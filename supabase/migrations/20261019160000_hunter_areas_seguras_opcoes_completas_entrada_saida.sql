-- ==============================================================================
-- HUNTER GUARDIAN / DJR-NEW — MIGRATION 20261019160000
-- ÁREAS SEGURAS (GEOFENCE): SUPORTE COMPLETO A REGRAS DE ENTRADA E SAÍDA
-- Permite ao usuário escolher livremente para cada área:
--   - regra_entrada: 'alertar' | 'fora_horario' | 'permitida'
--   - regra_saida:   'alertar' | 'fora_horario' | 'permitida'
-- Avaliação atômica em tempo real no trigger de telemetria com fuso de Brasília.
-- ==============================================================================

-- 1. Assegurar defaults canônicos nas colunas de areas_seguras
ALTER TABLE public.areas_seguras 
  ALTER COLUMN regra_entrada SET DEFAULT 'permitida',
  ALTER COLUMN regra_saida SET DEFAULT 'permitida';

-- 2. Atualizar a função atômica trigger_avaliar_alertas_telemetria
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
  v_dist_area_old     FLOAT;
  v_chave_cooldown    TEXT;
  v_agora_brt         TIMESTAMP;
  v_hora_atual        TIME;
  v_dow_atual         INT;
  v_area_fora_horario BOOLEAN;
  
  -- Variáveis de payload do alerta
  v_titulo            TEXT;
  v_mensagem          TEXT;
  v_tipo              TEXT;
  v_gravidade         TEXT;
  
  COOLDOWN_PADRAO     INTERVAL := INTERVAL '5 minutes';
  COOLDOWN_IGNICAO    INTERVAL := INTERVAL '1 minute';
BEGIN
  -- Data/hora canônica oficial no fuso horário de Brasília (UTC-3)
  v_agora_brt := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora_atual := v_agora_brt::TIME;
  v_dow_atual := EXTRACT(DOW FROM v_agora_brt)::INT; -- 0=Domingo ... 6=Sábado
  v_hora_evento_str := to_char(v_agora_brt, 'DD/MM/YYYY às HH24:MI:SS');

  -- 1. Busca o user_id do cliente proprietário do veículo
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = NEW.cliente_id
  LIMIT 1;

  -- 2. Busca parâmetros de regras e preferências ativas do veículo
  SELECT 
    COALESCE(limite_velocidade_geral, 110),
    COALESCE(alerta_movimento_nao_autorizado, true),
    COALESCE(alerta_ignicao_fora_horario, true),
    alertas_ativos
  INTO 
    v_velocidade_limite,
    v_alerta_mov_regras,
    v_alerta_ign_regras,
    v_alertas_ativos
  FROM public.regras_veiculo
  WHERE veiculo_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    v_velocidade_limite := 110;
    v_alerta_mov_regras := true;
    v_alerta_ign_regras := true;
    v_alertas_ativos := '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"ignicao_ligada":true,"saida_area":true,"entrada_area":true,"excesso_velocidade":true,"perda_comunicacao":true,"baixa_tensao":true,"desvio_rota":true,"guincho":true}'::jsonb;
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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA A: EXCESSO DE VELOCIDADE
  -- ─────────────────────────────────────────────────────────────────────────
  IF COALESCE(NEW.velocidade_atual, 0) > 0 
     AND COALESCE((v_alertas_ativos->>'excesso_velocidade')::BOOLEAN, true) = true THEN

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA B / C: IGNIÇÃO LIGADA (Fora do Horário ou Imediato)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true AND COALESCE(OLD.ignicao_status, false) = false THEN
    v_horario_proibido := public.hunter_horario_proibido(NEW.id);

    IF v_horario_proibido AND v_alerta_ign_regras = true 
       AND COALESCE((v_alertas_ativos->>'ignicao_fora_horario')::BOOLEAN, true) = true THEN
      
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

        v_titulo   := format('Ignição Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Motor acionado fora do horário habitual configurado (%s às %s) em %s. Veículo: %s.',
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str,
          COALESCE(NEW.placa, '')
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

    ELSIF NOT v_horario_proibido 
          AND COALESCE((v_alertas_ativos->>'ignicao_ligada')::BOOLEAN, true) = true THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'ignicao_ligada'
            AND ultimo_at > (now() - COOLDOWN_IGNICAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo   := format('Ignição Ligada — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format('Motor acionado / chave ligada em %s. Veículo: %s.', v_hora_evento_str, COALESCE(NEW.placa, ''));
        v_tipo      := 'ignicao_ligada';
        v_gravidade := 'baixa';

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA D: DESLOCAMENTO FORA DO HORÁRIO (ignição ligada + em movimento real)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true 
     AND (COALESCE(NEW.velocidade_atual, 0) >= 3 OR v_dist_metros >= 15.0)
     AND v_alerta_mov_regras = true
     AND COALESCE((v_alertas_ativos->>'movimento_fora_horario')::BOOLEAN, true) = true THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'movimento_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA E: MOVIMENTO COM IGNIÇÃO DESLIGADA (GUINCHO / ARRASTO)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false
     AND COALESCE(OLD.ignicao_status, false) = false
     AND (
       COALESCE(NEW.velocidade_atual, 0) >= 15
       OR (COALESCE(NEW.velocidade_atual, 0) >= 10 AND v_dist_metros >= 35.0)
     )
     AND COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true THEN

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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA F: GEOFENCE — SAÍDA E CHEGADA EM ÁREAS PROTEGIDAS / CERCAS VIRTUAIS
  -- Avaliação atômica por coordenada com suporte completo a regras simétricas
  -- de entrada e saída ('alertar', 'fora_horario', 'permitida')
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ultima_latitude IS NOT NULL 
     AND NEW.ultima_longitude IS NOT NULL 
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0)
     AND OLD.ultima_latitude IS NOT NULL 
     AND OLD.ultima_longitude IS NOT NULL 
     AND (OLD.ultima_latitude <> 0 OR OLD.ultima_longitude <> 0) THEN

    FOR v_area IN
      SELECT id, nome, latitude, longitude, raio_metros, 
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
      -- Distância atual do veículo até o centro da cerca (NEW)
      v_dlat_area := radians(NEW.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(NEW.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_new := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      -- Distância anterior do veículo até o centro da cerca (OLD)
      v_dlat_area := radians(OLD.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(OLD.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(OLD.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_old := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      -- Determina se o momento atual está fora da janela habitual da área
      v_area_fora_horario := false;
      IF v_area.hora_inicio IS NOT NULL AND v_area.hora_fim IS NOT NULL THEN
        IF v_area.dias_semana IS NOT NULL AND NOT (v_dow_atual = ANY(v_area.dias_semana)) THEN
          v_area_fora_horario := true;
        ELSIF v_area.hora_inicio <= v_area.hora_fim THEN
          IF v_hora_atual < v_area.hora_inicio OR v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        ELSE
          -- Janela noturna que passa pela meia-noite (ex: 22:00 até 06:00)
          IF v_hora_atual < v_area.hora_inicio AND v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        END IF;
      END IF;

      -- ───────────────────────────────────────────────────────────────────────
      -- F.1) SAÍDA DE ÁREA PROTEGIDA (estava dentro e agora está fora)
      -- ───────────────────────────────────────────────────────────────────────
      IF v_dist_area_old <= v_area.raio_metros AND v_dist_area_new > v_area.raio_metros THEN
        IF COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_saida = 'alertar'
             OR (v_area.regra_saida = 'fora_horario' AND v_area_fora_horario)
           ) THEN
          
          v_chave_cooldown := 'saida_area_' || v_area.id::text;
          SELECT (
            NOT EXISTS (
              SELECT 1 FROM public.alertas_telemetria_cooldown
              WHERE veiculo_id = NEW.id
                AND tipo_alerta = v_chave_cooldown
                AND ultimo_at > (now() - COOLDOWN_PADRAO)
            )
          ) INTO v_cooldown_ok;

          IF v_cooldown_ok THEN
            v_titulo   := format('🚨 Saída de Área Protegida — %s', COALESCE(NEW.placa, ''));
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
                'Veículo %s saiu do limite da cerca virtual "%s" em %s (distância: %s m).',
                COALESCE(NEW.placa, ''),
                v_area.nome,
                v_hora_evento_str,
                ROUND(v_dist_area_new)
              );
              v_gravidade := 'media';
            END IF;

            v_tipo := 'saida_area';

            INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
            VALUES (NEW.id, v_chave_cooldown, now())
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

      -- ───────────────────────────────────────────────────────────────────────
      -- F.2) ENTRADA / CHEGADA EM ÁREA PROTEGIDA (estava fora e agora está dentro)
      -- ───────────────────────────────────────────────────────────────────────
      ELSIF v_dist_area_old > v_area.raio_metros AND v_dist_area_new <= v_area.raio_metros THEN
        IF COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_entrada = 'alertar'
             OR (v_area.regra_entrada = 'fora_horario' AND v_area_fora_horario)
           ) THEN
          
          v_chave_cooldown := 'entrada_area_' || v_area.id::text;
          SELECT (
            NOT EXISTS (
              SELECT 1 FROM public.alertas_telemetria_cooldown
              WHERE veiculo_id = NEW.id
                AND tipo_alerta = v_chave_cooldown
                AND ultimo_at > (now() - COOLDOWN_PADRAO)
            )
          ) INTO v_cooldown_ok;

          IF v_cooldown_ok THEN
            v_titulo := format('✅ Chegada na Área Protegida — %s', COALESCE(NEW.placa, ''));
            IF v_area.regra_entrada = 'fora_horario' THEN
              v_mensagem := format(
                'Veículo %s chegou na área protegida "%s" FORA do horário habitual em %s.',
                COALESCE(NEW.placa, ''),
                v_area.nome,
                v_hora_evento_str
              );
              v_gravidade := 'media';
            ELSE
              v_mensagem := format(
                'Veículo %s chegou na área protegida "%s" em %s.',
                COALESCE(NEW.placa, ''),
                v_area.nome,
                v_hora_evento_str
              );
              v_gravidade := 'baixa';
            END IF;

            v_tipo := 'entrada_area';

            INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
            VALUES (NEW.id, v_chave_cooldown, now())
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

    END LOOP;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Defesa em profundidade: telemetria nunca é travada por erro de regra
  RAISE WARNING 'trigger_avaliar_alertas_telemetria falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. Atualizar a área "casa" ou outras áreas existentes para que entrada seja configurável
-- Invalidação canônica de cache PostgREST (regra estrita)
NOTIFY pgrst, 'reload schema';
