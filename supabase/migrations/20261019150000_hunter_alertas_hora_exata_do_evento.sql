-- ============================================================================
-- MIGRATION: 20261019150000_hunter_alertas_hora_exata_do_evento.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- 
-- REQUISITO ATENDIDO:
-- Todas as mensagens de alerta em tempo real (Push VAPID e WhatsApp)
-- devem conter obrigatoriamente a HORA EXATA DO EVENTO no fuso de Brasília.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_avaliar_alertas_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_cliente_user_id      UUID;
  v_velocidade_limite    NUMERIC := 110;
  v_alerta_mov_regras    BOOLEAN := true;
  v_alerta_ign_regras    BOOLEAN := true;
  v_alertas_ativos       JSONB;
  v_horario_proibido     BOOLEAN := false;
  v_hora_inicio_str      TEXT;
  v_hora_fim_str         TEXT;
  v_cooldown_ok          BOOLEAN;
  v_titulo               TEXT;
  v_mensagem             TEXT;
  v_tipo                 TEXT;
  v_gravidade            TEXT;
  v_chave_cooldown       TEXT;
  v_horario_evento_str   TEXT;
  COOLDOWN_PADRAO        CONSTANT INTERVAL := INTERVAL '5 minutes';
  COOLDOWN_IGNICAO       CONSTANT INTERVAL := INTERVAL '2 minutes';
  v_dlat                 DOUBLE PRECISION;
  v_dlon                 DOUBLE PRECISION;
  v_a                    DOUBLE PRECISION;
  v_dist_metros          DOUBLE PRECISION := 0;
  v_area                 RECORD;
  v_dist_area_new        DOUBLE PRECISION;
  v_dist_area_old        DOUBLE PRECISION;
  v_dlat_area            DOUBLE PRECISION;
  v_dlon_area            DOUBLE PRECISION;
BEGIN
  -- Ignora se não há cliente associado ao veículo
  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Formatação padrão e inegociável da hora exata do evento (Fuso de Brasília)
  v_horario_evento_str := to_char(
    COALESCE(NEW.ultima_atualizacao, now()) AT TIME ZONE 'America/Sao_Paulo',
    'DD/MM/YYYY às HH24:MI:SS'
  );

  -- 1. Busca o user_id do cliente para endereçar Push VAPID
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
        v_titulo    := format('Excesso de Velocidade — %s', COALESCE(NEW.placa, ''));
        v_mensagem  := format(
          'Veículo %s atingiu %s km/h (limite: %s km/h).' || E'\n' || '🕒 Horário: %s',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual),
          ROUND(v_velocidade_limite),
          v_horario_evento_str
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
  -- ALERTA B / C: IGNIÇÃO LIGADA (FORA DO HORÁRIO OU NORMAL EM TEMPO REAL)
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
          'Motor acionado fora do horário habitual configurado (%s às %s).' || E'\n' || 'Veículo: %s' || E'\n' || '🕒 Horário: %s',
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          COALESCE(NEW.placa, ''),
          v_horario_evento_str
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
        v_mensagem := format(
          'Motor acionado / chave ligada.' || E'\n' || 'Veículo: %s' || E'\n' || '🕒 Horário: %s',
          COALESCE(NEW.placa, ''),
          v_horario_evento_str
        );
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
        v_titulo   := format('Deslocamento Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s em deslocamento (%s km/h) fora da janela habitual configurada.' || E'\n' || '🕒 Horário: %s',
          COALESCE(NEW.placa, ''),
          ROUND(COALESCE(NEW.velocidade_atual, 0)),
          v_horario_evento_str
        );
        v_tipo      := 'movimento_fora_horario';
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
  -- ALERTA E: GUINCHO / FURTO / REBOQUE NÃO AUTORIZADO
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
        'Veículo %s detectado a %s km/h com ignição desligada. Possível reboque ou furto em andamento.' || E'\n' || '🕒 Horário: %s',
        COALESCE(NEW.placa, ''),
        ROUND(NEW.velocidade_atual),
        v_horario_evento_str
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
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ultima_latitude IS NOT NULL 
     AND NEW.ultima_longitude IS NOT NULL 
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0)
     AND OLD.ultima_latitude IS NOT NULL 
     AND OLD.ultima_longitude IS NOT NULL 
     AND (OLD.ultima_latitude <> 0 OR OLD.ultima_longitude <> 0) THEN

    FOR v_area IN
      SELECT id, nome, latitude, longitude, raio_metros, regra_entrada, regra_saida
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

      v_dlat_area := radians(OLD.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(OLD.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(OLD.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_old := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      -- F.1) SAÍDA DE ÁREA PROTEGIDA
      IF v_dist_area_old <= v_area.raio_metros AND v_dist_area_new > v_area.raio_metros THEN
        IF (v_area.regra_saida = 'alertar' OR COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true) THEN
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
            v_mensagem := format(
              'Veículo %s saiu do limite da cerca virtual %s (distância: %s m).' || E'\n' || '🕒 Horário: %s',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              ROUND(v_dist_area_new),
              v_horario_evento_str
            );
            v_tipo      := 'saida_area';
            v_gravidade := 'alta';

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

      -- F.2) ENTRADA / CHEGADA EM ÁREA PROTEGIDA
      ELSIF v_dist_area_old > v_area.raio_metros AND v_dist_area_new <= v_area.raio_metros THEN
        IF (v_area.regra_entrada = 'alertar' OR COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, false) = true) THEN
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
            v_titulo   := format('✅ Chegada na Área Protegida — %s', COALESCE(NEW.placa, ''));
            v_mensagem := format(
              'Veículo %s chegou na área protegida %s.' || E'\n' || '🕒 Horário: %s',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_horario_evento_str
            );
            v_tipo      := 'entrada_area';
            v_gravidade := 'baixa';

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
  RAISE WARNING '[HUNTER-ALERTAS-TELEMETRIA] Erro ao avaliar alertas para veículo %: %',
    NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
