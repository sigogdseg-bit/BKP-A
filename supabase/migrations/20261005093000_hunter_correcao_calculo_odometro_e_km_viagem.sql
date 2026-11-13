-- =============================================================================
-- HUNTER — CORREÇÃO DEFINITIVA DO CÁLCULO DE ODÔMETRO E KM DE VIAGEM (DJR-NEW)
-- Versão da Migração: 20261005093000_hunter_correcao_calculo_odometro_e_km_viagem.sql
-- =============================================================================
-- 1. Restaura o fator de calibração viária (1.06383) para compensar curvatura e sinuosidade de vias (1,00 km real = 0,94 km GPS linear).
-- 2. Limiar dinâmico anti-ruído:
--    - Em movimento (> 3 km/h): 1.5 metros (captura deslocamentos em baixa velocidade e curvas sem descarte indevido).
--    - Parado (<= 3 km/h): 8.0 metros (descarta flutuações e jitter da antena GPS com veículo estacionado).
-- 3. Restaura a atualização atômica contínua em viagens_trajetos (km_percorrido e velocidade_maxima) a cada pacote em tempo real.
-- 4. Notifica o PostgREST para recarregar o schema cache imediatamente.
-- =============================================================================

DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);

CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id UUID,
  p_rastreador_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT 0.0,
  p_longitude DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade NUMERIC DEFAULT 0,
  p_ignicao BOOLEAN DEFAULT FALSE,
  p_satelites INT DEFAULT 0,
  p_rumo INT DEFAULT 0,
  p_data_hora_gps TIMESTAMPTZ DEFAULT NOW(),
  p_inclinacao_graus INT DEFAULT 0,
  p_vibracao_g NUMERIC DEFAULT 0.0,
  p_bateria_veiculo_v NUMERIC DEFAULT NULL,
  p_bateria_rastreador_pct INT DEFAULT NULL,
  p_bateria_rastreador_status TEXT DEFAULT NULL,
  p_sinal_gsm INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_dist_metros NUMERIC := 0;
  v_dist_calibrada NUMERIC := 0;
  v_delta_km NUMERIC := 0;
  v_novo_odometro NUMERIC(12, 2);
  v_status_op TEXT;
  v_dlat NUMERIC;
  v_dlon NUMERIC;
  v_a NUMERIC;
  v_limiar_minimo NUMERIC;
BEGIN
  -- Trava a linha do veículo para evitar concorrência em alta taxa de telemetria
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, cliente_id, ultima_atualizacao
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  -- ─────────────────────────────────────────────────────────────────────────
  -- FÓRMULA HAVERSINE DE ALTA PRECISÃO COM CALIBRAÇÃO E LIMIAR DINÂMICO
  -- 1. Se possui coordenadas anteriores válidas e o carro está em trânsito (ignição OU velocidade)
  -- 2. Limiar dinâmico inteligente:
  --    - Carro em movimento (> 3 km/h): captura pequenos deslocamentos (>= 1.5 metros)
  --    - Carro parado (<= 3 km/h): exige 8.0 metros para descartar oscilação de antena
  -- 3. Calibração de precisão viária: compensa curvatura, relevo e sinuosidade (Fator: 1.06383)
  -- 4. Teto de plausibilidade: < 15.000 metros (15 km) num único pacote
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_veiculo.ultima_latitude IS NOT NULL 
     AND v_veiculo.ultima_longitude IS NOT NULL 
     AND (v_veiculo.ultima_latitude <> 0 OR v_veiculo.ultima_longitude <> 0)
     AND (p_latitude <> 0 OR p_longitude <> 0)
     AND (p_velocidade > 0 OR p_ignicao) THEN
    
    v_dlat := radians(p_latitude - v_veiculo.ultima_latitude);
    v_dlon := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));

    IF p_velocidade > 3 THEN
      v_limiar_minimo := 1.5;
    ELSE
      v_limiar_minimo := 8.0;
    END IF;

    IF v_dist_metros >= v_limiar_minimo AND v_dist_metros < 15000.0 THEN
      v_dist_calibrada := v_dist_metros * 1.06383;
      v_delta_km := (v_dist_calibrada / 1000.0);
      v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 2);
    END IF;
  ELSE
    v_delta_km := 0.0;
  END IF;

  -- Determina status operacional
  v_status_op := CASE
    WHEN p_velocidade > 3 THEN 'em_movimento'
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
    p_inclinacao_graus,
    p_vibracao_g,
    p_bateria_veiculo_v,
    p_bateria_rastreador_pct,
    p_bateria_rastreador_status,
    p_sinal_gsm
  );

  -- 2. Atualiza os dados instantâneos no veículo (dispara Realtime via WebSocket)
  UPDATE public.veiculos
  SET
    ultima_latitude = p_latitude,
    ultima_longitude = p_longitude,
    velocidade_atual = p_velocidade,
    ignicao_status = p_ignicao,
    odometro_km = v_novo_odometro,
    satelites = p_satelites,
    rumo = p_rumo,
    inclinacao_graus = p_inclinacao_graus,
    vibracao_g = p_vibracao_g,
    bateria_veiculo_v = COALESCE(p_bateria_veiculo_v, bateria_veiculo_v),
    bateria_rastreador_pct = COALESCE(p_bateria_rastreador_pct, bateria_rastreador_pct),
    bateria_rastreador_status = COALESCE(p_bateria_rastreador_status, bateria_rastreador_status),
    sinal_gsm = COALESCE(p_sinal_gsm, sinal_gsm),
    status_operacional = v_status_op,
    ultima_atualizacao = p_data_hora_gps,
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  -- 3. Atualiza quilometragem da viagem em andamento em tempo real
  IF v_delta_km > 0 THEN
    UPDATE public.viagens_trajetos
    SET
      km_percorrido = ROUND((COALESCE(km_percorrido, 0) + v_delta_km)::NUMERIC, 2),
      velocidade_maxima = GREATEST(COALESCE(velocidade_maxima, 0), p_velocidade)
    WHERE veiculo_id = p_veiculo_id AND status = 'em_andamento';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'odometro_anterior', v_veiculo.odometro_km,
    'delta_km', ROUND(v_delta_km::NUMERIC, 3),
    'novo_odometro', v_novo_odometro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
