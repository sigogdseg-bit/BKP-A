-- ==============================================================================
-- HUNTER: CORREÇÕES CANÔNICAS - REPASSES FINANCEIROS, FORNECEDOR VOXTER E COLUNAS
-- ==============================================================================

-- 1. Adicionar colunas necessárias com valor padrão
ALTER TABLE public.instalacoes 
ADD COLUMN IF NOT EXISTS pago_direto_cliente BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.transacoes_financeiras 
ADD COLUMN IF NOT EXISTS liquidado_pelo_cliente BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Correção de digitação do fornecedor: Vortexm -> Voxter nas transações financeiras
UPDATE public.transacoes_financeiras
SET descricao = REPLACE(descricao, 'Vortexm', 'Voxter')
WHERE descricao ILIKE '%vortexm%';

-- 3. RPC Canônica para Liquidação Direta pelo Cliente (Sem débitos para a empresa)
CREATE OR REPLACE FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(
  p_transacao_id TEXT,
  p_instalacao_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_inst_id UUID := NULL;
  v_trans_uuid UUID := NULL;
BEGIN
  -- 1. Se p_transacao_id iniciar com 'i-', extrai o UUID da instalacao
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
  END IF;

  IF v_inst_id IS NULL AND p_instalacao_id IS NOT NULL THEN
    v_inst_id := p_instalacao_id;
  END IF;

  -- 2. Se for uma ordem de instalação mesclada diretamente
  IF v_inst_id IS NOT NULL THEN
    UPDATE public.instalacoes
    SET pago_direto_cliente = TRUE,
        status_pagamento = 'pago',
        pago_em = NOW(),
        updated_at = NOW()
    WHERE id = v_inst_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'tipo', 'instalacao',
      'id', v_inst_id,
      'mensagem', 'Repasse de instalação marcado como liquidado diretamente pelo cliente (R$ 0,00 da empresa).'
    );
  END IF;

  -- 3. Se for uma transação na tabela transacoes_financeiras
  IF v_trans_uuid IS NOT NULL THEN
    UPDATE public.transacoes_financeiras
    SET liquidado_pelo_cliente = TRUE,
        status = 'concluido',
        valor = 0.00,
        data_pagamento = NOW(),
        descricao = CASE 
          WHEN descricao NOT ILIKE '%(Liquidado pelo Cliente)%' THEN descricao || ' (Liquidado pelo Cliente)'
          ELSE descricao 
        END,
        updated_at = NOW()
    WHERE id = v_trans_uuid;

    -- Se tiver instalacao vinculada, marca também na instalação
    SELECT instalacao_id INTO v_inst_id FROM public.transacoes_financeiras WHERE id = v_trans_uuid;
    IF v_inst_id IS NOT NULL THEN
      UPDATE public.instalacoes
      SET pago_direto_cliente = TRUE,
          status_pagamento = 'pago',
          pago_em = NOW(),
          updated_at = NOW()
      WHERE id = v_inst_id;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'tipo', 'transacao',
      'id', v_trans_uuid,
      'mensagem', 'Transação financeira liquidada pelo cliente com valor zerado.'
    );
  END IF;

  RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Nenhum identificador válido de instalação ou transação fornecido.');
END;
$$;

-- 4. Grants explícitos para Data API
GRANT EXECUTE ON FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(TEXT, UUID) TO authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.instalacoes TO authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.transacoes_financeiras TO authenticated, service_role;

-- 5. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
