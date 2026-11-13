-- ============================================================================
-- HUNTER — TELEMETRIA REAL DE BATERIA DO VEÍCULO E BATERIA INTERNA DO RASTREADOR
-- ============================================================================
-- Padrão: Manual do Rastreador J16 4G (Protocolo Concox / GT06 / Jimi IoT)
-- Bateria do Carro: Alimentação Externa VCC (9V a 90V DC) -> Volts
-- Bateria do Rastreador: Bateria Interna de Backup (3.7V Li-ion) -> Percentual (0-100%)
-- Regra Pétrea: Nenhuma informação inventada. Null/Ausente = Não Informado.
-- ============================================================================

-- 1. Colunas na tabela public.veiculos
DO $$ BEGIN
  -- Bateria principal do carro (Voltagem em Volts, ex: 12.6V, 13.8V, 24.0V)
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS voltagem NUMERIC(4, 1);
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS bateria_veiculo_v NUMERIC(4, 1);

  -- Bateria interna de backup do rastreador J16 (0 a 100%)
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS bateria_rastreador_pct INT;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS bateria_rastreador_status TEXT;

  -- Sensores complementares do J16
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS satelites INT DEFAULT 0;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS rumo INT DEFAULT 0;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS inclinacao_graus INT DEFAULT 0;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS vibracao_g NUMERIC(4,2) DEFAULT 0.00;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS alerta_acidente BOOLEAN DEFAULT FALSE;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS alerta_tipo TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 2. Colunas na tabela public.telemetria_posicoes
DO $$ BEGIN
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS bateria_veiculo_v NUMERIC(4, 1);
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS bateria_rastreador_pct INT;
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS bateria_rastreador_status TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 3. Comentários para documentação técnica de schema
COMMENT ON COLUMN public.veiculos.bateria_veiculo_v IS 'Voltagem real da bateria principal do veículo medida pelo rastreador (em Volts)';
COMMENT ON COLUMN public.veiculos.bateria_rastreador_pct IS 'Percentual de carga real da bateria interna de backup do rastreador (0 a 100%)';
COMMENT ON COLUMN public.veiculos.bateria_rastreador_status IS 'Estado da bateria interna (carregando, completa, bateria_interna, critica)';
