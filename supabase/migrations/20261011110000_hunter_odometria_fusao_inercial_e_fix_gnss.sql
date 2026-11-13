-- =============================================================================
-- HUNTER — ODOMETRIA DE ALTA ACUIDADE COM FUSÃO INERCIAL E FIX GNSS ESTREITO
-- =============================================================================
-- PROTOCOLO J16 / GT06 — RIGOR CIENTÍFICO E FÍSICO (DJR-NEW / 2026-10-11)
--
-- 1. FIX GNSS ESTREITO:
--    Aceita parâmetro p_gps_fixado BOOLEAN (Bit 4 do byte 1 do Course Status).
--    Se p_gps_fixado for FALSE (LBS ou sem fix), a telemetria é registrada mas
--    o odômetro vitalício e o km_percorrido da viagem NÃO são acumulados.
--
-- 2. ZERO VELOCITY UPDATE (ZVU) ESTRITO:
--    Se p_velocidade = 0 OU v_dist_metros < 3.0m (erro circular CEP nominal GNSS),
--    força Δs = 0 eliminando completamente o drift estático em paradas/semáforos.
--
-- 3. INTEGRAÇÃO NUMÉRICA DE VELOCIDADE (REGRA DO TRAPÉZIO):
--    Integra a velocidade instantânea medida por Doppler do hardware:
--    s_trap = ((v_i + v_{i-1}) / 7.2) * Δt
--
-- 4. CRITÉRIO DE FUSÃO INERCIAL PARA CURVAS:
--    Em curvas fechadas (Δrumo >= 8° e v > 3 km/h), a corda seca geodésica do GPS
--    subestima o arco real percorrido pelas rodas do veículo.
--    O critério de fusão prioriza o avanço inercial validado pelo Doppler (s_trap),
--    eliminando a discrepância histórica de odômetro em percursos sinuosos.
--
-- 5. SEGMENTAÇÃO DE GAPS (> 180s):
--    Se Δt > 180s (túnel / sombra de sinal), a corda cega é descartada (Δs = 0).
-- =============================================================================

-- Adiciona coluna gps_fixado nas tabelas públicas com valor default seguro
ALTER TABLE public.telemetria_posicoes
  ADD COLUMN IF NOT EXISTS gps_fixado BOOLEAN DEFAULT TRUE;

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS gps_fixado BOOLEAN DEFAULT TRUE;

-- ── DROP de versões anteriores com assinaturas divergentes ────────────────────
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer, boolean);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);

-- ── Cria a versão canônica definitiva com fusão inercial e fix GNSS ───────────
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
  p_sinal_gsm             INT         DEFAULT NULL,
  p_gps_fixado            BOOLEAN     DEFAULT TRUE
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
  -- Parâmetros de filtragem física
  c_gap_max_s  CONSTANT NUMERIC          := 180.0;  -- Gap máximo entre pacotes (s)
  c_spike_kmh  CONSTANT NUMERIC          := 195.0;  -- Velocidade calculada de spike (km/h)
  c_dist_max_m CONSTANT NUMERIC          := 15000.0;-- Distância máxima num único pacote (m)
  c_zvu_m      CONSTANT DOUBLE PRECISION := 3.0;    -- Limiar de ZVU estrito (erro circular CEP)

  v_veiculo            RECORD;
  v_ultima_telem       RECORD;
  v_dist_metros        DOUBLE PRECISION := 0.0;
  v_dist_geom          DOUBLE PRECISION := 0.0;
  v_dist_trap_m        DOUBLE PRECISION := 0.0;
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
  v_delta_rumo         INT              := 0;
  v_limiar_m           NUMERIC;
  v_viagem_ativa_id    UUID;
  v_descartado         BOOLEAN          := FALSE;
  v_motivo_descarte    TEXT             := NULL;
  v_fusao_aplicada     BOOLEAN          := FALSE;
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

  -- ── 2. Validação Estrita de Fix GNSS (Módulo 1) ───────────────────────────
  -- Se o J16 reportar Course Status sem Fix GNSS (Bit 12 = 0), descarta da odometria
  IF NOT COALESCE(p_gps_fixado, TRUE) THEN
    v_descartado      := TRUE;
    v_motivo_descarte := 'sem_fix_gnss_lbs';
  END IF;

  -- ── 3. Validação Geográfica (Brasil) ──────────────────────────────────────
  IF NOT v_descartado THEN
    IF p_latitude = 0.0 AND p_longitude = 0.0 THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'coordenada_zero';
    ELSIF p_latitude NOT BETWEEN -35.0 AND 5.5
       OR p_longitude NOT BETWEEN -74.0 AND -28.0 THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'fora_brasil';
    END IF;
  END IF;

  -- ── 4. Cálculo Geodésico WGS-84 com Raio Local (Módulo 3) ────────────────
  IF NOT v_descartado
     AND v_veiculo.ultima_latitude  IS NOT NULL
     AND v_veiculo.ultima_longitude IS NOT NULL
     AND (v_veiculo.ultima_latitude  <> 0.0 OR v_veiculo.ultima_longitude <> 0.0)
  THEN
    -- 4a. Raio geocêntrico local WGS-84 na latitude média do deslocamento
    v_lat_med_rad := radians((p_latitude + v_veiculo.ultima_latitude) / 2.0);
    v_cos_lat     := cos(v_lat_med_rad);
    v_sin_lat     := sin(v_lat_med_rad);
    v_raio_local  := sqrt(
      (((c_a * c_a * v_cos_lat)^2) + ((c_b * c_b * v_sin_lat)^2))
      /
      (((c_a * v_cos_lat)^2)       + ((c_b * v_sin_lat)^2))
    );

    -- 4b. Distância Geodésica Haversine Elipsoidal
    v_dlat    := radians(p_latitude  - v_veiculo.ultima_latitude);
    v_dlon    := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a_hav   := sin(v_dlat / 2.0)^2
               + cos(radians(v_veiculo.ultima_latitude))
               * cos(radians(p_latitude))
               * sin(v_dlon / 2.0)^2;
    v_dist_geom   := v_raio_local * 2.0 * atan2(sqrt(v_a_hav), sqrt(1.0 - v_a_hav));
    v_dist_metros := v_dist_geom;

    -- 4c. Intervalo temporal real (Δt) e busca de rumo/velocidade anteriores
    SELECT data_hora_gps, velocidade, rumo
    INTO v_ultima_telem
    FROM public.telemetria_posicoes
    WHERE veiculo_id = p_veiculo_id
    ORDER BY data_hora_gps DESC
    LIMIT 1;

    IF v_ultima_telem.data_hora_gps IS NOT NULL THEN
      v_delta_sec := GREATEST(0.0, EXTRACT(EPOCH FROM (p_data_hora_gps - v_ultima_telem.data_hora_gps)));
    ELSE
      v_delta_sec := 60.0;
    END IF;

    -- 4d. Filtro de Gaps Temporais Anômalos (> 180s)
    IF v_delta_sec > c_gap_max_s THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'gap_temporal_' || round(v_delta_sec) || 's';

    -- 4e. Spike Geodésico (> 195 km/h sem respaldo de velocidade de hardware)
    ELSIF v_delta_sec > 0.5 THEN
      v_vel_calc_kmh := (v_dist_metros / v_delta_sec) * 3.6;
      IF v_vel_calc_kmh > c_spike_kmh AND (p_velocidade IS NULL OR p_velocidade < 160.0) THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'spike_gps_' || round(v_vel_calc_kmh) || 'kmh';
      END IF;
    END IF;

    -- 4f. Zero-Velocity Update (ZVU Estrito): velocidade = 0 ou deslocamento < 3m
    IF NOT v_descartado THEN
      IF (p_velocidade IS NULL OR p_velocidade <= 0.5) OR v_dist_metros < c_zvu_m THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'zvu_estrito_' || round(v_dist_metros::NUMERIC, 1) || 'm';
      END IF;
    END IF;

    -- 4g. Distância máxima implausível (> 15 km num único pacote)
    IF NOT v_descartado AND v_dist_metros >= c_dist_max_m THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'dist_implausivel_' || round(v_dist_metros) || 'm';
    END IF;

    -- 4h. Integração Numérica Trapezoidal de Velocidade e Fusão Inercial em Curvas
    IF NOT v_descartado AND v_delta_sec > 0.5 AND v_delta_sec <= c_gap_max_s AND p_velocidade > 2.5 THEN
      -- Integração trapezoidal da velocidade Doppler: s_trap = ((v1 + v2) / 7.2) * Δt
      v_dist_trap_m := ((p_velocidade + COALESCE(v_ultima_telem.velocidade, p_velocidade)) / 7.2) * v_delta_sec;

      -- Variação angular de rumo entre os pacotes
      IF v_ultima_telem.rumo IS NOT NULL AND p_rumo IS NOT NULL THEN
        v_delta_rumo := ABS(p_rumo - v_ultima_telem.rumo);
        IF v_delta_rumo > 180 THEN
          v_delta_rumo := 360 - v_delta_rumo;
        END IF;
      ELSE
        v_delta_rumo := 0;
      END IF;

      -- Critério de Fusão Inercial:
      -- Em curvas (Δrumo >= 8° e v > 3 km/h), a corda seca geodésica subestima o arco real da pista.
      -- Prioriza o deslocamento inercial das rodas (v_dist_trap_m), limitado com segurança física a 1.35x a corda.
      IF v_delta_rumo >= 8 AND v_dist_trap_m > v_dist_geom THEN
        IF v_dist_trap_m <= (v_dist_geom * 1.35) THEN
          v_dist_metros    := v_dist_trap_m;
          v_fusao_aplicada := TRUE;
        ELSE
          v_dist_metros    := v_dist_geom * 1.35;
          v_fusao_aplicada := TRUE;
        END IF;
      END IF;
    END IF;

    -- 4i. Acumulação no Odômetro Vitalício
    IF NOT v_descartado THEN
      v_limiar_m := CASE WHEN p_velocidade > 3.0 THEN 1.5 ELSE 5.0 END;
      IF v_dist_metros >= v_limiar_m THEN
        v_delta_km      := (v_dist_metros / 1000.0);
        v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 3);
      ELSE
        v_descartado      := TRUE;
        v_motivo_descarte := COALESCE(v_motivo_descarte, 'limiar_' || round(v_dist_metros::NUMERIC, 1) || 'm');
      END IF;
    END IF;
  END IF;

  -- ── 5. Determinação do Status Operacional ──────────────────────────────────
  v_status_op := CASE
    WHEN p_velocidade > 3.0  THEN 'em_movimento'
    WHEN p_ignicao           THEN 'parado_ligado'
    ELSE                          'estacionado'
  END;

  -- ── 6. Persistência Histórica em telemetria_posicoes ───────────────────────
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
      sinal_gsm,
      gps_fixado
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
      COALESCE(p_inclinacao_graus, 0),
      COALESCE(p_vibracao_g, 0.0),
      p_bateria_veiculo_v,
      p_bateria_rastreador_pct,
      p_bateria_rastreador_status,
      p_sinal_gsm,
      COALESCE(p_gps_fixado, TRUE)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 7. Atualização de Estado no Veículo ────────────────────────────────────
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
    gps_fixado               = COALESCE(p_gps_fixado, TRUE),
    status_operacional       = v_status_op,
    ultima_atualizacao       = p_data_hora_gps,
    updated_at               = NOW()
  WHERE id = p_veiculo_id;

  -- ── 8. Acumulação Atômica em Viagem Ativa (viagens_trajetos) ───────────────
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
    'dist_geom',        ROUND(v_dist_geom::NUMERIC, 2),
    'dist_trap',        ROUND(v_dist_trap_m::NUMERIC, 2),
    'fusao_aplicada',   v_fusao_aplicada,
    'delta_rumo',       v_delta_rumo,
    'descartado',       v_descartado,
    'motivo_descarte',  v_motivo_descarte,
    'delta_sec',        ROUND(v_delta_sec::NUMERIC, 1),
    'raio_local_m',     ROUND(v_raio_local::NUMERIC),
    'gps_fixado',       COALESCE(p_gps_fixado, TRUE),
    'status_operacional', v_status_op
  );
END;
$$;

-- ── Permissões ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO service_role;

-- ── Invalidação Canônica de Cache PostgREST ──────────────────────────────────
NOTIFY pgrst, 'reload schema';
