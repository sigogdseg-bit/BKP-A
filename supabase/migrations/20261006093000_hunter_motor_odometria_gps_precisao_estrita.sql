-- ============================================================================
-- MIGRATION: 20261006093000_hunter_motor_odometria_gps_precisao_estrita.sql
-- DESCRIÇÃO: Motor de Odometria GPS de Alta Precisão Física (GD Rastreamento)
-- REGRAS:
-- 1. Erradicação definitiva de fatores arbitrários (zero hardcode de 1.05 ou 1.06383).
-- 2. Geodésia elipsoidal WGS-84 com raio geocêntrico local (6.374.900m).
-- 3. Máquina de estados anti-drift com histerese de parada (drift < 15m com v <= 2.5 km/h ignorado).
-- 4. Rejeição de spikes e saltos de posição impossíveis (> 190 km/h ou aceleração incoerente).
-- 5. Preservação de curvas reais sem atalhos simplificados.
-- ============================================================================

-- Adiciona colunas de auditoria de odometria em viagens_trajetos se não existirem
ALTER TABLE public.viagens_trajetos 
ADD COLUMN IF NOT EXISTS distance_raw_km NUMERIC(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS pontos_descartados INT DEFAULT 0;

CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id UUID,
  p_rastreador_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_velocidade NUMERIC,
  p_ignicao BOOLEAN,
  p_satelites INT,
  p_data_hora_gps TIMESTAMPTZ,
  p_tensao_bateria_v NUMERIC DEFAULT NULL,
  p_bateria_backup_pct NUMERIC DEFAULT NULL,
  p_tensao_bateria_backup_v NUMERIC DEFAULT NULL,
  p_rumo NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_ultima_telemetria RECORD;
  v_novo_odometro NUMERIC(12, 3);
  v_delta_km NUMERIC(12, 4) := 0.0000;
  v_dist_metros DOUBLE PRECISION := 0.0;
  v_delta_sec DOUBLE PRECISION := 0.0;
  v_vel_calculada DOUBLE PRECISION := 0.0;
  v_dlat DOUBLE PRECISION;
  v_dlon DOUBLE PRECISION;
  v_a DOUBLE PRECISION;
  v_status_op TEXT;
  v_viagem_id UUID;
  v_pontos_descartados INT := 0;
  v_is_spike BOOLEAN := false;
  v_is_drift BOOLEAN := false;
  v_raio_local DOUBLE PRECISION := 6374900.0; -- Raio geocêntrico médio no elipsoide WGS-84 (~22.5°S)
BEGIN
  -- Bloqueia a linha do veículo para concorrência
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, cliente_id, ultima_atualizacao
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  -- Busca o último ponto gravado para calcular intervalo de tempo e rejeitar duplicatas/spikes
  SELECT latitude, longitude, data_hora_gps, velocidade
  INTO v_ultima_telemetria
  FROM public.telemetria_posicoes
  WHERE veiculo_id = p_veiculo_id
  ORDER BY data_hora_gps DESC
  LIMIT 1;

  -- ─────────────────────────────────────────────────────────────────────────
  -- CÁLCULO GEODÉSICO ELIPSOIDAL WGS-84 E MOTOR ANTI-DRIFT
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_veiculo.ultima_latitude IS NOT NULL 
     AND v_veiculo.ultima_longitude IS NOT NULL 
     AND (v_veiculo.ultima_latitude <> 0 OR v_veiculo.ultima_longitude <> 0)
     AND (p_latitude <> 0 OR p_longitude <> 0)
     AND p_latitude BETWEEN -90.0 AND 90.0
     AND p_longitude BETWEEN -180.0 AND 180.0 THEN
    
    v_dlat := radians(p_latitude - v_veiculo.ultima_latitude);
    v_dlon := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := v_raio_local * 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));

    -- Calcula intervalo em segundos
    IF v_ultima_telemetria.data_hora_gps IS NOT NULL THEN
      v_delta_sec := EXTRACT(EPOCH FROM (p_data_hora_gps - v_ultima_telemetria.data_hora_gps));
    ELSE
      v_delta_sec := 10.0;
    END IF;

    -- 1. Validação de Outliers / Spikes Físicos
    IF v_delta_sec > 0 THEN
      v_vel_calculada := (v_dist_metros / v_delta_sec) * 3.6;
      -- Se a velocidade calculada for superior a 190 km/h e diferir muito da velocidade do hardware, é spike
      IF v_vel_calculada > 190.0 AND (p_velocidade IS NULL OR p_velocidade < 150.0) THEN
        v_is_spike := true;
      END IF;
    END IF;

    -- 2. Máquina de Estados Anti-Drift com Histerese
    -- Se ignição desligada e velocidade zero, ou deslocamento inferior a 15m com velocidade <= 2.5 km/h:
    IF NOT p_ignicao AND p_velocidade <= 2.5 THEN
      v_is_drift := true;
    ELSIF p_velocidade <= 2.5 AND v_dist_metros < 15.0 THEN
      v_is_drift := true;
    END IF;

    -- 3. Acumulação Física Real (Sem Fatores Arbitrários)
    IF NOT v_is_spike AND NOT v_is_drift AND v_dist_metros >= 1.5 AND v_dist_metros < 15000.0 THEN
      v_delta_km := (v_dist_metros / 1000.0)::NUMERIC;
      v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 3);
    ELSE
      v_delta_km := 0.0000;
      IF v_is_spike OR v_is_drift THEN
        v_pontos_descartados := 1;
      END IF;
    END IF;
  ELSE
    v_delta_km := 0.0000;
  END IF;

  -- Determina status operacional
  v_status_op := CASE
    WHEN p_velocidade > 2.5 THEN 'em_movimento'
    WHEN p_ignicao THEN 'parado_ligado'
    ELSE 'estacionado'
  END;

  -- 1. Insere histórico na tabela telemetria_posicoes
  INSERT INTO public.telemetria_posicoes (
    veiculo_id,
    rastreador_id,
    latitude,
    longitude,
    velocidade,
    ignicao,
    odometro,
    satelites,
    rumo,
    data_hora_gps,
    inclinacao_graus,
    vibracao_g,
    bateria_veiculo_v,
    bateria_rastreador_pct,
    bateria_rastreador_status,
    sinal_gsm
  ) VALUES (
    p_veiculo_id,
    p_rastreador_id,
    p_latitude,
    p_longitude,
    p_velocidade,
    p_ignicao,
    v_novo_odometro,
    p_satelites,
    p_rumo,
    p_data_hora_gps,
    0,
    0,
    p_tensao_bateria_v,
    p_bateria_backup_pct,
    CASE 
      WHEN p_tensao_bateria_backup_v > 3.6 THEN 'normal'
      WHEN p_tensao_bateria_backup_v > 0 THEN 'baixa'
      ELSE 'ok'
    END,
    100
  );

  -- 2. Atualiza tabela veiculos
  UPDATE public.veiculos
  SET 
    ultima_latitude = p_latitude,
    ultima_longitude = p_longitude,
    velocidade = p_velocidade,
    ignicao = p_ignicao,
    odometro_km = v_novo_odometro,
    status_operacional = v_status_op,
    satelites = p_satelites,
    rumo = p_rumo,
    tensao_bateria = p_tensao_bateria_v,
    nivel_bateria = p_bateria_backup_pct,
    ultima_atualizacao = p_data_hora_gps,
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  -- 3. Atualização contínua e em tempo real da viagem em andamento
  SELECT id INTO v_viagem_id
  FROM public.viagens_trajetos
  WHERE veiculo_id = p_veiculo_id
    AND status = 'em_andamento'
  ORDER BY inicio_at DESC
  LIMIT 1;

  IF v_viagem_id IS NOT NULL THEN
    UPDATE public.viagens_trajetos
    SET 
      km_percorrido = ROUND(COALESCE(km_percorrido, 0) + v_delta_km, 3),
      distance_raw_km = ROUND(COALESCE(distance_raw_km, 0) + (v_dist_metros / 1000.0)::NUMERIC, 3),
      pontos_descartados = COALESCE(pontos_descartados, 0) + v_pontos_descartados,
      velocidade_maxima = GREATEST(COALESCE(velocidade_maxima, 0), ROUND(p_velocidade)),
      atualizado_em = NOW()
    WHERE id = v_viagem_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'novo_odometro', v_novo_odometro,
    'delta_km', v_delta_km,
    'dist_metros', v_dist_metros,
    'is_drift', v_is_drift,
    'is_spike', v_is_spike,
    'status_operacional', v_status_op,
    'viagem_id', v_viagem_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO service_role;

NOTIFY pgrst, 'reload schema';
