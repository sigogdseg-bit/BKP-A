-- ─────────────────────────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: 20260930230000_hunter_consumo_real_abastecimento.sql
-- DESCRIÇÃO: Erradicação de consumo estimado/fictício. Consumo real apurado
-- exclusivamente por abastecimentos consecutivos (KM rodado / Litros abastecidos).
-- Quando não há dados suficientes, consumo_kml é estritamente NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Permitir NULL na coluna consumo_kml (sem default 0 inventado)
ALTER TABLE public.veiculo_analytics_diario 
  ALTER COLUMN consumo_kml DROP NOT NULL,
  ALTER COLUMN consumo_kml SET DEFAULT NULL;

-- 2. Limpar dados simulados anteriores de consumo
UPDATE public.veiculo_analytics_diario
SET consumo_kml = NULL
WHERE consumo_kml IS NOT NULL AND consumo_kml > 0;

-- 3. Atualizar a RPC gerar_analytics_cliente_dia para usar exclusivamente dados reais
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
  v_km_real DECIMAL(10,2);
  v_vel_max INT;
  v_score INT;
  v_consumo_apurado DECIMAL(10,2);
  v_abast_atual RECORD;
  v_abast_ant RECORD;
BEGIN
  -- 1. Iterar todos os veículos ativos do cliente
  FOR v_veiculo IN 
    SELECT id, placa, marca_modelo FROM public.veiculos WHERE cliente_id = p_cliente_id 
  LOOP
    FOR i IN 1..p_dias LOOP
      v_date := CURRENT_DATE - i;

      -- Aferição de KM rodado e velocidade máxima real daquele dia via viagens_trajetos
      SELECT 
        COALESCE(SUM(km_percorrido), 0),
        COALESCE(MAX(velocidade_maxima), 0)
      INTO v_km_real, v_vel_max
      FROM public.viagens_trajetos vt
      WHERE vt.veiculo_id = v_veiculo.id
        AND vt.inicio_at >= (v_date::text || ' 00:00:00')::timestamptz
        AND vt.inicio_at <= (v_date::text || ' 23:59:59.999')::timestamptz;

      -- Score de condução objetivo: base 100 com desconto por excesso de velocidade severo
      IF v_km_real = 0 THEN
        v_score := 100;
      ELSIF v_vel_max > 90 THEN
        v_score := GREATEST(40, 100 - (v_vel_max - 90));
      ELSE
        v_score := 100;
      END IF;

      -- Consumo Real: Verificar se houve abastecimento registrado para o veículo nesta data
      v_consumo_apurado := NULL;
      
      FOR v_abast_atual IN
        SELECT id, km_atual, litros, data_abastecimento
        FROM public.motorista_abastecimentos
        WHERE veiculo_id = v_veiculo.id
          AND data_abastecimento = v_date
          AND km_atual IS NOT NULL
          AND km_atual > 0
          AND litros > 0
        ORDER BY created_at DESC
        LIMIT 1
      LOOP
        -- Buscar o abastecimento imediatamente anterior para calcular o delta de KM
        SELECT km_atual
        INTO v_abast_ant
        FROM public.motorista_abastecimentos
        WHERE veiculo_id = v_veiculo.id
          AND (data_abastecimento < v_abast_atual.data_abastecimento 
               OR (data_abastecimento = v_abast_atual.data_abastecimento AND id <> v_abast_atual.id))
          AND km_atual IS NOT NULL
          AND km_atual < v_abast_atual.km_atual
        ORDER BY data_abastecimento DESC, created_at DESC
        LIMIT 1;

        IF v_abast_ant.km_atual IS NOT NULL AND (v_abast_atual.km_atual - v_abast_ant.km_atual) > 0 THEN
          v_consumo_apurado := ROUND(((v_abast_atual.km_atual - v_abast_ant.km_atual) / v_abast_atual.litros)::numeric, 2);
        END IF;
      END LOOP;

      -- Upsert no registro diário do veículo com dados reais (sem random)
      INSERT INTO public.veiculo_analytics_diario (
        veiculo_id,
        cliente_id,
        data_referencia,
        km_rodado,
        tempo_ocioso_minutos,
        vel_maxima_atingida,
        consumo_kml,
        score_conducao,
        updated_at
      ) VALUES (
        v_veiculo.id,
        p_cliente_id,
        v_date,
        v_km_real,
        0,
        v_vel_max,
        v_consumo_apurado,
        v_score,
        NOW()
      )
      ON CONFLICT (veiculo_id, data_referencia) DO UPDATE SET
        km_rodado = EXCLUDED.km_rodado,
        vel_maxima_atingida = EXCLUDED.vel_maxima_atingida,
        consumo_kml = EXCLUDED.consumo_kml,
        score_conducao = EXCLUDED.score_conducao,
        updated_at = NOW();

    END LOOP;
  END LOOP;

  -- Retornar os dados consolidados reais
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
