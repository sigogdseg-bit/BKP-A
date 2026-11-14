-- ============================================================================
-- MIGRATION: 20261019140000_hunter_alertas_tempo_real_geofence_ignicao_e_otimizacao_bd.sql
-- Sistema: GD Rastreamento | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- 
-- CAUSAS-RAÍZES SANADAS INTEGRALMENTE:
-- 1. Latência extrema e atrasos ao salvar no BD:
--    - Ausência de colunas (fator_calibracao_odometro, gps_fixado) causava erro SQL
--      na RPC registrar_posicao_gps_com_odometro a cada pacote, disparando
--      fallbacks em cascata e enfileiramento de requisições.
--    - Trigger trg_sync_veiculo_instalacao executava UPDATE desnecessário em instalacoes
--      a cada atualização de telemetria sem cláusula WHEN de filtragem.
--    - Índices críticos ausentes para busca rápida de áreas seguras e viagens ativas.
-- 2. Alertas de Cerca Virtual / Área Protegida (saída e chegada):
--    - Inexistiam no servidor/BD (estavam apenas em useEffect do frontend).
--    - Agora são avaliados de forma nativa e atômica no Postgres pelo trigger de telemetria.
-- 3. Alertas de Ignição e Deslocamento Fora de Horário:
--    - Ignição ligada agora possui canal canônico em tempo real no servidor.
--    - Deslocamento fora de horário calibrado para detectar movimento e velocidade.
--    - RPC registrar_alerta_seguranca agora insere em notificacoes_sistema para acionar Push e WhatsApp.
-- ============================================================================

-- ── 1. BLINDAGEM DE ESQUEMA: Colunas faltantes em veiculos e telemetria_posicoes ─
ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS fator_calibracao_odometro NUMERIC(8, 6) DEFAULT 1.000000;

ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS gps_fixado BOOLEAN DEFAULT TRUE;

ALTER TABLE public.telemetria_posicoes 
ADD COLUMN IF NOT EXISTS gps_fixado BOOLEAN DEFAULT TRUE;

-- ── 2. OTIMIZAÇÃO DE ÍNDICES: Aceleração de consultas críticas ───────────────────
CREATE INDEX IF NOT EXISTS idx_areas_seguras_veiculo_ativo 
ON public.areas_seguras(veiculo_id) 
WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_areas_seguras_cliente_ativo 
ON public.areas_seguras(cliente_id) 
WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_viagens_veiculo_status_andamento 
ON public.viagens_trajetos(veiculo_id, status) 
WHERE status = 'em_andamento';

CREATE INDEX IF NOT EXISTS idx_instalacoes_cliente_status_pendente 
ON public.instalacoes(cliente_id, status) 
WHERE status NOT IN ('concluida');

-- ── 3. OTIMIZAÇÃO DO TRIGGER trg_sync_veiculo_instalacao (Zero I/O inútil) ─────
DROP TRIGGER IF EXISTS trg_sync_veiculo_instalacao ON public.veiculos;
DROP TRIGGER IF EXISTS trg_sync_veiculo_instalacao_insert ON public.veiculos;
DROP TRIGGER IF EXISTS trg_sync_veiculo_instalacao_update ON public.veiculos;

CREATE TRIGGER trg_sync_veiculo_instalacao_insert
AFTER INSERT ON public.veiculos
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_veiculo_instalacao();

CREATE TRIGGER trg_sync_veiculo_instalacao_update
AFTER UPDATE ON public.veiculos
FOR EACH ROW
WHEN (
  OLD.placa IS DISTINCT FROM NEW.placa
  OR OLD.marca_modelo IS DISTINCT FROM NEW.marca_modelo
  OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
  OR OLD.tipo_veiculo IS DISTINCT FROM NEW.tipo_veiculo
)
EXECUTE FUNCTION public.trg_sync_veiculo_instalacao();

-- ── 4. FUNÇÃO DO TRIGGER DE ALERTAS DE TELEMETRIA COMPLETO E CANÔNICO ───────────
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

    ELSIF NOT v_horario_proibido 
          AND COALESCE((v_alertas_ativos->>'ignicao_ligada')::BOOLEAN, true) = true THEN
      -- Ignição ligada em horário normal: notificação de motor acionado em tempo real
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
        v_mensagem := format('Motor acionado / chave ligada. Veículo: %s.', COALESCE(NEW.placa, ''));
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
          'Veículo %s em deslocamento (%s km/h) fora da janela habitual configurada.',
          COALESCE(NEW.placa, ''),
          ROUND(COALESCE(NEW.velocidade_atual, 0))
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

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA F: GEOFENCE — SAÍDA E CHEGADA EM ÁREAS PROTEGIDAS / CERCAS VIRTUAIS
  -- Avaliação nativa e atômica por coordenada elipsoidal para todas as áreas ativas
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

      -- F.1) SAÍDA DE ÁREA PROTEGIDA (estava dentro e agora está fora)
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
              'Veículo %s saiu do limite da cerca virtual %s. Distância atual: %s m.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              ROUND(v_dist_area_new)
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

      -- F.2) ENTRADA / CHEGADA EM ÁREA PROTEGIDA (estava fora e agora está dentro)
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
              'Veículo %s chegou na área protegida %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome
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

-- ── 5. VINCULAÇÃO DO TRIGGER DE TELEMETRIA COM LATITUDE/LONGITUDE INCLUSAS ─────
DROP TRIGGER IF EXISTS trg_hunter_alertas_telemetria ON public.veiculos;

CREATE TRIGGER trg_hunter_alertas_telemetria
AFTER UPDATE OF velocidade_atual, ignicao_status, ultima_latitude, ultima_longitude, ultima_atualizacao
ON public.veiculos
FOR EACH ROW
WHEN (
  (
    OLD.velocidade_atual IS DISTINCT FROM NEW.velocidade_atual
    OR OLD.ignicao_status IS DISTINCT FROM NEW.ignicao_status
    OR OLD.ultima_latitude IS DISTINCT FROM NEW.ultima_latitude
    OR OLD.ultima_longitude IS DISTINCT FROM NEW.ultima_longitude
  )
  AND NEW.cliente_id IS NOT NULL
  AND NEW.ativo = true
)
EXECUTE FUNCTION public.trigger_avaliar_alertas_telemetria();

-- ── 6. ATUALIZAÇÃO DA RPC registrar_alerta_seguranca COM DISPARO DE NOTIFICAÇÃO ──
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
  v_alerta_existente_id  UUID;
  v_novo_alerta_id       UUID;
  v_titulo_evento        TEXT;
  v_severidade_evento    TEXT;
BEGIN
  -- 1. Determina cliente_id e placa caso não passados
  SELECT cliente_id, placa INTO v_cliente_id, v_placa
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF v_cliente_id IS NULL AND p_cliente_id IS NOT NULL THEN
    v_cliente_id := p_cliente_id;
  END IF;

  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo ou cliente não localizado no sistema.');
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

  -- 3. Insere na tabela oficial alertas_seguranca
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

  -- 4. Título padronizado para a Timeline de eventos_veiculo e notificações
  v_titulo_evento := CASE
    WHEN p_tipo = 'suspeita_jammer' THEN 'Alerta: Suspeita de Jammer / Silenciamento'
    WHEN p_tipo = 'saida_area' THEN 'Alerta: Saída de Cerca Virtual'
    WHEN p_tipo = 'entrada_area' THEN 'Alerta: Chegada em Área Segura'
    WHEN p_tipo = 'desvio_rota' THEN 'Alerta: Desvio de Rota Monitorada'
    WHEN p_tipo = 'bateria_desconectada' THEN 'Alerta: Alimentação Principal Desconectada'
    WHEN p_tipo = 'colisao_impacto' THEN 'Alerta: Impacto / Choque Violento'
    WHEN p_tipo = 'capotamento_inclinacao' THEN 'Alerta: Inclinação Excessiva / Capotamento'
    WHEN p_tipo = 'panico' THEN 'Alerta: Botão de Pânico Acionado'
    WHEN p_tipo = 'ignicao_ligada' THEN 'Alerta: Ignição Ligada'
    WHEN p_tipo = 'ignicao_desligada' THEN 'Alerta: Ignição Desligada'
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

  -- 6. Dispara notificação no sistema (ativa Push VAPID e WhatsApp em tempo real)
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
      p_tipo,
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

-- ── 7. INVALIDAÇÃO OBRIGATÓRIA DE SCHEMA CACHE POSTGREST ──────────────────────
NOTIFY pgrst, 'reload schema';
