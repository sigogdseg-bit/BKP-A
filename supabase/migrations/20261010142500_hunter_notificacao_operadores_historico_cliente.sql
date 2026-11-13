-- 20261010142500_hunter_notificacao_operadores_historico_cliente.sql
-- Notificação Imediata da Equipe Operação/ADM e Registro Canônico no Histórico do Cliente

-- 1. Permissão de SELECT para clientes em seu próprio histórico de atendimento
DROP POLICY IF EXISTS "Historico visivel para clientes de suas ordens" ON public.instalacoes_historico_atendimentos;
CREATE POLICY "Historico visivel para clientes de suas ordens"
ON public.instalacoes_historico_atendimentos FOR SELECT TO authenticated
USING (
  is_admin_or_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'operador'::hunter_role
  )
  OR instalador_id = auth.uid()
  OR instalacao_id IN (
    SELECT i.id FROM public.instalacoes i
    WHERE i.cliente_user_id = auth.uid() 
       OR i.cliente_id = auth.uid()
       OR i.cliente_id IN (SELECT c.id FROM public.clientes c WHERE c.user_id = auth.uid())
  )
);

-- 1.1. Permissão de SELECT em notificacoes_sistema para clientes e operadores
DROP POLICY IF EXISTS "Usuarios podem ler suas proprias notificacoes ou administradores leem todas" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios podem ler suas proprias notificacoes ou administradores leem todas"
  ON public.notificacoes_sistema FOR SELECT TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    )
    OR remetente_user_id = auth.uid()
    OR public.is_admin_or_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role = 'operador'::hunter_role
    )
  );

-- 2. Função RPC para notificar todos os operadores e administradores ativos
CREATE OR REPLACE FUNCTION public.notificar_equipe_operacao(
  p_remetente_id UUID,
  p_remetente_nome TEXT,
  p_titulo TEXT,
  p_mensagem TEXT,
  p_tipo TEXT DEFAULT 'instalacao',
  p_url TEXT DEFAULT '/instalacao',
  p_placa TEXT DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT p.id 
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE (p.role IN ('superadmin', 'adm', 'operador') OR ur.role IN ('superadmin', 'adm', 'operador'))
      AND p.ativo = TRUE
      AND p.id <> COALESCE(p_remetente_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) LOOP
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        destinatario_cliente_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        r.id,
        NULL, -- Destinatário é estritamente a equipe interna (r.id), NUNCA o cliente
        p_remetente_id,
        p_remetente_nome,
        p_titulo,
        p_mensagem,
        p_tipo,
        p_url,
        p_placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_equipe_operacao(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- 3. Atualização de instalador_definir_agendamento_instalacao com histórico e aviso à equipe
CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento_instalacao(
  p_instalacao_id UUID,
  p_data DATE,
  p_hora TEXT,
  p_local_tipo TEXT DEFAULT 'oficina'::TEXT,
  p_local_endereco TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_nome TEXT;
  v_instalador_id UUID;
  v_cliente_id UUID;
  v_cliente_user_id UUID;
  v_cliente_nome TEXT;
  v_placa TEXT;
  v_rastreador_imei TEXT;
  v_instalador_nome TEXT;
  v_endereco_final TEXT;
  v_tipo_local TEXT;
  v_tipo_acao TEXT := 'Agendamento';
  v_ja_estava_agendado BOOLEAN := FALSE;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role, nome INTO v_caller_role, v_caller_nome 
  FROM public.profiles 
  WHERE id = v_caller_id;

  SELECT 
    i.instalador_id, 
    i.cliente_id, 
    i.placa,
    i.rastreador_imei,
    i.data_agendamento IS NOT NULL,
    c.user_id,
    c.nome_razao_social,
    p.nome,
    p.endereco_instalacao
  INTO 
    v_instalador_id, 
    v_cliente_id, 
    v_placa,
    v_rastreador_imei,
    v_ja_estava_agendado,
    v_cliente_user_id,
    v_cliente_nome,
    v_instalador_nome,
    v_endereco_final
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, v_caller_id)
  WHERE i.id = p_instalacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  IF v_rastreador_imei IS NULL 
     OR TRIM(v_rastreador_imei) = '' 
     OR UPPER(TRIM(v_rastreador_imei)) IN (
       'AGUARDANDO ESTOQUE', 
       'AGUARDANDO_ESTOQUE', 
       'PENDENTE', 
       'A DEFINIR', 
       'A_DEFINIR', 
       'SEM RASTREADOR', 
       'SEM_RASTREADOR', 
       'A CONFERIR', 
       'A_CONFERIR', 
       'NENHUM'
     ) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Não é possível agendar sem kit disponibilizado para este veículo. O operador deve vincular e disponibilizar o kit antes de definir a data.'
    );
  END IF;

  IF v_instalador_id IS NULL THEN
    IF v_caller_role = 'instalador' THEN
      v_instalador_id := v_caller_id;
      UPDATE public.instalacoes SET instalador_id = v_caller_id WHERE id = p_instalacao_id;
    END IF;
  END IF;

  IF v_caller_role = 'instalador' AND v_instalador_id IS NOT NULL AND v_instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: apenas o instalador atribuído ou a equipe de operações podem agendar esta instalação.');
  END IF;

  IF p_data IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'A data do agendamento é obrigatória.');
  END IF;

  IF p_hora IS NULL OR TRIM(p_hora) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'O horário do agendamento é obrigatório.');
  END IF;

  v_tipo_local := COALESCE(p_local_tipo, 'oficina');
  IF v_tipo_local = 'local_veiculo' THEN
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final);
  ELSE
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final, 'Oficina Credenciada');
  END IF;

  UPDATE public.instalacoes
  SET 
    data_agendamento = p_data,
    hora_agendamento = TRIM(p_hora),
    status = 'agendada',
    local_tipo = v_tipo_local,
    local_endereco = v_endereco_final,
    solicita_endereco_cliente = FALSE,
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET 
      data_agendamento = p_data,
      hora_agendamento = TRIM(p_hora),
      status_agendamento = 'agendado',
      updated_at = NOW()
    WHERE id = v_cliente_id;
  END IF;

  IF v_ja_estava_agendado THEN
    v_tipo_acao := 'Reagendamento';
  END IF;

  -- Registra no histórico funcional de atendimentos
  BEGIN
    INSERT INTO public.instalacoes_historico_atendimentos (
      instalacao_id,
      instalador_id,
      status_atendimento,
      motivo,
      observacoes
    ) VALUES (
      p_instalacao_id,
      COALESCE(v_instalador_id, v_caller_id),
      'agendada',
      v_tipo_acao,
      format('%s confirmado para %s às %s (%s: %s). Técnico: %s.',
        v_tipo_acao,
        to_char(p_data, 'DD/MM/YYYY'),
        TRIM(p_hora),
        CASE WHEN v_tipo_local = 'local_veiculo' THEN 'Local do Veículo' ELSE 'Oficina' END,
        v_endereco_final,
        COALESCE(v_instalador_nome, v_caller_nome, 'Técnico Responsável')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Notifica o CLIENTE (apenas 1 notificação atômica)
  IF v_cliente_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        destinatario_cliente_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        v_cliente_user_id,
        v_cliente_id,
        v_caller_id,
        COALESCE(v_instalador_nome, v_caller_nome, 'Técnico Instalador'),
        format('📅 Instalação %s: %s', CASE WHEN v_ja_estava_agendado THEN 'Reagendada' ELSE 'Agendada' END, COALESCE(v_placa, 'Veículo')),
        format('A instalação do seu rastreador no veículo %s foi %s para %s às %s (%s: %s).',
          COALESCE(v_placa, ''),
          CASE WHEN v_ja_estava_agendado THEN 'reagendada' ELSE 'agendada' END,
          to_char(p_data, 'DD/MM/YYYY'),
          TRIM(p_hora),
          CASE WHEN v_tipo_local = 'local_veiculo' THEN 'Local do Veículo' ELSE 'Oficina' END,
          COALESCE(v_endereco_final, 'Oficina Credenciada')
        ),
        'agendamento',
        '/login',
        v_placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Notifica imediatamente OPERADORES E ADMINISTRADORES para ciência total
  PERFORM public.notificar_equipe_operacao(
    v_caller_id,
    COALESCE(v_instalador_nome, v_caller_nome, 'Técnico Instalador'),
    format('📅 Instalação %s: %s', CASE WHEN v_ja_estava_agendado THEN 'Reagendada' ELSE 'Agendada' END, COALESCE(v_placa, 'Veículo')),
    format('O técnico %s definiu o agendamento do veículo %s (Cliente: %s) para %s às %s (%s: %s).',
      COALESCE(v_instalador_nome, v_caller_nome, 'Técnico'),
      COALESCE(v_placa, ''),
      COALESCE(v_cliente_nome, 'Cliente'),
      to_char(p_data, 'DD/MM/YYYY'),
      TRIM(p_hora),
      CASE WHEN v_tipo_local = 'local_veiculo' THEN 'Local do Veículo' ELSE 'Oficina' END,
      COALESCE(v_endereco_final, 'Oficina Credenciada')
    ),
    'agendamento',
    '/instalacao',
    v_placa,
    v_cliente_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Instalação do veículo %s agendada com sucesso para %s às %s.', COALESCE(v_placa, ''), to_char(p_data, 'DD/MM/YYYY'), TRIM(p_hora)),
    'instalacao_id', p_instalacao_id,
    'placa', v_placa,
    'data', p_data,
    'hora', TRIM(p_hora),
    'local_tipo', v_tipo_local,
    'local_endereco', v_endereco_final
  );
END;
$$;

-- 4. Atualização de instalador_solicitar_endereco_cliente com histórico e aviso à equipe
CREATE OR REPLACE FUNCTION public.instalador_solicitar_endereco_cliente(p_instalacao_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role TEXT;
  v_inst RECORD;
  v_instalador_nome TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role, nome INTO v_role, v_instalador_nome FROM public.profiles WHERE id = v_caller_id;

  SELECT 
    i.id, i.cliente_id, i.placa, i.instalador_id, i.status,
    c.user_id AS cliente_user_id, c.nome_razao_social
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id;

  IF v_inst.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada.');
  END IF;

  IF v_role = 'instalador' AND v_inst.instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Esta instalação pertence a outro profissional.');
  END IF;

  UPDATE public.instalacoes
  SET 
    solicita_endereco_cliente = TRUE,
    solicitado_endereco_em = NOW(),
    local_tipo = 'local_veiculo',
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- Registra no histórico funcional de atendimentos
  BEGIN
    INSERT INTO public.instalacoes_historico_atendimentos (
      instalacao_id,
      instalador_id,
      status_atendimento,
      motivo,
      observacoes
    ) VALUES (
      p_instalacao_id,
      v_caller_id,
      'solicitacao_endereco',
      'Solicitação de Endereço',
      format('Técnico %s solicitou o endereço de atendimento presencial ao cliente para o veículo %s.',
        COALESCE(v_instalador_nome, 'Técnico'),
        COALESCE(v_inst.placa, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Notifica o CLIENTE (apenas 1 notificação atômica)
  IF v_inst.cliente_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        destinatario_cliente_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        v_inst.cliente_user_id,
        v_inst.cliente_id,
        v_caller_id,
        COALESCE(v_instalador_nome, 'Técnico Instalador'),
        format('📍 Endereço Necessário: %s', COALESCE(v_inst.placa, 'Veículo')),
        format('O técnico precisa do endereço onde o veículo %s estará para realizar a instalação presencial. Acesse para informar.', COALESCE(v_inst.placa, '')),
        'agendamento',
        '/login',
        v_inst.placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Notifica imediatamente OPERADORES E ADMINISTRADORES
  PERFORM public.notificar_equipe_operacao(
    v_caller_id,
    COALESCE(v_instalador_nome, 'Técnico Instalador'),
    format('📍 Endereço Solicitado: %s', COALESCE(v_inst.placa, 'Veículo')),
    format('O técnico %s solicitou o endereço do veículo %s ao cliente %s para atendimento presencial.',
      COALESCE(v_instalador_nome, 'Técnico'),
      COALESCE(v_inst.placa, ''),
      COALESCE(v_inst.nome_razao_social, 'Cliente')
    ),
    'agendamento',
    '/instalacao',
    v_inst.placa,
    v_inst.cliente_id
  );

  RETURN jsonb_build_object('success', true, 'message', 'Solicitação de endereço enviada ao cliente com sucesso.');
END;
$$;

-- 5. Atualização de cliente_informar_endereco_instalacao com histórico e aviso à equipe
CREATE OR REPLACE FUNCTION public.cliente_informar_endereco_instalacao(
  p_instalacao_id UUID,
  p_endereco TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cliente_id UUID;
  v_instalador_id UUID;
  v_placa TEXT;
  v_cliente_nome TEXT;
  v_instalador_user_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado.');
  END IF;

  SELECT 
    i.cliente_id, 
    i.instalador_id, 
    i.placa, 
    c.nome_razao_social,
    i.instalador_id
  INTO 
    v_cliente_id, 
    v_instalador_id, 
    v_placa, 
    v_cliente_nome,
    v_instalador_user_id
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id
    AND (i.cliente_user_id = v_uid OR i.cliente_id = v_uid OR i.cliente_id IN (SELECT id FROM public.clientes WHERE user_id = v_uid));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada para este cliente.');
  END IF;

  UPDATE public.instalacoes
  SET 
    endereco_cliente_informado = TRIM(p_endereco),
    endereco_cliente_informado_em = NOW(),
    solicita_endereco_cliente = FALSE,
    local_endereco = TRIM(p_endereco),
    local_tipo = 'local_veiculo',
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- Registra no histórico funcional de atendimentos
  BEGIN
    INSERT INTO public.instalacoes_historico_atendimentos (
      instalacao_id,
      instalador_id,
      status_atendimento,
      motivo,
      observacoes
    ) VALUES (
      p_instalacao_id,
      v_instalador_id,
      'endereco_informado',
      'Endereço Informado pelo Cliente',
      format('Cliente %s informou o endereço de atendimento do veículo %s: %s.',
        COALESCE(v_cliente_nome, 'Cliente'),
        COALESCE(v_placa, ''),
        TRIM(p_endereco)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Notifica o INSTALADOR (apenas 1 notificação atômica)
  IF v_instalador_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        v_instalador_user_id,
        v_uid,
        COALESCE(v_cliente_nome, 'Cliente'),
        format('📍 Endereço Informado: %s', COALESCE(v_placa, 'Veículo')),
        format('O cliente %s informou o local para o veículo %s: %s. Disponível para agendamento presencial.',
          COALESCE(v_cliente_nome, ''),
          COALESCE(v_placa, ''),
          TRIM(p_endereco)
        ),
        'agendamento',
        '/instalacao',
        v_placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Notifica imediatamente OPERADORES E ADMINISTRADORES
  PERFORM public.notificar_equipe_operacao(
    v_uid,
    COALESCE(v_cliente_nome, 'Cliente'),
    format('📍 Endereço Informado: %s', COALESCE(v_placa, 'Veículo')),
    format('O cliente %s informou o local para atendimento do veículo %s: %s.',
      COALESCE(v_cliente_nome, 'Cliente'),
      COALESCE(v_placa, ''),
      TRIM(p_endereco)
    ),
    'agendamento',
    '/instalacao',
    v_placa,
    v_cliente_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Endereço registrado com sucesso. O instalador e a central de operações foram notificados.'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
