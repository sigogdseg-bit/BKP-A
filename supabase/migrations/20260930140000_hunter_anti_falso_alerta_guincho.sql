-- ============================================================================
-- HUNTER / GD RASTREAMENTO — FIX: ANTI-FALSO-POSITIVO ALERTA DE GUINCHO / REBOQUE
-- ============================================================================
-- Versão Alvo: 1.11.0.16
-- Root Cause: O Alerta D (Guincho) disparava com ignicao = false e velocidade > 5.
--             Isso gerava falsos positivos graves em dois cenários:
--             1. No exato instante em que o motorista desliga a chave do motor
--                (OLD.ignicao = true, NEW.ignicao = false) enquanto desacelera (ex: 6 km/h).
--             2. Flutuação/ruído de satélite GPS com veículo estacionado (antena oscilando
--                espuriamente entre 6 e 12 km/h sem deslocamento físico do veículo).
-- Fix:        1. Ignora se o motor acabou de ser desligado (OLD.ignicao_status = true).
--             2. Exige que o veículo já estivesse com motor desligado (OLD.ignicao_status = false).
--             3. Calcula a distância geodésica real Haversine entre a coordenada anterior e atual.
--             4. Exige deslocamento real >= 35 metros E velocidade >= 10 km/h,
--                OU velocidade sustentada >= 15 km/h.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hunter_avaliar_alertas_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_velocidade_limite   NUMERIC;
  v_cliente_user_id     UUID;
  v_horario_proibido    BOOLEAN;
  v_cooldown_ok         BOOLEAN;
  v_hora_inicio_str     TEXT;
  v_hora_fim_str        TEXT;
  v_titulo              TEXT;
  v_mensagem            TEXT;
  v_tipo                TEXT;
  v_gravidade           TEXT;
  v_dist_metros         DOUBLE PRECISION := 0;
  v_dlat                DOUBLE PRECISION;
  v_dlon                DOUBLE PRECISION;
  v_a                   DOUBLE PRECISION;
  COOLDOWN_INTERVAL CONSTANT INTERVAL := INTERVAL '5 minutes';
BEGIN
  -- ── Ignora se não há cliente associado ao veículo ──
  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Busca o user_id do cliente para endereçar o Push VAPID ──
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = NEW.cliente_id
  LIMIT 1;

  -- ── Cálculo geodésico de deslocamento Haversine em metros entre OLD e NEW ──
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
  -- Condição: velocidade atual > limite configurado em regras_veiculo
  -- ─────────────────────────────────────────────────────────────────────────
  IF COALESCE(NEW.velocidade_atual, 0) > 0 THEN
    SELECT COALESCE(limite_velocidade_geral, 110)
    INTO v_velocidade_limite
    FROM public.regras_veiculo
    WHERE veiculo_id = NEW.id
    LIMIT 1;

    IF NOT FOUND THEN
      v_velocidade_limite := 110;
    END IF;

    IF NEW.velocidade_atual > v_velocidade_limite THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'excesso_velocidade'
            AND ultimo_at > (now() - COOLDOWN_INTERVAL)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo    := format('Excesso de Velocidade — %s', COALESCE(NEW.placa, ''));
        v_mensagem  := format(
          'Veículo %s atingiu %s km/h, ultrapassando o limite configurado de %s km/h.',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual),
          ROUND(v_velocidade_limite)
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
  -- ALERTA B: IGNIÇÃO FORA DO HORÁRIO CONFIGURADO
  -- Condição: ignição ligada E horário atual fora da janela permitida
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true THEN
    v_horario_proibido := public.hunter_horario_proibido(NEW.id);

    IF v_horario_proibido THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'ignicao_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_INTERVAL)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT
          hora_inicio::TEXT,
          hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('Ignição Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Motor acionado fora do horário habitual configurado (%s às %s). Veículo: %s.',
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
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
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA C: MOVIMENTO FORA DO HORÁRIO (ignição LIGADA + velocidade > 0)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true AND COALESCE(NEW.velocidade_atual, 0) > 0 THEN
    v_horario_proibido := public.hunter_horario_proibido(NEW.id);

    IF v_horario_proibido THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'movimento_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_INTERVAL)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo   := format('Deslocamento Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s em deslocamento (%s km/h) fora da janela habitual configurada.',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual)
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
  -- ALERTA D: GUINCHO / FURTO / REBOQUE NÃO AUTORIZADO
  -- Condição: ignição DESLIGADA com deslocamento real ou velocidade sustentada
  -- Anti-Falso-Positivo:
  -- 1. Descarta desaceleração ao desligar o motor (OLD.ignicao_status = true)
  -- 2. Descarta oscilação de satélite parado (velocidade < 15 e deslocamento < 35m)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false
     AND COALESCE(OLD.ignicao_status, false) = false
     AND (
       COALESCE(NEW.velocidade_atual, 0) >= 15
       OR (COALESCE(NEW.velocidade_atual, 0) >= 10 AND v_dist_metros >= 35.0)
     ) THEN
    SELECT (
      NOT EXISTS (
        SELECT 1 FROM public.alertas_telemetria_cooldown
        WHERE veiculo_id = NEW.id
          AND tipo_alerta = 'guincho'
          AND ultimo_at > (now() - COOLDOWN_INTERVAL)
      )
    ) INTO v_cooldown_ok;

    IF v_cooldown_ok THEN
      v_titulo   := format('🚨 Veículo em Movimento com Motor Desligado — %s', COALESCE(NEW.placa, ''));
      v_mensagem := format(
        'Veículo %s detectado a %s km/h com ignição desligada. Possível reboque ou furto em andamento.',
        COALESCE(NEW.placa, ''),
        ROUND(NEW.velocidade_atual)
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

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[HUNTER-ALERTAS-TELEMETRIA] Erro ao avaliar alertas para veículo %: %',
    NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
