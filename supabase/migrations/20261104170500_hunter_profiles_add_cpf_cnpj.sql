-- ==============================================================================
-- HUNTER / GD Rastreamento — Adicionar coluna cpf_cnpj na tabela public.profiles
-- Corrige o erro "column cpf_cnpj of relation profiles does not exist"
-- ao redefinir ou cadastrar senha de parceiro (revendedor e vendedor)
-- Migration: 20261104170500_hunter_profiles_add_cpf_cnpj.sql
-- ==============================================================================

-- 1. Adicionar coluna cpf_cnpj em public.profiles se não existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

-- 2. Garantir índice para busca rápida por documento no profile
CREATE INDEX IF NOT EXISTS idx_profiles_cpf_cnpj ON public.profiles(cpf_cnpj);

-- 3. Recarregar schema do PostgREST
NOTIFY pgrst, 'reload schema';
