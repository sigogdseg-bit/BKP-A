-- ============================================================================
-- HUNTER — FIX: ALERTA C — MOVIMENTO FORA DO HORÁRIO (COM IGNIÇÃO LIGADA)
-- ============================================================================
-- Versão Alvo: 1.10.2.10
-- Root Cause: O Alerta C avaliava ignicao_status = false (motor desligado),
--             cobrindo apenas guincho/reboque. O cenário real de "movimento
--             fora do horário" é o veículo se deslocar com MOTOR LIGADO fora
--             da janela configurada — que nunca era avaliado.
-- Fix:        Alerta C → ignicao_status = true AND velocidade_atual > 0
--             Alerta D (Guincho) permanece inalterado: ignicao = false + vel > 5
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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA A: EXCESSO DE VELOCIDADE
  -- Condição: velocidade atual > limite configurado em regras_veiculo
  -- ─────────────────────────────────────────────────────────────────────────
  IF COALESCE(NEW.velocidade_atual, 0) > 0 THEN
    -- Busca limite configurado (padrão 110 se não houver registro)
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
  -- FIX v1.10.2.10: Antes avaliava ignicao=false (guincho). Corrigido para
  -- ignicao=true — cobre o cenário real de deslocamento autorizado fora da
  -- janela habitual configurada pelo usuário.
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
  -- ALERTA D: GUINCHO / FURTO (ignição DESLIGADA + velocidade > 5 km/h, sempre)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false AND COALESCE(NEW.velocidade_atual, 0) > 5 THEN
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

COMMENT ON FUNCTION public.hunter_avaliar_alertas_telemetria() IS
  'v1.10.2.10 — FIX: Alerta C corrigido para ignicao=true + velocidade>0, '
  'cobrindo deslocamento com motor ligado fora do horário. '
  'Alerta D (Guincho) permanece: ignicao=false + velocidade>5. '
  'Trigger AFTER UPDATE na tabela veiculos. Cooldown 5 min por tipo/veículo. '
  'Independente de qualquer cliente ativo.';
