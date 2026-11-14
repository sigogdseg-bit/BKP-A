-- ==============================================================================
-- HUNTER / GD RASTREAMENTO - MIGRATION 20261009215000
-- Detalhes Técnicos de Bloqueador/Relé: Posição de Fixação e Circuito Cortado
-- ==============================================================================

-- 1. Adicionar colunas na tabela public.instalacoes
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS posicao_rele TEXT DEFAULT NULL;
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS circuito_cortado TEXT DEFAULT NULL;

-- 2. Adicionar colunas na tabela public.veiculos
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS posicao_rele TEXT DEFAULT NULL;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS circuito_cortado TEXT DEFAULT NULL;

-- 3. Invalidação obrigatória de cache PostgREST (Regra Pétrea Dev-Pétrea)
NOTIFY pgrst, 'reload schema';
