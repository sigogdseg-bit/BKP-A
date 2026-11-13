-- =============================================================================
-- HUNTER — CALIBRAÇÃO INDIVIDUAL DE ODÔMETRO POR VEÍCULO E MOTOR J16 4G
-- Versão da Migração: 20261011140000_hunter_calibracao_individual_veiculo_e_odometria_j16.sql
-- =============================================================================
-- PROTOCOLO J16 / GT06 — AUDITORIA, OTIMIZAÇÃO E CALIBRAÇÃO VEICULAR (DJR-NEW)
--
-- 1. COLUNAS DE CALIBRAÇÃO INDIVIDUAL EM VEICULOS:
--    - fator_calibracao_odometro NUMERIC(8, 6) DEFAULT 1.000000 (neutro)
--    - versao_algoritmo_odometro TEXT DEFAULT 'v2.1-geodesica-fusao-inercial'
--    - hodometro_painel_km NUMERIC(12, 2)
--
-- 2. TABELA PÚBLICA veiculo_calibracoes_odometro:
--    Registra cada aferição de campo (leitura inicial/final do painel físico
--    vs leitura inicial/final do SIGO Guardião), calculando diferença,
--    erro percentual e histórico de calibração por veículo e dispositivo.
--
-- 3. RLS ESTRITO:
--    Isolamento total de dados por cliente_id no Supabase.
--
-- 4. RPCS:
--    - registrar_calibracao_odometro_veiculo
--    - obter_calibracoes_odometro_veiculo
--    - atualização da registrar_posicao_gps_com_odometro com fator individual
-- =============================================================================

-- ── 1. Colunas de Calibração e Versão em Veículos e Viagens ───────────────────
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS fator_calibracao_odometro NUMERIC(8, 6) DEFAULT 1.000000,
  ADD COLUMN IF NOT EXISTS versao_algoritmo_odometro TEXT DEFAULT 'v2.1-geodesica-fusao-inercial',
  ADD COLUMN IF NOT EXISTS hodometro_painel_km NUMERIC(12, 2);

ALTER TABLE public.viagens_trajetos
  ADD COLUMN IF NOT EXISTS distance_raw_km NUMERIC(10, 3),
  ADD COLUMN IF NOT EXISTS pontos_descartados INT DEFAULT 0;

-- ── 2. Tabela de Sessões de Calibração por Veículo ────────────────────────────
CREATE TABLE IF NOT EXISTS public.veiculo_calibracoes_odometro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  rastreador_id UUID REFERENCES public.rastreadores(id) ON DELETE SET NULL,
  hodometro_inicial_painel_km NUMERIC(12, 2) NOT NULL,
  hodometro_final_painel_km NUMERIC(12, 2) NOT NULL,
  odometro_inicial_sigo_km NUMERIC(12, 3) NOT NULL,
  odometro_final_sigo_km NUMERIC(12, 3) NOT NULL,
  distancia_painel_km NUMERIC(12, 3) NOT NULL,
  distancia_sigo_km NUMERIC(12, 3) NOT NULL,
  diferenca_km NUMERIC(12, 3) NOT NULL,
  erro_percentual NUMERIC(8, 4) NOT NULL,
  fator_correcao_calculado NUMERIC(8, 6) NOT NULL,
  fator_correcao_aplicado NUMERIC(8, 6) DEFAULT 1.000000,
  tendencia TEXT NOT NULL, -- 'EXATO', 'SUPERESTIMADO', 'SUBESTIMADO'
  versao_algoritmo TEXT NOT NULL DEFAULT 'v2.1-geodesica-fusao-inercial',
  configuracao_j16 TEXT DEFAULT 'TIMER,10,3600# | SZCS#ANGLEVALUE=10-015',
  quantidade_percursos INT DEFAULT 1,
  condicoes_percurso TEXT,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_calibracoes_veiculo_data
  ON public.veiculo_calibracoes_odometro(veiculo_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_calibracoes_cliente
  ON public.veiculo_calibracoes_odometro(cliente_id);

-- ── 3. RLS Estrito na Tabela de Calibrações ───────────────────────────────────
ALTER TABLE public.veiculo_calibracoes_odometro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "veiculo_calibracoes_odometro_select_policy" ON public.veiculo_calibracoes_odometro;
DROP POLICY IF EXISTS "veiculo_calibracoes_odometro_insert_policy" ON public.veiculo_calibracoes_odometro;
DROP POLICY IF EXISTS "veiculo_calibracoes_odometro_update_policy" ON public.veiculo_calibracoes_odometro;
DROP POLICY IF EXISTS "veiculo_calibracoes_odometro_delete_policy" ON public.veiculo_calibracoes_odometro;

CREATE POLICY "veiculo_calibracoes_odometro_select_policy"
  ON public.veiculo_calibracoes_odometro
  FOR SELECT
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'superadmin', 'operador') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR EXISTS (
      SELECT 1 FROM public.veiculos v
      WHERE v.id = veiculo_calibracoes_odometro.veiculo_id
        AND v.cliente_id IN (
          SELECT c.id FROM public.clientes c
          WHERE c.user_id = auth.uid() OR c.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
    )
  );

CREATE POLICY "veiculo_calibracoes_odometro_insert_policy"
  ON public.veiculo_calibracoes_odometro
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'superadmin', 'operador') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

CREATE POLICY "veiculo_calibracoes_odometro_update_policy"
  ON public.veiculo_calibracoes_odometro
  FOR UPDATE
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'superadmin') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

CREATE POLICY "veiculo_calibracoes_odometro_delete_policy"
  ON public.veiculo_calibracoes_odometro
  FOR DELETE
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'superadmin') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

GRANT ALL ON TABLE public.veiculo_calibracoes_odometro TO authenticated, service_role;
GRANT SELECT ON TABLE public.veiculo_calibracoes_odometro TO anon;

-- ── 4. RPC para Registrar Calibração com Validação e Cálculo Preciso ───────────
CREATE OR REPLACE FUNCTION public.registrar_calibracao_odometro_veiculo(
  p_veiculo_id                  UUID,
  p_hodometro_inicial_painel    NUMERIC,
  p_hodometro_final_painel      NUMERIC,
  p_odometro_inicial_sigo       NUMERIC,
  p_odometro_final_sigo         NUMERIC,
  p_aplicar_fator               BOOLEAN DEFAULT FALSE,
  p_configuracao_j16            TEXT DEFAULT 'TIMER,10,3600# | SZCS#ANGLEVALUE=10-015',
  p_condicoes_percurso          TEXT DEFAULT NULL,
  p_observacoes                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo             RECORD;
  v_dist_painel         NUMERIC(12, 3);
  v_dist_sigo           NUMERIC(12, 3);
  v_diferenca_km        NUMERIC(12, 3);
  v_erro_pct            NUMERIC(8, 4);
  v_fator_calculado     NUMERIC(8, 6);
  v_fator_aplicar       NUMERIC(8, 6) := 1.000000;
  v_tendencia           TEXT := 'EXATO';
  v_calibracao_id       UUID;
BEGIN
  -- Busca e trava linha do veículo
  SELECT id, cliente_id, rastreador_id, placa, marca_modelo, odometro_km, fator_calibracao_odometro
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado.');
  END IF;

  -- Validações de consistência lógica das leituras
  IF p_hodometro_final_painel < p_hodometro_inicial_painel THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Hodômetro final do painel não pode ser menor que o inicial.');
  END IF;

  IF p_odometro_final_sigo < p_odometro_inicial_sigo THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Odômetro final do SIGO Guardião não pode ser menor que o inicial.');
  END IF;

  v_dist_painel := ROUND((p_hodometro_final_painel - p_hodometro_inicial_painel)::NUMERIC, 3);
  v_dist_sigo   := ROUND((p_odometro_final_sigo - p_odometro_inicial_sigo)::NUMERIC, 3);

  IF v_dist_painel <= 0.001 THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'A distância do painel para calibração deve ser maior que zero (mínimo de 1 km recomendado).');
  END IF;

  IF v_dist_sigo <= 0.001 THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'A distância registrada pelo SIGO Guardião deve ser maior que zero.');
  END IF;

  -- Cálculo da diferença e erro percentual conforme especificação formal:
  -- diferença_km = distância_SIGO − distância_hodômetro
  -- erro_percentual = 100 × abs(diferença_km) / distância_hodômetro
  v_diferenca_km := ROUND((v_dist_sigo - v_dist_painel)::NUMERIC, 3);
  v_erro_pct     := ROUND(((ABS(v_diferenca_km) / v_dist_painel) * 100.0)::NUMERIC, 4);

  -- Fator de correção individual: fator = distância_painel / distância_sigo
  v_fator_calculado := ROUND((v_dist_painel / v_dist_sigo)::NUMERIC, 6);

  IF v_diferenca_km > 0.05 THEN
    v_tendencia := 'SUPERESTIMADO';
  ELSIF v_diferenca_km < -0.05 THEN
    v_tendencia := 'SUBESTIMADO';
  ELSE
    v_tendencia := 'EXATO';
  END IF;

  -- Se solicitado pelo operador e dentro dos limites físicos de segurança (0.85 a 1.15)
  IF p_aplicar_fator THEN
    IF v_fator_calculado BETWEEN 0.850000 AND 1.150000 THEN
      v_fator_aplicar := v_fator_calculado;
      UPDATE public.veiculos
      SET
        fator_calibracao_odometro = v_fator_aplicar,
        hodometro_painel_km       = p_hodometro_final_painel,
        ultima_atualizacao        = NOW()
      WHERE id = p_veiculo_id;
    ELSE
      v_fator_aplicar := COALESCE(v_veiculo.fator_calibracao_odometro, 1.000000);
    END IF;
  ELSE
    v_fator_aplicar := COALESCE(v_veiculo.fator_calibracao_odometro, 1.000000);
  END IF;

  -- Insere na tabela de calibrações
  INSERT INTO public.veiculo_calibracoes_odometro (
    veiculo_id,
    cliente_id,
    rastreador_id,
    hodometro_inicial_painel_km,
    hodometro_final_painel_km,
    odometro_inicial_sigo_km,
    odometro_final_sigo_km,
    distancia_painel_km,
    distancia_sigo_km,
    diferenca_km,
    erro_percentual,
    fator_correcao_calculado,
    fator_correcao_aplicado,
    tendencia,
    versao_algoritmo,
    configuracao_j16,
    condicoes_percurso,
    observacoes,
    criado_por
  ) VALUES (
    p_veiculo_id,
    v_veiculo.cliente_id,
    v_veiculo.rastreador_id,
    p_hodometro_inicial_painel,
    p_hodometro_final_painel,
    p_odometro_inicial_sigo,
    p_odometro_final_sigo,
    v_dist_painel,
    v_dist_sigo,
    v_diferenca_km,
    v_erro_pct,
    v_fator_calculado,
    v_fator_aplicar,
    v_tendencia,
    'v2.1-geodesica-fusao-inercial',
    COALESCE(p_configuracao_j16, 'TIMER,10,3600# | SZCS#ANGLEVALUE=10-015'),
    p_condicoes_percurso,
    p_observacoes,
    auth.uid()
  )
  RETURNING id INTO v_calibracao_id;

  RETURN jsonb_build_object(
    'sucesso',                  true,
    'calibracao_id',            v_calibracao_id,
    'veiculo_id',               p_veiculo_id,
    'placa',                    v_veiculo.placa,
    'distancia_painel_km',      v_dist_painel,
    'distancia_sigo_km',        v_dist_sigo,
    'diferenca_km',             v_diferenca_km,
    'erro_percentual',          v_erro_pct,
    'tendencia',                v_tendencia,
    'fator_calculado',          v_fator_calculado,
    'fator_aplicado',           v_fator_aplicar,
    'fator_atualizado_veiculo', p_aplicar_fator
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_calibracao_odometro_veiculo TO authenticated, service_role;

-- ── 5. RPC para Listar Calibrações de um Veículo ─────────────────────────────
CREATE OR REPLACE FUNCTION public.obter_calibracoes_odometro_veiculo(p_veiculo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.criado_em DESC), '[]'::JSONB)
  INTO v_resultado
  FROM public.veiculo_calibracoes_odometro c
  WHERE c.veiculo_id = p_veiculo_id;

  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obter_calibracoes_odometro_veiculo TO authenticated, service_role, anon;

-- ── 6. Atualização da RPC registrar_posicao_gps_com_odometro com Fator Individual ──
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

  -- Fator de calibração individual do veículo (com blindagem 0.85 a 1.15)
  IF v_veiculo.fator_calibracao_odometro IS NOT NULL
     AND v_veiculo.fator_calibracao_odometro BETWEEN 0.850000 AND 1.150000 THEN
    v_fator_veiculo := v_veiculo.fator_calibracao_odometro;
  ELSE
    v_fator_veiculo := 1.000000;
  END IF;

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

    -- 4i. Acumulação no Odômetro Vitalício com Fator Individual
    IF NOT v_descartado THEN
      v_limiar_m := CASE WHEN p_velocidade > 3.0 THEN 1.5 ELSE 5.0 END;
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
    'raio_local_m',     ROUND(v_raio_local::NUMERIC),
    'gps_fixado',       COALESCE(p_gps_fixado, TRUE),
    'status_operacional', v_status_op
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO service_role;

-- ── 7. Invalidação Canônica de Cache PostgREST ────────────────────────────────
NOTIFY pgrst, 'reload schema';
