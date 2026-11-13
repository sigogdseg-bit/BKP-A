-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Hunter - Notificações Push VAPID em Tempo Real e Persistente do BD
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante que a extensão pg_net esteja ativa
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Assegura a tabela notificacoes_sistema com REPLICA IDENTITY FULL e no Realtime
ALTER TABLE public.notificacoes_sistema REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificacoes_sistema'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_sistema;
  END IF;
END $$;

-- 3. Função de disparo de Web Push VAPID via pg_net ao inserir em notificacoes_sistema
CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sigoguardiao.oficial.tec.br/api/push/disparar';
  v_payload jsonb;
  v_titulo text;
BEGIN
  -- Não dispara push de sistema para mensagens de chat interno
  IF NEW.tipo = 'chat' THEN
    RETURN NEW;
  END IF;

  v_titulo := NEW.titulo;
  IF NEW.placa IS NOT NULL AND NEW.placa <> '' THEN
    v_titulo := NEW.titulo || ' — ' || NEW.placa;
  END IF;

  v_payload := jsonb_build_object(
    'destinatarioUserId', NEW.destinatario_user_id,
    'destinatarioClienteId', NEW.destinatario_cliente_id,
    'titulo', v_titulo,
    'mensagem', NEW.mensagem,
    'url', COALESCE(NEW.url, '/monitor-gps'),
    'tag', 'sigo-notif-' || NEW.id::text
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. Gatilho AFTER INSERT em notificacoes_sistema para disparo atômico de Push
DROP TRIGGER IF EXISTS trg_push_vapid_notificacao_nova ON public.notificacoes_sistema;
CREATE TRIGGER trg_push_vapid_notificacao_nova
AFTER INSERT ON public.notificacoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao();

-- 5. Atualização da RPC registrar_alerta_seguranca com inteligência contextual de ignição
CREATE OR REPLACE FUNCTION public.registrar_alerta_seguranca(
  p_veiculo_id UUID,
  p_tipo TEXT,
  p_detalhes TEXT,
  p_gravidade TEXT DEFAULT 'alta',
  p_latitude DOUBLE PRECISION DEFAULT 0.0,
  p_longitude DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade INT DEFAULT 0,
  p_vibracao_g NUMERIC DEFAULT 0.0,
  p_inclinacao_graus INT DEFAULT 0,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_cliente_id UUID;
  v_cliente_user_id UUID;
  v_placa TEXT;
  v_ignicao BOOLEAN;
  v_ult_lat DOUBLE PRECISION;
  v_ult_lon DOUBLE PRECISION;
  v_ult_vel NUMERIC;
  v_alertas_ativos JSONB;
  v_alerta_existente_id UUID;
  v_novo_alerta_id UUID;
  v_titulo_evento TEXT;
  v_severidade_evento TEXT;
BEGIN
  -- 1. Determina dados do veículo caso não passados
  SELECT 
    cliente_id, 
    placa, 
    ultima_latitude, 
    ultima_longitude, 
    velocidade_atual,
    ignicao_status
  INTO 
    v_cliente_id, 
    v_placa, 
    v_ult_lat, 
    v_ult_lon, 
    v_ult_vel,
    v_ignicao
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF v_cliente_id IS NULL AND p_cliente_id IS NOT NULL THEN
    v_cliente_id := p_cliente_id;
  END IF;

  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo ou cliente não localizado no sistema.');
  END IF;

  -- 2. Busca user_id do cliente proprietário para direcionamento da notificação push e in-app
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = v_cliente_id
  LIMIT 1;

  -- 3. Resolução e Fallback de Coordenadas (Zero Null Island)
  IF (p_latitude IS NULL OR p_longitude IS NULL OR (p_latitude = 0.0 AND p_longitude = 0.0)) THEN
    IF v_ult_lat IS NOT NULL AND v_ult_lon IS NOT NULL AND (v_ult_lat <> 0.0 OR v_ult_lon <> 0.0) THEN
      p_latitude := v_ult_lat;
      p_longitude := v_ult_lon;
      IF (p_velocidade IS NULL OR p_velocidade = 0) AND v_ult_vel IS NOT NULL THEN
        p_velocidade := ROUND(v_ult_vel)::INT;
      END IF;
    END IF;
  END IF;

  -- 4. Validação estrita das preferências do veículo (regras_veiculo.alertas_ativos)
  SELECT alertas_ativos INTO v_alertas_ativos
  FROM public.regras_veiculo
  WHERE veiculo_id = p_veiculo_id
  LIMIT 1;

  IF p_tipo = 'bateria_desconectada' THEN
    IF v_alertas_ativos IS NOT NULL AND COALESCE(
      (v_alertas_ativos->>'bateria_desconectada')::BOOLEAN,
      (v_alertas_ativos->>'baixa_tensao')::BOOLEAN,
      true
    ) = false THEN
      RETURN jsonb_build_object(
        'sucesso', true, 
        'ignorado_por_preferencia', true,
        'mensagem', 'Notificação de desconexão da bateria desativada pelo cliente nas configurações de proteção do veículo.'
      );
    END IF;
  ELSIF p_tipo = 'baixa_tensao' THEN
    IF v_alertas_ativos IS NOT NULL AND COALESCE(
      (v_alertas_ativos->>'baixa_tensao')::BOOLEAN,
      true
    ) = false THEN
      RETURN jsonb_build_object(
        'sucesso', true, 
        'ignorado_por_preferencia', true,
        'mensagem', 'Notificação de baixa tensão desativada pelo cliente nas configurações do veículo.'
      );
    END IF;
  END IF;

  -- 5. Debouncing / Anti-Flood: Evita poluir a central e dispositivos se houver alerta não reconhecido do mesmo tipo nos últimos 3 minutos
  SELECT id INTO v_alerta_existente_id
  FROM public.alertas_seguranca
  WHERE veiculo_id = p_veiculo_id
    AND tipo = p_tipo
    AND reconhecido = FALSE
    AND created_at >= NOW() - INTERVAL '3 minutes'
  LIMIT 1;

  IF v_alerta_existente_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'alerta_id', v_alerta_existente_id,
      'duplicado', true
    );
  END IF;

  -- 6. Insere na tabela oficial alertas_seguranca
  INSERT INTO public.alertas_seguranca (
    veiculo_id,
    cliente_id,
    tipo,
    gravidade,
    latitude,
    longitude,
    velocidade,
    vibracao_g,
    inclinacao_graus,
    detalhes,
    reconhecido,
    created_at
  ) VALUES (
    p_veiculo_id,
    v_cliente_id,
    p_tipo,
    COALESCE(p_gravidade, 'alta'),
    COALESCE(p_latitude, 0.0),
    COALESCE(p_longitude, 0.0),
    COALESCE(p_velocidade, 0),
    COALESCE(p_vibracao_g, 0.00),
    COALESCE(p_inclinacao_graus, 0),
    p_detalhes,
    FALSE,
    NOW()
  )
  RETURNING id INTO v_novo_alerta_id;

  -- 7. Título padronizado para eventos e notificações com inteligência contextual de ignição
  v_titulo_evento := CASE
    WHEN p_tipo = 'suspeita_jammer' THEN 'Alerta: Suspeita de Jammer / Silenciamento'
    WHEN p_tipo = 'saida_area' THEN 'Alerta: Saída de Cerca Virtual'
    WHEN p_tipo = 'desvio_rota' THEN 'Alerta: Desvio de Rota Monitorada'
    WHEN p_tipo = 'bateria_desconectada' THEN 'Corte / Desconexão da Bateria'
    WHEN p_tipo = 'baixa_tensao' THEN 'Baixa Tensão da Bateria'
    WHEN p_tipo = 'guincho' THEN 'Alerta: Guincho / Reboque Não Autorizado'
    WHEN p_tipo = 'colisao_impacto' AND (COALESCE(v_ignicao, false) = false OR p_detalhes ILIKE '%estacionado%' OR p_detalhes ILIKE '%toque%') THEN 'Alerta: Toque / Vibração no Veículo Estacionado'
    WHEN p_tipo = 'colisao_impacto' THEN 'Alerta: Impacto / Choque Violento'
    WHEN p_tipo = 'capotamento_inclinacao' THEN 'Alerta: Inclinação Excessiva / Capotamento'
    WHEN p_tipo = 'panico' THEN 'Alerta: Botão de Pânico Acionado'
    ELSE 'Alerta de Segurança'
  END;

  v_severidade_evento := CASE
    WHEN p_gravidade = 'critica' THEN 'critico'
    WHEN p_gravidade = 'alta' THEN 'aviso'
    ELSE 'info'
  END;

  -- 8. Grava no histórico de eventos_veiculo (resiliente para timeline)
  BEGIN
    INSERT INTO public.eventos_veiculo (
      veiculo_id,
      cliente_id,
      tipo,
      titulo,
      descricao,
      severidade,
      latitude,
      longitude,
      velocidade,
      data_hora
    ) VALUES (
      p_veiculo_id,
      v_cliente_id,
      p_tipo,
      v_titulo_evento,
      p_detalhes,
      v_severidade_evento,
      p_latitude,
      p_longitude,
      p_velocidade,
      NOW()
    );
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

  -- 9. Entrega Automática ao Cliente: Grava em notificacoes_sistema para disparar Realtime e Web Push VAPID via pg_net
  IF v_cliente_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        destinatario_cliente_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa,
        lida,
        created_at
      ) VALUES (
        v_cliente_user_id,
        v_cliente_id,
        'SIGO Guardião — Central de Segurança',
        v_titulo_evento || ' — ' || COALESCE(v_placa, 'Veículo'),
        p_detalhes,
        p_tipo,
        '/monitor-gps',
        COALESCE(v_placa, ''),
        false,
        NOW()
      );
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alerta_id', v_novo_alerta_id,
    'duplicado', false,
    'latitude', p_latitude,
    'longitude', p_longitude
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_alerta_seguranca TO authenticated, anon, service_role;

-- 6. Invalidação de Cache de Schema do PostgREST
NOTIFY pgrst, 'reload schema';
