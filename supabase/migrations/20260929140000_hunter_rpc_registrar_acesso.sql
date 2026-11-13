-- ============================================================================
-- HUNTER — RPC REGISTRAR ACESSO DO USUÁRIO E ATUALIZAÇÃO RLS DE PERFIL
-- ============================================================================
-- Migration: 20260929140000_hunter_rpc_registrar_acesso.sql
-- Objetivo: Permitir que usuários autenticados registrem seu acesso em tempo real
-- atualizando profiles.ultimo_login e sessao_ativa com SECURITY DEFINER,
-- além de permitir que usuários atualizem seus próprios perfis via RLS.
-- ============================================================================

-- 1. RPC Segura com SECURITY DEFINER para registrar o acesso do usuário atual
CREATE OR REPLACE FUNCTION public.registrar_acesso_usuario()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_agora TIMESTAMPTZ := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Não autenticado');
  END IF;

  UPDATE public.profiles
  SET
    sessao_ativa = true,
    ultimo_login = v_agora,
    updated_at = v_agora
  WHERE id = v_uid;

  RETURN jsonb_build_object('sucesso', true, 'ultimo_login', v_agora);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_acesso_usuario() TO authenticated;

-- 2. Política de RLS para permitir que usuários atualizem seu próprio perfil
DROP POLICY IF EXISTS "Usuarios atualizam seu proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios atualizam seu proprio perfil"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 3. Atualiza os perfis que possuem sessao_ativa = true para terem o ultimo_login condizente se necessário
UPDATE public.profiles
SET ultimo_login = now()
WHERE sessao_ativa = true AND (ultimo_login IS NULL OR ultimo_login < (now() - interval '24 hours'));
