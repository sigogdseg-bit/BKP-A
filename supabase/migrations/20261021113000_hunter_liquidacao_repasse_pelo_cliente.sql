-- ============================================================================
-- MIGRAÇÃO HUNTER: LIQUIDAÇÃO DE REPASSE DE INSTALAÇÃO PAGO DIRETO PELO CLIENTE
-- Data: 21/10/2026
-- Objetivo: Permitir que instalações pagas diretamente pelo cliente ao instalador
-- sejam liquidadas com valor R$ 0,00 sem afetar o fluxo de caixa/financeiro da empresa.
-- ============================================================================

-- 1. Novas colunas canônicas
ALTER TABLE public.instalacoes 
ADD COLUMN IF NOT EXISTS pago_direto_cliente BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.transacoes_financeiras 
ADD COLUMN IF NOT EXISTS liquidado_pelo_cliente BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Atualização da trigger de sincronização de instalação e transação
CREATE OR REPLACE FUNCTION public.trg_sync_instalacao_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instalador_nome TEXT;
  v_cliente_nome TEXT;
  v_status_trans public.status_transacao_financeira;
  v_desc TEXT;
  v_valor NUMERIC(10,2);
  v_liquidado_cliente BOOLEAN;
BEGIN
  IF (NEW.valor_repasse IS NULL OR NEW.valor_repasse <= 0) AND (NEW.pago_direto_cliente IS NOT TRUE) THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_instalador_nome FROM public.profiles WHERE id = NEW.instalador_id;
  SELECT c.nome_razao_social INTO v_cliente_nome
  FROM public.veiculos v
  JOIN public.clientes c ON v.cliente_id = c.id
  WHERE v.id = NEW.veiculo_id;

  v_desc := 'Repasse Instalador (' || COALESCE(v_instalador_nome, 'Tecnico') || ') - Veiculo Cliente ' || COALESCE(v_cliente_nome, '');

  IF NEW.pago_direto_cliente IS TRUE THEN
    v_valor := 0.00;
    v_status_trans := 'concluido';
    v_liquidado_cliente := TRUE;
    IF v_desc NOT ILIKE '%(Liquidado pelo Cliente)%' THEN
      v_desc := v_desc || ' (Liquidado pelo Cliente)';
    END IF;
  ELSE
    v_valor := COALESCE(NEW.valor_repasse, 0.00);
    v_liquidado_cliente := FALSE;
    IF NEW.status_pagamento = 'pago' THEN
      v_status_trans := 'concluido';
    ELSE
      v_status_trans := 'pendente';
    END IF;
  END IF;

  INSERT INTO public.transacoes_financeiras (
    tipo, categoria, descricao, valor, data_competencia, data_vencimento,
    data_pagamento, status, instalacao_id, instalador_id, comprovante_url, 
    liquidado_pelo_cliente, updated_at
  ) VALUES (
    'saida', 'repasse_instalador', v_desc, v_valor,
    COALESCE(NEW.data_instalacao::DATE, CURRENT_DATE),
    COALESCE(NEW.data_instalacao::DATE, CURRENT_DATE),
    COALESCE(NEW.data_pagamento_repasse, NEW.pago_em, CASE WHEN v_liquidado_cliente THEN NOW() ELSE NULL END), 
    v_status_trans,
    NEW.id, NEW.instalador_id, NEW.comprovante_pagamento_url, 
    v_liquidado_cliente, NOW()
  )
  ON CONFLICT (instalacao_id) DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    data_pagamento = EXCLUDED.data_pagamento,
    status = EXCLUDED.status,
    liquidado_pelo_cliente = EXCLUDED.liquidado_pelo_cliente,
    comprovante_url = EXCLUDED.comprovante_url,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_instalacao_transacao ON public.instalacoes;
CREATE TRIGGER trg_sync_instalacao_transacao
AFTER INSERT OR UPDATE ON public.instalacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_instalacao_transacao();

-- 3. RPC Canônica para Liquidação Direta pelo Cliente
CREATE OR REPLACE FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(
  p_transacao_id TEXT,
  p_instalacao_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst_id UUID;
  v_trans_uuid UUID;
BEGIN
  -- Se p_transacao_id começar com 'i-', extrai o UUID da instalacao
  IF p_transacao_id LIKE 'i-%' THEN
    BEGIN
      v_inst_id := substring(p_transacao_id from 3)::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_inst_id := p_instalacao_id;
    END;
  ELSE
    BEGIN
      v_trans_uuid := p_transacao_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_trans_uuid := NULL;
    END;
    v_inst_id := p_instalacao_id;
  END IF;

  -- Se localizou uma transacao financeira existente
  IF v_trans_uuid IS NOT NULL THEN
    UPDATE public.transacoes_financeiras
    SET
      valor = 0.00,
      status = 'concluido',
      liquidado_pelo_cliente = TRUE,
      data_pagamento = COALESCE(data_pagamento, NOW()),
      descricao = CASE 
        WHEN descricao ILIKE '%Liquidado pelo Cliente%' THEN descricao 
        ELSE descricao || ' (Liquidado pelo Cliente)' 
      END,
      updated_at = NOW()
    WHERE id = v_trans_uuid
    RETURNING instalacao_id INTO v_inst_id;
  END IF;

  -- Se vinculada à instalacao, atualiza o registro da ordem
  IF v_inst_id IS NOT NULL THEN
    UPDATE public.instalacoes
    SET
      status_pagamento = 'pago',
      pago_direto_cliente = TRUE,
      pago_em = COALESCE(pago_em, NOW()),
      updated_at = NOW()
    WHERE id = v_inst_id;

    -- Garante que em transacoes_financeiras também fique zerado e concluído
    UPDATE public.transacoes_financeiras
    SET
      valor = 0.00,
      status = 'concluido',
      liquidado_pelo_cliente = TRUE,
      data_pagamento = COALESCE(data_pagamento, NOW()),
      descricao = CASE 
        WHEN descricao ILIKE '%Liquidado pelo Cliente%' THEN descricao 
        ELSE descricao || ' (Liquidado pelo Cliente)' 
      END,
      updated_at = NOW()
    WHERE instalacao_id = v_inst_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'instalacao_id', v_inst_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(TEXT, UUID) TO authenticated, service_role;

-- 4. Notificar recarga de cache PostgREST
NOTIFY pgrst, 'reload schema';
