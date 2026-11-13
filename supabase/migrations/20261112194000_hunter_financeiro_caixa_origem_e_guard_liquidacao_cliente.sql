-- ============================================================================
-- HUNTER — ORIGEM DA VERBA / CAIXA EM DESPESAS E GUARDA DE LIQUIDAÇÃO PELO CLIENTE
-- Migration: 20261112194000_hunter_financeiro_caixa_origem_e_guard_liquidacao_cliente.sql
-- ============================================================================

-- 1. Garante colunas canônicas de caixa/origem da verba e ressarcimento em transacoes_financeiras
ALTER TABLE public.transacoes_financeiras
  ADD COLUMN IF NOT EXISTS fonte_pagamento TEXT DEFAULT 'caixa_empresa';

ALTER TABLE public.transacoes_financeiras
  ADD COLUMN IF NOT EXISTS responsavel_pagamento_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.transacoes_financeiras
  ADD COLUMN IF NOT EXISTS responsavel_pagamento_nome TEXT;

ALTER TABLE public.transacoes_financeiras
  ADD COLUMN IF NOT EXISTS status_ressarcimento TEXT DEFAULT 'nao_aplicavel';

ALTER TABLE public.transacoes_financeiras
  ADD COLUMN IF NOT EXISTS data_ressarcimento TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transacoes_fonte_pagamento
  ON public.transacoes_financeiras(fonte_pagamento);

CREATE INDEX IF NOT EXISTS idx_transacoes_status_ressarcimento
  ON public.transacoes_financeiras(status_ressarcimento);

CREATE INDEX IF NOT EXISTS idx_transacoes_responsavel_pagamento_id
  ON public.transacoes_financeiras(responsavel_pagamento_id);

-- 2. Backfill seguro para lançamentos antigos que salvaram [FONTE:operador_adm] em observacoes
UPDATE public.transacoes_financeiras
SET
  fonte_pagamento = 'operador_adm',
  status_ressarcimento = CASE
    WHEN observacoes ILIKE '%RESSARC:ressarcido%' THEN 'ressarcido'
    ELSE 'pendente'
  END
WHERE tipo IN ('saida', 'despesa')
  AND (fonte_pagamento IS NULL OR fonte_pagamento = 'caixa_empresa')
  AND observacoes ILIKE '%[FONTE:operador_adm%';

-- 3. Atualiza RPC liquidar_repasse_instalacao_pelo_cliente com guarda estrita:
--    Apenas lançamentos de repasse ao instalador (categoria = 'repasse_instalador' ou instalacao_id NOT NULL)
--    podem ser liquidados como pagos diretamente pelo cliente.
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
  v_caller_id UUID;
  v_role TEXT;
  v_inst_id UUID := NULL;
  v_trans_uuid UUID := NULL;
  v_trans RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;
    IF COALESCE(v_role, '') NOT IN ('superadmin', 'adm', 'operador') THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores e operadores podem liquidar repasses.';
    END IF;
  END IF;

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
  IF v_inst_id IS NOT NULL AND v_trans_uuid IS NULL THEN
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
    SELECT id, tipo, categoria, instalacao_id
    INTO v_trans
    FROM public.transacoes_financeiras
    WHERE id = v_trans_uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transação financeira não encontrada.';
    END IF;

    IF COALESCE(v_trans.tipo, '') NOT IN ('saida', 'despesa')
       OR (
         COALESCE(v_trans.categoria, '') <> 'repasse_instalador'
         AND v_trans.instalacao_id IS NULL
       ) THEN
      RAISE EXCEPTION 'Apenas repasses de instalação para pagamento ao instalador podem ser liquidados pelo cliente.';
    END IF;

    UPDATE public.transacoes_financeiras
    SET liquidado_pelo_cliente = TRUE,
        status = 'concluido',
        valor = 0.00,
        data_pagamento = NOW(),
        fonte_pagamento = 'caixa_empresa',
        status_ressarcimento = 'nao_aplicavel',
        descricao = CASE
          WHEN descricao NOT ILIKE '%(Liquidado pelo Cliente)%' THEN descricao || ' (Liquidado pelo Cliente)'
          ELSE descricao
        END,
        updated_at = NOW()
    WHERE id = v_trans_uuid;

    IF v_trans.instalacao_id IS NOT NULL THEN
      UPDATE public.instalacoes
      SET pago_direto_cliente = TRUE,
          status_pagamento = 'pago',
          pago_em = NOW(),
          updated_at = NOW()
      WHERE id = v_trans.instalacao_id;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', true,
      'tipo', 'transacao',
      'id', v_trans_uuid,
      'mensagem', 'Transação financeira liquidada pelo cliente com valor zerado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'sucesso', false,
    'mensagem', 'Nenhum identificador válido de instalação ou transação fornecido.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquidar_repasse_instalacao_pelo_cliente(TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
