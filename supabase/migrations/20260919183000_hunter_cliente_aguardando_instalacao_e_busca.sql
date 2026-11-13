-- ============================================================================
-- HUNTER — CLIENTE AGUARDANDO INSTALAÇÃO, ATIVAÇÃO AUTOMÁTICA E CHAVE PIX
-- ============================================================================
-- 1. Adiciona o status 'aguardando_instalacao' ao enum de status_cliente.
-- 2. Adiciona a coluna 'chave_pix' na tabela public.profiles para instaladores.
-- 3. Atualiza admin_cadastrar_usuario e admin_atualizar_usuario para suportar chave_pix.
-- 4. Clientes novos entram com status 'aguardando_instalacao' (veículo não é mais criado no cadastro de cliente).
-- 5. Permite a instaladores consultar a lista de clientes para vincular à instalação.
-- 6. Ao finalizar a instalação (status 'concluida'), o cliente é ativado ('ativo') e o veículo é associado.
-- ============================================================================

-- 1. Atualizar ENUM status_cliente
ALTER TYPE public.status_cliente ADD VALUE IF NOT EXISTS 'aguardando_instalacao';

-- 2. Adicionar coluna chave_pix em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chave_pix TEXT;

-- 3. Política de RLS: Permitir que instaladores consultem clientes para associar na instalação física
DROP POLICY IF EXISTS "Instaladores consultam clientes para instalacao" ON public.clientes;
CREATE POLICY "Instaladores consultam clientes para instalacao"
ON public.clientes FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'instalador')
);

-- 4. Atualizar função de cadastro unificado do cliente (sem exigir/cadastrar veículo antecipadamente)
CREATE OR REPLACE FUNCTION public.admin_cadastrar_cliente_completo(
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_criar_usuario BOOLEAN DEFAULT TRUE,
  p_senha TEXT DEFAULT NULL,
  p_placa TEXT DEFAULT NULL,
  p_marca_modelo TEXT DEFAULT NULL,
  p_km_inicial INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID := NULL;
  v_cliente_id UUID;
  v_mod TEXT;
  v_modulos TEXT[];
BEGIN
  -- 1. Apenas administradores podem cadastrar clientes
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validações básicas do cliente
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  -- 3. Criação de usuário em auth.users se solicitado
  IF p_criar_usuario THEN
    IF p_email IS NULL OR trim(p_email) = '' THEN
      RAISE EXCEPTION 'O e-mail e obrigatorio para liberar acesso ao sistema.';
    END IF;

    IF p_senha IS NULL OR length(p_senha) < 6 THEN
      RAISE EXCEPTION 'A senha inicial de acesso deve conter no minimo 6 caracteres.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
      RAISE EXCEPTION 'Ja existe um usuario cadastrado no sistema com este e-mail.';
    END IF;

    -- Cria o ID do usuário
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      LOWER(trim(p_email)),
      extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('nome', p_nome, 'role', 'cliente'),
      now(), now(),
      '', '', '', ''
    );

    -- Perfil de acesso do cliente
    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'cliente', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        role = 'cliente',
        ativo = TRUE,
        updated_at = now();

    -- Role em user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Define módulos conforme plano do cliente
    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    END IF;

    FOREACH v_mod IN ARRAY v_modulos
    LOOP
      INSERT INTO public.user_module_access (user_id, module_name)
      VALUES (v_user_id, v_mod)
      ON CONFLICT (user_id, module_name) DO NOTHING;
    END LOOP;
  END IF;

  -- 4. Criação do cliente com status 'aguardando_instalacao'
  -- O veículo será cadastrado pelo instalador na instalação física
  v_cliente_id := gen_random_uuid();
  INSERT INTO public.clientes (
    id,
    user_id,
    nome_razao_social,
    documento,
    email,
    telefone,
    plano,
    status,
    dia_vencimento,
    valor_mensalidade,
    dias_historico_plano,
    dias_retencao_banco,
    created_at,
    updated_at
  ) VALUES (
    v_cliente_id,
    v_user_id,
    trim(p_nome),
    NULLIF(trim(p_documento), ''),
    NULLIF(LOWER(trim(p_email)), ''),
    NULLIF(trim(p_telefone), ''),
    p_plano,
    'aguardando_instalacao',
    COALESCE(p_dia_vencimento, 10),
    COALESCE(p_valor_mensalidade, 79.90),
    COALESCE(p_dias_historico, 7),
    COALESCE(p_dias_retencao, 10),
    now(),
    now()
  );

  -- 5. Auditoria forense
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'CADASTRO_CLIENTE_UNIFICADO',
    format('Cliente %s cadastrado com sucesso. Status: aguardando_instalacao. Login: %s', p_nome, COALESCE(p_email, 'sem login'))
  );

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'cliente_id', v_cliente_id,
    'user_id', v_user_id,
    'email', p_email,
    'status', 'aguardando_instalacao'
  );
END;
$$;

-- 5. Atualizar salvar_atendimento_instalacao para ativar cliente na conclusão
CREATE OR REPLACE FUNCTION public.salvar_atendimento_instalacao(
  p_instalacao_id UUID DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL,
  p_placa TEXT DEFAULT NULL,
  p_marca TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_km_instalacao INT DEFAULT 0,
  p_rastreador_imei TEXT DEFAULT NULL,
  p_rastreador_modelo TEXT DEFAULT 'J16 4G',
  p_chip_iccid TEXT DEFAULT NULL,
  p_chip_operadora TEXT DEFAULT NULL,
  p_posicao_instalacao TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'nao_instalado',
  p_motivo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_instalador_id UUID;
  v_instalacao_id UUID;
  v_veiculo_id UUID := NULL;
  v_placa_limpa TEXT;
  v_valor_unitario NUMERIC(10,2) := 0.00;
  v_concluida_at TIMESTAMPTZ := NULL;
  v_status_valido BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  -- Validação de status
  IF p_status NOT IN ('nao_instalado', 'concluida_com_pendencia', 'concluida') THEN
    RAISE EXCEPTION 'Status de instalação inválido: %', p_status;
  END IF;

  -- Se for 'nao_instalado' ou 'concluida_com_pendencia', motivo é estritamente obrigatório
  IF p_status IN ('nao_instalado', 'concluida_com_pendencia') AND (p_motivo IS NULL OR trim(p_motivo) = '') THEN
    RAISE EXCEPTION 'É obrigatório informar o motivo para status de pendência ou não instalado.';
  END IF;

  v_placa_limpa := UPPER(trim(p_placa));

  IF p_instalacao_id IS NULL THEN
    -- Nova Ordem de Instalação
    v_instalador_id := v_user_id;

    -- Obter o valor da instalação configurado no cadastro do instalador
    SELECT COALESCE(valor_por_instalacao, 0.00) INTO v_valor_unitario
    FROM public.profiles
    WHERE id = v_instalador_id;

    IF p_status = 'concluida' THEN
      v_concluida_at := NOW();
    END IF;

    INSERT INTO public.instalacoes (
      instalador_id,
      cliente_id,
      placa,
      marca,
      modelo,
      ano,
      cor,
      km_instalacao,
      rastreador_imei,
      rastreador_modelo,
      chip_iccid,
      chip_operadora,
      posicao_instalacao,
      status,
      motivo_pendencia_recusa,
      observacoes,
      valor_instalacao,
      concluida_at
    ) VALUES (
      v_instalador_id,
      p_cliente_id,
      v_placa_limpa,
      p_marca,
      p_modelo,
      p_ano,
      p_cor,
      p_km_instalacao,
      p_rastreador_imei,
      p_rastreador_modelo,
      p_chip_iccid,
      p_chip_operadora,
      p_posicao_instalacao,
      p_status,
      p_motivo,
      p_observacoes,
      v_valor_unitario,
      v_concluida_at
    ) RETURNING id INTO v_instalacao_id;

  ELSE
    -- Atualização / Reabertura de instalação existente
    v_instalacao_id := p_instalacao_id;

    SELECT instalador_id, concluida_at, veiculo_id
    INTO v_instalador_id, v_concluida_at, v_veiculo_id
    FROM public.instalacoes
    WHERE id = v_instalacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instalação não encontrada.';
    END IF;

    IF p_status = 'concluida' AND v_concluida_at IS NULL THEN
      v_concluida_at := NOW();
    END IF;

    UPDATE public.instalacoes
    SET
      cliente_id = COALESCE(p_cliente_id, cliente_id),
      placa = COALESCE(v_placa_limpa, placa),
      marca = COALESCE(p_marca, marca),
      modelo = COALESCE(p_modelo, modelo),
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      km_instalacao = COALESCE(p_km_instalacao, km_instalacao),
      rastreador_imei = COALESCE(p_rastreador_imei, rastreador_imei),
      rastreador_modelo = COALESCE(p_rastreador_modelo, rastreador_modelo),
      chip_iccid = COALESCE(p_chip_iccid, chip_iccid),
      chip_operadora = COALESCE(p_chip_operadora, chip_operadora),
      posicao_instalacao = COALESCE(p_posicao_instalacao, posicao_instalacao),
      status = p_status,
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      concluida_at = v_concluida_at,
      updated_at = NOW()
    WHERE id = v_instalacao_id;
  END IF;

  -- Grava o registro histórico imutável na timeline de atendimentos
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_instalacao_id,
    v_user_id,
    p_status,
    p_motivo,
    p_observacoes,
    p_km_instalacao
  );

  -- Se a instalação for concluída com sucesso:
  -- 1. Cadastra ou vincula o veículo na frota
  -- 2. Ativa o cliente associado (que estava 'aguardando_instalacao')
  IF p_status = 'concluida' THEN
    -- Verifica se o veículo já existe por placa
    SELECT id INTO v_veiculo_id
    FROM public.veiculos
    WHERE placa = v_placa_limpa
    LIMIT 1;

    IF v_veiculo_id IS NULL THEN
      -- Cadastra o novo veículo associado ao cliente
      INSERT INTO public.veiculos (
        cliente_id,
        placa,
        marca_modelo,
        ano,
        cor,
        odometro_km,
        status_operacional,
        rastreador_imei
      ) VALUES (
        p_cliente_id,
        v_placa_limpa,
        format('%s %s', p_marca, p_modelo),
        p_ano,
        p_cor,
        p_km_instalacao,
        'estacionado',
        p_rastreador_imei
      ) RETURNING id INTO v_veiculo_id;

      -- Inicializa manutenção preventiva
      PERFORM public.inicializar_itens_manutencao_veiculo(v_veiculo_id, p_km_instalacao);
    ELSE
      -- Atualiza veículo existente
      UPDATE public.veiculos
      SET
        cliente_id = COALESCE(p_cliente_id, cliente_id),
        odometro_km = GREATEST(odometro_km, p_km_instalacao),
        rastreador_imei = COALESCE(p_rastreador_imei, rastreador_imei),
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;

    -- Vincula o veiculo_id na ordem de instalação
    UPDATE public.instalacoes
    SET veiculo_id = v_veiculo_id
    WHERE id = v_instalacao_id;

    -- Ativa o cliente associado que estava com status 'aguardando_instalacao'
    IF p_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET status = 'ativo', updated_at = NOW()
      WHERE id = p_cliente_id AND status = 'aguardando_instalacao';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'instalacao_id', v_instalacao_id,
    'status', p_status,
    'veiculo_id', v_veiculo_id
  );
END;
$$;

-- 6. Atualizar admin_cadastrar_usuario para salvar chave_pix
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico',
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID;
  v_mod TEXT;
  v_modulos_finais TEXT[];
  v_modulos_todos TEXT[] := ARRAY[
    'monitor-gps', 'atendimento', 'clientes', 'mensalidades',
    'rastreadores', 'central-seguranca', 'logs', 'dispositivos',
    'manutencao', 'usuarios', 'instalacao'
  ];
BEGIN
  -- 1. Apenas administradores podem cadastrar
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem cadastrar usuarios.';
  END IF;

  -- 2. SuperAdmin Mestre tem e-mail reservado
  IF LOWER(trim(p_email)) = 'novaes@adm.28bpm.local' AND p_role <> 'superadmin' THEN
    RAISE EXCEPTION 'O e-mail novaes@adm.28bpm.local e reservado exclusivamente para a conta SuperAdmin Mestre.';
  END IF;

  -- 3. Módulos por perfil
  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSIF p_role = 'instalador' THEN
    v_modulos_finais := ARRAY['instalacao'];
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  -- 4. Cria conta em auth.users
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    LOWER(trim(p_email)),
    crypt(p_senha, gen_salt('bf', 10)),
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(), now(), '', '', '', ''
  );

  -- 5. Atualiza ou insere perfil em public.profiles com valor_por_instalacao e chave_pix
  INSERT INTO public.profiles (id, nome, email, role, ativo, valor_por_instalacao, chave_pix)
  VALUES (
    v_user_id,
    p_nome,
    LOWER(trim(p_email)),
    p_role,
    TRUE,
    COALESCE(p_valor_por_instalacao, 0.00),
    NULLIF(trim(p_chave_pix), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      valor_por_instalacao = COALESCE(EXCLUDED.valor_por_instalacao, public.profiles.valor_por_instalacao),
      chave_pix = COALESCE(EXCLUDED.chave_pix, public.profiles.chave_pix),
      ativo = TRUE,
      updated_at = now();

  -- 6. Registra role em public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Atribui módulos permitidos
  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 8. Registro de auditoria forense
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    'USUARIO_CRIADO',
    format('Usuario %s (%s) criado com role %s por %s. PIX: %s', p_nome, p_email, p_role, v_caller_id, COALESCE(p_chave_pix, 'Nao informada'))
  );

  RETURN jsonb_build_object('success', true, 'message', 'Usuario cadastrado com sucesso!', 'user_id', v_user_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 7. Atualizar admin_atualizar_usuario para salvar chave_pix
CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_user_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT NULL,
  p_valor_por_instalacao NUMERIC DEFAULT NULL,
  p_chave_pix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mod TEXT;
  v_modulos_finais TEXT[];
  v_modulos_todos TEXT[] := ARRAY[
    'monitor-gps', 'atendimento', 'clientes', 'mensalidades',
    'rastreadores', 'central-seguranca', 'logs', 'dispositivos',
    'manutencao', 'usuarios', 'instalacao'
  ];
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerenciar usuarios.';
  END IF;

  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSIF p_role = 'instalador' THEN
    v_modulos_finais := ARRAY['instalacao'];
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      valor_por_instalacao = COALESCE(p_valor_por_instalacao, valor_por_instalacao),
      chave_pix = COALESCE(p_chave_pix, chave_pix),
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role <> p_role;

  UPDATE public.user_module_access
  SET ativo = FALSE
  WHERE user_id = p_user_id;

  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    'USUARIO_ATUALIZADO',
    format('Usuario %s atualizado por %s', p_user_id, v_caller_id)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Usuario atualizado com sucesso!');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 8. RPC Administrativa para Quitar em Lote todas as instalações pendentes de um instalador
CREATE OR REPLACE FUNCTION public.marcar_pagamento_lote_instalador(
  p_instalador_id UUID,
  p_comprovante TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_qtd INT;
  v_total NUMERIC(10,2);
BEGIN
  v_user_id := auth.uid();
  IF NOT (
    public.is_admin_or_superadmin(v_user_id) OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'operador')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem registrar pagamento.';
  END IF;

  -- Contabiliza e atualiza todas as ordens pendentes
  SELECT COUNT(*), COALESCE(SUM(valor_instalacao), 0.00)
  INTO v_qtd, v_total
  FROM public.instalacoes
  WHERE instalador_id = p_instalador_id AND status_pagamento = 'pendente';

  IF v_qtd = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'message', 'Não há instalações pendentes para este instalador.');
  END IF;

  UPDATE public.instalacoes
  SET status_pagamento = 'pago',
      pago_em = NOW(),
      pago_por = v_user_id,
      comprovante_pagamento = COALESCE(p_comprovante, comprovante_pagamento),
      updated_at = NOW()
  WHERE instalador_id = p_instalador_id AND status_pagamento = 'pendente';

  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_user_id,
    'REPASSE_INSTALACOES_LOTE_PAGO',
    format('Repasse em lote de %s instalações do instalador %s quitado. Total: R$ %s', v_qtd, p_instalador_id, v_total)
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'instalador_id', p_instalador_id,
    'total_quitadas', v_qtd,
    'valor_total', v_total
  );
END;
$$;
