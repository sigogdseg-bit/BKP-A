-- ==============================================================================
-- HUNTER: NOTIFICAÇÃO INSTANTÂNEA E ATUALIZAÇÃO REATIVA DE INSTALAÇÃO E KIT NO BD
-- ==============================================================================

-- 1. Garante REPLICA IDENTITY FULL para que o Supabase Realtime propague eventos completos com RLS
ALTER TABLE public.instalacoes REPLICA IDENTITY FULL;
ALTER TABLE public.clientes REPLICA IDENTITY FULL;
ALTER TABLE public.veiculos REPLICA IDENTITY FULL;
ALTER TABLE public.notificacoes_sistema REPLICA IDENTITY FULL;

-- 2. Habilita tabelas na publicação supabase_realtime de forma idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'instalacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.instalacoes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificacoes_sistema'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_sistema;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'veiculos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculos;
  END IF;
END $$;

-- 3. Função de Trigger: Disparar Notificação Instantânea no BD ao atribuir Instalador, Kit ou Concluir Instalação
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

  -- 3.1. Se o instalador foi atribuído ou alterado
  IF v_mudou_instalador THEN
    -- Notifica o Instalador
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
      'GD Rastreamento — Central Operacional',
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

    -- Notifica o Cliente Titular
    IF v_cliente_user_id IS NOT NULL THEN
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
        'GD Rastreamento — Central Operacional',
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

  -- 3.2. Se um kit com IMEI real foi atribuído e já há instalador definido (e não foi o mesmo disparo anterior)
  IF v_mudou_kit AND NOT v_mudou_instalador THEN
    IF NEW.instalador_id IS NOT NULL THEN
      -- Notifica o Instalador
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
        'GD Rastreamento — Central Operacional',
        '📦 Kit Rastreador Vinculado: ' || COALESCE(NEW.placa, 'Veículo'),
        'O operador vinculou o rastreador (IMEI ' || NEW.rastreador_imei || ') ao veículo ' || COALESCE(NEW.placa, '') || '. Equipamento disponível para conferência física e agendamento.',
        'instalacao',
        '/instalacao',
        NEW.placa,
        FALSE,
        NOW()
      );
    END IF;

    -- Notifica o Cliente Titular
    IF v_cliente_user_id IS NOT NULL THEN
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
        'GD Rastreamento — Central Operacional',
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

  -- 3.3. Se a instalação foi concluída com sucesso
  IF v_concluiu_instalacao THEN
    -- Notifica o Cliente Titular com link direto ao Monitor GPS
    IF v_cliente_user_id IS NOT NULL THEN
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
        'GD Rastreamento — Central Operacional',
        '🎉 Instalação Concluída: ' || COALESCE(NEW.placa, 'Veículo'),
        'A instalação do rastreador no veículo ' || COALESCE(NEW.placa, '') || ' foi finalizada com sucesso! Seu veículo já está protegido e pronto para acompanhamento em tempo real.',
        'instalacao',
        '/monitor-gps',
        NEW.placa,
        FALSE,
        NOW()
      );
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
      'GD Rastreamento — Central Operacional',
      '✅ Instalação Concluída: ' || COALESCE(NEW.placa, 'Veículo'),
      'O técnico ' || COALESCE(v_instalador_nome, 'instalador') || ' concluiu a instalação do veículo ' || COALESCE(NEW.placa, '') || ' (Cliente: ' || COALESCE(v_cliente_nome, 'Cliente') || ').',
      'instalacao',
      '/instalacao',
      NEW.placa,
      FALSE,
      NOW()
    FROM public.profiles p
    WHERE p.role IN ('superadmin', 'adm', 'operador');
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Anexar o Trigger à Tabela public.instalacoes
DROP TRIGGER IF EXISTS trg_notificar_atribuicao_instalacao_kit ON public.instalacoes;
CREATE TRIGGER trg_notificar_atribuicao_instalacao_kit
  AFTER INSERT OR UPDATE OF instalador_id, rastreador_imei, rastreador_id, status
  ON public.instalacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notificar_atribuicao_instalacao_kit();

-- 5. Atualizar a RPC instalador_obter_minhas_demandas para incluir clientes cujas ORDENS pertencem ao instalador
-- (Mesmo que o campo clientes.instalador_id aponte para outro instalador por ter múltiplos veículos)
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

  -- 1. Coletar Ordens de Instalação Atribuídas
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'cliente_id', i.cliente_id,
      'veiculo_id', i.veiculo_id,
      'instalador_id', i.instalador_id,
      'placa', i.placa,
      'marca', i.marca,
      'modelo', i.modelo,
      'ano', i.ano,
      'cor', i.cor,
      'tipo_veiculo', i.tipo_veiculo,
      'km_instalacao', i.km_instalacao,
      'tipo_servico', i.tipo_servico,
      'valor_instalacao', i.valor_instalacao,
      'status_pagamento', i.status_pagamento,
      'bloqueador_instalado', COALESCE(i.bloqueador_instalado, false),
      'com_bloqueador', COALESCE(i.bloqueador_instalado, false),
      'status', i.status,
      'posicao_instalacao', i.posicao_instalacao,
      'posicaoInstalacao', i.posicao_instalacao,
      'rastreador_id', i.rastreador_id,
      'rastreador_imei', i.rastreador_imei,
      'rastreador_modelo', i.rastreador_modelo,
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'data_agendamento', i.data_agendamento,
      'hora_agendamento', i.hora_agendamento,
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
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id;

  -- 2. Coletar Clientes Agendados ou Aguardando Agendamento
  -- (Inclui clientes onde o instalador_id está no cliente OU em alguma de suas ordens de instalação)
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
    OR EXISTS (SELECT 1 FROM public.instalacoes inst WHERE inst.cliente_id = c.id AND inst.instalador_id = v_alvo_id)
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

-- Invalidação canônica de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';
