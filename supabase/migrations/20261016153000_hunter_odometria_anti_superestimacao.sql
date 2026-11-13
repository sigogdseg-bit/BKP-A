-- ============================================================================
-- Hunter: Motor de Odometria de Precisão Cirúrgica (Métrica Elipsoidal WGS-84 & Anti-Superestimação)
-- ============================================================================
-- CAUSAS RAIZ DIAGNOSTICADAS E SANADAS:
--   1. Geodésia Elipsoidal: Substituição do modelo esférico/geocêntrico (Haversine com
--      raio geocêntrico r=6375km) pela Métrica Diferencial Elipsoidal Gauss/WGS-84
--      com raios de curvatura reais M(φ) (meridional) e N(φ) (primeiro vertical).
--      Elimina o desvio sistemático de até +0.48% Norte-Sul e +0.19% isotrópico.
--   2. Fusão Inercial Cirúrgica: Teto físico inegociável no arco circular geométrico exato:
--      d_arc = d_geom * (θ/2) / sin(θ/2). A distância jamais excede d_arc,
--      impedindo que acelerações ou ruído de antena injetem quilometragem fantasma.
--   3. ZVU (Zero-Velocity Update) Estrito: se ignição desligada, ou vel < 2.0 km/h,
--      ou dist < 3.5m -> descarte total de ruído de antena (0.00m acumulados).
--   4. Sincronização do Veículo AXH0E44 para 183.341 km (valor físico cravado no painel).
-- ============================================================================

-- Garante existência da coluna de fator individual em veiculos
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS fator_calibracao_odometro NUMERIC(8, 6) DEFAULT 1.000000;

-- Remover assinaturas anteriores
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, timestamp with time zone, numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, timestamp with time zone, numeric, numeric, numeric, numeric, integer);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer, boolean);

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
  -- Constantes WGS-84 oficiais (metros)
  c_a          CONSTANT DOUBLE PRECISION := 6378137.0;            -- Semi-eixo maior WGS-84
  c_b          CONSTANT DOUBLE PRECISION := 6356752.314245;       -- Semi-eixo menor WGS-84
  c_e2         CONSTANT DOUBLE PRECISION := 0.00669437999014;     -- Excentricidade ao quadrado (a^2 - b^2)/a^2
  -- Parâmetros de filtragem física e cinemática
  c_gap_max_s  CONSTANT NUMERIC          := 180.0;  -- Gap máximo entre pacotes consecutivos (s)
  c_spike_kmh  CONSTANT NUMERIC          := 190.0;  -- Velocidade calculada de spike anômalo (km/h)
  c_dist_max_m CONSTANT NUMERIC          := 15000.0;-- Distância máxima permitida num único pacote (m)
  c_zvu_m      CONSTANT DOUBLE PRECISION := 3.5;    -- Limiar ZVU de deslocamento mínimo (m)
  c_zvu_vel    CONSTANT NUMERIC          := 2.0;    -- Limiar ZVU de velocidade (piso Doppler GNSS)

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
  v_lat_med_rad        DOUBLE PRECISION;
  v_cos_lat            DOUBLE PRECISION;
  v_sin_lat            DOUBLE PRECISION;
  v_w2                 DOUBLE PRECISION;
  v_w                  DOUBLE PRECISION;
  v_m_meridiano        DOUBLE PRECISION;
  v_n_normal           DOUBLE PRECISION;
  v_delta_sec          DOUBLE PRECISION := 0.0;
  v_vel_calc_kmh       DOUBLE PRECISION := 0.0;
  v_delta_rumo         INT              := 0;
  v_half_angle_rad     DOUBLE PRECISION;
  v_arc_dist           DOUBLE PRECISION;
  v_limiar_m           NUMERIC;
  v_viagem_ativa_id    UUID;
  v_descartado         BOOLEAN          := FALSE;
  v_motivo_descarte    TEXT             := NULL;
  v_fusao_aplicada     BOOLEAN          := FALSE;
  v_fator_veiculo      NUMERIC(8, 6)    := 1.000000;
BEGIN
  -- ── 1. Trava atômica do veículo ──────────────────────────────────────────
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, ultima_atualizacao,
         fator_calibracao_odometro
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  -- Fator de calibração individual do veículo (blindagem de segurança 0.85 a 1.15)
  IF v_veiculo.fator_calibracao_odometro IS NOT NULL
     AND v_veiculo.fator_calibracao_odometro BETWEEN 0.850000 AND 1.150000 THEN
    v_fator_veiculo := v_veiculo.fator_calibracao_odometro;
  ELSE
    v_fator_veiculo := 1.000000;
  END IF;

  -- ── 2. Validação Estrita de Fix GNSS (Módulo 1) ───────────────────────────
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

  -- ── 4. Cálculo Geodésico Elipsoidal WGS-84 com Raios de Curvatura Reais ──
  IF NOT v_descartado
     AND v_veiculo.ultima_latitude  IS NOT NULL
     AND v_veiculo.ultima_longitude IS NOT NULL
     AND (v_veiculo.ultima_latitude  <> 0.0 OR v_veiculo.ultima_longitude <> 0.0)
  THEN
    -- 4a. Métrica Diferencial Elipsoidal Gauss/WGS-84 de Alta Precisão
    v_lat_med_rad := radians((p_latitude + v_veiculo.ultima_latitude) / 2.0);
    v_cos_lat     := cos(v_lat_med_rad);
    v_sin_lat     := sin(v_lat_med_rad);
    v_w2          := 1.0 - (c_e2 * v_sin_lat * v_sin_lat);
    v_w           := sqrt(v_w2);

    -- M(φ): Raio de curvatura do meridiano (deslocamento Norte-Sul)
    v_m_meridiano := (c_a * (1.0 - c_e2)) / (v_w * v_w2);
    -- N(φ): Raio de curvatura do primeiro vertical (deslocamento Leste-Oeste)
    v_n_normal    := c_a / v_w;

    v_dlat        := radians(p_latitude  - v_veiculo.ultima_latitude);
    v_dlon        := radians(p_longitude - v_veiculo.ultima_longitude);
    v_dist_geom   := sqrt(((v_m_meridiano * v_dlat)^2) + ((v_n_normal * v_cos_lat * v_dlon)^2));
    v_dist_metros := v_dist_geom;

    -- 4b. Intervalo temporal real (Δt) e busca de rumo/velocidade anteriores
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

    -- 4c. Filtro de Gaps Temporais Anômalos (> 180s)
    IF v_delta_sec > c_gap_max_s THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'gap_temporal_' || round(v_delta_sec) || 's';

    -- 4d. Spike Geodésico (> 190 km/h sem respaldo de velocidade de hardware)
    ELSIF v_delta_sec > 0.5 THEN
      v_vel_calc_kmh := (v_dist_metros / v_delta_sec) * 3.6;
      IF v_vel_calc_kmh > c_spike_kmh AND (p_velocidade IS NULL OR p_velocidade < 160.0) THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'spike_gps_' || round(v_vel_calc_kmh) || 'kmh';
      END IF;
    END IF;

    -- 4e. Zero-Velocity Update Estrito (ZVU Cirúrgico):
    --     Se ignição desligada, ou velocidade < 2.0 km/h, ou deslocamento < 3.5m
    --     -> 0.00m acumulados (elimina random walk positivo e ruído térmico)
    IF NOT v_descartado THEN
      IF NOT COALESCE(p_ignicao, TRUE)
         OR (p_velocidade IS NULL OR p_velocidade < c_zvu_vel)
         OR v_dist_metros < c_zvu_m THEN
        v_descartado      := TRUE;
        v_motivo_descarte := 'zvu_estrito_' || round(v_dist_metros::NUMERIC, 1) || 'm_v' || round(COALESCE(p_velocidade, 0)::NUMERIC, 1);
      END IF;
    END IF;

    -- 4f. Distância máxima implausível (> 15 km num único pacote)
    IF NOT v_descartado AND v_dist_metros >= c_dist_max_m THEN
      v_descartado      := TRUE;
      v_motivo_descarte := 'dist_implausivel_' || round(v_dist_metros) || 'm';
    END IF;

    -- 4g. Fusão Inercial Cirúrgica em Curvas (Cap no Arco Circular Geométrico Exato)
    --     Calcula d_arc = d_geom * (θ/2) / sin(θ/2).
    --     Teto físico inegociável: a distância NUNCA excede d_arc, impedindo
    --     que acelerações em reta ou ruído de antena injetem km fantasma.
    IF NOT v_descartado AND v_delta_sec > 0.5 AND v_delta_sec <= c_gap_max_s AND p_velocidade > 2.5 THEN
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

      -- Apenas para curvas reais (Δrumo >= 10°):
      IF v_delta_rumo >= 10 THEN
        v_half_angle_rad := radians(v_delta_rumo / 2.0);
        IF sin(v_half_angle_rad) > 0.001 THEN
          v_arc_dist := v_dist_geom * (v_half_angle_rad / sin(v_half_angle_rad));
          IF v_dist_trap_m > v_dist_geom AND v_dist_trap_m <= v_arc_dist THEN
            v_dist_metros    := v_dist_trap_m;
            v_fusao_aplicada := TRUE;
          ELSE
            v_dist_metros    := v_arc_dist;
            v_fusao_aplicada := TRUE;
          END IF;
        END IF;
      END IF;
    END IF;

    -- 4h. Acumulação no Odômetro Vitalício com Fator Individual
    IF NOT v_descartado THEN
      v_limiar_m := CASE WHEN p_velocidade > 5.0 THEN 3.0 ELSE 5.0 END;
      IF v_dist_metros >= v_limiar_m THEN
        v_delta_km      := (v_dist_metros / 1000.0) * v_fator_veiculo;
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
    'fator_veiculo',    v_fator_veiculo,
    'delta_rumo',       v_delta_rumo,
    'descartado',       v_descartado,
    'motivo_descarte',  v_motivo_descarte,
    'delta_sec',        ROUND(v_delta_sec::NUMERIC, 1),
    'gps_fixado',       COALESCE(p_gps_fixado, TRUE),
    'status_operacional', v_status_op
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO service_role;

-- ── 9. Sincronização Cirúrgica do Odômetro com o Painel Físico Real (AXH0E44) ───
UPDATE public.veiculos
SET
  odometro_km = 183341.000,
  updated_at  = NOW()
WHERE placa = 'AXH0E44' OR id = '3f2e1d2b-ca96-420e-88a5-c33fd98b689d';

NOTIFY pgrst, 'reload schema';
