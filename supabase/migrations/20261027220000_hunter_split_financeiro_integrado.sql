-- ============================================================================
-- Hunter — Integração do Split de Revendedores e Vendedores ao Financeiro Mestre
-- ============================================================================

-- 1. Adicionar colunas de vínculo com parceiros na tabela de transações financeiras
ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transacoes_revendedor_id ON public.transacoes_financeiras(revendedor_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_vendedor_id ON public.transacoes_financeiras(vendedor_id);

-- 2. Atualizar restrição de unicidade para permitir entrada e saídas de split da mesma mensalidade
ALTER TABLE public.transacoes_financeiras DROP CONSTRAINT IF EXISTS uq_transacao_mensalidade;
ALTER TABLE public.transacoes_financeiras DROP CONSTRAINT IF EXISTS uq_transacao_mensalidade_split;

ALTER TABLE public.transacoes_financeiras 
  ADD CONSTRAINT uq_transacao_mensalidade_split UNIQUE (mensalidade_id, tipo, categoria);

DO $$ BEGIN
  CREATE TYPE public.status_transacao_financeira AS ENUM ('pendente', 'concluido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Atualizar a trigger de sincronização de mensalidades com cálculo de split automático
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
BEGIN
  -- 1. Busca dados do cliente e vínculos de parceiro
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

  v_desc_entrada := 'Mensalidade ' || LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                    ' - ' || COALESCE(v_cliente_nome, 'Cliente');

  IF NEW.status = 'pago' THEN
    v_status_trans := 'concluido';
  ELSE
    v_status_trans := 'pendente';
  END IF;

  -- 2. Insere/Atualiza o lançamento principal de ENTRADA (Mensalidade do Cliente)
  INSERT INTO public.transacoes_financeiras (
    tipo, categoria, descricao, valor, data_competencia, data_vencimento,
    data_pagamento, status, mensalidade_id, cliente_id, revendedor_id, vendedor_id,
    comprovante_url, updated_at
  ) VALUES (
    'entrada', 'mensalidade', v_desc_entrada, NEW.valor,
    make_date(NEW.ano_referencia, NEW.mes_referencia, 1),
    NEW.data_vencimento, NEW.data_pagamento, v_status_trans,
    NEW.id, NEW.cliente_id, v_revendedor_id, v_vendedor_id,
    NEW.comprovante_url, NOW()
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
    updated_at = NOW();

  -- 3. Se houver vínculo com Revendedor, calcula e gera/atualiza as saídas de repasse
  IF v_revendedor_id IS NOT NULL THEN
    -- Busca dados do revendedor
    SELECT nome, COALESCE(valor_base_sistema, 25.00)
    INTO v_revendedor_nome, v_base_sistema
    FROM public.revendedores
    WHERE id = v_revendedor_id;

    -- Se também tiver vendedor
    IF v_vendedor_id IS NOT NULL THEN
      SELECT nome, COALESCE(valor_base_vendedor, 40.00)
      INTO v_vendedor_nome, v_base_vendedor
      FROM public.vendedores
      WHERE id = v_vendedor_id;

      -- Cálculo de split com Vendedor
      v_parte_sistema := v_base_sistema;
      v_parte_vendedor := GREATEST(0, NEW.valor - v_base_vendedor);
      v_parte_revendedor := GREATEST(0, v_base_vendedor - v_base_sistema);

      -- Lançamento de SAÍDA: Comissão do Vendedor
      IF v_parte_vendedor > 0 THEN
        v_desc_vend := 'Comissão Vendedor (' || COALESCE(v_vendedor_nome, 'Equipe') || ') - Ref. ' ||
                       LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                       ' (' || COALESCE(v_cliente_nome, 'Cliente') || ')';

        INSERT INTO public.transacoes_financeiras (
          tipo, categoria, descricao, valor, data_competencia, data_vencimento,
          status, mensalidade_id, cliente_id, revendedor_id, vendedor_id, updated_at
        ) VALUES (
          'saida', 'repasse_vendedor', v_desc_vend, v_parte_vendedor,
          make_date(NEW.ano_referencia, NEW.mes_referencia, 1),
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
      -- Venda Direta do Revendedor
      v_parte_sistema := v_base_sistema;
      v_parte_revendedor := GREATEST(0, NEW.valor - v_base_sistema);
      v_parte_vendedor := 0;
    END IF;

    -- Lançamento de SAÍDA: Repasse da Margem do Revendedor
    IF v_parte_revendedor > 0 THEN
      v_desc_rev := 'Repasse Franquia (' || COALESCE(v_revendedor_nome, 'Revendedor') || ') - Ref. ' ||
                    LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
                    ' (' || COALESCE(v_cliente_nome, 'Cliente') || ')';

      INSERT INTO public.transacoes_financeiras (
        tipo, categoria, descricao, valor, data_competencia, data_vencimento,
        status, mensalidade_id, cliente_id, revendedor_id, updated_at
      ) VALUES (
        'saida', 'repasse_revendedor', v_desc_rev, v_parte_revendedor,
        make_date(NEW.ano_referencia, NEW.mes_referencia, 1),
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

DROP TRIGGER IF EXISTS trg_sync_mensalidade_transacao ON public.mensalidades;
CREATE TRIGGER trg_sync_mensalidade_transacao
AFTER INSERT OR UPDATE ON public.mensalidades
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_mensalidade_transacao();

-- 4. RLS para que revendedores e vendedores consultem seus repasses com segurança
DROP POLICY IF EXISTS "Revendedores visualizam seus repasses" ON public.transacoes_financeiras;
CREATE POLICY "Revendedores visualizam seus repasses"
ON public.transacoes_financeiras FOR SELECT TO authenticated
USING (
  revendedor_id IN (
    SELECT id FROM public.revendedores WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Vendedores visualizam seus repasses" ON public.transacoes_financeiras;
CREATE POLICY "Vendedores visualizam seus repasses"
ON public.transacoes_financeiras FOR SELECT TO authenticated
USING (
  vendedor_id IN (
    SELECT id FROM public.vendedores WHERE user_id = auth.uid()
  )
);

-- 5. Grants explícitos para Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transacoes_financeiras TO authenticated, service_role;
GRANT SELECT ON TABLE public.transacoes_financeiras TO anon;

-- Invalidação canônica de cache do schema
NOTIFY pgrst, 'reload schema';
