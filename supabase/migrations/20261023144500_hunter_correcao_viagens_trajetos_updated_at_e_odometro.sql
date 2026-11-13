-- ============================================================================
-- MIGRATION: 20261023144500_hunter_correcao_viagens_trajetos_updated_at_e_odometro.sql
-- ============================================================================
-- Objetivo:
-- 1. Corrige a causa raiz do congelamento dos 6 odômetros durante o movimento:
--    A tabela public.viagens_trajetos não possuía a coluna updated_at, provocando
--    o erro fatal 42703 (column "updated_at" does not exist) na RPC atômica
--    registrar_posicao_gps_com_odometro sempre que havia deslocamento (v_delta_km > 0).
-- 2. Adiciona a coluna updated_at TIMESTAMPTZ com DEFAULT NOW() em viagens_trajetos.
-- 3. Assegura permissões GRANT explícitas para a Data API do Supabase.
-- 4. Notifica invalidação imediata de cache com NOTIFY pgrst, 'reload schema'.
-- ============================================================================

-- 1. Adição da coluna updated_at em viagens_trajetos
ALTER TABLE public.viagens_trajetos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Inicialização de registros com updated_at nulo
UPDATE public.viagens_trajetos
SET updated_at = COALESCE(fim_at, created_at, NOW())
WHERE updated_at IS NULL;

-- 3. Grants Explícitos para a Data API (Supabase October 30 Compliance)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.viagens_trajetos TO authenticated, service_role;
GRANT SELECT ON TABLE public.viagens_trajetos TO anon;

-- 4. Invalidação Canônica de Cache PostgREST
NOTIFY pgrst, 'reload schema';
