-- ============================================================================
-- HUNTER / GD RASTREAMENTO — RELOGIO SERVER-SIDE DE 24H DA DEGUSTACAO APOS 1O ACESSO E REVALIDACAO
-- ============================================================================
-- Migration: 20261111120000_hunter_degustacao_primeiro_acesso_e_revalidacao.sql
-- Objetivo:
--   1. Persistir no servidor (public.profiles) o instante real do 1o acesso do
--      cliente em degustacao, a data de expiracao (+24h) e a marca da ultima
--      revalidacao via WhatsApp (comando REVALIDA).
--   2. Criar RPC SECURITY DEFINER public.registrar_primeiro_acesso_degustacao
--      que carimba as 24h estritamente no 1o login autenticado (sem sobrescrever
--      logins seguintes e funcionando de forma consistente entre dispositivos).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS degustacao_primeiro_acesso_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS degustacao_expira_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS degustacao_revalidada_em TIMESTAMPTZ DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.registrar_primeiro_acesso_degustacao(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_target_user_id  UUID := COALESCE(p_user_id, auth.uid());
  v_role            TEXT;
  v_primeiro_acesso TIMESTAMPTZ;
  v_expira_em       TIMESTAMPTZ;
  v_revalidada      TIMESTAMPTZ;
  v_meta            JSONB := '{}'::jsonb;
  v_is_degustacao   BOOLEAN := FALSE;
  v_agora           TIMESTAMPTZ := NOW();
  v_expirado        BOOLEAN := FALSE;
  v_seg_restantes   INTEGER := 0;
BEGIN
  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Usuário não identificado.');
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM v_target_user_id
     AND NOT public.is_adm() THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Acesso negado para registrar acesso de outro usuário.');
  END IF;

  SELECT
    p.role::text,
    p.degustacao_primeiro_acesso_em,
    p.degustacao_expira_em,
    p.degustacao_revalidada_em
  INTO
    v_role,
    v_primeiro_acesso,
    v_expira_em,
    v_revalidada
  FROM public.profiles p
  WHERE p.id = v_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Perfil de usuário não encontrado.');
  END IF;

  SELECT u.raw_user_meta_data
  INTO v_meta
  FROM auth.users u
  WHERE u.id = v_target_user_id;

  v_meta := COALESCE(v_meta, '{}'::jsonb);
  v_is_degustacao := (
    COALESCE(v_role, '') IN ('cliente_degustacao', 'superadmin_auditor', 'degustacao')
    OR COALESCE((v_meta->>'degustacao')::BOOLEAN, FALSE)
    OR COALESCE(v_meta->>'role', '') IN ('cliente_degustacao', 'superadmin_auditor', 'degustacao')
  );

  IF NOT v_is_degustacao THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Perfil não está em modo de degustação.');
  END IF;

  -- Se houve revalidacao posterior ao ultimo primeiro acesso gravado, reinicia contagem para o proximo 1o login
  IF v_primeiro_acesso IS NOT NULL
     AND v_revalidada IS NOT NULL
     AND v_revalidada > v_primeiro_acesso THEN
    v_primeiro_acesso := NULL;
    v_expira_em := NULL;
  END IF;

  IF v_primeiro_acesso IS NULL THEN
    v_primeiro_acesso := v_agora;
    v_expira_em := v_agora + INTERVAL '24 hours';

    UPDATE public.profiles
    SET
      degustacao_primeiro_acesso_em = v_primeiro_acesso,
      degustacao_expira_em = v_expira_em,
      updated_at = v_agora
    WHERE id = v_target_user_id;
  ELSIF v_expira_em IS NULL THEN
    v_expira_em := v_primeiro_acesso + INTERVAL '24 hours';

    UPDATE public.profiles
    SET degustacao_expira_em = v_expira_em
    WHERE id = v_target_user_id;
  END IF;

  v_expirado := (v_agora >= v_expira_em);
  v_seg_restantes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_expira_em - v_agora)))::INTEGER);

  RETURN jsonb_build_object(
    'sucesso', true,
    'user_id', v_target_user_id,
    'primeiro_acesso_em', v_primeiro_acesso,
    'expira_em', v_expira_em,
    'revalidada_em', v_revalidada,
    'expirado', v_expirado,
    'segundos_restantes', v_seg_restantes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_primeiro_acesso_degustacao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_primeiro_acesso_degustacao(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
