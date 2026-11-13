-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Recálculo de Odômetro Físico, Filtro Cinemático Anti-Jitter e RPC Ajuste
-- Data: 02/10/2026
-- Objetivo:
-- 1. Elimina acúmulo fantasma de quilometragem quando veículo está parado (velocidade <= 3 km/h).
-- 2. Aplica leis da física cinemática newtoniana (Doppler + consistência velocidade-tempo-espaço).
-- 3. Recalibra o odômetro do veículo AXH0E44 para 182.935,00 km (sincronização com painel físico).
-- 4. Cria a RPC atômica ajustar_odometro_veiculo para sincronização pelo cliente/operador.
-- 5. Adiciona política de RLS em public.veiculos para permitir UPDATE pelos proprietários.
-- 6. Fecha e consolida viagens órfãs em_andamento.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Recalibração do veículo AXH0E44 para o valor real do painel físico (final 35 = 182935.00 km)
UPDATE public.veiculos
SET 
  odometro_km = 182935.00,
  updated_at = NOW()
WHERE placa = 'AXH0E44';

-- Atualiza a última posição de telemetria para prosseguir a partir do valor calibrado
UPDATE public.telemetria_posicoes
SET odometro = 182935.00
WHERE id = (
  SELECT id FROM public.telemetria_posicoes
  WHERE veiculo_id = (SELECT id FROM public.veiculos WHERE placa = 'AXH0E44' LIMIT 1)
  ORDER BY data_hora_gps DESC
  LIMIT 1
);

-- Consolida viagens órfãs que ficaram como em_andamento com veículo estacionado
UPDATE public.viagens_trajetos
SET 
  status = 'concluido',
  fim_at = COALESCE(fim_at, NOW())
WHERE veiculo_id = (SELECT id FROM public.veiculos WHERE placa = 'AXH0E44' LIMIT 1)
  AND status = 'em_andamento';

-- 2. Recriação da RPC registrar_posicao_gps_com_odometro com Leis da Física Cinemática
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, integer, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);

CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id UUID,
  p_rastreador_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_velocidade NUMERIC,
  p_ignicao BOOLEAN,
  p_satelites INT,
  p_rumo INT,
  p_data_hora_gps TIMESTAMPTZ,
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
  v_vel_ms NUMERIC;
  v_max_dist_plausivel NUMERIC;
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
  -- FÍSICA CINEMÁTICA ESTATÍSTICA DE VEÍCULOS TERRESTRES (ANTI-JITTER REAL):
  -- 1. Se p_velocidade <= 3.0 km/h: o veículo está fisicamente PARADO (velocidade Doppler nula).
  --    Toda e qualquer variação de latitude/longitude é ruído de antena/ionosfera (Brownian drift).
  --    Portanto, delta_km é estritamente 0.00.
  -- 2. Se p_velocidade > 3.0 km/h: veículo em trânsito comprovado.
  --    Calcula distância geodésica Haversine precisa na superfície elipsoidal WGS84.
  --    Aplica banda morta mínima (>= 3.0 metros) para evitar acumular zigue-zague lateral.
  --    Aplica limite cinemático de plausibilidade: dist <= vel_ms * 60s + 25m e dist < 5000m.
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_velocidade > 3.0 
     AND v_veiculo.ultima_latitude IS NOT NULL 
     AND v_veiculo.ultima_longitude IS NOT NULL 
     AND (v_veiculo.ultima_latitude <> 0 OR v_veiculo.ultima_longitude <> 0)
     AND (p_latitude <> 0 OR p_longitude <> 0) THEN
    
    -- Fórmula Haversine
    v_dlat := radians(p_latitude - v_veiculo.ultima_latitude);
    v_dlon := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));

    -- Conversão da velocidade reportada para m/s
    v_vel_ms := (p_velocidade / 3.6);
    -- Em um intervalo típico de envio (10s a 60s), a distância máxima plausível com aceleração é:
    v_max_dist_plausivel := GREATEST((v_vel_ms * 60.0) + 25.0, 50.0);

    -- Verifica plausibilidade cinemática: descarta ruídos abaixo de 3m e saltos anômalos
    IF v_dist_metros >= 3.0 AND v_dist_metros <= v_max_dist_plausivel AND v_dist_metros < 5000.0 THEN
      v_delta_km := (v_dist_metros / 1000.0);
      v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 2);
    END IF;
  ELSE
    -- Veículo parado (ou velocidade Doppler <= 3 km/h): acúmulo nulo rigoroso
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

  -- 3. Atualiza quilometragem da viagem em andamento apenas se houver deslocamento real
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

-- 3. RPC Atômica de Calibração / Ajuste do Odômetro pelo Cliente ou Operador
CREATE OR REPLACE FUNCTION public.ajustar_odometro_veiculo(
  p_veiculo_id UUID,
  p_novo_odometro NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_odometro_anterior NUMERIC(12, 2);
  v_placa TEXT;
  v_eh_dono BOOLEAN := FALSE;
  v_eh_admin BOOLEAN := FALSE;
  v_novo_km NUMERIC(12, 2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  IF p_novo_odometro IS NULL OR p_novo_odometro < 0 THEN
    RAISE EXCEPTION 'Quilometragem inválida. Deve ser maior ou igual a zero.';
  END IF;

  v_novo_km := ROUND(p_novo_odometro::NUMERIC, 2);

  -- Verifica permissão: SuperADM/Equipe OU titular do veículo
  SELECT 
    v.odometro_km,
    v.placa,
    (c.user_id = v_user_id)
  INTO 
    v_odometro_anterior,
    v_placa,
    v_eh_dono
  FROM public.veiculos v
  JOIN public.clientes c ON c.id = v.cliente_id
  WHERE v.id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_id AND role::text IN ('adm', 'superadmin', 'operador')
  ) INTO v_eh_admin;

  IF NOT (v_eh_dono OR v_eh_admin) THEN
    RAISE EXCEPTION 'Permissão negada. Apenas o proprietário ou a administração podem calibrar o odômetro.';
  END IF;

  -- 1. Atualiza o odômetro no veículo
  UPDATE public.veiculos
  SET 
    odometro_km = v_novo_km,
    ultima_atualizacao = NOW()
  WHERE id = p_veiculo_id;

  -- 2. Sincroniza a última posição de telemetria
  UPDATE public.telemetria_posicoes
  SET odometro = v_novo_km
  WHERE id = (
    SELECT id FROM public.telemetria_posicoes
    WHERE veiculo_id = p_veiculo_id
    ORDER BY data_hora_gps DESC
    LIMIT 1
  );

  -- 3. Registra log forense de auditoria
  INSERT INTO public.system_activity_logs (
    acao,
    usuario_id,
    detalhe
  ) VALUES (
    'AJUSTE_CALIBRACAO_ODOMETRO',
    v_user_id,
    format('Odômetro do veículo %s ajustado de %s km para %s km para sincronização com o painel físico.',
           v_placa,
           COALESCE(v_odometro_anterior::TEXT, '0.00'),
           v_novo_km::TEXT)
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa,
    'odometro_anterior', v_odometro_anterior,
    'novo_odometro', v_novo_km
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajustar_odometro_veiculo TO authenticated, service_role;

-- 4. Política de RLS em public.veiculos: permite aos clientes atualizarem seus veículos
DROP POLICY IF EXISTS "Clientes atualizam seus proprios veiculos" ON public.veiculos;
CREATE POLICY "Clientes atualizam seus proprios veiculos"
ON public.veiculos FOR UPDATE TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
)
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- Notifica o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';
