-- ============================================================================
-- HUNTER — MOTOR DE ALERTAS DE TELEMETRIA NO SERVIDOR (INDEPENDENTE DE CLIENTE)
-- ============================================================================
-- Versão Alvo: 1.10.2.9
-- Objetivo: Disparar alertas de velocidade, ignição fora de horário e movimento
--           diretamente via trigger PostgreSQL ao receber atualização de telemetria,
--           sem depender de nenhum cliente (app fechado, tela bloqueada — sempre funciona).
-- Root Cause: O motor de alertas anterior rodava APENAS no browser (React useEffect),
--             portanto nunca disparava se o usuário não estivesse na tela de Monitor GPS.
-- Solução:   Trigger AFTER UPDATE na tabela `veiculos` → avalia regras e horários →
--             insere em `notificacoes_sistema` → trg_push_vapid dispara Push VAPID.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA DE CONTROLE DE COOLDOWN (anti-flood server-side)
-- Garante que o mesmo tipo de alerta não seja disparado mais de 1x a cada 5 min
-- por veículo, mesmo com múltiplas atualizações de telemetria por segundo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alertas_telemetria_cooldown (
  veiculo_id  UUID        NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  tipo_alerta TEXT        NOT NULL,
  ultimo_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (veiculo_id, tipo_alerta)
);

COMMENT ON TABLE public.alertas_telemetria_cooldown IS
  'Controla o cooldown de 5 min entre alertas do mesmo tipo por veículo (anti-flood server-side).';

-- RLS desabilitado — tabela interna só acessada por triggers SECURITY DEFINER
ALTER TABLE public.alertas_telemetria_cooldown DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO AUXILIAR: Verifica se o horário atual está dentro da janela permitida
--    para o veículo. Retorna TRUE se FORA do horário (=> alerta).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hunter_horario_proibido(
  p_veiculo_id UUID,
  p_agora      TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hora_inicio  TIME;
  v_hora_fim     TIME;
  v_dias_semana  INT[];
  v_fim_semana   BOOLEAN;
  v_dia_semana   INT;
  v_hora_agora   TIME;
BEGIN
  -- Busca a regra de horário ativa para o veículo
  SELECT
    hora_inicio::TIME,
    hora_fim::TIME,
    dias_semana,
    permitir_fim_de_semana
  INTO
    v_hora_inicio,
    v_hora_fim,
    v_dias_semana,
    v_fim_semana
  FROM public.horarios_utilizacao
  WHERE veiculo_id = p_veiculo_id
    AND ativo = true
  LIMIT 1;

  -- Sem regra configurada → horário sempre permitido → NOT proibido
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_dia_semana := EXTRACT(DOW FROM p_agora AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_hora_agora := (p_agora AT TIME ZONE 'America/Sao_Paulo')::TIME;

  -- Verifica fim de semana
  IF (v_dia_semana = 0 OR v_dia_semana = 6) AND NOT v_fim_semana THEN
    RETURN TRUE; -- proibido
  END IF;

  -- Verifica dia da semana permitido
  IF NOT (v_dia_semana = ANY(v_dias_semana)) THEN
    RETURN TRUE; -- proibido
  END IF;

  -- Verifica janela de horário
  IF v_hora_agora < v_hora_inicio OR v_hora_agora > v_hora_fim THEN
    RETURN TRUE; -- proibido
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.hunter_horario_proibido(UUID, TIMESTAMPTZ) IS
  'Retorna TRUE se o horário atual está FORA da janela permitida para o veículo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FUNÇÃO PRINCIPAL DO TRIGGER DE ALERTAS DE TELEMETRIA
-- ─────────────────────────────────────────────────────────────────────────────
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
      -- Verifica cooldown
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

        -- Upsert cooldown
        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        -- Persiste alerta na central
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

        -- Dispara notificação → trigger pg_net → Push VAPID
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
        -- Busca os horários para montar a mensagem descritiva
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
  -- ALERTA C: MOVIMENTO FORA DO HORÁRIO (ignição DESLIGADA + velocidade > 3 km/h)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false AND COALESCE(NEW.velocidade_atual, 0) > 3 THEN
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
          'Veículo %s em deslocamento (%s km/h) fora da janela habitual configurada (motor desligado).',
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
  -- NUNCA bloqueia a atualização de telemetria por falha de alerta
  RAISE WARNING '[HUNTER-ALERTAS-TELEMETRIA] Erro ao avaliar alertas para veículo %: %',
    NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hunter_avaliar_alertas_telemetria() IS
  'Trigger AFTER UPDATE na tabela veiculos. Avalia regras de velocidade, '
  'horário e ignição a cada pacote de telemetria. Insere em alertas_seguranca '
  'e notificacoes_sistema (→ trg_push_vapid → Push VAPID via pg_net). '
  'Cooldown de 5 min por tipo/veículo. Independente de qualquer cliente ativo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CRIA O TRIGGER NA TABELA veiculos
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_hunter_alertas_telemetria ON public.veiculos;

CREATE TRIGGER trg_hunter_alertas_telemetria
AFTER UPDATE OF velocidade_atual, ignicao_status, ultima_atualizacao
ON public.veiculos
FOR EACH ROW
WHEN (
  -- Só executa se houver mudança real em velocidade ou ignição (evita disparos vazios)
  (
    OLD.velocidade_atual IS DISTINCT FROM NEW.velocidade_atual
    OR OLD.ignicao_status IS DISTINCT FROM NEW.ignicao_status
  )
  AND NEW.cliente_id IS NOT NULL
  AND NEW.ativo = true
)
EXECUTE FUNCTION public.hunter_avaliar_alertas_telemetria();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TAMBÉM AVALIA AO INSERIR TELEMETRIA_POSICOES (gateway de hardware)
-- Garante funcionamento via triggers na tabela de telemetria, caso o
-- gateway atualize telemetria_posicoes sem atualizar veiculos diretamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hunter_atualizar_veiculo_pos_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sincroniza os campos de estado do veículo a partir da nova telemetria
  -- para garantir que o trigger trg_hunter_alertas_telemetria seja acionado.
  UPDATE public.veiculos
  SET
    velocidade_atual     = COALESCE(NEW.velocidade, velocidade_atual),
    ignicao_status       = COALESCE(NEW.ignicao, ignicao_status),
    ultima_latitude      = COALESCE(NEW.latitude, ultima_latitude),
    ultima_longitude     = COALESCE(NEW.longitude, ultima_longitude),
    ultima_atualizacao   = COALESCE(NEW.data_hora_gps, now())
  WHERE id = NEW.veiculo_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[HUNTER-POS-TELEMETRIA] Erro ao sincronizar veículo %: %',
    NEW.veiculo_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hunter_sync_veiculo_telemetria ON public.telemetria_posicoes;

CREATE TRIGGER trg_hunter_sync_veiculo_telemetria
AFTER INSERT ON public.telemetria_posicoes
FOR EACH ROW
EXECUTE FUNCTION public.hunter_atualizar_veiculo_pos_telemetria();

COMMENT ON FUNCTION public.hunter_atualizar_veiculo_pos_telemetria() IS
  'Sincroniza o estado do veículo (velocidade, ignição, lat/lon) a cada '
  'novo pacote de telemetria recebido, garantindo que o motor de alertas '
  'server-side seja acionado via trg_hunter_alertas_telemetria.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC PÚBLICA: TESTE DE NOTIFICAÇÃO (disparo manual com alerta real simulado)
-- Permite testar o pipeline completo sem depender de telemetria de hardware.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hunter_testar_notificacao(
  p_veiculo_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_cliente_id  UUID;
  v_placa       TEXT;
  v_notif_id    UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Usuário não autenticado.');
  END IF;

  -- Busca o cliente do usuário autenticado
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE user_id = v_user_id
  LIMIT 1;

  -- Se um veículo_id foi passado, usa a placa dele
  IF p_veiculo_id IS NOT NULL THEN
    SELECT placa INTO v_placa
    FROM public.veiculos
    WHERE id = p_veiculo_id AND cliente_id = v_cliente_id;
  END IF;

  -- Insere notificação de teste → trigger pg_net → Push VAPID → dispositivo
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
    v_user_id,
    v_cliente_id,
    '🔔 Teste de Notificação — GD Rastreamento',
    format(
      'Canal de alertas operacional. Notificações de velocidade, ignição e movimento estão ativas e funcionando.%s',
      CASE WHEN v_placa IS NOT NULL THEN format(' Veículo: %s.', v_placa) ELSE '' END
    ),
    'teste',
    '/monitor-gps',
    v_placa,
    false,
    now()
  )
  RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'notificacao_id', v_notif_id,
    'mensagem', 'Notificação de teste enviada. Você deve receber o push em segundos.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hunter_testar_notificacao(UUID) TO authenticated;

COMMENT ON FUNCTION public.hunter_testar_notificacao(UUID) IS
  'Dispara uma notificação de teste para o usuário autenticado via inserção '
  'em notificacoes_sistema → trg_push_vapid → Push VAPID. '
  'Permite validar o pipeline completo sem telemetria real.';
