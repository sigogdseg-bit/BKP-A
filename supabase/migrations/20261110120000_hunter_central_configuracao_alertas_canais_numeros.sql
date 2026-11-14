-- ============================================================================
-- HUNTER / GD RASTREAMENTO — CENTRAL COMPLETA DE CONFIGURAÇÃO DE ALERTAS
-- ============================================================================
-- Migration: 20261110120000_hunter_central_configuracao_alertas_canais_numeros.sql
-- Objetivo:
--   1. Persistência na conta (clientes.alertas_operacionais e clientes.contatos_alertas)
--      para os 7 alertas operacionais/conta com canal independente (app, whatsapp,
--      ligacao) e destinatários por alerta.
--   2. Garantir colunas alertas_ativos, canais_alertas e whatsapp_destinatarios
--      em regras_veiculo com DEFAULT seguro (Expand e Contract).
--   3. Criar helper hunter_alerta_pode_emitir para avaliar opt-in/opt-out e ao
--      menos 1 canal ativo (App, WhatsApp ou Ligação) no banco de dados.
--   4. Atualizar trigger_avaliar_alertas_telemetria, registrar_alerta_seguranca,
--      verificar_jammers_servidor e hunter_processar_ciclo_vida_nfs para respeitar
--      a escolha granular do usuário em todos os alertas reais do sistema.
--   5. Implementar RPC verificar_perda_comunicacao_servidor() acionada pelo Cron
--      para monitoramento efetivo de perda de comunicação no servidor.
-- ============================================================================

-- 1. Colunas em clientes (alertas operacionais e catálogo de contatos da conta)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS alertas_operacionais JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contatos_alertas JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Garantir colunas em regras_veiculo caso ambiente antigo ainda não tenha aplicado
ALTER TABLE public.regras_veiculo
  ADD COLUMN IF NOT EXISTS alertas_ativos JSONB NOT NULL DEFAULT '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"guincho":true,"saida_area":true,"entrada_area":false,"excesso_velocidade":true,"desvio_rota":true,"suspeita_jammer":true,"perda_comunicacao":true,"bateria_desconectada":true,"baixa_tensao":true,"colisao_impacto":true,"corte_nao_autorizado_sms":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS canais_alertas JSONB NOT NULL DEFAULT '{"app": true, "whatsapp": true, "ligacao": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_destinatarios JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Função auxiliar de avaliação de permissão de alerta no servidor PostgreSQL
CREATE OR REPLACE FUNCTION public.hunter_alerta_pode_emitir(
  p_alertas_ativos JSONB,
  p_canais_alertas JSONB,
  p_tipo           TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo        TEXT;
  v_por_alerta  JSONB;
  v_ativo       BOOLEAN;
  v_app         BOOLEAN;
  v_whats       BOOLEAN;
  v_lig         BOOLEAN;
BEGIN
  v_tipo := LOWER(COALESCE(NULLIF(trim(p_tipo), ''), 'alerta'));

  -- Normalização estrita de aliases legados para chave canônica do catálogo real
  v_tipo := CASE v_tipo
    WHEN 'movimento_indevido' THEN 'guincho'
    WHEN 'rota_monitorada' THEN 'desvio_rota'
    WHEN 'jammer' THEN 'suspeita_jammer'
    WHEN 'sos' THEN 'panico'
    WHEN 'sos_panico' THEN 'panico'
    WHEN 'impacto' THEN 'colisao_impacto'
    WHEN 'vib_impacto' THEN 'colisao_impacto'
    WHEN 'desbloqueio_nao_autorizado_sms' THEN 'corte_nao_autorizado_sms'
    WHEN 'cerca_saida' THEN 'saida_area'
    WHEN 'cerca_entrada' THEN 'entrada_area'
    WHEN 'financeiro' THEN 'cobranca'
    WHEN 'alerta_nf_expurgo_24h' THEN 'alerta_nf_expurgo'
    WHEN 'alerta_nf_expurgo_6h' THEN 'alerta_nf_expurgo'
    WHEN 'alerta_nf_expurgo_30m' THEN 'alerta_nf_expurgo'
    WHEN 'agendamento' THEN 'instalacao'
    WHEN 'chamado' THEN 'atendimento'
    WHEN 'suporte' THEN 'atendimento'
    ELSE v_tipo
  END;

  IF p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas->'por_alerta') = 'object' THEN
    v_por_alerta := p_canais_alertas->'por_alerta'->v_tipo;
  END IF;

  IF v_por_alerta IS NULL AND p_alertas_ativos IS NOT NULL AND jsonb_typeof(p_alertas_ativos->'canais_por_alerta') = 'object' THEN
    v_por_alerta := p_alertas_ativos->'canais_por_alerta'->v_tipo;
  END IF;

  -- Determina se o alerta está ativo (opt-in / opt-out)
  IF v_por_alerta IS NOT NULL AND jsonb_typeof(v_por_alerta) = 'object' AND jsonb_typeof(v_por_alerta->'ativo') = 'boolean' THEN
    v_ativo := (v_por_alerta->>'ativo')::BOOLEAN;
  ELSIF p_alertas_ativos IS NOT NULL AND jsonb_typeof(p_alertas_ativos->v_tipo) = 'boolean' THEN
    v_ativo := (p_alertas_ativos->>v_tipo)::BOOLEAN;
  ELSE
    v_ativo := true;
  END IF;

  IF NOT COALESCE(v_ativo, true) THEN
    RETURN false;
  END IF;

  -- Verifica se ao menos 1 canal de entrega está habilitado para este item
  IF v_por_alerta IS NOT NULL AND jsonb_typeof(v_por_alerta) = 'object' THEN
    v_app := CASE
      WHEN jsonb_typeof(v_por_alerta->'app') = 'boolean' THEN (v_por_alerta->>'app')::BOOLEAN
      WHEN p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas->'app') = 'boolean' THEN (p_canais_alertas->>'app')::BOOLEAN
      ELSE true
    END;
    v_whats := CASE
      WHEN jsonb_typeof(v_por_alerta->'whatsapp') = 'boolean' THEN (v_por_alerta->>'whatsapp')::BOOLEAN
      WHEN p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas->'whatsapp') = 'boolean' THEN (p_canais_alertas->>'whatsapp')::BOOLEAN
      ELSE true
    END;
    v_lig := CASE
      WHEN jsonb_typeof(v_por_alerta->'ligacao') = 'boolean' THEN (v_por_alerta->>'ligacao')::BOOLEAN
      WHEN p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas->'ligacao') = 'boolean' THEN (p_canais_alertas->>'ligacao')::BOOLEAN
      ELSE false
    END;
    RETURN (v_app OR v_whats OR v_lig);
  END IF;

  IF p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas) = 'object' THEN
    v_app := CASE WHEN jsonb_typeof(p_canais_alertas->'app') = 'boolean' THEN (p_canais_alertas->>'app')::BOOLEAN ELSE true END;
    v_whats := CASE WHEN jsonb_typeof(p_canais_alertas->'whatsapp') = 'boolean' THEN (p_canais_alertas->>'whatsapp')::BOOLEAN ELSE true END;
    v_lig := CASE WHEN jsonb_typeof(p_canais_alertas->'ligacao') = 'boolean' THEN (p_canais_alertas->>'ligacao')::BOOLEAN ELSE false END;
    RETURN (v_app OR v_whats OR v_lig);
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hunter_alerta_pode_emitir(JSONB, JSONB, TEXT) TO authenticated, anon, service_role;

-- 3. Atualização de public.registrar_alerta_seguranca com normalização, fallback Null Island e validação completa de preferências
CREATE OR REPLACE FUNCTION public.registrar_alerta_seguranca(
  p_veiculo_id            UUID,
  p_tipo                  TEXT,
  p_detalhes              TEXT,
  p_gravidade             TEXT             DEFAULT 'alta',
  p_latitude              DOUBLE PRECISION DEFAULT 0.0,
  p_longitude             DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade            INTEGER          DEFAULT 0,
  p_vibracao_g            NUMERIC          DEFAULT 0.00,
  p_inclinacao_graus      INTEGER          DEFAULT 0,
  p_cliente_id            UUID             DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_cliente_id           UUID;
  v_cliente_user_id      UUID;
  v_placa                TEXT;
  v_ignicao              BOOLEAN;
  v_ult_lat              DOUBLE PRECISION;
  v_ult_lon              DOUBLE PRECISION;
  v_ult_vel              NUMERIC;
  v_alertas_ativos       JSONB;
  v_canais_alertas       JSONB;
  v_alerta_existente_id  UUID;
  v_novo_alerta_id       UUID;
  v_titulo_evento        TEXT;
  v_severidade_evento    TEXT;
  v_tipo_norm            TEXT;
BEGIN
  -- 1. Determina veículo, cliente_id e última posição válida para fallback Anti-Null Island
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

  -- Fallback Anti-Null Island quando evento de hardware não trouxer coordenadas GPS
  IF (p_latitude IS NULL OR p_longitude IS NULL OR (p_latitude = 0.0 AND p_longitude = 0.0)) THEN
    IF v_ult_lat IS NOT NULL AND v_ult_lon IS NOT NULL AND (v_ult_lat <> 0.0 OR v_ult_lon <> 0.0) THEN
      p_latitude := v_ult_lat;
      p_longitude := v_ult_lon;
      IF (p_velocidade IS NULL OR p_velocidade = 0) AND v_ult_vel IS NOT NULL THEN
        p_velocidade := ROUND(v_ult_vel)::INT;
      END IF;
    END IF;
  END IF;

  -- Normalização de aliases legados do hardware / frontend
  v_tipo_norm := CASE LOWER(COALESCE(p_tipo, 'alerta'))
    WHEN 'movimento_indevido' THEN 'guincho'
    WHEN 'rota_monitorada' THEN 'desvio_rota'
    WHEN 'jammer' THEN 'suspeita_jammer'
    WHEN 'sos' THEN 'panico'
    WHEN 'sos_panico' THEN 'panico'
    WHEN 'impacto' THEN 'colisao_impacto'
    WHEN 'vib_impacto' THEN 'colisao_impacto'
    WHEN 'desbloqueio_nao_autorizado_sms' THEN 'corte_nao_autorizado_sms'
    WHEN 'cerca_saida' THEN 'saida_area'
    WHEN 'cerca_entrada' THEN 'entrada_area'
    ELSE LOWER(COALESCE(p_tipo, 'alerta'))
  END;

  -- Busca preferências e canais configurados no veículo
  SELECT alertas_ativos, canais_alertas
  INTO v_alertas_ativos, v_canais_alertas
  FROM public.regras_veiculo
  WHERE veiculo_id = p_veiculo_id
  LIMIT 1;

  -- Verifica preferência explícita (opt-out ou todos os canais desligados)
  IF v_tipo_norm = 'bateria_desconectada'
     AND v_alertas_ativos IS NOT NULL
     AND jsonb_typeof(v_alertas_ativos->'bateria_desconectada') = 'boolean'
     AND (v_alertas_ativos->>'bateria_desconectada')::BOOLEAN = false THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ignorado_por_preferencia', true,
      'mensagem', 'Alerta bateria_desconectada desativado pelo cliente nas configurações do veículo.'
    );
  END IF;

  IF NOT public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, v_tipo_norm) THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'ignorado_por_preferencia', true,
      'mensagem', format('Alerta %s desativado pelo usuário nas configurações de proteção.', v_tipo_norm)
    );
  END IF;

  -- Busca o user_id do cliente para entrega de push/notificações
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = v_cliente_id
  LIMIT 1;

  -- 2. Debouncing / Anti-Flood: Evita poluir a central se houver alerta não reconhecido do mesmo tipo nos últimos 3 minutos
  SELECT id INTO v_alerta_existente_id
  FROM public.alertas_seguranca
  WHERE veiculo_id = p_veiculo_id
    AND tipo IN (p_tipo, v_tipo_norm)
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

  -- 3. Insere na tabela oficial alertas_seguranca usando tipo canônico
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
    v_tipo_norm,
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

  -- 4. Título padronizado para Timeline e notificações
  v_titulo_evento := CASE
    WHEN v_tipo_norm = 'suspeita_jammer' THEN 'Alerta: Suspeita de Jammer / Silenciamento'
    WHEN v_tipo_norm = 'saida_area' THEN 'Alerta: Saída de Cerca Virtual'
    WHEN v_tipo_norm = 'entrada_area' THEN 'Alerta: Chegada em Área Segura'
    WHEN v_tipo_norm = 'desvio_rota' THEN 'Alerta: Desvio de Rota Monitorada'
    WHEN v_tipo_norm = 'bateria_desconectada' THEN 'Corte / Desconexão da Bateria'
    WHEN v_tipo_norm = 'baixa_tensao' THEN 'Baixa Tensão da Bateria'
    WHEN v_tipo_norm = 'perda_comunicacao' THEN 'Perda de Comunicação do Rastreador'
    WHEN v_tipo_norm = 'guincho' THEN 'Alerta: Movimento com Motor Desligado (Guincho)'
    WHEN v_tipo_norm = 'colisao_impacto' AND (COALESCE(v_ignicao, false) = false OR p_detalhes ILIKE '%estacionado%' OR p_detalhes ILIKE '%toque%') THEN 'Alerta: Toque / Vibração no Veículo Estacionado'
    WHEN v_tipo_norm = 'colisao_impacto' THEN 'Alerta: Impacto / Choque Violento'
    WHEN v_tipo_norm = 'capotamento_inclinacao' THEN 'Alerta: Inclinação Excessiva / Capotamento'
    WHEN v_tipo_norm = 'panico' THEN 'Alerta: Botão de Pânico / SOS Acionado'
    WHEN v_tipo_norm = 'violacao_dispositivo' THEN 'Alerta: Violação / Remoção do Rastreador'
    WHEN p_tipo = 'desbloqueio_nao_autorizado_sms' THEN 'Alerta: Desbloqueio Externo via SMS Bloqueado'
    WHEN v_tipo_norm = 'corte_nao_autorizado_sms' THEN 'Alerta: Corte / Comando Externo via SMS'
    WHEN v_tipo_norm = 'ignicao_ligada' THEN 'Alerta: Ignição Ligada'
    WHEN v_tipo_norm = 'ignicao_desligada' THEN 'Alerta: Ignição Desligada'
    ELSE 'Alerta Operacional de Segurança'
  END;

  v_severidade_evento := CASE
    WHEN p_gravidade = 'critica' THEN 'critico'
    WHEN p_gravidade = 'alta' THEN 'aviso'
    ELSE 'info'
  END;

  -- 5. Grava também no histórico de eventos_veiculo
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
      v_tipo_norm,
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

  -- 6. Dispara notificação no sistema (ativa Push VAPID, WhatsApp e Ligação conforme configuração do usuário)
  BEGIN
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
      v_cliente_id,
      format('%s — %s', v_titulo_evento, COALESCE(v_placa, '')),
      p_detalhes,
      v_tipo_norm,
      '/monitor-gps',
      COALESCE(v_placa, ''),
      false,
      NOW()
    );
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alerta_id', v_novo_alerta_id,
    'duplicado', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_alerta_seguranca(UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, NUMERIC, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_alerta_seguranca(UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, NUMERIC, INTEGER, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_alerta_seguranca(UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, NUMERIC, INTEGER, UUID) TO service_role;

-- 4. Atualização de public.trigger_avaliar_alertas_telemetria() respeitando canais e ativo por alerta
CREATE OR REPLACE FUNCTION public.trigger_avaliar_alertas_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_user_id   UUID;
  v_velocidade_limite INT := 110;
  v_alerta_mov_regras BOOLEAN := true;
  v_alerta_ign_regras BOOLEAN := true;
  v_alertas_ativos    JSONB;
  v_canais_alertas    JSONB;
  v_dist_metros       FLOAT := 0;
  v_dlat              FLOAT;
  v_dlon              FLOAT;
  v_a                 FLOAT;
  v_cooldown_ok       BOOLEAN := false;
  v_horario_proibido  BOOLEAN := false;
  v_hora_inicio_str   TEXT;
  v_hora_fim_str      TEXT;
  v_hora_evento_str   TEXT;

  -- Variáveis de geofence / áreas seguras
  v_area              RECORD;
  v_dlat_area         FLOAT;
  v_dlon_area         FLOAT;
  v_dist_area_new     FLOAT;
  v_agora_brt         TIMESTAMP;
  v_hora_atual        TIME;
  v_dow_atual         INT;
  v_area_fora_horario BOOLEAN;
  v_estado_anterior   TEXT;
  v_tolerancia        FLOAT;
  v_raio_saida        FLOAT;
  v_raio_entrada      FLOAT;
  v_deve_alertar_geo  BOOLEAN;

  -- Variáveis de payload do alerta
  v_titulo            TEXT;
  v_mensagem          TEXT;
  v_tipo              TEXT;
  v_gravidade         TEXT;

  COOLDOWN_PADRAO     INTERVAL := INTERVAL '5 minutes';
BEGIN
  -- Data/hora canônica oficial no fuso horário de Brasília (UTC-3)
  v_agora_brt := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora_atual := v_agora_brt::TIME;
  v_dow_atual := EXTRACT(DOW FROM v_agora_brt)::INT;
  v_hora_evento_str := to_char(v_agora_brt, 'DD/MM/YYYY às HH24:MI:SS');

  -- RESET DO CICLO DE IGNIÇÃO / DESLOCAMENTO NA CHAVE DESLIGADA
  IF NEW.ignicao_status = false THEN
    DELETE FROM public.alertas_telemetria_cooldown
    WHERE veiculo_id = NEW.id
      AND tipo_alerta IN ('movimento_fora_horario', 'ignicao_fora_horario');
  END IF;

  -- 1. Busca user_id do cliente titular
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = NEW.cliente_id
  LIMIT 1;

  -- 2. Busca parâmetros de regras e preferências ativas do veículo
  SELECT
    COALESCE(limite_velocidade_geral, 110),
    COALESCE(alerta_movimento_nao_autorizado, true),
    COALESCE(alerta_ignicao_fora_horario, true),
    alertas_ativos,
    canais_alertas
  INTO
    v_velocidade_limite,
    v_alerta_mov_regras,
    v_alerta_ign_regras,
    v_alertas_ativos,
    v_canais_alertas
  FROM public.regras_veiculo
  WHERE veiculo_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    v_velocidade_limite := 110;
    v_alerta_mov_regras := true;
    v_alerta_ign_regras := true;
    v_alertas_ativos := '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"saida_area":true,"entrada_area":false,"excesso_velocidade":true,"perda_comunicacao":true,"baixa_tensao":true,"bateria_desconectada":true,"desvio_rota":true,"guincho":true,"suspeita_jammer":true,"colisao_impacto":true,"corte_nao_autorizado_sms":true}'::jsonb;
    v_canais_alertas := '{"app":true,"whatsapp":true,"ligacao":false}'::jsonb;
  END IF;

  -- 3. Cálculo geodésico de deslocamento Haversine em metros entre OLD e NEW
  IF OLD.ultima_latitude IS NOT NULL
     AND OLD.ultima_longitude IS NOT NULL
     AND NEW.ultima_latitude IS NOT NULL
     AND NEW.ultima_longitude IS NOT NULL
     AND (OLD.ultima_latitude <> 0 OR OLD.ultima_longitude <> 0)
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0)
     AND (OLD.ultima_latitude <> NEW.ultima_latitude OR OLD.ultima_longitude <> NEW.ultima_longitude) THEN

    v_dlat := radians(NEW.ultima_latitude - OLD.ultima_latitude);
    v_dlon := radians(NEW.ultima_longitude - OLD.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(OLD.ultima_latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));
  ELSE
    v_dist_metros := 0;
  END IF;

  -- ALERTA A: EXCESSO DE VELOCIDADE
  IF COALESCE(NEW.velocidade_atual, 0) > 0
     AND COALESCE((v_alertas_ativos->>'excesso_velocidade')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'excesso_velocidade') THEN

    IF NEW.velocidade_atual > v_velocidade_limite THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'excesso_velocidade'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo   := format('⚠️ Excesso de Velocidade — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s atingiu %s km/h (limite configurado: %s km/h) em %s.',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual),
          v_velocidade_limite,
          v_hora_evento_str
        );
        v_tipo      := 'excesso_velocidade';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA B: IGNIÇÃO LIGADA FORA DO HORÁRIO (TRANSIÇÃO OFF -> ON)
  IF NEW.ignicao_status = true
     AND COALESCE(OLD.ignicao_status, false) = false
     AND v_alerta_ign_regras = true
     AND COALESCE((v_alertas_ativos->>'ignicao_fora_horario')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'ignicao_fora_horario') THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'ignicao_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Ignição Acionada Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Motor do veículo %s acionado fora do horário permitido (%s às %s) em %s.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str
        );
        v_tipo      := 'ignicao_fora_horario';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA D: DESLOCAMENTO FORA DO HORÁRIO (1x POR CICLO DE CHAVE LIGADA)
  IF NEW.ignicao_status = true
     AND (COALESCE(NEW.velocidade_atual, 0) >= 3 OR v_dist_metros >= 15.0)
     AND v_alerta_mov_regras = true
     AND COALESCE((v_alertas_ativos->>'movimento_fora_horario')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'movimento_fora_horario') THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'movimento_fora_horario'
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Deslocamento Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s em movimento fora do horário permitido (%s às %s) em %s. Velocidade: %s km/h.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str,
          ROUND(NEW.velocidade_atual)
        );
        v_tipo      := 'movimento_fora_horario';
        v_gravidade := 'critica';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ALERTA E: GUINCHO / ARRASTO COM MOTOR DESLIGADO
  IF NEW.ignicao_status = false
     AND COALESCE(OLD.ignicao_status, false) = false
     AND (
       COALESCE(NEW.velocidade_atual, 0) >= 15
       OR (COALESCE(NEW.velocidade_atual, 0) >= 10 AND v_dist_metros >= 35.0)
     )
     AND COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true
     AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'guincho') THEN

    SELECT (
      NOT EXISTS (
        SELECT 1 FROM public.alertas_telemetria_cooldown
        WHERE veiculo_id = NEW.id
          AND tipo_alerta = 'guincho'
          AND ultimo_at > (now() - COOLDOWN_PADRAO)
      )
    ) INTO v_cooldown_ok;

    IF v_cooldown_ok THEN
      v_titulo   := format('🚨 Veículo em Movimento com Motor Desligado — %s', COALESCE(NEW.placa, ''));
      v_mensagem := format(
        'Veículo %s detectado a %s km/h com ignição desligada em %s. Possível reboque ou furto em andamento.',
        COALESCE(NEW.placa, ''),
        ROUND(NEW.velocidade_atual),
        v_hora_evento_str
      );
      v_tipo      := 'guincho';
      v_gravidade := 'critica';

      INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
      VALUES (NEW.id, v_tipo, now())
      ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

      INSERT INTO public.alertas_seguranca (
        veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
        velocidade, detalhes, reconhecido, created_at
      ) VALUES (
        NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
        COALESCE(NEW.ultima_latitude, 0),
        COALESCE(NEW.ultima_longitude, 0),
        COALESCE(NEW.velocidade_atual::INT, 0),
        v_mensagem, false, now()
      );

      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id, destinatario_cliente_id,
        titulo, mensagem, tipo, url, placa, lida, created_at
      ) VALUES (
        v_cliente_user_id, NEW.cliente_id,
        v_titulo, v_mensagem, v_tipo, '/monitor-gps',
        COALESCE(NEW.placa, ''), false, now()
      );
    END IF;
  END IF;

  -- ALERTA F: GEOFENCE COM MÁQUINA DE ESTADOS FÍSICA (ZERO REPETIÇÃO)
  IF NEW.ultima_latitude IS NOT NULL
     AND NEW.ultima_longitude IS NOT NULL
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0) THEN

    FOR v_area IN
      SELECT id, nome, latitude, longitude, raio_metros,
             COALESCE(tolerancia_metros, 30) AS tolerancia_metros,
             COALESCE(regra_entrada, 'permitida') AS regra_entrada,
             COALESCE(regra_saida, 'permitida') AS regra_saida,
             hora_inicio, hora_fim, dias_semana
      FROM public.areas_seguras
      WHERE (veiculo_id = NEW.id OR (veiculo_id IS NULL AND cliente_id = NEW.cliente_id))
        AND ativo = true
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND raio_metros > 0
    LOOP
      v_dlat_area := radians(NEW.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(NEW.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_new := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      v_tolerancia := GREATEST(COALESCE(v_area.tolerancia_metros, 30.0), 20.0);
      v_raio_saida := v_area.raio_metros + v_tolerancia;
      v_raio_entrada := v_area.raio_metros;

      v_area_fora_horario := false;
      IF v_area.hora_inicio IS NOT NULL AND v_area.hora_fim IS NOT NULL THEN
        IF v_area.dias_semana IS NOT NULL AND NOT (v_dow_atual = ANY(v_area.dias_semana)) THEN
          v_area_fora_horario := true;
        ELSIF v_area.hora_inicio <= v_area.hora_fim THEN
          IF v_hora_atual < v_area.hora_inicio OR v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        ELSE
          IF v_hora_atual < v_area.hora_inicio AND v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        END IF;
      END IF;

      SELECT estado INTO v_estado_anterior
      FROM public.veiculo_areas_estado
      WHERE veiculo_id = NEW.id AND area_id = v_area.id;

      IF v_estado_anterior IS NULL THEN
        IF v_dist_area_new <= v_raio_entrada THEN
          v_estado_anterior := 'dentro';
        ELSE
          v_estado_anterior := 'fora';
        END IF;

        INSERT INTO public.veiculo_areas_estado (
          veiculo_id, area_id, estado, distancia_metros, updated_at
        ) VALUES (
          NEW.id, v_area.id, v_estado_anterior, v_dist_area_new, now()
        ) ON CONFLICT (veiculo_id, area_id) DO NOTHING;
      END IF;

      -- F.1) TRANSIÇÃO PARA SAÍDA: DE 'dentro' PARA 'fora'
      IF v_estado_anterior = 'dentro' AND v_dist_area_new > v_raio_saida THEN
        v_deve_alertar_geo :=
          COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true
          AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'saida_area')
          AND (
            v_area.regra_saida = 'alertar'
            OR (v_area.regra_saida = 'fora_horario' AND v_area_fora_horario)
          );

        UPDATE public.veiculo_areas_estado
        SET estado = 'fora',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'saida_area',
            ultimo_evento_em = now(),
            notificacao_enviada = v_deve_alertar_geo,
            whatsapp_enviado = NOT v_deve_alertar_geo,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        IF v_deve_alertar_geo THEN
          v_titulo := format('🚨 Saída de Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_saida = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s saiu da área protegida "%s" FORA do horário habitual em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s saiu da área monitorada "%s" em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'media';
          END IF;

          v_tipo := 'saida_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      -- F.2) TRANSIÇÃO PARA ENTRADA: DE 'fora' PARA 'dentro'
      ELSIF v_estado_anterior = 'fora' AND v_dist_area_new <= v_raio_entrada THEN
        v_deve_alertar_geo :=
          COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true
          AND public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'entrada_area')
          AND (
            v_area.regra_entrada = 'alertar'
            OR (v_area.regra_entrada = 'fora_horario' AND v_area_fora_horario)
          );

        UPDATE public.veiculo_areas_estado
        SET estado = 'dentro',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'entrada_area',
            ultimo_evento_em = now(),
            notificacao_enviada = v_deve_alertar_geo,
            whatsapp_enviado = NOT v_deve_alertar_geo,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        IF v_deve_alertar_geo THEN
          v_titulo := format('✅ Chegada em Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_entrada = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s entrou na área protegida "%s" FORA do horário habitual em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s entrou na área monitorada "%s" em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'baixa';
          END IF;

          v_tipo := 'entrada_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      ELSE
        UPDATE public.veiculo_areas_estado
        SET distancia_metros = v_dist_area_new,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;
      END IF;

    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_avaliar_alertas_telemetria falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 5. Atualização de public.verificar_jammers_servidor(p_timeout_minutos INT)
CREATE OR REPLACE FUNCTION public.verificar_jammers_servidor(
  p_timeout_minutos INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_veiculo          RECORD;
  v_cliente_user_id  UUID;
  v_alertas_ativos   JSONB;
  v_canais_alertas   JSONB;
  v_diff_minutos     NUMERIC;
  v_alertas_criados  INT := 0;
  v_ultima_notif_at  TIMESTAMPTZ;
  v_descricao        TEXT;
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
      AND (v.ignicao_status = true OR v.velocidade_atual > 10)
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
        WHERE ult.ignicao = true OR ult.velocidade > 10
      )
  LOOP
    SELECT alertas_ativos, canais_alertas
    INTO v_alertas_ativos, v_canais_alertas
    FROM public.regras_veiculo
    WHERE veiculo_id = v_veiculo.id
    LIMIT 1;

    IF NOT public.hunter_alerta_pode_emitir(v_alertas_ativos, v_canais_alertas, 'suspeita_jammer') THEN
      CONTINUE;
    END IF;

    SELECT created_at INTO v_ultima_notif_at
    FROM public.alertas_seguranca
    WHERE veiculo_id = v_veiculo.id
      AND tipo = 'suspeita_jammer'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_ultima_notif_at IS NOT NULL AND
       (now() - v_ultima_notif_at) < interval '10 minutes' THEN
      CONTINUE;
    END IF;

    v_diff_minutos := ROUND(v_veiculo.minutos_sem_sinal::NUMERIC, 1);

    v_descricao := format(
      'Veículo %s (%s) perdeu contato abruptamente enquanto estava em trânsito (%s km/h, ignição %s). '
      'Ausência de pacotes há %s min sem evento de desligamento normal. '
      'Suspeita de bloqueador de sinal celular/GPS ou sabotagem elétrica.',
      v_veiculo.placa,
      v_veiculo.marca_modelo,
      COALESCE(v_veiculo.velocidade_atual, 0),
      CASE WHEN v_veiculo.ignicao_status THEN 'ligada' ELSE 'desligada' END,
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
    );

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

REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM anon;
REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_jammers_servidor(INT) TO service_role;

-- 6. Nova RPC de monitoramento efetivo no servidor para perda de comunicação
CREATE OR REPLACE FUNCTION public.verificar_perda_comunicacao_servidor()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_veiculo          RECORD;
  v_cliente_user_id  UUID;
  v_limite_min       INT;
  v_alertas_criados  INT := 0;
  v_cooldown_ok      BOOLEAN := false;
  v_diff_minutos     NUMERIC;
  v_descricao        TEXT;
BEGIN
  -- Limpa cooldowns de veículos que voltaram a se comunicar após o último alerta
  DELETE FROM public.alertas_telemetria_cooldown c
  USING public.veiculos v
  WHERE c.veiculo_id = v.id
    AND c.tipo_alerta = 'perda_comunicacao'
    AND v.ultima_atualizacao IS NOT NULL
    AND v.ultima_atualizacao > c.ultimo_at;

  FOR v_veiculo IN
    SELECT
      v.id,
      v.cliente_id,
      v.placa,
      v.marca_modelo,
      v.velocidade_atual,
      v.ultima_atualizacao,
      v.ultima_latitude,
      v.ultima_longitude,
      EXTRACT(EPOCH FROM (now() - v.ultima_atualizacao)) / 60.0 AS minutos_sem_sinal,
      rv.minutos_limite_sem_comunicacao,
      rv.alertas_ativos,
      rv.canais_alertas
    FROM public.veiculos v
    LEFT JOIN LATERAL (
      SELECT
        minutos_limite_sem_comunicacao,
        alertas_ativos,
        canais_alertas
      FROM public.regras_veiculo r
      WHERE r.veiculo_id = v.id
      LIMIT 1
    ) rv ON true
    WHERE
      v.ativo = true
      AND v.cliente_id IS NOT NULL
      AND v.ultima_atualizacao IS NOT NULL
  LOOP
    v_limite_min := GREATEST(COALESCE(v_veiculo.minutos_limite_sem_comunicacao, 30), 10);

    IF v_veiculo.minutos_sem_sinal <= v_limite_min THEN
      CONTINUE;
    END IF;

    IF NOT public.hunter_alerta_pode_emitir(v_veiculo.alertas_ativos, v_veiculo.canais_alertas, 'perda_comunicacao') THEN
      CONTINUE;
    END IF;

    SELECT (
      NOT EXISTS (
        SELECT 1
        FROM public.alertas_telemetria_cooldown
        WHERE veiculo_id = v_veiculo.id
          AND tipo_alerta = 'perda_comunicacao'
          AND ultimo_at > (now() - interval '60 minutes')
      )
    ) INTO v_cooldown_ok;

    IF NOT v_cooldown_ok THEN
      CONTINUE;
    END IF;

    v_diff_minutos := ROUND(v_veiculo.minutos_sem_sinal::NUMERIC, 0);
    v_descricao := format(
      'Veículo %s está sem transmitir pacote de telemetria há %s minutos (limite configurado: %s min).',
      COALESCE(v_veiculo.placa, ''),
      v_diff_minutos,
      v_limite_min
    );

    INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
    VALUES (v_veiculo.id, 'perda_comunicacao', now())
    ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

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
      'perda_comunicacao',
      'alta',
      COALESCE(v_veiculo.ultima_latitude, 0.0),
      COALESCE(v_veiculo.ultima_longitude, 0.0),
      COALESCE(v_veiculo.velocidade_atual::INT, 0),
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
      format('📡 Perda de Comunicação — %s', COALESCE(v_veiculo.placa, '')),
      v_descricao,
      'perda_comunicacao',
      '/monitor-gps',
      COALESCE(v_veiculo.placa, ''),
      false,
      now()
    );

    v_alertas_criados := v_alertas_criados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alertas_criados', v_alertas_criados,
    'verificado_em', now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PERDA-COMUNICACAO] Erro ao verificar perda de comunicação: %', SQLERRM;
  RETURN jsonb_build_object('sucesso', false, 'erro', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_perda_comunicacao_servidor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_perda_comunicacao_servidor() FROM anon;
REVOKE ALL ON FUNCTION public.verificar_perda_comunicacao_servidor() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_perda_comunicacao_servidor() TO service_role;

-- 7. Atualização de public.hunter_processar_ciclo_vida_nfs() considerando alertas_operacionais
CREATE OR REPLACE FUNCTION public.hunter_processar_ciclo_vida_nfs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_agora TIMESTAMPTZ := now();
  v_horas_passadas FLOAT;
  v_alertas_enviados INT := 0;
  v_expurgadas INT := 0;
  v_titulo TEXT;
  v_msg TEXT;
BEGIN
  -- A) Processa NFs de Abastecimentos pendentes de download
  FOR v_rec IN
    SELECT a.id, a.veiculo_id, a.nf_foto_url, a.nf_numero, a.nf_upload_em,
           a.nf_alerta_pronta_em, a.nf_alerta_24h_em, a.nf_alerta_6h_em, a.nf_alerta_30m_em,
           v.placa, v.cliente_id,
           CASE
             WHEN COALESCE(c.alertas_operacionais, '{}'::jsonb) ? 'alerta_nf_expurgo' THEN
               public.hunter_alerta_pode_emitir(
                 NULL,
                 jsonb_build_object('por_alerta', c.alertas_operacionais),
                 'alerta_nf_expurgo'
               )
             ELSE COALESCE(c.notificar_nf_pendente, true)
           END AS notificar,
           c.user_id AS cliente_user_id
    FROM public.motorista_abastecimentos a
    JOIN public.veiculos v ON v.id = a.veiculo_id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    WHERE a.nf_foto_url IS NOT NULL
      AND a.nf_baixado = false
      AND a.nf_expirado = false
      AND a.nf_upload_em IS NOT NULL
  LOOP
    v_horas_passadas := EXTRACT(EPOCH FROM (v_agora - v_rec.nf_upload_em)) / 3600.0;

    IF v_rec.notificar = false THEN
      IF v_horas_passadas >= 48.0 THEN
        UPDATE public.motorista_abastecimentos
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;
      END IF;
    ELSE
      IF v_horas_passadas >= 78.5 THEN
        UPDATE public.motorista_abastecimentos
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;

      ELSIF v_horas_passadas >= 78.0 AND v_rec.nf_alerta_30m_em IS NULL THEN
        v_titulo := format('⚠️ Último Aviso: Exclusão de NF em 30 min — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('A Nota Fiscal vinculada ao veículo %s será excluída definitivamente em 30 minutos por ausência de download.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_30m', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_abastecimentos
        SET nf_alerta_30m_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;

      ELSIF v_horas_passadas >= 72.0 AND v_rec.nf_alerta_6h_em IS NULL THEN
        v_titulo := format('⏰ Alerta: Exclusão de NF em 6 horas — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('A Nota Fiscal vinculada ao veículo %s não foi baixada e será excluída do sistema em 6 horas.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_6h', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_abastecimentos
        SET nf_alerta_6h_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;

      ELSIF v_horas_passadas >= 48.0 AND v_rec.nf_alerta_24h_em IS NULL THEN
        v_titulo := format('📄 Alerta: Exclusão de NF em 24 horas — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('O prazo inicial de 48h para download da Nota Fiscal do veículo %s expirou. Restam 24h antes da exclusão permanente.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_24h', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_abastecimentos
        SET nf_alerta_24h_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;
      END IF;
    END IF;
  END LOOP;

  -- B) Processa NFs de Despesas pendentes de download
  FOR v_rec IN
    SELECT d.id, d.veiculo_id, d.nf_foto_url, d.nf_numero, d.nf_upload_em,
           d.nf_alerta_pronta_em, d.nf_alerta_24h_em, d.nf_alerta_6h_em, d.nf_alerta_30m_em,
           v.placa, v.cliente_id,
           CASE
             WHEN COALESCE(c.alertas_operacionais, '{}'::jsonb) ? 'alerta_nf_expurgo' THEN
               public.hunter_alerta_pode_emitir(
                 NULL,
                 jsonb_build_object('por_alerta', c.alertas_operacionais),
                 'alerta_nf_expurgo'
               )
             ELSE COALESCE(c.notificar_nf_pendente, true)
           END AS notificar,
           c.user_id AS cliente_user_id
    FROM public.motorista_despesas d
    JOIN public.veiculos v ON v.id = d.veiculo_id
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    WHERE d.nf_foto_url IS NOT NULL
      AND d.nf_baixado = false
      AND d.nf_expirado = false
      AND d.nf_upload_em IS NOT NULL
  LOOP
    v_horas_passadas := EXTRACT(EPOCH FROM (v_agora - v_rec.nf_upload_em)) / 3600.0;

    IF v_rec.notificar = false THEN
      IF v_horas_passadas >= 48.0 THEN
        UPDATE public.motorista_despesas
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;
      END IF;
    ELSE
      IF v_horas_passadas >= 78.5 THEN
        UPDATE public.motorista_despesas
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;

      ELSIF v_horas_passadas >= 78.0 AND v_rec.nf_alerta_30m_em IS NULL THEN
        v_titulo := format('⚠️ Último Aviso: Exclusão de NF em 30 min — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('A Nota Fiscal de despesa vinculada ao veículo %s será excluída definitivamente em 30 minutos por ausência de download.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_30m', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_despesas
        SET nf_alerta_30m_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;

      ELSIF v_horas_passadas >= 72.0 AND v_rec.nf_alerta_6h_em IS NULL THEN
        v_titulo := format('⏰ Alerta: Exclusão de NF em 6 horas — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('A Nota Fiscal de despesa vinculada ao veículo %s não foi baixada e será excluída do sistema em 6 horas.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_6h', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_despesas
        SET nf_alerta_6h_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;

      ELSIF v_horas_passadas >= 48.0 AND v_rec.nf_alerta_24h_em IS NULL THEN
        v_titulo := format('📄 Alerta: Exclusão de NF em 24 horas — %s', COALESCE(v_rec.placa, ''));
        v_msg := format('O prazo inicial de 48h para download da Nota Fiscal de despesa do veículo %s expirou. Restam 24h antes da exclusão permanente.', COALESCE(v_rec.placa, ''));

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_rec.cliente_user_id, v_rec.cliente_id,
          v_titulo, v_msg, 'alerta_nf_expurgo_24h', '/motoristas',
          COALESCE(v_rec.placa, ''), false, now()
        );

        UPDATE public.motorista_despesas
        SET nf_alerta_24h_em = v_agora
        WHERE id = v_rec.id;
        v_alertas_enviados := v_alertas_enviados + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alertas_enviados', v_alertas_enviados,
    'expurgadas', v_expurgadas,
    'processado_em', v_agora
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hunter_processar_ciclo_vida_nfs() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
