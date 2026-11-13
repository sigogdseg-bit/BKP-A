-- ============================================================================
-- HUNTER / SIGO GUARDIÃO — SIGILO OPERACIONAL DE DEFESA ATIVA ANTI-SMS
-- ============================================================================
-- Migration: 20261110150000_hunter_sigilo_alerta_sms_equipe_tecnica.sql
-- Objetivo:
--   1. Restringir leitura (RLS RESTRICTIVE) de alertas e eventos técnicos de
--      sabotagem de relé via SMS (`corte_nao_autorizado_sms` e
--      `desbloqueio_nao_autorizado_sms`) em `alertas_seguranca`,
--      `eventos_veiculo` e `notificacoes_sistema` estritamente à equipe técnica
--      ativa (`superadmin`, `adm`, `operador`), isolando clientes, motoristas,
--      funcionários e perfil `superadmin_auditor` (degustação).
--   2. Atualizar `public.registrar_alerta_seguranca` para nunca endereçar
--      `destinatario_cliente_id` ao cliente em incidentes SMS, direcionando
--      exclusivamente ao usuário técnico responsável para disparo Web Push
--      restrito à equipe técnica no servidor.
-- ============================================================================

-- 1. Função estrita de sigilo técnico (exclui superadmin_auditor, cliente, motorista, instalador, etc.)
CREATE OR REPLACE FUNCTION public.is_equipe_tecnica_sigilo()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_email  TEXT := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
  v_equipe BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    RETURN TRUE;
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = v_uid
        AND role IN ('superadmin', 'adm', 'operador')
        AND ativo = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = v_uid
        AND role IN ('superadmin', 'adm', 'operador')
    )
  ) INTO v_equipe;

  RETURN COALESCE(v_equipe, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_equipe_tecnica_sigilo() TO authenticated, service_role;

-- 2. Políticas RESTRICTIVE de RLS em tabelas de alertas, eventos e notificações
DROP POLICY IF EXISTS "Sigilo operacional alertas sms apenas equipe tecnica" ON public.alertas_seguranca;
CREATE POLICY "Sigilo operacional alertas sms apenas equipe tecnica"
  ON public.alertas_seguranca
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    LOWER(COALESCE(tipo, '')) NOT IN ('corte_nao_autorizado_sms', 'desbloqueio_nao_autorizado_sms')
    OR public.is_equipe_tecnica_sigilo()
  );

DROP POLICY IF EXISTS "Sigilo operacional eventos sms apenas equipe tecnica" ON public.eventos_veiculo;
CREATE POLICY "Sigilo operacional eventos sms apenas equipe tecnica"
  ON public.eventos_veiculo
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    LOWER(COALESCE(tipo, '')) NOT IN ('corte_nao_autorizado_sms', 'desbloqueio_nao_autorizado_sms')
    OR public.is_equipe_tecnica_sigilo()
  );

DROP POLICY IF EXISTS "Sigilo operacional notificacoes sms apenas equipe tecnica" ON public.notificacoes_sistema;
CREATE POLICY "Sigilo operacional notificacoes sms apenas equipe tecnica"
  ON public.notificacoes_sistema
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    LOWER(COALESCE(tipo, '')) NOT IN ('corte_nao_autorizado_sms', 'desbloqueio_nao_autorizado_sms')
    OR public.is_equipe_tecnica_sigilo()
  );

-- 3. Atualização de public.registrar_alerta_seguranca para não endereçar clientes em alertas SMS internos
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
  v_equipe_user_id       UUID;
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

  -- 6. Dispara notificação no sistema respeitando sigilo técnico-operacional
  BEGIN
    IF v_tipo_norm = 'corte_nao_autorizado_sms' THEN
      SELECT COALESCE(
        (
          SELECT ur.user_id
          FROM public.user_roles ur
          JOIN public.profiles p ON p.id = ur.user_id AND p.ativo = TRUE
          WHERE ur.role IN ('superadmin', 'adm', 'operador')
          ORDER BY CASE ur.role
            WHEN 'superadmin' THEN 1
            WHEN 'adm' THEN 2
            ELSE 3
          END
          LIMIT 1
        ),
        (
          SELECT p.id
          FROM public.profiles p
          WHERE p.role IN ('superadmin', 'adm', 'operador')
            AND p.ativo = TRUE
          ORDER BY CASE p.role
            WHEN 'superadmin' THEN 1
            WHEN 'adm' THEN 2
            ELSE 3
          END
          LIMIT 1
        )
      )
      INTO v_equipe_user_id;

      IF v_equipe_user_id IS NOT NULL THEN
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
          v_equipe_user_id,
          NULL,
          format('%s — %s', v_titulo_evento, COALESCE(v_placa, '')),
          p_detalhes,
          v_tipo_norm,
          '/monitor-gps',
          COALESCE(v_placa, ''),
          false,
          NOW()
        );
      END IF;
    ELSE
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
    END IF;
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

NOTIFY pgrst, 'reload schema';
