-- ============================================================================
-- HUNTER — AGENDAMENTO DE INSTALAÇÃO, ENDEREÇO DO TÉCNICO E VINCULAÇÃO
-- ============================================================================
-- Versão: 1.5.4.0
-- 1. Endereço do local de instalação no cadastro do instalador.
-- 2. Atribuição de instalador no cadastro/edição de clientes pelo administrador.
-- 3. Definição de dia e hora pelo instalador no seu módulo.
-- 4. Painel de status e agendamento para o cliente no login.
-- ============================================================================

-- 1. Coluna de endereço da oficina / ponto de instalação no perfil
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco_instalacao TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 2. Colunas de instalador e agendamento na tabela de clientes
DO $$ BEGIN
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS instalador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS data_agendamento DATE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS hora_agendamento TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_agendamento TEXT DEFAULT 'aguardando_agendamento';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_instalador ON public.clientes(instalador_id);
CREATE INDEX IF NOT EXISTS idx_clientes_agendamento ON public.clientes(status_agendamento);

-- 3. RPC para o instalador definir dia e hora do agendamento
CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento(
  p_cliente_id UUID,
  p_data DATE,
  p_hora TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_instalador_id UUID;
  v_cliente_nome TEXT;
BEGIN
  -- 1. Obter dados do cliente
  SELECT instalador_id, nome_razao_social INTO v_instalador_id, v_cliente_nome
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- 2. Verificar se o chamador é o instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuido ou administrador podem agendar este atendimento.';
  END IF;

  -- 3. Validar data e hora
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento e obrigatoria.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horario do agendamento e obrigatorio.';
  END IF;

  -- 4. Atualizar o agendamento
  UPDATE public.clientes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Agendamento confirmado para o cliente ' || v_cliente_nome || ' em ' || to_char(p_data, 'DD/MM/YYYY') || ' as ' || trim(p_hora) || '.',
    'cliente_id', p_cliente_id,
    'data', p_data,
    'hora', trim(p_hora)
  );
END;
$$;

-- 4. Atualizar RPC admin_cadastrar_cliente_completo com instalador_id
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
  p_km_inicial INT DEFAULT 0,
  p_instalador_id UUID DEFAULT NULL
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
  v_veiculo_id UUID;
  v_mod TEXT;
  v_modulos TEXT[];
BEGIN
  -- 1. Apenas administradores podem cadastrar
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

    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'cliente', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        role = 'cliente',
        ativo = TRUE,
        updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao', 'central-seguranca'];
    END IF;

    FOREACH v_mod IN ARRAY v_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 4. Inserção na tabela public.clientes vinculada ao v_user_id e ao instalador_id
  v_cliente_id := gen_random_uuid();
  INSERT INTO public.clientes (
    id,
    user_id,
    instalador_id,
    nome_razao_social,
    documento,
    email,
    telefone,
    plano,
    status,
    status_agendamento,
    dia_vencimento,
    valor_mensalidade,
    dias_historico_plano,
    dias_retencao_banco,
    created_at,
    updated_at
  ) VALUES (
    v_cliente_id,
    v_user_id,
    p_instalador_id,
    trim(p_nome),
    NULLIF(trim(p_documento), ''),
    NULLIF(LOWER(trim(p_email)), ''),
    NULLIF(trim(p_telefone), ''),
    p_plano,
    'aguardando_instalacao',
    'aguardando_agendamento',
    COALESCE(p_dia_vencimento, 10),
    COALESCE(p_valor_mensalidade, 79.90),
    COALESCE(p_dias_historico, 7),
    COALESCE(p_dias_retencao, 10),
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Cliente cadastrado com sucesso. Status: aguardando instalacao.',
    'cliente_id', v_cliente_id,
    'user_id', v_user_id,
    'instalador_id', p_instalador_id
  );
END;
$$;

-- 5. Atualizar RPC admin_atualizar_cliente_completo com instalador_id e agendamento
CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_status public.status_cliente DEFAULT 'ativo',
  p_plano public.plano_cliente DEFAULT 'basico',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_data_agendamento DATE DEFAULT NULL,
  p_hora_agendamento TEXT DEFAULT NULL,
  p_status_agendamento TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_mod TEXT;
  v_modulos TEXT[];
  v_email_antigo TEXT;
BEGIN
  -- 1. Apenas administradores podem atualizar clientes
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validações do cliente
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  -- 3. Obter dados atuais do cliente
  SELECT user_id, email INTO v_user_id, v_email_antigo
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- 4. Tratamento do usuário em auth.users e profiles
  IF v_user_id IS NULL AND p_email IS NOT NULL AND trim(p_email) <> '' AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email));

    IF v_user_id IS NULL THEN
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
    ELSE
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'cliente', (p_status = 'ativo' OR p_status = 'aguardando_instalacao'))
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        role = 'cliente',
        ativo = EXCLUDED.ativo,
        updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF v_user_id IS NOT NULL THEN
    IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
      UPDATE auth.users
      SET email = LOWER(trim(p_email)),
          raw_user_meta_data = jsonb_build_object('nome', p_nome, 'role', 'cliente'),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    UPDATE public.profiles
    SET nome = trim(p_nome),
        email = COALESCE(NULLIF(LOWER(trim(p_email)), ''), email),
        ativo = (p_status = 'ativo' OR p_status = 'aguardando_instalacao'),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao', 'central-seguranca'];
    END IF;

    DELETE FROM public.user_module_access WHERE user_id = v_user_id;
    FOREACH v_mod IN ARRAY v_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 5. Atualização atômica na tabela public.clientes
  UPDATE public.clientes
  SET user_id = COALESCE(v_user_id, clientes.user_id),
      instalador_id = COALESCE(p_instalador_id, clientes.instalador_id),
      nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(LOWER(trim(p_email)), ''),
      telefone = NULLIF(trim(p_telefone), ''),
      status = p_status,
      plano = p_plano,
      data_agendamento = COALESCE(p_data_agendamento, clientes.data_agendamento),
      hora_agendamento = COALESCE(p_hora_agendamento, clientes.hora_agendamento),
      status_agendamento = COALESCE(p_status_agendamento, clientes.status_agendamento),
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      updated_at = now()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Ficha do cliente e credenciais atualizadas com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id,
    'instalador_id', p_instalador_id
  );
END;
$$;

-- 6. Atualizar RPC admin_cadastrar_usuario e admin_atualizar_usuario para endereco_instalacao
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_email TEXT,
  p_senha TEXT,
  p_nome TEXT,
  p_role public.hunter_role,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_novo_user_id UUID;
  v_mod TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar novos usuarios.';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'O e-mail e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha deve conter no minimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario cadastrado com este e-mail.';
  END IF;

  v_novo_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_novo_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    LOWER(trim(p_email)),
    extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO public.profiles (id, nome, email, role, valor_por_instalacao, chave_pix, endereco_instalacao, ativo)
  VALUES (v_novo_user_id, p_nome, LOWER(trim(p_email)), p_role, p_valor_por_instalacao, p_chave_pix, p_endereco_instalacao, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      valor_por_instalacao = EXCLUDED.valor_por_instalacao,
      chave_pix = EXCLUDED.chave_pix,
      endereco_instalacao = EXCLUDED.endereco_instalacao,
      ativo = TRUE,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_novo_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF p_role = 'instalador' THEN
    p_modulos := ARRAY['instalacao'];
  END IF;

  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_novo_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario criado com sucesso.',
    'user_id', v_novo_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_usuario_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mod TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar usuarios.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_usuario_id AND email = 'novaes@adm.28bpm.local') THEN
    IF p_role <> 'superadmin' OR p_ativo = FALSE THEN
      RAISE EXCEPTION 'A conta SuperAdmin mestre e imutavel e blindada contra rebaixamento ou inativacao.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      valor_por_instalacao = p_valor_por_instalacao,
      chave_pix = p_chave_pix,
      endereco_instalacao = p_endereco_instalacao,
      updated_at = now()
  WHERE id = p_usuario_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_usuario_id, p_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  IF p_role = 'instalador' THEN
    p_modulos := ARRAY['instalacao'];
  END IF;

  DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_usuario_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario atualizado com sucesso.'
  );
END;
$$;

-- 7. Políticas de RLS para o cliente ler seu próprio cadastro com dados do instalador
DROP POLICY IF EXISTS "Clientes leem seus proprios dados de cliente" ON public.clientes;
CREATE POLICY "Clientes leem seus proprios dados de cliente"
ON public.clientes FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  user_id = auth.uid() OR
  instalador_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

-- Permissão para que clientes consultem o perfil público do instalador atribuído
DROP POLICY IF EXISTS "Clientes leem perfil do seu instalador" ON public.profiles;
CREATE POLICY "Clientes leem perfil do seu instalador"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  id = auth.uid() OR
  role = 'instalador' OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'instalador'))
);

-- 8. Ativação de Realtime no Banco de Dados para sincronização instantânea sem cache
ALTER TABLE public.clientes REPLICA IDENTITY FULL;
ALTER TABLE public.instalacoes REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

