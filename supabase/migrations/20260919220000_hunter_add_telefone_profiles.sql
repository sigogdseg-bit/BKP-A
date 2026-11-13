-- ============================================================================
-- HUNTER — ADICIONAR COLUNA TELEFONE EM PROFILES E RECARREGAR CACHE POSTGREST
-- ============================================================================
-- Versão: 1.5.4.2
-- 1. Adiciona coluna telefone na tabela public.profiles se não existir.
-- 2. Recarrega o schema cache do PostgREST.
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
