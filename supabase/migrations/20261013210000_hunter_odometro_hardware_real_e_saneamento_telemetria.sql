-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Odômetro Físico Real J16 (MCU), Data da Leitura e Saneamento
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante a coluna odometro_hardware_km na tabela public.veiculos
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS odometro_hardware_km NUMERIC(12, 2) DEFAULT NULL;

-- 2. Coluna para rastreabilidade de data e hora em que a MCU foi lida
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS odometro_hardware_atualizado_em TIMESTAMPTZ DEFAULT NULL;

-- 3. Invalidação do cache PostgREST (obrigatório)
NOTIFY pgrst, 'reload schema';
