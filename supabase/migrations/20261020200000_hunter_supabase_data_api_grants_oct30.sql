-- ============================================================================
-- HUNTER — BLINDAGEM COMPULSÓRIA DATA API SUPABASE (OCTOBER 30 COMPLIANCE)
-- ============================================================================
-- A partir de 30 de Outubro de 2026, o Supabase deixa de atribuir grants automáticos
-- na criação de tabelas públicas. Este script:
-- 1. Configura ALTER DEFAULT PRIVILEGES para tabelas, sequências e funções futuras.
-- 2. Concede GRANT explícito em 100% das tabelas existentes no schema public.
-- 3. Mantém RLS estrito em todas as tabelas (o isolamento de dados permanece inviolável).
-- ============================================================================

-- 1. PRIVILÉGIOS PADRÃO FUTUROS (ALTER DEFAULT PRIVILEGES)
-- Garante que qualquer nova tabela criada pelo postgres/dashboard/migrations receba acesso da Data API
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

-- 2. GARANTIR GRANTS EXPLÍCITOS EM 100% DAS TABELAS PÚBLICAS EXISTENTES
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.' || quote_ident(r.tablename) || ' TO authenticated;';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.' || quote_ident(r.tablename) || ' TO service_role;';
        EXECUTE 'GRANT SELECT ON TABLE public.' || quote_ident(r.tablename) || ' TO anon;';
    END LOOP;
END $$;

-- 3. GARANTIR GRANTS EM SEQUÊNCIAS EXISTENTES
DO $$
DECLARE
    s RECORD;
BEGIN
    FOR s IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.' || quote_ident(s.sequence_name) || ' TO authenticated;';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.' || quote_ident(s.sequence_name) || ' TO service_role;';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.' || quote_ident(s.sequence_name) || ' TO anon;';
    END LOOP;
END $$;

-- 4. INVALIDAÇÃO E ATUALIZAÇÃO ATÔMICA DO CACHE POSTGREST
NOTIFY pgrst, 'reload schema';
