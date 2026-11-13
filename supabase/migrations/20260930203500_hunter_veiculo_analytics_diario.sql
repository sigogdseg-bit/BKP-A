-- ─────────────────────────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: 20260930203500_hunter_veiculo_analytics_diario.sql
-- DESCRIÇÃO: Tabela D-1 para consolidar analytics diário POR VEÍCULO, não motorista.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remover tabela/rpc antiga de motorista (já que estava incorreta pro negócio)
DROP FUNCTION IF EXISTS public.gerar_analytics_motorista_dia(UUID, INT);
DROP TABLE IF EXISTS public.motorista_analytics_diario CASCADE;

-- 2. Criar a nova tabela orientada a VEÍCULO
CREATE TABLE IF NOT EXISTS public.veiculo_analytics_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  km_rodado DECIMAL(10,2) NOT NULL DEFAULT 0,
  tempo_ocioso_minutos INT NOT NULL DEFAULT 0,
  vel_maxima_atingida INT NOT NULL DEFAULT 0,
  consumo_kml DECIMAL(10,2) NOT NULL DEFAULT 0,
  score_conducao INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(veiculo_id, data_referencia)
);

-- RLS
ALTER TABLE public.veiculo_analytics_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso aos analytics do veiculo do próprio cliente"
  ON public.veiculo_analytics_diario
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = veiculo_analytics_diario.cliente_id
      AND c.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.adm_users a
      WHERE a.user_id = auth.uid() AND a.ativo = TRUE
    )
  );

-- Function RPC para gerar/recuperar dados D-1 do CLIENTE (todos os veículos dele)
CREATE OR REPLACE FUNCTION public.gerar_analytics_cliente_dia(
  p_cliente_id UUID,
  p_dias INT DEFAULT 7
)
RETURNS TABLE (
  veiculo_id UUID,
  placa TEXT,
  marca_modelo TEXT,
  data_referencia DATE,
  km_rodado DECIMAL(10,2),
  tempo_ocioso_minutos INT,
  vel_maxima_atingida INT,
  consumo_kml DECIMAL(10,2),
  score_conducao INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_veiculo RECORD;
  v_date DATE;
  v_existe BOOLEAN;
BEGIN
  -- 1. Iterar todos os veículos do cliente
  FOR v_veiculo IN 
    SELECT id, placa, marca_modelo FROM public.veiculos WHERE cliente_id = p_cliente_id 
  LOOP
    -- Para cada veículo, simular/garantir dados dos últimos p_dias
    FOR i IN 1..p_dias LOOP
      v_date := CURRENT_DATE - i;

      SELECT EXISTS (
        SELECT 1 FROM public.veiculo_analytics_diario
        WHERE veiculo_analytics_diario.veiculo_id = v_veiculo.id
          AND veiculo_analytics_diario.data_referencia = v_date
      ) INTO v_existe;

      IF NOT v_existe THEN
        -- Seed mock para o MVP. Numa subida real, isso viria da tabela de telemetria processada em cron.
        INSERT INTO public.veiculo_analytics_diario (
          veiculo_id, cliente_id, data_referencia, km_rodado, tempo_ocioso_minutos,
          vel_maxima_atingida, consumo_kml, score_conducao
        ) VALUES (
          v_veiculo.id,
          p_cliente_id,
          v_date,
          ROUND((RANDOM() * 100 + 20)::numeric, 2), -- 20 a 120km
          FLOOR(RANDOM() * 60 + 10)::int,         -- 10 a 70 min
          FLOOR(RANDOM() * 50 + 60)::int,         -- 60 a 110 km/h
          ROUND((RANDOM() * 5 + 8)::numeric, 2),    -- 8 a 13 km/l
          FLOOR(RANDOM() * 20 + 80)::int          -- 80 a 100 score
        );
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Retornar os dados
  RETURN QUERY
    SELECT 
      vad.veiculo_id,
      v.placa,
      v.marca_modelo,
      vad.data_referencia,
      vad.km_rodado,
      vad.tempo_ocioso_minutos,
      vad.vel_maxima_atingida,
      vad.consumo_kml,
      vad.score_conducao
    FROM public.veiculo_analytics_diario vad
    JOIN public.veiculos v ON v.id = vad.veiculo_id
    WHERE vad.cliente_id = p_cliente_id
      AND vad.data_referencia >= CURRENT_DATE - p_dias
    ORDER BY v.placa ASC, vad.data_referencia ASC;
END;
$$;
