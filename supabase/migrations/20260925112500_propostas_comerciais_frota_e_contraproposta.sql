-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Propostas Comerciais - Modalidade Frota e Contrapropostas
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Permite campos de veículo nulos quando for proposta de frota
ALTER TABLE public.propostas_comerciais ALTER COLUMN veiculo_marca DROP NOT NULL;
ALTER TABLE public.propostas_comerciais ALTER COLUMN veiculo_modelo DROP NOT NULL;
ALTER TABLE public.propostas_comerciais ALTER COLUMN veiculo_ano DROP NOT NULL;

-- 2. Adiciona colunas para modalidade frota e histórico de contrapropostas
ALTER TABLE public.propostas_comerciais
ADD COLUMN IF NOT EXISTS tipo_proposta TEXT NOT NULL DEFAULT 'individual' CHECK (tipo_proposta IN ('individual', 'frota')),
ADD COLUMN IF NOT EXISTS faixas_frota JSONB,
ADD COLUMN IF NOT EXISTS historico_contrapropostas JSONB DEFAULT '[]'::jsonb;

-- Índice para filtragem rápida por tipo de proposta
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_tipo ON public.propostas_comerciais(tipo_proposta);
