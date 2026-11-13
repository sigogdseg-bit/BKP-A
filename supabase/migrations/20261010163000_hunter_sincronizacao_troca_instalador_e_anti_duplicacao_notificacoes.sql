-- ==============================================================================
-- HUNTER: SINCRONIZAÇÃO ATÔMICA DE TROCA DE INSTALADOR E ANTI-DUPLICAÇÃO DE NOTIFICAÇÕES
-- ==============================================================================

-- 1. Atualizar RPC admin_atualizar_cliente_completo para propagar atomicamente
--    a troca de instalador para todas as ordens de instalação pendentes do cliente
CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT,
  p_email TEXT,
  p_telefone TEXT,
  p_status public.status_cliente,
  p_plano public.plano_cliente,
  p_dia_vencimento INT,
  p_valor_mensalidade NUMERIC,
  p_dias_historico INT,
  p_dias_retencao INT,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_meses_contrato INT DEFAULT 12,
  p_data_inicio_contrato DATE DEFAULT CURRENT_DATE,
  p_tipo_renovacao TEXT DEFAULT 'mesma_vigencia',
  p_meses_renovacao INT DEFAULT 12,
  p_foro_comarca TEXT DEFAULT 'Volta Redonda/RJ',
  p_gerar_parcelas_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_email_limpo TEXT := lower(trim(coalesce(p_email, '')));
  v_resultado_parcelas JSONB := '[]'::JSONB;
  v_meses_c INT := COALESCE(p_meses_contrato, 12);
  v_data_inicio DATE := COALESCE(p_data_inicio_contrato, CURRENT_DATE);
  v_data_fim DATE;
  v_status_final public.status_cliente := p_status;
  v_status_agendamento_final TEXT;
  r_veiculo RECORD;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar clientes.';
  END IF;

  SELECT user_id, status_agendamento INTO v_user_id, v_status_agendamento_final
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  v_data_fim := v_data_inicio + (v_meses_c || ' months')::INTERVAL;

  -- Se foi atribuído ou alterado instalador:
  IF p_instalador_id IS NOT NULL THEN
    IF v_status_agendamento_final IS NULL OR v_status_agendamento_final = 'concluido' THEN
      v_status_agendamento_final := 'aguardando_agendamento';
    END IF;
    -- Se cliente não possui veículos ativos com rastreadores, força status operacional aguardando_instalacao
    IF NOT EXISTS (
      SELECT 1 FROM public.veiculos WHERE cliente_id = p_cliente_id AND ativo = TRUE AND rastreador_id IS NOT NULL
    ) THEN
      v_status_final := 'aguardando_instalacao'::public.status_cliente;
    END IF;

    -- Sincronização atômica imediata no BD:
    -- Atualiza o instalador_id de todas as ordens de serviço pendentes do cliente
    UPDATE public.instalacoes
    SET instalador_id = p_instalador_id,
        updated_at = NOW()
    WHERE cliente_id = p_cliente_id AND status != 'concluida';

    -- Se o cliente possui veículos cadastrados sem ordem de instalação aberta, cria a ordem para o novo instalador
    FOR r_veiculo IN
      SELECT v.id, v.placa, v.marca, v.modelo, v.ano, v.tipo_veiculo
      FROM public.veiculos v
      WHERE v.cliente_id = p_cliente_id
        AND NOT EXISTS (
          SELECT 1 FROM public.instalacoes i 
          WHERE i.veiculo_id = v.id AND i.status != 'cancelada'
        )
    LOOP
      INSERT INTO public.instalacoes (
        cliente_id,
        veiculo_id,
        placa,
        marca,
        modelo,
        ano,
        tipo_veiculo,
        instalador_id,
        status,
        rastreador_imei,
        created_at,
        updated_at
      ) VALUES (
        p_cliente_id,
        r_veiculo.id,
        r_veiculo.placa,
        r_veiculo.marca,
        r_veiculo.modelo,
        r_veiculo.ano,
        COALESCE(r_veiculo.tipo_veiculo, 'carro'),
        p_instalador_id,
        'aguardando_agendamento',
        'AGUARDANDO ESTOQUE',
        NOW(),
        NOW()
      );
    END LOOP;
  END IF;

  -- Atualizar credenciais de auth se aplicável
  IF v_user_id IS NOT NULL THEN
    IF v_email_limpo <> '' THEN
      UPDATE auth.users
      SET email = v_email_limpo,
          raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'email', v_email_limpo),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE public.profiles
      SET nome = trim(p_nome),
          email = v_email_limpo,
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_limpo)),
          provider_id = v_email_limpo
      WHERE user_id = v_user_id AND provider = 'email';
    ELSE
      UPDATE public.profiles
      SET nome = trim(p_nome),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.users
      SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  -- Atualizar registro em public.clientes
  UPDATE public.clientes
  SET nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(v_email_limpo, ''),
      telefone = NULLIF(trim(p_telefone), ''),
      user_id = COALESCE(user_id, v_user_id),
      plano = p_plano,
      status = v_status_final,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      instalador_id = p_instalador_id,
      status_agendamento = COALESCE(v_status_agendamento_final, status_agendamento),
      meses_contrato = v_meses_c,
      data_inicio_contrato = v_data_inicio,
      data_fim_contrato = v_data_fim,
      tipo_renovacao = COALESCE(p_tipo_renovacao, tipo_renovacao),
      meses_renovacao = COALESCE(p_meses_renovacao, meses_renovacao),
      foro_comarca = COALESCE(p_foro_comarca, 'Volta Redonda/RJ'),
      updated_at = now()
  WHERE id = p_cliente_id;

  IF p_gerar_parcelas_ausentes THEN
    v_resultado_parcelas := public.admin_gerar_parcelas_contrato(p_cliente_id);
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Dados do cliente e credenciais atualizados com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID, INT, DATE, TEXT, INT, TEXT, BOOLEAN) TO authenticated;

-- 2. Atualizar o Trigger trg_notificar_atribuicao_instalacao_kit com blindagem anti-duplicação (30 segundos)
CREATE OR REPLACE FUNCTION public.trg_notificar_atribuicao_instalacao_kit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tem_kit_valido BOOLEAN;
  v_mudou_kit BOOLEAN;
  v_mudou_instalador BOOLEAN;
  v_concluiu_instalacao BOOLEAN;
  v_cliente_user_id UUID;
  v_cliente_nome TEXT;
  v_instalador_nome TEXT;
BEGIN
  -- Identifica o cliente associado
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT user_id, nome_razao_social INTO v_cliente_user_id, v_cliente_nome
    FROM public.clientes
    WHERE id = NEW.cliente_id;
  END IF;

  -- Identifica o instalador associado
  IF NEW.instalador_id IS NOT NULL THEN
    SELECT nome INTO v_instalador_nome
    FROM public.profiles
    WHERE id = NEW.instalador_id;
  END IF;

  v_tem_kit_valido := (
    NEW.rastreador_imei IS NOT NULL 
    AND NEW.rastreador_imei NOT IN ('PENDENTE', 'AGUARDANDO ESTOQUE', 'A DEFINIR', 'SEM RASTREADOR', '')
  );

  v_mudou_instalador := (
    NEW.instalador_id IS NOT NULL 
    AND (TG_OP = 'INSERT' OR OLD.instalador_id IS DISTINCT FROM NEW.instalador_id)
  );

  v_mudou_kit := (
    v_tem_kit_valido 
    AND (TG_OP = 'INSERT' OR OLD.rastreador_imei IS DISTINCT FROM NEW.rastreador_imei)
  );

  v_concluiu_instalacao := (
    NEW.status = 'concluida' 
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida')
  );

  -- 2.1. Se o instalador foi atribuído ou alterado
  IF v_mudou_instalador THEN
    -- Notifica o Instalador (com blindagem anti-duplicação de 30s)
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes_sistema
      WHERE destinatario_user_id = NEW.instalador_id
        AND tipo = 'instalacao'
        AND COALESCE(placa, '') = COALESCE(NEW.placa, '')
        AND created_at > NOW() - INTERVAL '30 seconds'
    ) THEN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa,
        lida,
        created_at
      ) VALUES (
        NEW.instalador_id,
        'SIGO Guardião — Central Operacional',
        '🔧 Nova Instalação Atribuída: ' || COALESCE(NEW.placa, 'Veículo'),
        'Você foi designado para realizar a instalação do veículo ' || COALESCE(NEW.placa, '') || ' (' || COALESCE(NEW.marca, '') || ' ' || COALESCE(NEW.modelo, '') || '). ' || 
          CASE 
            WHEN v_tem_kit_valido THEN 'Kit de comodato já atribuído: IMEI ' || NEW.rastreador_imei || '.'
            ELSE 'Aguardando liberação de rastreador pelo operador.'
          END,
        'instalacao',
        '/instalacao',
        NEW.placa,
        FALSE,
        NOW()
      );
    END IF;

    -- Notifica o Cliente Titular (com blindagem anti-duplicação de 30s)
    IF v_cliente_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes_sistema
        WHERE destinatario_user_id = v_cliente_user_id
          AND tipo = 'instalacao'
          AND COALESCE(placa, '') = COALESCE(NEW.placa, '')
          AND created_at > NOW() - INTERVAL '30 seconds'
      ) THEN
        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id,
          destinatario_cliente_id,
          remetente_nome,
          titulo,
          mensagem,
          tipo,
          url,
          placa,
          lida,
          created_at
        ) VALUES (
          v_cliente_user_id,
          NEW.cliente_id,
          'SIGO Guardião — Central Operacional',
          '🔧 Técnico Designado para seu Veículo: ' || COALESCE(NEW.placa, 'Veículo'),
          'O técnico credenciado ' || COALESCE(v_instalador_nome, 'especializado') || ' foi designado para o atendimento do seu veículo ' || COALESCE(NEW.placa, '') || ' (' || COALESCE(NEW.marca, '') || ' ' || COALESCE(NEW.modelo, '') || '). ' ||
            CASE 
              WHEN v_tem_kit_valido THEN 'O kit de rastreador já foi vinculado e preparado para agendamento.'
              ELSE 'Em breve alinharemos os detalhes para instalação.'
            END,
          'instalacao',
          '/login',
          NEW.placa,
          FALSE,
          NOW()
        );
      END IF;
    END IF;
  END IF;

  -- 2.2. Se um kit com IMEI real foi atribuído e já há instalador definido (e não foi o mesmo disparo anterior)
  IF v_mudou_kit AND NOT v_mudou_instalador THEN
    IF NEW.instalador_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes_sistema
        WHERE destinatario_user_id = NEW.instalador_id
          AND tipo = 'instalacao'
          AND COALESCE(placa, '') = COALESCE(NEW.placa, '')
          AND created_at > NOW() - INTERVAL '30 seconds'
      ) THEN
        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id,
          remetente_nome,
          titulo,
          mensagem,
          tipo,
          url,
          placa,
          lida,
          created_at
        ) VALUES (
          NEW.instalador_id,
          'SIGO Guardião — Central Operacional',
          '📦 Kit Rastreador Vinculado: ' || COALESCE(NEW.placa, 'Veículo'),
          'O operador vinculou o rastreador (IMEI ' || NEW.rastreador_imei || ') ao veículo ' || COALESCE(NEW.placa, '') || '. Equipamento disponível para conferência física e agendamento.',
          'instalacao',
          '/instalacao',
          NEW.placa,
          FALSE,
          NOW()
        );
      END IF;
    END IF;

    -- Notifica o Cliente Titular
    IF v_cliente_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes_sistema
        WHERE destinatario_user_id = v_cliente_user_id
          AND tipo = 'instalacao'
          AND COALESCE(placa, '') = COALESCE(NEW.placa, '')
          AND created_at > NOW() - INTERVAL '30 seconds'
      ) THEN
        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id,
          destinatario_cliente_id,
          remetente_nome,
          titulo,
          mensagem,
          tipo,
          url,
          placa,
          lida,
          created_at
        ) VALUES (
          v_cliente_user_id,
          NEW.cliente_id,
          'SIGO Guardião — Central Operacional',
          '📦 Rastreador Preparado: ' || COALESCE(NEW.placa, 'Veículo'),
          'O rastreador foi vinculado ao seu veículo ' || COALESCE(NEW.placa, '') || '. O equipamento já está liberado para o técnico realizar a conferência e o agendamento.',
          'instalacao',
          '/login',
          NEW.placa,
          FALSE,
          NOW()
        );
      END IF;
    END IF;
  END IF;

  -- 2.3. Se a instalação foi concluída com sucesso
  IF v_concluiu_instalacao THEN
    IF v_cliente_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notificacoes_sistema
        WHERE destinatario_user_id = v_cliente_user_id
          AND tipo = 'instalacao'
          AND COALESCE(placa, '') = COALESCE(NEW.placa, '')
          AND created_at > NOW() - INTERVAL '30 seconds'
      ) THEN
        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id,
          destinatario_cliente_id,
          remetente_nome,
          titulo,
          mensagem,
          tipo,
          url,
          placa,
          lida,
          created_at
        ) VALUES (
          v_cliente_user_id,
          NEW.cliente_id,
          'SIGO Guardião — Central Operacional',
          '🎉 Instalação Concluída: ' || COALESCE(NEW.placa, 'Veículo'),
          'A instalação do rastreador no veículo ' || COALESCE(NEW.placa, '') || ' foi finalizada com sucesso! Seu veículo já está protegido e pronto para acompanhamento em tempo real.',
          'instalacao',
          '/monitor-gps',
          NEW.placa,
          FALSE,
          NOW()
        );
      END IF;
    END IF;

    -- Notifica Administradores e Operadores
    INSERT INTO public.notificacoes_sistema (
      destinatario_user_id,
      remetente_nome,
      titulo,
      mensagem,
      tipo,
      url,
      placa,
      lida,
      created_at
    )
    SELECT 
      p.id,
      'SIGO Guardião — Central Operacional',
      '✅ Instalação Concluída: ' || COALESCE(NEW.placa, 'Veículo'),
      'O técnico ' || COALESCE(v_instalador_nome, 'instalador') || ' concluiu a instalação do veículo ' || COALESCE(NEW.placa, '') || ' (Cliente: ' || COALESCE(v_cliente_nome, 'Cliente') || ').',
      'instalacao',
      '/instalacao',
      NEW.placa,
      FALSE,
      NOW()
    FROM public.profiles p
    WHERE p.role IN ('superadmin', 'adm', 'operador')
      AND NOT EXISTS (
        SELECT 1 FROM public.notificacoes_sistema ns
        WHERE ns.destinatario_user_id = p.id
          AND ns.tipo = 'instalacao'
          AND COALESCE(ns.placa, '') = COALESCE(NEW.placa, '')
          AND ns.created_at > NOW() - INTERVAL '30 seconds'
      );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Atualizar a RPC instalador_obter_minhas_demandas para contemplar ordens onde o instalador está no cliente
--    ou na ordem de instalação, garantindo que o veículo sempre apareça para o técnico designado
CREATE OR REPLACE FUNCTION public.instalador_obter_minhas_demandas(
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_alvo_id UUID;
  v_ordens JSONB;
  v_agendamentos JSONB;
  v_resumo JSONB;
  v_total_a_receber NUMERIC(10,2);
  v_total_recebido NUMERIC(10,2);
  v_total_agendados_qtd INT;
  v_total_a_agendar_qtd INT;
  v_valor_previsto_agendados NUMERIC(10,2);
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  IF v_role IN ('superadmin', 'adm', 'operador') THEN
    v_alvo_id := COALESCE(p_instalador_id, v_caller_id);
  ELSE
    v_alvo_id := v_caller_id;
  END IF;

  -- 1. Coletar Ordens de Instalação Atribuídas (diretamente ou via vínculo do cliente)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'cliente_id', i.cliente_id,
      'veiculo_id', i.veiculo_id,
      'instalador_id', COALESCE(i.instalador_id, c.instalador_id),
      'placa', COALESCE(i.placa, v.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, split_part(v.marca_modelo, ' ', 1), 'Geral'),
      'modelo', COALESCE(i.modelo, v.marca_modelo, 'Veículo'),
      'ano', COALESCE(i.ano, v.ano),
      'cor', COALESCE(i.cor, v.cor),
      'tipo_veiculo', COALESCE(i.tipo_veiculo, v.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'tipo_servico', COALESCE(i.tipo_servico, 'instalacao'),
      'valor_instalacao', i.valor_instalacao,
      'status_pagamento', i.status_pagamento,
      'bloqueador_instalado', COALESCE(i.bloqueador_instalado, false),
      'com_bloqueador', COALESCE(i.bloqueador_instalado, false),
      'status', i.status,
      'posicao_instalacao', i.posicao_instalacao,
      'posicaoInstalacao', i.posicao_instalacao,
      'rastreador_id', COALESCE(i.rastreador_id, v.rastreador_id),
      'rastreador_imei', COALESCE(i.rastreador_imei, v.rastreador_imei, 'PENDENTE'),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, 'J16 4G'),
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', i.local_endereco,
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, false),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'endereco_cliente_informado_em', i.endereco_cliente_informado_em,
      'solicitado_endereco_em', i.solicitado_endereco_em,
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, false),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'instalador_nome', COALESCE(p.nome, 'Instalador Técnico'),
      'instalador_chave_pix', p.chave_pix,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_telefone', c.telefone,
      'cliente_documento', c.documento,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.veiculos v ON v.id = i.veiculo_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, c.instalador_id)
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id
     OR (i.instalador_id IS NULL AND c.instalador_id = v_alvo_id);

  -- 2. Coletar Clientes Agendados ou Aguardando Agendamento
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome_razao_social', c.nome_razao_social,
      'documento', c.documento,
      'telefone', c.telefone,
      'email', c.email,
      'status', c.status,
      'plano', c.plano,
      'tem_fidelidade', c.tem_fidelidade,
      'regra_horimetro', c.regra_horimetro,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', COALESCE(c.instalador_id, v_alvo_id),
      'instalador', jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'endereco_instalacao', p.endereco_instalacao,
        'valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
        'valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador
      ),
      'veiculos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 
          'placa', v.placa, 
          'modelo', v.marca_modelo, 
          'tipo_veiculo', v.tipo_veiculo,
          'horimetro_horas', v.horimetro_horas
        ))
        FROM public.veiculos v
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = COALESCE(c.instalador_id, v_alvo_id)
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
    OR EXISTS (SELECT 1 FROM public.instalacoes inst WHERE inst.cliente_id = c.id AND (inst.instalador_id = v_alvo_id OR (inst.instalador_id IS NULL AND c.instalador_id = v_alvo_id)))
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Métricas Financeiras ESTRITAS
  SELECT 
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pendente' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pago' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status != 'concluida' AND data_agendamento IS NOT NULL THEN valor_instalacao ELSE 0 END), 0.00),
    COUNT(CASE WHEN status != 'concluida' AND data_agendamento IS NOT NULL THEN 1 END),
    COUNT(CASE WHEN status != 'concluida' AND data_agendamento IS NULL THEN 1 END)
  INTO 
    v_total_a_receber,
    v_total_recebido,
    v_valor_previsto_agendados,
    v_total_agendados_qtd,
    v_total_a_agendar_qtd
  FROM public.instalacoes
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR instalador_id = v_alvo_id;

  v_resumo := jsonb_build_object(
    'total_ordens', jsonb_array_length(v_ordens),
    'total_agendamentos', jsonb_array_length(v_agendamentos),
    'a_receber', v_total_a_receber,
    'recebido', v_total_recebido,
    'agendados_qtd', v_total_agendados_qtd,
    'a_agendar_qtd', v_total_a_agendar_qtd,
    'valor_previsto_agendados', v_valor_previsto_agendados
  );

  RETURN jsonb_build_object(
    'success', true,
    'ordens', v_ordens,
    'agendamentos', v_agendamentos,
    'resumo', v_resumo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_obter_minhas_demandas(UUID) TO authenticated;

-- 5. Trigger Anti-Duplicação na raiz da tabela public.notificacoes_sistema
-- Barreira física de código (Root Cause First): Impede qualquer gravação de notificação duplicada
-- no intervalo de 30 segundos para o mesmo destinatário com o mesmo tipo e placa/título,
-- independentemente de ser disparada por trigger, RPC ou requisição do frontend.
CREATE OR REPLACE FUNCTION public.trg_anti_duplicacao_notificacoes_sistema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notificacoes_sistema
    WHERE (
      (destinatario_user_id IS NOT NULL AND destinatario_user_id = NEW.destinatario_user_id)
      OR
      (destinatario_cliente_id IS NOT NULL AND destinatario_cliente_id = NEW.destinatario_cliente_id)
    )
    AND tipo = NEW.tipo
    AND (
      (NEW.placa IS NOT NULL AND NEW.placa <> '' AND COALESCE(placa, '') = NEW.placa)
      OR
      (COALESCE(titulo, '') = COALESCE(NEW.titulo, ''))
    )
    AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
    -- Descarta silenciosamente o insert duplicado na raiz do banco
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicacao_notificacoes_sistema ON public.notificacoes_sistema;
CREATE TRIGGER trg_anti_duplicacao_notificacoes_sistema
  BEFORE INSERT ON public.notificacoes_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_anti_duplicacao_notificacoes_sistema();

-- Invalidação canônica de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';
