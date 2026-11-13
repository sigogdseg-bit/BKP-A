-- ============================================================================
-- HUNTER — SUPORTE A CUSTO BASE, FRETE UNITÁRIO E MARKUP EM ESTOQUE_ITENS
-- ============================================================================
-- Data: 29/09/2026
-- Objetivo: Permitir que o frete unitário componha o custo total do material
--           em estoque, somando ao final do markup sem incidência de lucro.
-- ============================================================================

DO $$
BEGIN
  -- 1. Custo Base (aquisição direta da peça)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'custo_base'
  ) THEN
    ALTER TABLE public.estoque_itens ADD COLUMN custo_base NUMERIC(12, 2) DEFAULT 0;
  END IF;

  -- 2. Custo do Frete Unitário (rateio do frete por unidade)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'custo_frete'
  ) THEN
    ALTER TABLE public.estoque_itens ADD COLUMN custo_frete NUMERIC(12, 2) DEFAULT 0;
  END IF;

  -- 3. Preço de Venda
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'preco_venda'
  ) THEN
    ALTER TABLE public.estoque_itens ADD COLUMN preco_venda NUMERIC(12, 2) DEFAULT 0;
  END IF;

  -- 4. Markup Percentual
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_itens' AND column_name = 'markup_percentual'
  ) THEN
    ALTER TABLE public.estoque_itens ADD COLUMN markup_percentual NUMERIC(12, 2) DEFAULT 0;
  END IF;
END $$;
