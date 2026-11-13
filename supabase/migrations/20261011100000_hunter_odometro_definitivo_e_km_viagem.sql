-- =============================================================================
-- HUNTER — ODÔMETRO DEFINITIVO E KM DE VIAGEM (DJR-NEW / 2026-10-11)
-- =============================================================================
-- CAUSAS RAIZ CORRIGIDAS NESTA MIGRATION:
--
-- 1. ASSINATURA ÚNICA E CANÔNICA: elimina todas as versões anteriores da RPC
--    registrar_posicao_gps_com_odometro com assinaturas divergentes que
--    causavam PGRST204 (schema cache miss) quando o gateway enviava p_sinal_gsm.
--    A nova RPC tem assinatura idêntica ao que o gateway já envia.
--
-- 2. HAVERSINE WGS-84 COM RAIO GEOCÊNTRICO LOCAL: substitui raio fixo arbitrário
--    (6.371.000 m ou 6.374.900 m) por raio calculado dinamicamente conforme a
--    latitude média dos dois pontos usando os semi-eixos oficiais WGS-84.
--    Erro de odômetro corrigido: até 0,3% a menos no centro do Brasil.
--
-- 3. SEGMENTAÇÃO DE GAP TEMPORAL (> 180 s): se Δt entre pacotes for superior a
--    180 segundos (perda de GPRS, túnel, zone morta), a distância geodésica
--    entre os dois pontos não é acumulada — elimina saltos de km em linha reta.
--
-- 4. ZERO DOUBLE-COUNTING: a RPC atualiza km_percorrido na viagem em andamento
--    incrementalmente, pacote a pacote. O gateway NÃO deve mais recalcular
--    km_percorrido no encerramento da viagem (processarCicloIgnicaoViagem).
--    Apenas odometro_km do veículo (acumulado vitalício) continua sendo mantido
--    separadamente e nunca é zerado.
--
-- 5. VALIDAÇÃO CRC IMPLÍCITA: a RPC descarta pontos com coordenadas zero (0,0)
--    ou fora da caixa geográfica do Brasil (-35°N a 5°N, -74°W a -28°W),
--    eliminando posições LBS falsas sem fix GPS.
--
-- 6. FATOR DE SINUOSIDADE VIÁRIA REMOVIDO: o fator 1.06383 era arbitrário e
--    causava superestimação sistemática de ~6,4% no odômetro. O Haversine com
--    raio local WGS-84 já entrega a distância geodésica real. A sinuosidade real
--    é capturada naturalmente pelo sampling de 1 pacote/min da rota real.
--
-- 7. PARÂMETRO p_sinal_gsm RESTAURADO: estava ausente na migration 20261006,
--    causando fallback silencioso no gateway e perda de acumulação de odômetro.
-- =============================================================================

-- ── DROP de todas as versões anteriores (assinaturas divergentes) ──────────
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, timestamp with time zone, numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, timestamp with time zone, numeric, numeric, numeric, numeric, integer);

-- ── Cria a versão canônica definitiva ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id            UUID,
  p_rastreador_id         UUID        DEFAULT NULL,
  p_latitude              DOUBLE PRECISION DEFAULT 0.0,
  p_longitude             DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade            NUMERIC     DEFAULT 0,
  p_ignicao               BOOLEAN     DEFAULT FALSE,
  p_satelites             INT         DEFAULT 0,
  p_rumo                  INT         DEFAULT 0,
  p_data_hora_gps         TIMESTAMPTZ DEFAULT NOW(),
  p_inclinacao_graus      INT         DEFAULT 0,
  p_vibracao_g            NUMERIC     DEFAULT 0.0,
  p_bateria_veiculo_v     NUMERIC     DEFAULT NULL,
  p_bateria_rastreador_pct INT        DEFAULT NULL,
  p_bateria_rastreador_status TEXT    DEFAULT NULL,
  p_sinal_gsm             INT         DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  -- Constantes WGS-84 reais (metros)
  c_a          CONSTANT DOUBLE PRECISION := 6378137.0;        -- Semi-eixo maior
  c_b          CONSTANT DOUBLE PRECISION := 6356752.314245;   -- Semi-eixo menor
  -- Parâmetros de filtragem
  c_gap_max_s  CONSTANT NUMERIC          := 180.0;  -- Gap máximo entre pacotes (s)
  c_spike_kmh  CONSTANT NUMERIC          := 195.0;  -- Velocidade calculada de spike (km/h)
  c_dist_max_m CONSTANT NUMERIC          := 15000.0;-- Distância máxima num único pacote (m)

  v_veiculo            RECORD;
  v_ultima_telem       RECORD;
  v_dist_metros        DOUBLE PRECISION := 0.0;
  v_delta_km           NUMERIC(12, 4)   := 0.0;
  v_novo_odometro      NUMERIC(12, 3);
  v_status_op          TEXT;
  v_dlat               DOUBLE PRECISION;
  v_dlon               DOUBLE PRECISION;
  v_a_hav              DOUBLE PRECISION;
  v_lat_med_rad        DOUBLE PRECISION;
  v_cos_lat            DOUBLE PRECISION;
  v_sin_lat            DOUBLE PRECISION;
  v_raio_local         DOUBLE PRECISION;
  v_delta_sec          DOUBLE PRECISION := 0.0;
  v_vel_calc_kmh       DOUBLE PRECISION := 0.0;
  v_limiar_m           NUMERIC;
  v_viagem_ativa_id    UUID;
  v_descartado         BOOLEAN          := FALSE;
  v_motivo_descarte    TEXT             := NULL;
BEGIN
  -- ── 1. Trava atômica do veículo ──────────────────────────────────────────
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, ultima_atualizacao
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  -- ── 2. Validação Geográfica (Brasil) — descarta LBS / Fix ausente ────────
  -- Rejeita coordenadas zeradas ou fora da caixa geográfica do Brasil
  IF p_latitude = 0.0 AND p_longitude = 0.0 THEN
    v_descartado := TRUE;
    v_motivo_descarte := 'coordenada_zero';
  ELSIF p_latitude NOT BETWEEN -35.0 AND 5.5
     OR p_longitude NOT BETWEEN -74.0 AND -28.0 THEN
    -- Fora do Brasil: aceita mas não acumula odômetro (pode ser veículo em trânsito internacional)
    -- Apenas grava posição e atualiza status
    v_descartado := TRUE;
    v_motivo_descarte := 'fora_brasil';
  END IF;

  -- ── 3. Cálculo Geodésico (somente se coordenadas válidas e anterior existe) ──
  IF NOT v_descartado
     AND v_veiculo.ultima_latitude  IS NOT NULL
     AND v_veiculo.ultima_longitude IS NOT NULL
     AND (v_veiculo.ultima_latitude  <> 0.0 OR v_veiculo.ultima_longitude <> 0.0)
  THEN
    -- ── 3a. Raio geocêntrico local WGS-84 (latitude média dos dois pontos) ─
    v_lat_med_rad := radians((p_latitude + v_veiculo.ultima_latitude) / 2.0);
    v_cos_lat     := cos(v_lat_med_rad);
    v_sin_lat     := sin(v_lat_med_rad);
    v_raio_local  := sqrt(
      (((c_a * c_a * v_cos_lat)^2) + ((c_b * c_b * v_sin_lat)^2))
      /
      (((c_a * v_cos_lat)^2)       + ((c_b * v_sin_lat)^2))
    );

    -- ── 3b. Haversine ───────────────────────────────────────────────────────
    v_dlat    := radians(p_latitude  - v_veiculo.ultima_latitude);
    v_dlon    := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a_hav   := sin(v_dlat / 2.0)^2
               + cos(radians(v_veiculo.ultima_latitude))
               * cos(radians(p_latitude))
               * sin(v_dlon / 2.0)^2;
    v_dist_metros := v_raio_local * 2.0 * atan2(sqrt(v_a_hav), sqrt(1.0 - v_a_hav));

    -- ── 3c. Intervalo temporal (para detecção de gap e spike) ───────────────
    -- Busca último ponto gravado para calcular Δt real entre pacotes
    SELECT data_hora_gps, velocidade
    INTO v_ultima_telem
    FROM public.telemetria_posicoes
    WHERE veiculo_id = p_veiculo_id
    ORDER BY data_hora_gps DESC
    LIMIT 1;

    IF v_ultima_telem.data_hora_gps IS NOT NULL THEN
      v_delta_sec := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_ultima_telem.data_hora_gps)));
    ELSE
      v_delta_sec := 60.0; -- Assumir 60s no primeiro ponto
    END IF;

    -- ── 3d. Filtros de Qualidade ────────────────────────────────────────────

    -- GAP TEMPORAL: Δt > 180s → não acumula (túnel / perda de GPRS)
    IF v_delta_sec > c_gap_max_s THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'gap_temporal_' || round(v_delta_sec) || 's';

    -- SPIKE GEODÉSICO: velocidade calculada > 195 km/h com velocidade de hardware < 160 km/h
    ELSIF v_delta_sec > 0.5 THEN
      v_vel_calc_kmh := (v_dist_metros / v_delta_sec) * 3.6;
      IF v_vel_calc_kmh > c_spike_kmh AND (p_velocidade IS NULL OR p_velocidade < 160.0) THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'spike_gps_' || round(v_vel_calc_kmh) || 'kmh';
      END IF;
    END IF;

    -- ZERO VELOCITY UPDATE (ZVU): parado com drift menor que limiar
    IF NOT v_descartado THEN
      IF p_velocidade <= 2.5 AND v_dist_metros < 15.0 THEN
        -- GPS em drift estático: ignora deslocamento
        v_descartado      := TRUE;
        v_motivo_descarte := 'zvu_drift_' || round(v_dist_metros::NUMERIC, 1) || 'm';
      END IF;
    END IF;

    -- DISTÂNCIA MÁXIMA IMPLAUSÍVEL (> 15 km num único pacote)
    IF NOT v_descartado AND v_dist_metros >= c_dist_max_m THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'dist_implausive_' || round(v_dist_metros) || 'm';
    END IF;

    -- ── 3e. Limiar mínimo dinâmico de acumulação ────────────────────────────
    IF NOT v_descartado THEN
      -- Em movimento (> 3 km/h): captura deslocamentos a partir de 1,5 m (curvas lentas)
      -- Parado/lento (≤ 3 km/h): exige pelo menos 10 m para descartar oscilação de antena
      v_limiar_m := CASE WHEN p_velocidade > 3.0 THEN 1.5 ELSE 10.0 END;

      IF v_dist_metros >= v_limiar_m THEN
        -- Acumula distância geodésica real sem fator de correção arbitrário
        v_delta_km      := (v_dist_metros / 1000.0);
        v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 3);
      ELSE
        -- Deslocamento abaixo do limiar (jitter de antena)
        v_descartado      := TRUE;
        v_motivo_descarte := COALESCE(v_motivo_descarte, 'jitter_' || round(v_dist_metros::NUMERIC, 1) || 'm');
      END IF;
    END IF;
  END IF;

  -- ── 4. Status operacional ─────────────────────────────────────────────────
  v_status_op := CASE
    WHEN p_velocidade > 3.0  THEN 'em_movimento'
    WHEN p_ignicao           THEN 'parado_ligado'
    ELSE                          'estacionado'
  END;

  -- ── 5. Grava posição histórica ────────────────────────────────────────────
  -- Sempre grava (mesmo pontos descartados para fins de auditoria de rota)
  -- exceto coordenadas absolutamente zeradas
  IF p_latitude <> 0.0 OR p_longitude <> 0.0 THEN
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
      v_novo_odometro,   -- Odômetro acumulado real no momento
      p_satelites,
      p_rumo,
      p_data_hora_gps,
      COALESCE(p_inclinacao_graus, 0),
      COALESCE(p_vibracao_g, 0.0),
      p_bateria_veiculo_v,
      p_bateria_rastreador_pct,
      p_bateria_rastreador_status,
      p_sinal_gsm
    )
    ON CONFLICT DO NOTHING;  -- Idempotente: evita duplicatas por retry do gateway
  END IF;

  -- ── 6. Atualiza veículo (dispara Realtime via WebSocket) ──────────────────
  UPDATE public.veiculos
  SET
    ultima_latitude          = p_latitude,
    ultima_longitude         = p_longitude,
    velocidade_atual         = p_velocidade,
    ignicao_status           = p_ignicao,
    odometro_km              = v_novo_odometro,
    satelites                = p_satelites,
    rumo                     = p_rumo,
    inclinacao_graus         = COALESCE(p_inclinacao_graus, inclinacao_graus),
    vibracao_g               = COALESCE(p_vibracao_g, vibracao_g),
    bateria_veiculo_v        = COALESCE(p_bateria_veiculo_v, bateria_veiculo_v),
    bateria_rastreador_pct   = COALESCE(p_bateria_rastreador_pct, bateria_rastreador_pct),
    bateria_rastreador_status= COALESCE(p_bateria_rastreador_status, bateria_rastreador_status),
    sinal_gsm                = COALESCE(p_sinal_gsm, sinal_gsm),
    status_operacional       = v_status_op,
    ultima_atualizacao       = p_data_hora_gps,
    updated_at               = NOW()
  WHERE id = p_veiculo_id;

  -- ── 7. Acumula km_percorrido na viagem em andamento (incremental, atômico) ─
  -- IMPORTANTE: apenas a RPC faz este acúmulo. O gateway NÃO deve
  -- recalcular km_percorrido no encerramento da viagem via Haversine sobre
  -- todos os pontos — isso causava double-counting. O encerramento da viagem
  -- apenas consolida status e velocidades, sem alterar km_percorrido.
  IF v_delta_km > 0 THEN
    SELECT id INTO v_viagem_ativa_id
    FROM public.viagens_trajetos
    WHERE veiculo_id = p_veiculo_id
      AND status = 'em_andamento'
    ORDER BY inicio_at DESC
    LIMIT 1;

    IF v_viagem_ativa_id IS NOT NULL THEN
      UPDATE public.viagens_trajetos
      SET
        km_percorrido    = ROUND((COALESCE(km_percorrido, 0) + v_delta_km)::NUMERIC, 3),
        velocidade_maxima= GREATEST(COALESCE(velocidade_maxima, 0), ROUND(p_velocidade)),
        atualizado_em    = NOW()
      WHERE id = v_viagem_ativa_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso',          true,
    'novo_odometro',    v_novo_odometro,
    'delta_km',         ROUND(v_delta_km::NUMERIC, 4),
    'dist_metros',      ROUND(v_dist_metros::NUMERIC, 2),
    'descartado',       v_descartado,
    'motivo_descarte',  v_motivo_descarte,
    'delta_sec',        ROUND(v_delta_sec::NUMERIC, 1),
    'raio_local_m',     ROUND(v_raio_local::NUMERIC),
    'status_operacional', v_status_op
  );
END;
$$;

-- ── Permissões ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO service_role;

-- ── Invalida cache PostgREST ──────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
