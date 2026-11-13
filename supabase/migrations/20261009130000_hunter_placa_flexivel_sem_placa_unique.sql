-- ============================================================================
-- Hunter — Ajuste de Constraint de Placa para Máquinas e Veículos Sem Placa
-- Migration: 20261009130000_hunter_placa_flexivel_sem_placa_unique.sql
-- ============================================================================

DO $$
BEGIN
  -- 1. Remove a constraint única rígida de placa que bloqueava múltiplos "SEMPLACA" ou "A DEFINIR"
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.veiculos'::regclass AND conname = 'veiculos_placa_key'
  ) THEN
    ALTER TABLE public.veiculos DROP CONSTRAINT veiculos_placa_key;
  END IF;

  -- 2. Remove qualquer outro índice único total sobre a coluna placa em veiculos
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'veiculos' AND indexname = 'veiculos_placa_key'
  ) THEN
    DROP INDEX public.veiculos_placa_key;
  END IF;
END $$;

-- 3. Cria índice único parcial: apenas placas reais cadastradas e ativas precisam ser exclusivas
DROP INDEX IF EXISTS public.uq_veiculos_placa_real;
CREATE UNIQUE INDEX IF NOT EXISTS uq_veiculos_placa_real 
ON public.veiculos (UPPER(TRIM(placa))) 
WHERE placa IS NOT NULL 
  AND UPPER(TRIM(placa)) NOT IN ('SEMPLACA', 'SEM PLACA', 'A DEFINIR', 'S/PLACA');

-- 4. Notifica recarregamento de schema no PostgREST
NOTIFY pgrst, 'reload schema';
