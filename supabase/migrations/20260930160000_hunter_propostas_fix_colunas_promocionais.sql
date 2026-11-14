-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Hunter - Garantir Colunas Promocionais em Propostas Comerciais
-- Versão Alvo: 1.11.0.17
-- Sistema: GD Rastreamento | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.propostas_comerciais
ADD COLUMN IF NOT EXISTS com_fidelidade_instalacao_cheia NUMERIC(10,2) NOT NULL DEFAULT 380.00,
ADD COLUMN IF NOT EXISTS com_fidelidade_mensalidade_cheia NUMERIC(10,2) NOT NULL DEFAULT 120.00,
ADD COLUMN IF NOT EXISTS sem_fidelidade_instalacao_cheia NUMERIC(10,2) NOT NULL DEFAULT 420.00,
ADD COLUMN IF NOT EXISTS sem_fidelidade_mensalidade_cheia NUMERIC(10,2) NOT NULL DEFAULT 160.00,
ADD COLUMN IF NOT EXISTS aplicar_promocao BOOLEAN NOT NULL DEFAULT true;

-- Notifica o PostgREST para recarregar o cache de esquema
NOTIFY pgrst, 'reload schema';
