-- ============================================================================
-- HUNTER — Despesas do Veículo, Conclusão Financeira de Manutenções e Formas de Pagamento
-- ============================================================================
-- Permite que clientes e administradores lancem despesas de veículos, comprem
-- insumos (óleo, palhetas, pneus, limpeza) e concluam revisões registrando
-- valor gasto (R$), como foi pago e comprovante fiscal (NF) para auditoria.
-- ============================================================================

-- 1. Permitir que motorista_id seja opcional (lançamento por cliente ou adm da frota)
DO $$ BEGIN
  ALTER TABLE public.motorista_despesas ALTER COLUMN motorista_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Adicionar colunas de Forma de Pagamento, Oficina e Vínculo Preventivo
DO $$ BEGIN
  ALTER TABLE public.motorista_despesas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT DEFAULT 'pix';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.motorista_despesas ADD COLUMN IF NOT EXISTS oficina_prestador TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.motorista_despesas ADD COLUMN IF NOT EXISTS plano_manutencao_id UUID REFERENCES public.planos_manutencao_preventiva(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.motorista_despesas ADD COLUMN IF NOT EXISTS tipo_despesa TEXT DEFAULT 'despesa_rota';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_despesas_veiculo_data ON public.motorista_despesas(veiculo_id, data_despesa DESC);
CREATE INDEX IF NOT EXISTS idx_despesas_plano_manutencao ON public.motorista_despesas(plano_manutencao_id);

-- 4. Recarregar o cache do PostgREST
NOTIFY pgrst, 'reload schema';
