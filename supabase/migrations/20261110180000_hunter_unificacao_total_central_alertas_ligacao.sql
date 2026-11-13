-- ============================================================================
-- HUNTER / SIGO GUARDIÃO — UNIFICAÇÃO TOTAL DE ALERTAS, RPC DE PREFERÊNCIAS E LIGAÇÃO
-- ============================================================================
-- Migration: 20261110180000_hunter_unificacao_total_central_alertas_ligacao.sql
-- Objetivo:
--   1. Garantir colunas e política de mensalidades (pagamento_informado_em e
--      pagamento_informado_obs) também no ambiente remoto.
--   2. Criar RPC SECURITY DEFINER public.salvar_preferencias_alertas_cliente(...)
--      permitindo que o próprio titular (ou SuperADM/ADM, vedado a auditor)
--      grave alertas_operacionais, contatos_alertas e preferências de NF sem
--      esbarrar no bloqueio de UPDATE direto por RLS em public.clientes.
--   3. Expandir o default de public.regras_veiculo.alertas_ativos para todos os
--      16 alertas reais de veículo (incluindo panico, violacao_dispositivo e
--      capotamento_inclinacao).
--   4. Corrigir public.hunter_alerta_pode_emitir para impedir vazamento de
--      ligacao/canal global para chaves omitidas quando existe por_alerta.
--   5. Corrigir public.registrar_alerta_seguranca para impedir que opt-out do
--      cliente silencie sabotagem SMS da equipe técnica e notificar TODOS os
--      membros ativos da equipe respeitando notificacoes_configuracoes.
-- ============================================================================

-- 1. Colunas complementares em mensalidades e RLS de cliente
ALTER TABLE public.mensalidades
  ADD COLUMN IF NOT EXISTS pagamento_informado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pagamento_informado_obs TEXT;

DROP POLICY IF EXISTS "Clientes informam pagamento de suas proprias mensalidades" ON public.mensalidades;
CREATE POLICY "Clientes informam pagamento de suas proprias mensalidades"
ON public.mensalidades
FOR UPDATE
TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
  AND status <> 'pago'
)
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
  AND status <> 'pago'
);

-- 2. Atualiza default de regras_veiculo.alertas_ativos para os 16 alertas reais de veículo
ALTER TABLE public.regras_veiculo
  ALTER COLUMN alertas_ativos SET DEFAULT '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"guincho":true,"saida_area":true,"entrada_area":false,"excesso_velocidade":true,"desvio_rota":true,"suspeita_jammer":true,"perda_comunicacao":true,"bateria_desconectada":true,"baixa_tensao":true,"colisao_impacto":true,"panico":true,"violacao_dispositivo":true,"capotamento_inclinacao":true,"corte_nao_autorizado_sms":true}'::jsonb;

-- 3. RPC segura para salvar preferências de alertas da conta do cliente
CREATE OR REPLACE FUNCTION public.salvar_preferencias_alertas_cliente(
  p_cliente_id                         UUID,
  p_alertas_operacionais               JSONB   DEFAULT NULL,
  p_contatos_alertas                   JSONB   DEFAULT NULL,
  p_notificar_nf_pendente              BOOLEAN DEFAULT NULL,
  p_canais_notificacao_nf              JSONB   DEFAULT NULL,
  p_ciencia_expurgo_sem_notificacao_nf BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid               UUID := auth.uid();
  v_eh_auditor        BOOLEAN := FALSE;
  v_eh_autorizado     BOOLEAN := FALSE;
  v_notificar_nf      BOOLEAN;
  v_canais_nf         JSONB;
  v_ciencia_expurgo   BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Usuário não autenticado.');
  END IF;

  IF p_cliente_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Cliente não informado.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'superadmin_auditor'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'superadmin_auditor'
  ) INTO v_eh_auditor;

  IF v_eh_auditor THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Perfil auditor somente leitura não pode alterar preferências.');
  END IF;

  v_eh_autorizado := public.is_adm() OR EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = p_cliente_id
      AND c.user_id = v_uid
  );

  IF NOT v_eh_autorizado THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Acesso negado para atualizar preferências deste cliente.');
  END IF;

  v_notificar_nf := p_notificar_nf_pendente;
  v_canais_nf := p_canais_notificacao_nf;
  v_ciencia_expurgo := p_ciencia_expurgo_sem_notificacao_nf;

  -- Deriva fallback coerente de NF a partir de alertas_operacionais caso omitido
  IF v_notificar_nf IS NULL AND p_alertas_operacionais IS NOT NULL THEN
    IF jsonb_typeof(p_alertas_operacionais->'nf_pronta_download') = 'object'
       AND jsonb_typeof(p_alertas_operacionais->'alerta_nf_expurgo') = 'object' THEN
      v_notificar_nf := COALESCE((p_alertas_operacionais->'nf_pronta_download'->>'ativo')::BOOLEAN, true)
                     OR COALESCE((p_alertas_operacionais->'alerta_nf_expurgo'->>'ativo')::BOOLEAN, true);
    END IF;
  END IF;

  IF v_canais_nf IS NULL AND p_alertas_operacionais IS NOT NULL
     AND jsonb_typeof(p_alertas_operacionais->'nf_pronta_download') = 'object' THEN
    v_canais_nf := jsonb_build_object(
      'push', COALESCE((p_alertas_operacionais->'nf_pronta_download'->>'app')::BOOLEAN, true),
      'whatsapp', COALESCE((p_alertas_operacionais->'nf_pronta_download'->>'whatsapp')::BOOLEAN, true),
      'ligacao', COALESCE((p_alertas_operacionais->'nf_pronta_download'->>'ligacao')::BOOLEAN, false)
    );
  END IF;

  UPDATE public.clientes
  SET
    alertas_operacionais = COALESCE(p_alertas_operacionais, alertas_operacionais),
    contatos_alertas = COALESCE(p_contatos_alertas, contatos_alertas),
    notificar_nf_pendente = COALESCE(v_notificar_nf, notificar_nf_pendente),
    canais_notificacao_nf = COALESCE(v_canais_nf, canais_notificacao_nf),
    ciencia_expurgo_sem_notificacao_nf = COALESCE(v_ciencia_expurgo, ciencia_expurgo_sem_notificacao_nf),
    ciencia_expurgo_em = CASE
      WHEN v_ciencia_expurgo IS TRUE THEN NOW()
      WHEN v_ciencia_expurgo IS FALSE THEN NULL
      ELSE ciencia_expurgo_em
    END,
    updated_at = NOW()
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Cliente não encontrado.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'cliente_id', p_cliente_id);
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_preferencias_alertas_cliente(UUID, JSONB, JSONB, BOOLEAN, JSONB, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salvar_preferencias_alertas_cliente(UUID, JSONB, JSONB, BOOLEAN, JSONB, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.salvar_preferencias_alertas_cliente(UUID, JSONB, JSONB, BOOLEAN, JSONB, BOOLEAN) TO authenticated, service_role;

-- 4. Atualização de hunter_alerta_pode_emitir sem herança indevida de flags globais
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
  v_tipo             TEXT;
  v_mapa_por_alerta  JSONB;
  v_tem_por_alerta   BOOLEAN := FALSE;
  v_por_alerta       JSONB;
  v_ativo            BOOLEAN;
  v_app              BOOLEAN;
  v_whats            BOOLEAN;
  v_lig              BOOLEAN;
  v_default_ativo    BOOLEAN := TRUE;
  v_default_whats    BOOLEAN := TRUE;
BEGIN
  v_tipo := LOWER(COALESCE(NULLIF(trim(p_tipo), ''), 'alerta'));

  -- Normalização estrita de aliases legados para chave canônica do catálogo real
  v_tipo := CASE v_tipo
    WHEN 'movimento_indevido' THEN 'guincho'
    WHEN 'rota_monitorada' THEN 'desvio_rota'
    WHEN 'jammer' THEN 'suspeita_jammer'
    WHEN 'sos' THEN 'panico'
    WHEN 'sos_panico' THEN 'panico'
    WHEN 'tamper' THEN 'violacao_dispositivo'
    WHEN 'capotamento' THEN 'capotamento_inclinacao'
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
    WHEN 'novo_instalador_auto_cadastro' THEN 'cadastros_convites_veiculos'
    WHEN 'novo_cliente_auto_cadastro' THEN 'cadastros_convites_veiculos'
    WHEN 'novo_revendedor_cadastro' THEN 'cadastros_convites_veiculos'
    WHEN 'novo_vendedor_cadastro' THEN 'cadastros_convites_veiculos'
    WHEN 'nova_solicitacao_veiculo_cliente' THEN 'cadastros_convites_veiculos'
    WHEN 'notificacao_proposta_emitida' THEN 'propostas_contratos'
    WHEN 'notificacao_contrato_assinado_cliente' THEN 'propostas_contratos'
    WHEN 'notificacao_contrato_assinado_recebido' THEN 'propostas_contratos'
    WHEN 'mensalidade_pagamento_informado' THEN 'pagamento_informado'
    WHEN 'degustacao_cadastrada_whatsapp' THEN 'degustacao_bot'
    WHEN 'degustacao_reativada_whatsapp' THEN 'degustacao_bot'
    WHEN 'transbordo_humano_whatsapp' THEN 'atendimento_humano_bot'
    WHEN 'indicacao_vendedor_whatsapp' THEN 'atendimento_humano_bot'
    WHEN 'gerencial' THEN 'relatorio_gerencial'
    WHEN 'relatorio_diario_metricas' THEN 'relatorio_gerencial'
    WHEN 'comando_j16_concluido' THEN 'comandos_j16'
    WHEN 'retorno_comando_j16' THEN 'comandos_j16'
    ELSE v_tipo
  END;

  IF v_tipo = 'entrada_area' THEN
    v_default_ativo := FALSE;
  END IF;
  IF v_tipo = 'chat' THEN
    v_default_whats := FALSE;
  END IF;

  IF p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas->'por_alerta') = 'object' THEN
    v_mapa_por_alerta := p_canais_alertas->'por_alerta';
  ELSIF p_alertas_ativos IS NOT NULL AND jsonb_typeof(p_alertas_ativos->'canais_por_alerta') = 'object' THEN
    v_mapa_por_alerta := p_alertas_ativos->'canais_por_alerta';
  END IF;

  IF v_mapa_por_alerta IS NOT NULL THEN
    v_tem_por_alerta := EXISTS (SELECT 1 FROM jsonb_object_keys(v_mapa_por_alerta) LIMIT 1);
    IF v_tem_por_alerta THEN
      v_por_alerta := v_mapa_por_alerta->v_tipo;
    END IF;
  END IF;

  -- Determina se o alerta está ativo (opt-in / opt-out)
  IF v_por_alerta IS NOT NULL AND jsonb_typeof(v_por_alerta) = 'object' AND jsonb_typeof(v_por_alerta->'ativo') = 'boolean' THEN
    v_ativo := (v_por_alerta->>'ativo')::BOOLEAN;
  ELSIF p_alertas_ativos IS NOT NULL AND jsonb_typeof(p_alertas_ativos->v_tipo) = 'boolean' THEN
    v_ativo := (p_alertas_ativos->>v_tipo)::BOOLEAN;
  ELSE
    v_ativo := v_default_ativo;
  END IF;

  IF NOT COALESCE(v_ativo, TRUE) THEN
    RETURN FALSE;
  END IF;

  -- Verifica se ao menos 1 canal de entrega está habilitado para este item
  IF v_por_alerta IS NOT NULL AND jsonb_typeof(v_por_alerta) = 'object' THEN
    v_app := CASE
      WHEN jsonb_typeof(v_por_alerta->'app') = 'boolean' THEN (v_por_alerta->>'app')::BOOLEAN
      ELSE TRUE
    END;
    v_whats := CASE
      WHEN jsonb_typeof(v_por_alerta->'whatsapp') = 'boolean' THEN (v_por_alerta->>'whatsapp')::BOOLEAN
      ELSE v_default_whats
    END;
    v_lig := CASE
      WHEN jsonb_typeof(v_por_alerta->'ligacao') = 'boolean' THEN (v_por_alerta->>'ligacao')::BOOLEAN
      ELSE FALSE
    END;
    RETURN (v_app OR v_whats OR v_lig);
  END IF;

  -- Quando existe mapa por_alerta e o tipo ainda não foi gravado nele, usa apenas defaults seguros do catálogo
  IF v_tem_por_alerta THEN
    RETURN (TRUE OR v_default_whats);
  END IF;

  -- Compatibilidade legada somente quando não existe mapa por_alerta
  IF p_canais_alertas IS NOT NULL AND jsonb_typeof(p_canais_alertas) = 'object' THEN
    v_app := CASE WHEN jsonb_typeof(p_canais_alertas->'app') = 'boolean' THEN (p_canais_alertas->>'app')::BOOLEAN ELSE TRUE END;
    v_whats := CASE WHEN jsonb_typeof(p_canais_alertas->'whatsapp') = 'boolean' THEN (p_canais_alertas->>'whatsapp')::BOOLEAN ELSE v_default_whats END;
    v_lig := CASE WHEN jsonb_typeof(p_canais_alertas->'ligacao') = 'boolean' THEN (p_canais_alertas->>'ligacao')::BOOLEAN ELSE FALSE END;
    RETURN (v_app OR v_whats OR v_lig);
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hunter_alerta_pode_emitir(JSONB, JSONB, TEXT) TO authenticated, anon, service_role;

-- 5. Atualização de public.registrar_alerta_seguranca
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
  v_equipe_rec           RECORD;
  v_cfg_equipe           JSONB;
  v_pode_notificar_membro BOOLEAN;
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
    WHEN 'tamper' THEN 'violacao_dispositivo'
    WHEN 'capotamento' THEN 'capotamento_inclinacao'
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

  -- Alertas de defesa ativa anti-SMS são exclusivos da equipe técnica:
  -- cliente nunca pode silenciar a emissão de auditoria/sigilo via regras_veiculo
  IF v_tipo_norm <> 'corte_nao_autorizado_sms' THEN
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

  -- 6. Dispara notificação no sistema respeitando sigilo técnico-operacional e configuração individual
  BEGIN
    IF v_tipo_norm = 'corte_nao_autorizado_sms' THEN
      FOR v_equipe_rec IN
        SELECT DISTINCT membros.user_id
        FROM (
          SELECT ur.user_id
          FROM public.user_roles ur
          JOIN public.profiles p ON p.id = ur.user_id AND p.ativo = TRUE
          WHERE ur.role IN ('superadmin', 'adm', 'operador')
          UNION
          SELECT p.id AS user_id
          FROM public.profiles p
          WHERE p.role IN ('superadmin', 'adm', 'operador')
            AND p.ativo = TRUE
        ) membros
      LOOP
        SELECT nc.alertas_ativos->'alertas_operacionais'->'corte_nao_autorizado_sms'
        INTO v_cfg_equipe
        FROM public.notificacoes_configuracoes nc
        WHERE nc.user_id = v_equipe_rec.user_id
          AND nc.veiculo_id IS NULL
        ORDER BY nc.updated_at DESC
        LIMIT 1;

        v_pode_notificar_membro := TRUE;
        IF v_cfg_equipe IS NOT NULL AND jsonb_typeof(v_cfg_equipe) = 'object' THEN
          v_pode_notificar_membro := public.hunter_alerta_pode_emitir(
            NULL,
            jsonb_build_object('por_alerta', jsonb_build_object('corte_nao_autorizado_sms', v_cfg_equipe)),
            'corte_nao_autorizado_sms'
          );
        END IF;

        IF v_pode_notificar_membro THEN
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
            v_equipe_rec.user_id,
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
      END LOOP;
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
