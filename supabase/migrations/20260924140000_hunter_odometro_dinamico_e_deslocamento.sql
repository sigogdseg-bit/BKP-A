-- =============================================================================
-- HUNTER — SISTEMA DE ODÔMETRO DINÂMICO E CORREÇÃO DE TEMA (DJR-NEW / CANÔNICO)
-- Versão da Migração: 20260924140000_hunter_odometro_dinamico_e_deslocamento.sql
-- =============================================================================

-- 1. Permissões explícitas para a RPC de Preferência de Tema
GRANT EXECUTE ON FUNCTION public.salvar_preferencia_tema(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_preferencia_tema(TEXT) TO anon;

-- 2. Suporte a frações decimais de KM no odômetro de veículos e posições
ALTER TABLE public.veiculos 
  ALTER COLUMN odometro_km TYPE NUMERIC(12, 2) USING odometro_km::NUMERIC(12, 2);

ALTER TABLE public.telemetria_posicoes 
  ALTER COLUMN odometro TYPE NUMERIC(12, 2) USING odometro::NUMERIC(12, 2);

-- 3. Função RPC Atômica para Ingestão de GPS com Odômetro Acumulado e Viagem em Tempo Real
CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id UUID,
  p_rastreador_id UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT 0.0,
  p_longitude DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade INT DEFAULT 0,
  p_ignicao BOOLEAN DEFAULT FALSE,
  p_satelites INT DEFAULT 0,
  p_rumo INT DEFAULT 0,
  p_data_hora_gps TIMESTAMPTZ DEFAULT NOW(),
  p_inclinacao_graus INT DEFAULT 0,
  p_vibracao_g NUMERIC DEFAULT 0.0,
  p_bateria_veiculo_v NUMERIC DEFAULT NULL,
  p_bateria_rastreador_pct INT DEFAULT NULL,
  p_bateria_rastreador_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_dist_metros NUMERIC := 0;
  v_delta_km NUMERIC := 0;
  v_novo_odometro NUMERIC(12, 2);
  v_status_op TEXT;
  v_dlat NUMERIC;
  v_dlon NUMERIC;
  v_a NUMERIC;
BEGIN
  -- Trava a linha do veículo para evitar concorrência em alta taxa de telemetria
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, cliente_id
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  -- Se possui coordenadas anteriores válidas e o carro está em movimento/ignição ligada
  IF v_veiculo.ultima_latitude IS NOT NULL 
     AND v_veiculo.ultima_longitude IS NOT NULL 
     AND (v_veiculo.ultima_latitude <> 0 OR v_veiculo.ultima_longitude <> 0)
     AND (p_latitude <> 0 OR p_longitude <> 0)
     AND (p_velocidade > 0 OR p_ignicao) THEN
    
    -- Fórmula Haversine para cálculo geodésico de distância
    v_dlat := radians(p_latitude - v_veiculo.ultima_latitude);
    v_dlon := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));

    -- Filtro anti-ruído físico:
    -- Mínimo de 5 metros para ignorar oscilações normais de antena GPS com carro parado
    -- Máximo de 15.000 metros (15 km) em um único pacote para descartar saltos anômalos
    IF v_dist_metros >= 5.0 AND v_dist_metros < 15000.0 THEN
      v_delta_km := ROUND((v_dist_metros / 1000.0)::NUMERIC, 3);
      v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 2);
    END IF;
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
    bateria_rastreador_status
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
    p_bateria_rastreador_status
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
    status_operacional = v_status_op,
    ultima_atualizacao = NOW()
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
    'delta_km', v_delta_km,
    'novo_odometro', v_novo_odometro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated, service_role, anon;
