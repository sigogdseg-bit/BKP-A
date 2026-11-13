-- ============================================================================
-- Hunter — Suporte Pleno a Máquinas e Tratores Sem Placa Obrigatória
-- Migration: 20261008220000_hunter_maquinas_sem_placa_e_instalacoes_placa_flexivel.sql
-- ============================================================================

DO $$
BEGIN
  -- 1. Permite que instalacoes possua placa opcional (para máquinas agrícolas / industriais e equipamentos)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'placa'
  ) THEN
    ALTER TABLE public.instalacoes ALTER COLUMN placa DROP NOT NULL;
  END IF;

  -- 2. Permite que veiculos possua placa opcional para frotas industriais/agrícolas
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'veiculos' AND column_name = 'placa'
  ) THEN
    ALTER TABLE public.veiculos ALTER COLUMN placa DROP NOT NULL;
  END IF;
END $$;

-- 3. Notifica recarregamento de schema no PostgREST
NOTIFY pgrst, 'reload schema';
