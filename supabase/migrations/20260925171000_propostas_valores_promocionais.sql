-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Propostas Comerciais - Valores Cheios Padrão e Condição Promocional
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- Adiciona campos de valores cheios e flag de promoção
ALTER TABLE public.propostas_comerciais
ADD COLUMN IF NOT EXISTS com_fidelidade_instalacao_cheia NUMERIC(10,2) NOT NULL DEFAULT 380.00,
ADD COLUMN IF NOT EXISTS com_fidelidade_mensalidade_cheia NUMERIC(10,2) NOT NULL DEFAULT 120.00,
ADD COLUMN IF NOT EXISTS sem_fidelidade_instalacao_cheia NUMERIC(10,2) NOT NULL DEFAULT 420.00,
ADD COLUMN IF NOT EXISTS sem_fidelidade_mensalidade_cheia NUMERIC(10,2) NOT NULL DEFAULT 160.00,
ADD COLUMN IF NOT EXISTS aplicar_promocao BOOLEAN NOT NULL DEFAULT true;

-- Atualiza registros existentes que estejam com zero ou nulo
UPDATE public.propostas_comerciais
SET 
  com_fidelidade_instalacao_cheia = COALESCE(NULLIF(com_fidelidade_instalacao_cheia, 0), 380.00),
  com_fidelidade_mensalidade_cheia = COALESCE(NULLIF(com_fidelidade_mensalidade_cheia, 0), 120.00),
  sem_fidelidade_instalacao_cheia = COALESCE(NULLIF(sem_fidelidade_instalacao_cheia, 0), 420.00),
  sem_fidelidade_mensalidade_cheia = COALESCE(NULLIF(sem_fidelidade_mensalidade_cheia, 0), 160.00),
  aplicar_promocao = COALESCE(aplicar_promocao, true)
WHERE 
  com_fidelidade_instalacao_cheia IS NULL OR com_fidelidade_instalacao_cheia = 0;
