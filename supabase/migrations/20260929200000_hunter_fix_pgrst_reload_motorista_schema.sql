-- ============================================================================
-- HUNTER — FIX: Recarregar cache do PostgREST após adição do ENUM 'motorista'
-- ============================================================================
-- O PostgREST armazena em cache o schema do banco. Quando adicionamos um novo
-- valor ao ENUM hunter_role ('motorista'), o PostgREST não recarrega
-- automaticamente, causando "Database error querying schema" ao fazer login
-- com um usuário de role=motorista.
-- Este comando força a reinicialização do schema cache do PostgREST.
-- ============================================================================

-- Forçar recarga do cache do PostgREST
NOTIFY pgrst, 'reload schema';

-- Também garantir que o ENUM está correto (idempotente)
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'motorista';

-- Confirmar que pgcrypto está instalado no schema 'extensions'
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Garantir que a função cadastrar_motorista tem GRANT correto
GRANT EXECUTE ON FUNCTION public.cadastrar_motorista(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT
) TO authenticated;

-- ============================================================================
-- Atualizar TAMBÉM a função admin_redefinir_senha para aceitar role=motorista
-- (garantir que adm pode redefinir senha de motorista)
-- ============================================================================
-- Verificar e GRANT admin_redefinir_senha para authenticated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'admin_redefinir_senha'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_redefinir_senha(UUID, TEXT) TO authenticated';
  END IF;
END
$$;
