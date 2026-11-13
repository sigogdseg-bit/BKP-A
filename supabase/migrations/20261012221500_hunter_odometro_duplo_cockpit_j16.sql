-- =============================================================================
-- HUNTER — SUPORTE A DUPLO ODÔMETRO NO COCKPIT (SERVIDOR WGS-84 vs MCU J16)
-- Versão da Migração: 20261012221500_hunter_odometro_duplo_cockpit_j16.sql
-- =============================================================================
-- Permite comparar lado a lado no Cockpit 3D:
-- 1. odometro_km: Quilometragem calculada pelo Servidor Hunter (WGS-84 + fusão inercial)
-- 2. odometro_hardware_km: Quilometragem interna acumulada pela MCU do hardware J16 (GT06METER=1)
-- =============================================================================

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS odometro_hardware_km NUMERIC(12, 2) DEFAULT NULL;

-- Inicializa odometro_hardware_km com o valor atual para veículos em operação
UPDATE public.veiculos
SET odometro_hardware_km = odometro_km
WHERE odometro_hardware_km IS NULL AND odometro_km > 0;

-- Invalidação canônica de cache do PostgREST
NOTIFY pgrst, 'reload schema';
