-- =============================================================================
-- HUNTER — STORAGE NFS-TEMP, ODÔMETRO HAVERSINE E AJUSTE ANTI-FALSO JAMMER
-- Versão da Migração: 20261003180000_hunter_storage_nfs_temp_e_odometro_haversine.sql
-- Diretrizes: HUNTER-GUARDIAN / DJR-NEW
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BUCKET DE STORAGE nfs-temp (Causa Raiz: Bucket not found ao enviar NF)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nfs-temp',
  'nfs-temp',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']::text[];

-- Políticas RLS em storage.objects para nfs-temp
DROP POLICY IF EXISTS "Permitir upload em nfs-temp" ON storage.objects;
CREATE POLICY "Permitir upload em nfs-temp"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'nfs-temp');

DROP POLICY IF EXISTS "Permitir leitura em nfs-temp" ON storage.objects;
CREATE POLICY "Permitir leitura em nfs-temp"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'nfs-temp');

DROP POLICY IF EXISTS "Permitir exclusao em nfs-temp" ON storage.objects;
CREATE POLICY "Permitir exclusao em nfs-temp"
  ON storage.objects FOR DELETE
  TO authenticated, anon
  USING (bucket_id = 'nfs-temp');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 PERMITIR QUE CLIENTES REGISTREM ABASTECIMENTO (motorista_id opcional)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.motorista_abastecimentos ALTER COLUMN motorista_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RESTAURAÇÃO DA RPC registrar_posicao_gps_com_odometro COM HAVERSINE REAL
-- Elimina o filtro excessivamente restritivo de velocidade instantânea e janelas
-- de tempo que causava o descarte indevido de quilômetros rodados.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);

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
  v_delta_km NUMERIC := 0;
  v_novo_odometro NUMERIC(12, 2);
  v_status_op TEXT;
  v_dlat NUMERIC;
  v_dlon NUMERIC;
  v_a NUMERIC;
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
  -- FÓRMULA HAVERSINE DE ALTA PRECISÃO E ACÚMULO REAL DE QUILOMETRAGEM
  -- 1. Se possui coordenadas anteriores válidas e o carro está em trânsito (ignição OU velocidade)
  -- 2. Filtro anti-ruído físico canônico:
  --    - Mínimo de 5 metros para ignorar oscilações normais de antena com carro parado
  --    - Máximo de 15.000 metros (15 km) num único pacote para descartar saltos anômalos
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

    IF v_dist_metros >= 5.0 AND v_dist_metros < 15000.0 THEN
      v_delta_km := (v_dist_metros / 1000.0);
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

  RETURN jsonb_build_object(
    'sucesso', true,
    'odometro_anterior', v_veiculo.odometro_km,
    'delta_km', v_delta_km,
    'novo_odometro', v_novo_odometro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated, service_role, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AJUSTE ANTI-FALSO ALERTA DE JAMMER (Causa Raiz: Falso alarme no centro da cidade)
-- Requer velocidade anterior expressiva (>= 20 km/h) e timeout seguro (>= 10 min)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verificar_suspeita_jammer(
  p_timeout_minutos INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_diff_minutos NUMERIC;
  v_descricao TEXT;
  v_alertas_criados INT := 0;
  v_ultima_notif_at TIMESTAMPTZ;
  v_cliente_user_id UUID;
  v_notif_id UUID;
BEGIN
  FOR v_veiculo IN
    SELECT
      v.id,
      v.cliente_id,
      v.placa,
      v.marca_modelo,
      v.ignicao_status,
      v.velocidade_atual,
      v.ultima_atualizacao,
      v.ultima_latitude,
      v.ultima_longitude,
      EXTRACT(EPOCH FROM (now() - v.ultima_atualizacao)) / 60.0 AS minutos_sem_sinal
    FROM public.veiculos v
    WHERE
      v.ativo = true
      AND v.ultima_atualizacao IS NOT NULL
      -- Requer que estivesse comprovadamente em trânsito com velocidade relevante
      AND v.velocidade_atual >= 20
      AND v.ignicao_status = true
      -- Silenciado há mais de p_timeout_minutos (padrão 10 min)
      AND (now() - v.ultima_atualizacao) > (p_timeout_minutos * interval '1 minute')
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT tp.ignicao, tp.velocidade
          FROM public.telemetria_posicoes tp
          WHERE tp.veiculo_id = v.id
          ORDER BY tp.data_hora_gps DESC
          LIMIT 1
        ) ult
        WHERE ult.ignicao = true AND ult.velocidade >= 20
      )
  LOOP
    -- Deduplicação: não dispara se já existe alerta de jammer nos últimos 15 minutos
    SELECT created_at INTO v_ultima_notif_at
    FROM public.alertas_seguranca
    WHERE
      veiculo_id = v_veiculo.id
      AND tipo = 'suspeita_jammer'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_ultima_notif_at IS NOT NULL AND
       (now() - v_ultima_notif_at) < interval '15 minutes' THEN
      CONTINUE;
    END IF;

    v_diff_minutos := ROUND(v_veiculo.minutos_sem_sinal::NUMERIC, 1);

    v_descricao := format(
      'Veículo %s (%s) perdeu contato abruptamente enquanto estava em trânsito (%s km/h, ignição ligada). '
      'Ausência de pacotes há %s min sem evento de desligamento normal. '
      'Suspeita de bloqueador de sinal celular/GPS ou sabotagem elétrica.',
      v_veiculo.placa,
      v_veiculo.marca_modelo,
      COALESCE(v_veiculo.velocidade_atual, 0),
      v_diff_minutos
    );

    INSERT INTO public.alertas_seguranca (
      veiculo_id,
      cliente_id,
      tipo,
      gravidade,
      latitude,
      longitude,
      velocidade,
      detalhes,
      reconhecido,
      created_at
    ) VALUES (
      v_veiculo.id,
      v_veiculo.cliente_id,
      'suspeita_jammer',
      'critica',
      COALESCE(v_veiculo.ultima_latitude, 0.0),
      COALESCE(v_veiculo.ultima_longitude, 0.0),
      COALESCE(v_veiculo.velocidade_atual, 0),
      v_descricao,
      false,
      now()
    );

    SELECT user_id INTO v_cliente_user_id
    FROM public.clientes
    WHERE id = v_veiculo.cliente_id
    LIMIT 1;

    INSERT INTO public.notificacoes_sistema (
      destinatario_user_id,
      destinatario_cliente_id,
      titulo,
      mensagem,
      tipo,
      url,
      placa,
      lida,
      created_at
    ) VALUES (
      v_cliente_user_id,
      v_veiculo.cliente_id,
      '🚨 Suspeita de Jammer / Silenciamento Súbito',
      v_descricao,
      'suspeita_jammer',
      '/monitor-gps',
      v_veiculo.placa,
      false,
      now()
    )
    RETURNING id INTO v_notif_id;

    v_alertas_criados := v_alertas_criados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alertas_criados', v_alertas_criados,
    'verificado_em', now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[JAMMER-CHECKER] Erro durante verificação de jammers: %', SQLERRM;
  RETURN jsonb_build_object('sucesso', false, 'erro', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verificar_suspeita_jammer TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
