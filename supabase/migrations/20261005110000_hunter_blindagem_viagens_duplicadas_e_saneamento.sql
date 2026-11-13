-- =============================================================================
-- HUNTER — BLINDAGEM DE VIAGENS DUPLICADAS E SANEAMENTO DE TELEMETRIA (DJR-NEW)
-- Versão da Migração: 20261005110000_hunter_blindagem_viagens_duplicadas_e_saneamento.sql
-- =============================================================================
-- 1. Saneamento: remove os registros fantasmas gerados em loop e restaura os ciclos reais de 04/10 e 05/10.
-- 2. Trigger de Autodefesa: conclui automaticamente qualquer viagem anterior antes de inserir uma nova 'em_andamento'.
-- 3. Índice Único Parcial: garante a nível físico de banco de dados que NENHUM veículo pode ter mais de uma viagem 'em_andamento'.
-- 4. RPC registrar_posicao_gps_com_odometro: direciona o incremento de KM estritamente para a viagem ativa atual (LIMIT 1 por ID).
-- 5. Notificação de reload de schema ao PostgREST.
-- =============================================================================

-- 1. Saneamento de viagens duplicadas em_andamento
DELETE FROM public.viagens_trajetos
WHERE status = 'em_andamento'
  AND veiculo_id = '3f2e1d2b-ca96-420e-88a5-c33fd98b689d';

-- Restaura as 9 viagens reais consolidadas de 04/10/2026 para o veículo AXH0E44 (Soma: 45.89 km)
INSERT INTO public.viagens_trajetos (veiculo_id, inicio_at, fim_at, km_percorrido, velocidade_maxima, velocidade_media, status) VALUES
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T02:43:20+00:00', '2026-10-04T02:45:25+00:00', 0.00, 0, 0, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T02:46:55+00:00', '2026-10-04T03:17:00+00:00', 14.21, 74, 32, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T06:57:23+00:00', '2026-10-04T07:04:23+00:00', 4.09, 76, 38, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T10:02:57+00:00', '2026-10-04T10:03:57+00:00', 0.00, 0, 0, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T14:18:37+00:00', '2026-10-04T14:33:38+00:00', 4.18, 57, 24, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T15:16:38+00:00', '2026-10-04T15:37:02+00:00', 9.26, 107, 41, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T15:56:32+00:00', '2026-10-04T15:59:20+00:00', 0.83, 53, 20, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T18:45:54+00:00', '2026-10-04T19:04:20+00:00', 13.20, 87, 39, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-04T19:19:50+00:00', '2026-10-04T19:20:37+00:00', 0.12, 20, 12, 'concluido');

-- Restaura as 3 viagens reais consolidadas de 05/10/2026 para o veículo AXH0E44 (Soma: 19.72 km)
INSERT INTO public.viagens_trajetos (veiculo_id, inicio_at, fim_at, km_percorrido, velocidade_maxima, velocidade_media, status) VALUES
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-05T10:14:32+00:00', '2026-10-05T10:29:49+00:00', 6.20, 77, 28, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-05T11:38:21+00:00', '2026-10-05T11:53:21+00:00', 12.71, 77, 29, 'concluido'),
  ('3f2e1d2b-ca96-420e-88a5-c33fd98b689d', '2026-10-05T12:00:22+00:00', '2026-10-05T12:02:52+00:00', 0.81, 37, 22, 'concluido');

-- Conclui qualquer outra viagem antiga que tenha ficado órfã em 'em_andamento'
UPDATE public.viagens_trajetos
SET status = 'concluido',
    fim_at = COALESCE(fim_at, inicio_at + INTERVAL '5 minutes')
WHERE status = 'em_andamento';

-- 2. Gatilho de Autodefesa: fecha automaticamente qualquer viagem em andamento antes de abrir uma nova
CREATE OR REPLACE FUNCTION public.trg_garantir_uma_viagem_em_andamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'em_andamento' THEN
    UPDATE public.viagens_trajetos
    SET status = 'concluido',
        fim_at = COALESCE(NEW.inicio_at, NOW())
    WHERE veiculo_id = NEW.veiculo_id
      AND status = 'em_andamento'
      AND (NEW.id IS NULL OR id <> NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viagens_garantir_uma_ativa ON public.viagens_trajetos;
CREATE TRIGGER trg_viagens_garantir_uma_ativa
BEFORE INSERT ON public.viagens_trajetos
FOR EACH ROW
EXECUTE FUNCTION public.trg_garantir_uma_viagem_em_andamento();

-- 3. Índice Único Parcial: garante a nível físico de tabela apenas 1 viagem em andamento por veículo
DROP INDEX IF EXISTS public.idx_viagens_uma_ativa_por_veiculo;
CREATE UNIQUE INDEX idx_viagens_uma_ativa_por_veiculo
ON public.viagens_trajetos (veiculo_id)
WHERE status = 'em_andamento';

-- 4. RPC registrar_posicao_gps_com_odometro com alvo atômico de viagem ativa
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
  v_viagem_ativa_id UUID;
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

  -- 3. Atualiza quilometragem da viagem em andamento atômica (estritamente a mais recente)
  IF v_delta_km > 0 THEN
    SELECT id INTO v_viagem_ativa_id
    FROM public.viagens_trajetos
    WHERE veiculo_id = p_veiculo_id AND status = 'em_andamento'
    ORDER BY inicio_at DESC
    LIMIT 1;

    IF v_viagem_ativa_id IS NOT NULL THEN
      UPDATE public.viagens_trajetos
      SET
        km_percorrido = ROUND((COALESCE(km_percorrido, 0) + v_delta_km)::NUMERIC, 2),
        velocidade_maxima = GREATEST(COALESCE(velocidade_maxima, 0), p_velocidade)
      WHERE id = v_viagem_ativa_id;
    END IF;
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
