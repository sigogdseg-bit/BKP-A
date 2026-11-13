-- ─────────────────────────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: 20260930233000_hunter_telemetria_corporativa_frota.sql
-- DESCRIÇÃO: Expansão corporativa de telemetria da frota:
-- 1. Tempo ocioso real calculado a partir da ignição ligada sem deslocamento
-- 2. Contagem e agregação de alertas de segurança e infrações por dia
-- 3. Inclusão de alertas_count em veiculo_analytics_diario e na RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adicionar coluna alertas_count na tabela veiculo_analytics_diario
ALTER TABLE public.veiculo_analytics_diario 
  ADD COLUMN IF NOT EXISTS alertas_count INT NOT NULL DEFAULT 0;

-- 2. Atualizar a RPC gerar_analytics_cliente_dia com apuração de tempo ocioso e alertas reais
DROP FUNCTION IF EXISTS public.gerar_analytics_cliente_dia(UUID, INT);

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
  score_conducao INT,
  alertas_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_veiculo RECORD;
  v_date DATE;
  v_km_real DECIMAL(10,2);
  v_vel_max INT;
  v_ocioso_real INT;
  v_alertas_count INT;
  v_score INT;
  v_consumo_apurado DECIMAL(10,2);
  v_abast_atual RECORD;
  v_abast_ant RECORD;
BEGIN
  FOR v_veiculo IN 
    SELECT id, placa, marca_modelo FROM public.veiculos WHERE cliente_id = p_cliente_id 
  LOOP
    FOR i IN 1..p_dias LOOP
      v_date := CURRENT_DATE - i;

      -- 1. Aferição de KM rodado, velocidade máxima e tempo ocioso real via viagens_trajetos
      SELECT 
        COALESCE(SUM(km_percorrido), 0),
        COALESCE(MAX(velocidade_maxima), 0),
        COALESCE(SUM(
          CASE 
            WHEN fim_at IS NOT NULL AND fim_at > inicio_at THEN
              GREATEST(0, ROUND(EXTRACT(EPOCH FROM (fim_at - inicio_at)) / 60) - 
                CASE 
                  WHEN velocidade_media > 0 AND km_percorrido > 0 THEN 
                    ROUND((km_percorrido / velocidade_media) * 60)
                  ELSE 0
                END
              )
            ELSE 0
          END
        ), 0)
      INTO v_km_real, v_vel_max, v_ocioso_real
      FROM public.viagens_trajetos vt
      WHERE vt.veiculo_id = v_veiculo.id
        AND vt.inicio_at >= (v_date::text || ' 00:00:00')::timestamptz
        AND vt.inicio_at <= (v_date::text || ' 23:59:59.999')::timestamptz;

      -- 2. Alertas de segurança registrados para o veículo nesta data
      SELECT COUNT(*)
      INTO v_alertas_count
      FROM public.alertas_seguranca a
      WHERE a.veiculo_id = v_veiculo.id
        AND a.created_at >= (v_date::text || ' 00:00:00')::timestamptz
        AND a.created_at <= (v_date::text || ' 23:59:59.999')::timestamptz;

      -- 3. Score de condução objetivo: base 100 com desconto por excesso de velocidade e alertas
      IF v_km_real = 0 AND v_ocioso_real = 0 AND v_alertas_count = 0 THEN
        v_score := 100;
      ELSE
        v_score := 100;
        IF v_vel_max > 90 THEN
          v_score := v_score - (v_vel_max - 90);
        END IF;
        IF v_alertas_count > 0 THEN
          v_score := v_score - (v_alertas_count * 5);
        END IF;
        IF v_ocioso_real > 30 THEN
          v_score := v_score - 5;
        END IF;
        v_score := GREATEST(30, v_score);
      END IF;

      -- 4. Consumo Real: exclusivamente por abastecimentos consecutivos
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

      -- 5. Upsert no registro diário do veículo com dados reais
      INSERT INTO public.veiculo_analytics_diario (
        veiculo_id,
        cliente_id,
        data_referencia,
        km_rodado,
        tempo_ocioso_minutos,
        vel_maxima_atingida,
        consumo_kml,
        score_conducao,
        alertas_count,
        updated_at
      ) VALUES (
        v_veiculo.id,
        p_cliente_id,
        v_date,
        v_km_real,
        v_ocioso_real,
        v_vel_max,
        v_consumo_apurado,
        v_score,
        v_alertas_count,
        NOW()
      )
      ON CONFLICT (veiculo_id, data_referencia) DO UPDATE SET
        km_rodado = EXCLUDED.km_rodado,
        tempo_ocioso_minutos = EXCLUDED.tempo_ocioso_minutos,
        vel_maxima_atingida = EXCLUDED.vel_maxima_atingida,
        consumo_kml = EXCLUDED.consumo_kml,
        score_conducao = EXCLUDED.score_conducao,
        alertas_count = EXCLUDED.alertas_count,
        updated_at = NOW();

    END LOOP;
  END LOOP;

  -- 6. Retornar os dados consolidados reais
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
      vad.score_conducao,
      vad.alertas_count
    FROM public.veiculo_analytics_diario vad
    JOIN public.veiculos v ON v.id = vad.veiculo_id
    WHERE vad.cliente_id = p_cliente_id
      AND vad.data_referencia >= CURRENT_DATE - p_dias
    ORDER BY v.placa ASC, vad.data_referencia ASC;
END;
$$;
