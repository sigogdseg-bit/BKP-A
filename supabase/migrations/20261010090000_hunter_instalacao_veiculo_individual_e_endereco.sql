-- ==============================================================================
-- HUNTER: INSTALAÇÃO POR VEÍCULO INDIVIDUAL, ENDEREÇO DE ATENDIMENTO E NOTIFICAÇÃO
-- ==============================================================================

-- 1. Novas colunas em public.instalacoes para suportar local individual e solicitação de endereço
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS local_tipo TEXT NOT NULL DEFAULT 'oficina' CHECK (local_tipo IN ('oficina', 'domicilio', 'local_veiculo'));
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS local_endereco TEXT DEFAULT NULL;
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS solicita_endereco_cliente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS endereco_cliente_informado TEXT DEFAULT NULL;
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS endereco_cliente_informado_em TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS solicitado_endereco_em TIMESTAMPTZ DEFAULT NULL;

-- 2. RPC: Instalador solicita endereço de instalação ao cliente
CREATE OR REPLACE FUNCTION public.instalador_solicitar_endereco_cliente(
  p_instalacao_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_inst RECORD;
  v_cliente_user_id UUID;
  v_instalador_nome TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT, nome INTO v_role, v_instalador_nome FROM public.profiles WHERE id = v_caller_id;

  SELECT i.*, c.user_id as c_user_id, c.nome_razao_social
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  -- Validação de permissão: apenas o instalador atribuído ou adm/operador pode solicitar
  IF v_role NOT IN ('superadmin', 'adm', 'operador') AND v_inst.instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas o técnico responsável pode solicitar o endereço.');
  END IF;

  -- Atualiza a ordem
  UPDATE public.instalacoes
  SET 
    solicita_endereco_cliente = TRUE,
    solicitado_endereco_em = NOW(),
    local_tipo = 'local_veiculo',
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  v_cliente_user_id := v_inst.c_user_id;

  -- 3. Emissão de Notificação Imediata para o Cliente
  IF v_cliente_user_id IS NOT NULL THEN
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
      v_inst.cliente_id,
      v_caller_id,
      COALESCE(v_instalador_nome, 'Técnico Instalador'),
      '📍 Informe o Endereço de Instalação',
      'O instalador precisa do endereço onde o veículo ' || v_inst.placa || ' estará para realizar o atendimento presencial.',
      'agendamento',
      '/login',
      v_inst.placa
    );
  END IF;

  -- 4. Notificação para Administradores e Operadores (Acompanhamento em tempo real)
  INSERT INTO public.notificacoes_sistema (
    destinatario_user_id,
    remetente_user_id,
    remetente_nome,
    titulo,
    mensagem,
    tipo,
    url,
    placa
  )
  SELECT 
    p.id,
    v_caller_id,
    COALESCE(v_instalador_nome, 'Técnico Instalador'),
    '📍 Endereço Solicitado ao Cliente',
    'Técnico solicitou endereço de instalação para o veículo ' || v_inst.placa || ' (Cliente: ' || COALESCE(v_inst.nome_razao_social, 'Cliente') || ').',
    'agendamento',
    '/instalacao',
    v_inst.placa
  FROM public.profiles p
  WHERE p.role IN ('superadmin', 'adm', 'operador') AND p.id <> v_caller_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Solicitação de endereço enviada com sucesso ao cliente e registrada para a central.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_solicitar_endereco_cliente(UUID) TO authenticated;

-- 3. RPC: Cliente informa o endereço onde o veículo estará
CREATE OR REPLACE FUNCTION public.cliente_informar_endereco_instalacao(
  p_instalacao_id UUID,
  p_endereco TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_inst RECORD;
  v_cliente_nome TEXT;
  v_endereco_limpo TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  v_endereco_limpo := TRIM(p_endereco);
  IF v_endereco_limpo IS NULL OR LENGTH(v_endereco_limpo) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Por favor, informe o endereço completo para atendimento.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  SELECT i.*, c.user_id as c_user_id, c.nome_razao_social
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  -- Validação de permissão: o próprio cliente ou gestor
  IF v_role NOT IN ('superadmin', 'adm', 'operador') AND v_inst.c_user_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas o titular do veículo pode informar este endereço.');
  END IF;

  -- Atualiza a ordem
  UPDATE public.instalacoes
  SET 
    endereco_cliente_informado = v_endereco_limpo,
    local_endereco = v_endereco_limpo,
    local_tipo = 'local_veiculo',
    solicita_endereco_cliente = FALSE,
    endereco_cliente_informado_em = NOW(),
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  v_cliente_nome := COALESCE(v_inst.nome_razao_social, 'Cliente');

  -- 1. Notificação Imediata para o Instalador Técnico Responsável
  IF v_inst.instalador_id IS NOT NULL THEN
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
      v_inst.instalador_id,
      v_caller_id,
      v_cliente_nome,
      '📍 Endereço de Instalação Recebido',
      'O cliente informou o local para o veículo ' || v_inst.placa || ': ' || v_endereco_limpo || '. Agora você pode confirmar data e horário.',
      'agendamento',
      '/instalacao',
      v_inst.placa
    );
  END IF;

  -- 2. Notificação para Administradores e Operadores
  INSERT INTO public.notificacoes_sistema (
    destinatario_user_id,
    remetente_user_id,
    remetente_nome,
    titulo,
    mensagem,
    tipo,
    url,
    placa
  )
  SELECT 
    p.id,
    v_caller_id,
    v_cliente_nome,
    '📍 Endereço de Instalação Informado',
    v_cliente_nome || ' informou endereço para o veículo ' || v_inst.placa || ': ' || v_endereco_limpo || '.',
    'agendamento',
    '/instalacao',
    v_inst.placa
  FROM public.profiles p
  WHERE p.role IN ('superadmin', 'adm', 'operador') AND p.id <> v_caller_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Endereço registrado com sucesso! O instalador foi notificado imediatamente para realizar o agendamento.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_informar_endereco_instalacao(UUID, TEXT) TO authenticated;

-- 4. RPC: Obter todos os veículos e respectivas instalações do cliente (INDIVIDUALIZADOS)
CREATE OR REPLACE FUNCTION public.cliente_obter_meus_veiculos_instalacao(
  p_cliente_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_alvo_id UUID;
  v_role TEXT;
  v_cliente_id UUID;
  v_resultado JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  IF v_role IN ('superadmin', 'adm', 'operador') AND p_cliente_user_id IS NOT NULL THEN
    v_alvo_id := p_cliente_user_id;
  ELSE
    v_alvo_id := v_caller_id;
  END IF;

  -- Localiza cliente_id
  SELECT id INTO v_cliente_id FROM public.clientes WHERE user_id = v_alvo_id;
  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cadastro de cliente não encontrado.');
  END IF;

  -- Monta JSON com CADA veículo e sua respectiva ordem de instalação
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'instalacao_id', i.id,
      'veiculo_id', COALESCE(i.veiculo_id, v.id),
      'placa', COALESCE(i.placa, v.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, v.marca_modelo, 'A DEFINIR'),
      'modelo', COALESCE(i.modelo, v.marca_modelo, 'Veículo'),
      'ano', i.ano,
      'cor', COALESCE(i.cor, v.cor),
      'tipo_veiculo', COALESCE(i.tipo_veiculo, v.tipo_veiculo, 'carro'),
      'status_instalacao', COALESCE(i.status, 'nao_instalado'),
      'data_agendamento', i.data_agendamento,
      'hora_agendamento', i.hora_agendamento,
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', i.local_endereco,
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, FALSE),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'rastreador_imei', i.rastreador_imei,
      'instalador_id', i.instalador_id,
      'instalador_nome', COALESCE(p.nome, 'Técnico em Atribuição'),
      'instalador_telefone', p.telefone,
      'instalador_endereco', p.endereco_instalacao
    ) ORDER BY i.created_at ASC
  ), '[]'::JSONB)
  INTO v_resultado
  FROM public.instalacoes i
  LEFT JOIN public.veiculos v ON v.id = i.veiculo_id
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  WHERE i.cliente_id = v_cliente_id;

  RETURN jsonb_build_object(
    'success', true,
    'veiculos', v_resultado
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_obter_meus_veiculos_instalacao(UUID) TO authenticated;

-- 5. Atualizar RPC instalador_obter_minhas_demandas para retornar os novos campos
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
  v_total_a_receber NUMERIC(10,2) := 0.00;
  v_total_recebido NUMERIC(10,2) := 0.00;
  v_total_agendados_qtd INT := 0;
  v_total_a_agendar_qtd INT := 0;
  v_valor_previsto_agendados NUMERIC(10,2) := 0.00;
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

  -- 1. Coletar Ordens da tabela public.instalacoes com campos de local e endereco
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'instalador_id', i.instalador_id,
      'instalador_nome', COALESCE(p.nome, 'Instalador'),
      'instalador_chave_pix', p.chave_pix,
      'instalador_valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
      'instalador_valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador,
      'cliente_id', i.cliente_id,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_documento', c.documento,
      'cliente_telefone', c.telefone,
      'cliente_plano', c.plano,
      'cliente_tem_fidelidade', c.tem_fidelidade,
      'cliente_regra_horimetro', c.regra_horimetro,
      'veiculo_id', i.veiculo_id,
      'placa', COALESCE(i.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, 'A DEFINIR'),
      'modelo', COALESCE(i.modelo, 'Veículo do Cliente'),
      'ano', i.ano,
      'cor', i.cor,
      'tipo_veiculo', COALESCE(i.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'horimetro_inicial', COALESCE(i.horimetro_inicial, 0.00),
      'rastreador_id', i.rastreador_id,
      'rastreador_imei', COALESCE(i.rastreador_imei, 'PENDENTE'),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, 'J16 4G'),
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'com_bloqueador', COALESCE(i.com_bloqueador, FALSE),
      'tipo_bloqueador', i.tipo_bloqueador,
      'posicao_instalacao', i.posicao_instalacao,
      'posicao_rele', i.posicao_rele,
      'circuito_cortado', i.circuito_cortado,
      'status', i.status,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'valor_instalacao', COALESCE(i.valor_instalacao, 50.00),
      'status_pagamento', COALESCE(i.status_pagamento, 'pendente'),
      'pago_em', i.pago_em,
      'pago_por', i.pago_por,
      'comprovante_pagamento', i.comprovante_pagamento,
      'kit_determinado_em', i.kit_determinado_em,
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, FALSE),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', COALESCE(i.local_endereco, p.endereco_instalacao),
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, FALSE),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'foto_placa_url', i.foto_placa_url,
      'foto_rastreador_url', i.foto_rastreador_url,
      'foto_local_instalacao_url', i.foto_local_instalacao_url,
      'foto_bloqueador_url', i.foto_bloqueador_url,
      'fotos_instalacao', i.fotos_instalacao,
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
      'instalador_id', c.instalador_id,
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
  LEFT JOIN public.profiles p ON p.id = c.instalador_id
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Métricas Financeiras ESTRITAS: A RECEBER APENAS DE INSTALAÇÕES CONCLUÍDAS E PENDENTES DE PAGAMENTO!
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

-- 4. RPC: Definir agendamento individual com suporte a local (oficina ou local_veiculo) e notificações imediatas
CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento_instalacao(
  p_instalacao_id UUID,
  p_data DATE,
  p_hora TEXT,
  p_local_tipo TEXT DEFAULT 'oficina',
  p_local_endereco TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_instalador_id UUID;
  v_cliente_id UUID;
  v_cliente_user_id UUID;
  v_placa TEXT;
  v_instalador_nome TEXT;
  v_endereco_final TEXT;
  v_tipo_local TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  -- 1. Resgatar instalação alvo e dados do cliente
  SELECT 
    i.instalador_id, 
    i.cliente_id, 
    i.placa,
    c.user_id,
    p.nome,
    p.endereco_instalacao
  INTO 
    v_instalador_id, 
    v_cliente_id, 
    v_placa,
    v_cliente_user_id,
    v_instalador_nome,
    v_endereco_final
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, v_caller_id)
  WHERE i.id = p_instalacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada.';
  END IF;

  -- Se v_instalador_id estiver nulo, atribuir ao chamador
  IF v_instalador_id IS NULL THEN
    v_instalador_id := v_caller_id;
    UPDATE public.instalacoes SET instalador_id = v_caller_id WHERE id = p_instalacao_id;
  END IF;

  -- 2. Permissão: apenas instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuído ou administrador podem agendar esta instalação.';
  END IF;

  -- 3. Validações
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento é obrigatória.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horário do agendamento é obrigatório.';
  END IF;

  v_tipo_local := COALESCE(p_local_tipo, 'oficina');
  IF v_tipo_local = 'local_veiculo' THEN
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final);
  ELSE
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final, 'Oficina Credenciada');
  END IF;

  -- 4. Atualizar ESTRITAMENTE a ordem da instalação do veículo especificado
  UPDATE public.instalacoes
  SET 
    data_agendamento = p_data,
    hora_agendamento = trim(p_hora),
    local_tipo = v_tipo_local,
    local_endereco = v_endereco_final,
    solicita_endereco_cliente = FALSE,
    updated_at = now()
  WHERE id = p_instalacao_id;

  -- 5. Atualizar agendamento do cliente como referência geral
  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET 
      data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
    WHERE id = v_cliente_id;
  END IF;

  -- 6. Disparar notificação imediata para o Cliente no dispositivo
  IF v_cliente_user_id IS NOT NULL THEN
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
      COALESCE(v_instalador_nome, 'Técnico Instalador'),
      '📅 Instalação Agendada: ' || v_placa,
      'Instalação agendada para ' || to_char(p_data, 'DD/MM/YYYY') || ' às ' || trim(p_hora) || 'h. Local: ' || COALESCE(v_endereco_final, 'A combinar') || '.',
      'agendamento',
      '/login',
      v_placa
    );
  END IF;

  -- 7. Disparar notificação para Administradores e Operadores
  INSERT INTO public.notificacoes_sistema (
    destinatario_user_id,
    remetente_user_id,
    remetente_nome,
    titulo,
    mensagem,
    tipo,
    url,
    placa
  )
  SELECT 
    p.id,
    v_caller_id,
    COALESCE(v_instalador_nome, 'Técnico Instalador'),
    '📅 Veículo Agendado: ' || v_placa,
    'Instalação agendada para ' || to_char(p_data, 'DD/MM/YYYY') || ' às ' || trim(p_hora) || 'h por ' || COALESCE(v_instalador_nome, 'instalador') || '.',
    'agendamento',
    '/instalacao',
    v_placa
  FROM public.profiles p
  WHERE p.role IN ('superadmin', 'adm', 'operador') AND p.id <> v_caller_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Agendamento confirmado com sucesso para o veículo ' || v_placa || '!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento_instalacao(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- Invalidação canônica de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';

