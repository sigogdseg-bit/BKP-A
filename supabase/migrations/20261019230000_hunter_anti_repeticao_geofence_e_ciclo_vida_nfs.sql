-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261019230000_hunter_anti_repeticao_geofence_e_ciclo_vida_nfs.sql
-- Sistema: GD Rastreamento | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Máquina de Estados de Presença de Veículo em Áreas Seguras (veiculo_areas_estado)
--    Garante fisicamente ZERO repetição de alertas de saída e entrada.
--    "Enviou uma para, até ocorrer novo evento."
-- 2. Colunas de ciclo de vida e notificações temporais de Notas Fiscais
--    (48h -> 24h -> 6h -> 30m -> expurgo definitivo sem recuperação)
-- 3. Preferência de notificações de NF do cliente com ciência expressa de expurgo
-- 4. Função RPC hunter_processar_ciclo_vida_nfs() para execução periódica
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de Máquina de Estados para Geofence (Presença DENTRO / FORA)
CREATE TABLE IF NOT EXISTS public.veiculo_areas_estado (
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.areas_seguras(id) ON DELETE CASCADE,
  estado TEXT NOT NULL CHECK (estado IN ('dentro', 'fora')),
  distancia_metros FLOAT NOT NULL DEFAULT 0,
  ultimo_evento_tipo TEXT, -- 'saida' ou 'entrada'
  ultimo_evento_em TIMESTAMPTZ DEFAULT now(),
  notificacao_enviada BOOLEAN DEFAULT false,
  whatsapp_enviado BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (veiculo_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_veiculo_areas_estado_veiculo 
  ON public.veiculo_areas_estado(veiculo_id);

CREATE INDEX IF NOT EXISTS idx_veiculo_areas_estado_area 
  ON public.veiculo_areas_estado(area_id);

ALTER TABLE public.veiculo_areas_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "veiculo_areas_estado_leitura_autenticada" ON public.veiculo_areas_estado;
CREATE POLICY "veiculo_areas_estado_leitura_autenticada"
  ON public.veiculo_areas_estado
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "veiculo_areas_estado_service_role" ON public.veiculo_areas_estado;
CREATE POLICY "veiculo_areas_estado_service_role"
  ON public.veiculo_areas_estado
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.veiculo_areas_estado TO authenticated, service_role;

-- 2. Inicialização dos estados para veículos e áreas existentes
INSERT INTO public.veiculo_areas_estado (veiculo_id, area_id, estado, distancia_metros, updated_at)
SELECT 
  v.id AS veiculo_id,
  a.id AS area_id,
  CASE 
    WHEN (
      6371000.0 * 2.0 * atan2(
        sqrt(
          sin(radians(COALESCE(v.ultima_latitude, 0) - a.latitude) / 2.0)^2 + 
          cos(radians(a.latitude)) * cos(radians(COALESCE(v.ultima_latitude, 0))) * 
          sin(radians(COALESCE(v.ultima_longitude, 0) - a.longitude) / 2.0)^2
        ),
        sqrt(GREATEST(0.0, 1.0 - (
          sin(radians(COALESCE(v.ultima_latitude, 0) - a.latitude) / 2.0)^2 + 
          cos(radians(a.latitude)) * cos(radians(COALESCE(v.ultima_latitude, 0))) * 
          sin(radians(COALESCE(v.ultima_longitude, 0) - a.longitude) / 2.0)^2
        )))
      )
    ) <= a.raio_metros THEN 'dentro'
    ELSE 'fora'
  END AS estado,
  (
    6371000.0 * 2.0 * atan2(
      sqrt(
        sin(radians(COALESCE(v.ultima_latitude, 0) - a.latitude) / 2.0)^2 + 
        cos(radians(a.latitude)) * cos(radians(COALESCE(v.ultima_latitude, 0))) * 
        sin(radians(COALESCE(v.ultima_longitude, 0) - a.longitude) / 2.0)^2
      ),
      sqrt(GREATEST(0.0, 1.0 - (
        sin(radians(COALESCE(v.ultima_latitude, 0) - a.latitude) / 2.0)^2 + 
        cos(radians(a.latitude)) * cos(radians(COALESCE(v.ultima_latitude, 0))) * 
        sin(radians(COALESCE(v.ultima_longitude, 0) - a.longitude) / 2.0)^2
      )))
    )
  ) AS distancia_metros,
  now() AS updated_at
FROM public.veiculos v
CROSS JOIN public.areas_seguras a
WHERE (a.veiculo_id = v.id OR (a.veiculo_id IS NULL AND a.cliente_id = v.cliente_id))
  AND a.ativo = true
  AND a.latitude IS NOT NULL
  AND a.longitude IS NOT NULL
  AND v.ativo = true
ON CONFLICT (veiculo_id, area_id) DO NOTHING;

-- 3. Atualizar a função atômica trigger_avaliar_alertas_telemetria
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
  v_agora_brt         TIMESTAMP;
  v_hora_atual        TIME;
  v_dow_atual         INT;
  v_area_fora_horario BOOLEAN;
  v_estado_anterior   TEXT;
  v_novo_estado       TEXT;
  
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
  -- ALERTA B: IGNIÇÃO LIGADA (Fora do Horário)
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
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA D: DESLOCAMENTO FORA DO HORÁRIO
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
  -- ALERTA E: GUINCHO / ARRASTO
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
  -- ALERTA F: GEOFENCE COM MÁQUINA DE ESTADOS FÍSICA (ZERO REPETIÇÃO)
  -- Regra Pétrea: "Enviou uma para, até ocorrer novo evento."
  -- Só dispara saída se estado_anterior = 'dentro' E dist > raio + 15m (histerese).
  -- Transita para 'fora' e NUNCA MAIS repete saída enquanto permanecer 'fora'.
  -- Só dispara entrada se estado_anterior = 'fora' E dist <= raio.
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ultima_latitude IS NOT NULL 
     AND NEW.ultima_longitude IS NOT NULL 
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0) THEN

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
      -- Distância geodésica do veículo até o centro da cerca virtual
      v_dlat_area := radians(NEW.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(NEW.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_new := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

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
          IF v_hora_atual < v_area.hora_inicio AND v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        END IF;
      END IF;

      -- Consulta estado persistente na máquina de estados
      SELECT estado INTO v_estado_anterior
      FROM public.veiculo_areas_estado
      WHERE veiculo_id = NEW.id AND area_id = v_area.id;

      -- Se não existir registro prévio, inicializa de forma neutra sem disparo
      IF v_estado_anterior IS NULL THEN
        IF v_dist_area_new <= v_area.raio_metros THEN
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

      -- ───────────────────────────────────────────────────────────────────────
      -- F.1) TRANSIÇÃO PARA SAÍDA: DE 'dentro' PARA 'fora'
      -- Histerese de segurança: requer dist > raio_metros + 15m para não oscilar na borda
      -- ───────────────────────────────────────────────────────────────────────
      IF v_estado_anterior = 'dentro' AND v_dist_area_new > (v_area.raio_metros + 15.0) THEN
        -- Atualiza imediatamente o estado na máquina para 'fora' (bloqueia repetições)
        UPDATE public.veiculo_areas_estado
        SET estado = 'fora',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'saida',
            ultimo_evento_em = now(),
            notificacao_enviada = true,
            whatsapp_enviado = false,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        -- Avalia se deve emitir o alerta único de saída
        IF COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_saida = 'alertar'
             OR (v_area.regra_saida = 'fora_horario' AND v_area_fora_horario)
           ) THEN

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
              'Veículo %s saiu do limite da cerca virtual "%s" em %s (distância: %s m).',
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

      -- ───────────────────────────────────────────────────────────────────────
      -- F.2) TRANSIÇÃO PARA ENTRADA: DE 'fora' PARA 'dentro'
      -- ───────────────────────────────────────────────────────────────────────
      ELSIF v_estado_anterior = 'fora' AND v_dist_area_new <= v_area.raio_metros THEN
        -- Atualiza imediatamente o estado na máquina para 'dentro' (bloqueia repetições)
        UPDATE public.veiculo_areas_estado
        SET estado = 'dentro',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'entrada',
            ultimo_evento_em = now(),
            notificacao_enviada = true,
            whatsapp_enviado = false,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        -- Avalia se deve emitir o alerta único de entrada
        IF COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_entrada = 'alertar'
             OR (v_area.regra_entrada = 'fora_horario' AND v_area_fora_horario)
           ) THEN

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
              'Veículo %s entrou na cerca virtual "%s" em %s.',
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
        -- Mantém a distância atualizada na máquina de estados sem transição
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

-- 4. Colunas de Notificações e Ciclo de Vida Temporal de Notas Fiscais
ALTER TABLE public.motorista_abastecimentos
  ADD COLUMN IF NOT EXISTS nf_alerta_pronta_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_24h_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_6h_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_30m_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_expirado_em TIMESTAMPTZ;

ALTER TABLE public.motorista_despesas
  ADD COLUMN IF NOT EXISTS nf_alerta_pronta_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_24h_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_6h_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_alerta_30m_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nf_expirado_em TIMESTAMPTZ;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS notificar_nf_pendente BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ciencia_expurgo_sem_notificacao_nf BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ciencia_expurgo_em TIMESTAMPTZ;

-- Índices parciais de altíssima performance para consultas de NFs pendentes (Zero Abuso de Egress)
CREATE INDEX IF NOT EXISTS idx_abastecimentos_nf_pendente
  ON public.motorista_abastecimentos(nf_upload_em)
  WHERE nf_foto_url IS NOT NULL AND nf_baixado = false AND nf_expirado = false;

CREATE INDEX IF NOT EXISTS idx_despesas_nf_pendente
  ON public.motorista_despesas(nf_upload_em)
  WHERE nf_foto_url IS NOT NULL AND nf_baixado = false AND nf_expirado = false;

-- 5. Função RPC atômica para processamento temporal do ciclo de vida das NFs
CREATE OR REPLACE FUNCTION public.hunter_processar_ciclo_vida_nfs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_agora TIMESTAMPTZ := now();
  v_cliente RECORD;
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
           COALESCE(c.notificar_nf_pendente, true) AS notificar,
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

    -- Se o cliente desativou notificações de NF
    IF v_rec.notificar = false THEN
      -- Se passou de 48h sem download, expurga diretamente
      IF v_horas_passadas >= 48.0 THEN
        UPDATE public.motorista_abastecimentos
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;
      END IF;
    ELSE
      -- Cliente com notificações ativas:
      -- Estágio 4: Expurgo definitivo aos 78.5h (48h + 24h + 6h + 30m)
      IF v_horas_passadas >= 78.5 THEN
        UPDATE public.motorista_abastecimentos
        SET nf_expirado = true,
            nf_expirado_em = v_agora,
            nf_foto_url = NULL
        WHERE id = v_rec.id;
        v_expurgadas := v_expurgadas + 1;

      -- Estágio 3: Alerta de exclusão em 30min (passados 78h)
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

      -- Estágio 2: Alerta de exclusão em 6h (passados 72h)
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

      -- Estágio 1: Alerta de exclusão em 24h (passadas 48h sem download)
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
           COALESCE(c.notificar_nf_pendente, true) AS notificar,
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

-- Invalidação canônica de cache PostgREST
NOTIFY pgrst, 'reload schema';
