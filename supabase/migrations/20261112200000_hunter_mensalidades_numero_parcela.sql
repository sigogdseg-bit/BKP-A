-- Migration: 20261112200000_hunter_mensalidades_numero_parcela.sql
-- Objetivo:
--   1. Permitir valor >= 0 em transacoes_financeiras (cortesia R$ 0,00 e liquidado_pelo_cliente R$ 0,00).
--   2. Persistir numero_parcela e total_parcelas em public.mensalidades (ex: 01/12, 02/12 ...).
--   3. Atualizar trigger trg_sync_mensalidade_transacao e RPC admin_gerar_mensalidades_mes antes do backfill.
--   4. Preencher (backfill) cronologicamente todas as mensalidades recorrentes existentes por cliente.

-- 1. Ajusta CHECK constraint para suportar valor >= 0 (cortesia e liquidado_pelo_cliente)
ALTER TABLE public.transacoes_financeiras
  DROP CONSTRAINT IF EXISTS transacoes_financeiras_valor_check;

ALTER TABLE public.transacoes_financeiras
  ADD CONSTRAINT transacoes_financeiras_valor_check CHECK (valor >= 0);

-- 2. Adiciona colunas de numeração de parcela em public.mensalidades
ALTER TABLE public.mensalidades
  ADD COLUMN IF NOT EXISTS numero_parcela INT,
  ADD COLUMN IF NOT EXISTS total_parcelas INT;

-- 3. Atualiza trigger de sincronização antes do backfill
CREATE OR REPLACE FUNCTION public.trg_sync_mensalidade_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_revendedor_id UUID;
  v_vendedor_id UUID;
  v_revendedor_nome TEXT;
  v_vendedor_nome TEXT;
  v_base_sistema NUMERIC(10, 2) := 25.00;
  v_base_vendedor NUMERIC(10, 2) := 40.00;
  v_parte_sistema NUMERIC(10, 2) := 0.00;
  v_parte_revendedor NUMERIC(10, 2) := 0.00;
  v_parte_vendedor NUMERIC(10, 2) := 0.00;
  v_status_trans TEXT;
  v_desc_entrada TEXT;
  v_desc_rev TEXT;
  v_desc_vend TEXT;
  v_num_parcela INT;
  v_tot_parcelas INT;
  v_qtd_anteriores INT;
  v_parcela_fmt TEXT;
  v_ja_existe_trans BOOLEAN;
BEGIN
  -- Evita poluir transacoes_financeiras com cortesia R$ 0,00 que nunca teve lançamento lá
  IF COALESCE(NEW.valor, 0) <= 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.transacoes_financeiras
      WHERE mensalidade_id = NEW.id AND tipo = 'entrada' AND categoria = 'mensalidade'
    ) INTO v_ja_existe_trans;
    IF NOT v_ja_existe_trans THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT
    nome_razao_social,
    revendedor_id,
    vendedor_id
  INTO
    v_cliente_nome,
    v_revendedor_id,
    v_vendedor_id
  FROM public.clientes
  WHERE id = NEW.cliente_id;

  IF COALESCE(NEW.mes_referencia, 0) > 0 THEN
    v_num_parcela := NEW.numero_parcela;
    v_tot_parcelas := COALESCE(NULLIF(NEW.total_parcelas, 0), 12);

    IF v_num_parcela IS NULL OR v_num_parcela <= 0 THEN
      SELECT COUNT(*) INTO v_qtd_anteriores
      FROM public.mensalidades m_prev
      WHERE m_prev.cliente_id = NEW.cliente_id
        AND m_prev.mes_referencia > 0
        AND m_prev.id <> NEW.id
        AND (
          m_prev.ano_referencia < NEW.ano_referencia
          OR (m_prev.ano_referencia = NEW.ano_referencia AND m_prev.mes_referencia < NEW.mes_referencia)
        );
      v_num_parcela := ((COALESCE(v_qtd_anteriores, 0) % GREATEST(1, v_tot_parcelas)) + 1);
    END IF;

    v_parcela_fmt := LPAD(v_num_parcela::TEXT, 2, '0') || '/' || LPAD(v_tot_parcelas::TEXT, 2, '0');
    v_desc_entrada := 'Mensalidade ' || LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                      ' (' || v_parcela_fmt || ') - ' || COALESCE(v_cliente_nome, 'Cliente');
  ELSE
    v_num_parcela := NULL;
    v_tot_parcelas := NULL;
    v_desc_entrada := 'Taxa de Ativação (' || NEW.ano_referencia::TEXT || ') - ' || COALESCE(v_cliente_nome, 'Cliente');
  END IF;

  IF NEW.status = 'pago' THEN
    v_status_trans := 'concluido';
  ELSE
    v_status_trans := 'pendente';
  END IF;

  INSERT INTO public.transacoes_financeiras (
    tipo, categoria, descricao, valor, data_competencia, data_vencimento,
    data_pagamento, status, mensalidade_id, cliente_id, revendedor_id, vendedor_id,
    comprovante_url, parcela_atual, total_parcelas, updated_at
  ) VALUES (
    'entrada', 'mensalidade', v_desc_entrada, NEW.valor,
    make_date(NEW.ano_referencia, GREATEST(1, NEW.mes_referencia), 1),
    NEW.data_vencimento, NEW.data_pagamento, v_status_trans,
    NEW.id, NEW.cliente_id, v_revendedor_id, v_vendedor_id,
    NEW.comprovante_url, v_num_parcela, v_tot_parcelas, NOW()
  )
  ON CONFLICT (mensalidade_id, tipo, categoria) DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    data_vencimento = EXCLUDED.data_vencimento,
    data_pagamento = EXCLUDED.data_pagamento,
    status = EXCLUDED.status,
    comprovante_url = EXCLUDED.comprovante_url,
    revendedor_id = EXCLUDED.revendedor_id,
    vendedor_id = EXCLUDED.vendedor_id,
    parcela_atual = COALESCE(EXCLUDED.parcela_atual, public.transacoes_financeiras.parcela_atual),
    total_parcelas = COALESCE(EXCLUDED.total_parcelas, public.transacoes_financeiras.total_parcelas),
    updated_at = NOW();

  IF v_revendedor_id IS NOT NULL AND COALESCE(NEW.mes_referencia, 0) > 0 AND COALESCE(NEW.valor, 0) > 0 THEN
    SELECT nome, COALESCE(valor_base_sistema, 25.00)
    INTO v_revendedor_nome, v_base_sistema
    FROM public.revendedores
    WHERE id = v_revendedor_id;

    IF v_vendedor_id IS NOT NULL THEN
      SELECT nome, COALESCE(valor_base_vendedor, 40.00)
      INTO v_vendedor_nome, v_base_vendedor
      FROM public.vendedores
      WHERE id = v_vendedor_id;

      v_parte_sistema := v_base_sistema;
      v_parte_vendedor := GREATEST(0, NEW.valor - v_base_vendedor);
      v_parte_revendedor := GREATEST(0, v_base_vendedor - v_base_sistema);

      IF v_parte_vendedor > 0 THEN
        v_desc_vend := 'Comissão Vendedor (' || COALESCE(v_vendedor_nome, 'Equipe') || ') - Ref. ' ||
                       LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                       ' (' || v_parcela_fmt || ' - ' || COALESCE(v_cliente_nome, 'Cliente') || ')';

        INSERT INTO public.transacoes_financeiras (
          tipo, categoria, descricao, valor, data_competencia, data_vencimento,
          status, mensalidade_id, cliente_id, revendedor_id, vendedor_id, updated_at
        ) VALUES (
          'saida', 'repasse_vendedor', v_desc_vend, v_parte_vendedor,
          make_date(NEW.ano_referencia, GREATEST(1, NEW.mes_referencia), 1),
          NEW.data_vencimento, 'pendente',
          NEW.id, NEW.cliente_id, v_revendedor_id, v_vendedor_id, NOW()
        )
        ON CONFLICT (mensalidade_id, tipo, categoria) DO UPDATE SET
          valor = EXCLUDED.valor,
          descricao = EXCLUDED.descricao,
          data_vencimento = EXCLUDED.data_vencimento,
          revendedor_id = EXCLUDED.revendedor_id,
          vendedor_id = EXCLUDED.vendedor_id,
          updated_at = NOW();
      END IF;
    ELSE
      v_parte_sistema := v_base_sistema;
      v_parte_revendedor := GREATEST(0, NEW.valor - v_base_sistema);
      v_parte_vendedor := 0;
    END IF;

    IF v_parte_revendedor > 0 THEN
      v_desc_rev := 'Repasse Franquia (' || COALESCE(v_revendedor_nome, 'Revendedor') || ') - Ref. ' ||
                    LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                    ' (' || v_parcela_fmt || ' - ' || COALESCE(v_cliente_nome, 'Cliente') || ')';

      INSERT INTO public.transacoes_financeiras (
        tipo, categoria, descricao, valor, data_competencia, data_vencimento,
        status, mensalidade_id, cliente_id, revendedor_id, updated_at
      ) VALUES (
        'saida', 'repasse_revendedor', v_desc_rev, v_parte_revendedor,
        make_date(NEW.ano_referencia, GREATEST(1, NEW.mes_referencia), 1),
        NEW.data_vencimento, 'pendente',
        NEW.id, NEW.cliente_id, v_revendedor_id, NOW()
      )
      ON CONFLICT (mensalidade_id, tipo, categoria) DO UPDATE SET
        valor = EXCLUDED.valor,
        descricao = EXCLUDED.descricao,
        data_vencimento = EXCLUDED.data_vencimento,
        revendedor_id = EXCLUDED.revendedor_id,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Backfill cronológico por cliente para mensalidades recorrentes (mes_referencia > 0)
WITH numeradas AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (
      PARTITION BY m.cliente_id
      ORDER BY m.ano_referencia ASC, m.mes_referencia ASC, m.data_vencimento ASC, m.created_at ASC
    )::INT AS pos,
    GREATEST(12, COUNT(*) OVER (PARTITION BY m.cliente_id))::INT AS total_cli
  FROM public.mensalidades m
  WHERE m.mes_referencia > 0
)
UPDATE public.mensalidades m
SET
  numero_parcela = CASE
    WHEN n.total_cli > 12 THEN (((n.pos - 1) % 12) + 1)
    ELSE n.pos
  END,
  total_parcelas = CASE
    WHEN n.total_cli > 12 THEN 12
    ELSE GREATEST(12, n.total_cli)
  END
FROM numeradas n
WHERE m.id = n.id
  AND (m.numero_parcela IS NULL OR m.total_parcelas IS NULL);

-- 5. Atualiza RPC de geração em lote para já gravar numero_parcela e total_parcelas
CREATE OR REPLACE FUNCTION public.admin_gerar_mensalidades_mes(
  p_mes INT,
  p_ano INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente RECORD;
  v_dia_max INT;
  v_dia_final INT;
  v_data_venc DATE;
  v_status_inicial public.status_mensalidade;
  v_total_clientes INT := 0;
  v_geradas INT := 0;
  v_ja_existentes INT := 0;
  v_qtd_anteriores INT := 0;
  v_num_parcela INT := 1;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar mensalidades em lote.';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mês de referência inválido: deve estar entre 1 e 12.';
  END IF;

  IF p_ano < 2024 OR p_ano > 2099 THEN
    RAISE EXCEPTION 'Ano de referência inválido.';
  END IF;

  v_dia_max := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day'))::INT;

  FOR v_cliente IN
    SELECT c.id, c.dia_vencimento, c.valor_mensalidade, c.nome_razao_social
    FROM public.clientes c
    WHERE c.status <> 'bloqueado'
      AND c.status <> 'aguardando_instalacao'
      AND c.valor_mensalidade > 0
      AND EXISTS (
        SELECT 1 FROM public.veiculos v
        WHERE v.cliente_id = c.id
          AND v.ativo = TRUE
      )
  LOOP
    v_total_clientes := v_total_clientes + 1;

    v_dia_final := LEAST(COALESCE(v_cliente.dia_vencimento, 10), v_dia_max);
    v_data_venc := make_date(p_ano, p_mes, v_dia_final);

    IF v_data_venc < CURRENT_DATE THEN
      v_status_inicial := 'vencido';
    ELSE
      v_status_inicial := 'pendente';
    END IF;

    SELECT COUNT(*) INTO v_qtd_anteriores
    FROM public.mensalidades m_prev
    WHERE m_prev.cliente_id = v_cliente.id
      AND m_prev.mes_referencia > 0
      AND (
        m_prev.ano_referencia < p_ano
        OR (m_prev.ano_referencia = p_ano AND m_prev.mes_referencia < p_mes)
      );

    v_num_parcela := ((COALESCE(v_qtd_anteriores, 0) % 12) + 1);

    INSERT INTO public.mensalidades (
      cliente_id,
      mes_referencia,
      ano_referencia,
      numero_parcela,
      total_parcelas,
      valor,
      data_vencimento,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_cliente.id,
      p_mes,
      p_ano,
      v_num_parcela,
      12,
      v_cliente.valor_mensalidade,
      v_data_venc,
      v_status_inicial,
      NOW(),
      NOW()
    )
    ON CONFLICT (cliente_id, mes_referencia, ano_referencia) DO NOTHING;

    IF FOUND THEN
      v_geradas := v_geradas + 1;
    ELSE
      v_ja_existentes := v_ja_existentes + 1;
    END IF;
  END LOOP;

  INSERT INTO public.system_activity_logs (
    user_id,
    acao,
    detalhe,
    created_at
  ) VALUES (
    auth.uid(),
    'GERACAO_MENSALIDADES_LOTE',
    'Competência: ' || LPAD(p_mes::TEXT, 2, '0') || '/' || p_ano::TEXT ||
    ' | Geradas: ' || v_geradas::TEXT ||
    ' | Já existentes: ' || v_ja_existentes::TEXT ||
    ' | Clientes com veículo ativo: ' || v_total_clientes::TEXT,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'geradas', v_geradas,
    'ja_existentes', v_ja_existentes,
    'total_clientes', v_total_clientes,
    'message', v_geradas || ' mensalidades geradas com sucesso para a competência ' || LPAD(p_mes::TEXT, 2, '0') || '/' || p_ano::TEXT || '.'
  );
END;
$$;

-- 6. Atualiza transações já sincronizadas com mensalidades
UPDATE public.transacoes_financeiras t
SET
  parcela_atual = m.numero_parcela,
  total_parcelas = m.total_parcelas,
  descricao = CASE
    WHEN t.descricao NOT LIKE '%(' || LPAD(m.numero_parcela::TEXT, 2, '0') || '/' || LPAD(m.total_parcelas::TEXT, 2, '0') || ')%'
      THEN 'Mensalidade ' || LPAD(m.mes_referencia::TEXT, 2, '0') || '/' || m.ano_referencia::TEXT ||
           ' (' || LPAD(m.numero_parcela::TEXT, 2, '0') || '/' || LPAD(m.total_parcelas::TEXT, 2, '0') || ') - ' ||
           COALESCE(c.nome_razao_social, 'Cliente')
    ELSE t.descricao
  END,
  updated_at = NOW()
FROM public.mensalidades m
JOIN public.clientes c ON c.id = m.cliente_id
WHERE t.mensalidade_id = m.id
  AND t.categoria = 'mensalidade'
  AND m.mes_referencia > 0
  AND m.numero_parcela IS NOT NULL
  AND m.total_parcelas IS NOT NULL;

NOTIFY pgrst, 'reload schema';
