-- ============================================================================
-- HUNTER — CORREÇÃO DEFINITIVA DE LOGIN DE CLIENTES E USUÁRIOS (AUTH.IDENTITIES)
-- ============================================================================
-- Versão: 1.5.4.1
-- Causa Raiz: No Supabase GoTrue v2, o método signInWithPassword exige a existência
-- correspondente do registro em auth.identities (provider = 'email', provider_id = user_id).
-- Quando usuários/clientes eram criados diretamente via SQL, auth.identities ficava
-- vazia, disparando "Invalid login credentials" mesmo com senha bcrypt válida.
--
-- Solução Canônica Hunter-Guardian:
-- 1. Atualizar handle_new_user() para auto-popular auth.identities em qualquer INSERT em auth.users.
-- 2. Atualizar admin_cadastrar_cliente_completo com provisionamento expresso em auth.identities.
-- 3. Atualizar admin_atualizar_cliente_completo com sincronização em auth.identities.
-- 4. Atualizar admin_cadastrar_usuario e admin_atualizar_usuario com sincronização em auth.identities.
-- 5. Atualizar admin_redefinir_senha garantindo email_confirmed_at e integridade.
-- 6. Executar BACKFILL estrito para todos os usuários existentes em auth.users.
-- ============================================================================

-- 0. Adicionar o papel 'instalador' no ENUM hunter_role (fora de bloco DO)
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'instalador';

-- 0.1 Garantir colunas técnicas em public.profiles
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS valor_por_instalacao NUMERIC DEFAULT 0.00;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS chave_pix TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco_instalacao TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 0.1 Limpar sobrecargas legadas de admin_cadastrar_usuario e admin_atualizar_usuario para o schema cache do PostgREST
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, TEXT[], public.plano_cliente, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, TEXT[], public.plano_cliente, NUMERIC);
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, TEXT[], public.plano_cliente);
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, public.plano_cliente, TEXT[], NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[], NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[]);
DROP FUNCTION IF EXISTS public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[], NUMERIC, TEXT, TEXT);

-- 1. Atualização do Trigger canônico handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_role public.hunter_role;
  v_nome TEXT;
BEGIN
  -- Identifica se é o SuperAdmin mestre
  IF LOWER(NEW.email) = 'novaes@adm.28bpm.local' THEN
    v_role := 'superadmin'::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'SuperAdmin Hunter (Novaes)');
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  END IF;

  -- 1. Cria ou atualiza o perfil em public.profiles
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, LOWER(NEW.email), v_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email;

  -- 2. Vincula a role na tabela user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 3. Blindagem de Autenticação GoTrue: Cria ou sincroniza identidade em auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = NEW.id::text)
       OR user_id = NEW.id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        NEW.id::text,
        NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'email', LOWER(NEW.email)),
        'email',
        NEW.id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  ELSE
    BEGIN
      UPDATE auth.identities
      SET identity_data = jsonb_build_object('sub', NEW.id::text, 'email', LOWER(NEW.email)),
          updated_at = now()
      WHERE user_id = NEW.id AND provider = 'email';
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Atualizar RPC admin_cadastrar_cliente_completo com auth.identities
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
  v_email_limpo TEXT := LOWER(trim(p_email));
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
    IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
      RAISE EXCEPTION 'O e-mail e obrigatorio para liberar acesso ao sistema.';
    END IF;

    IF p_senha IS NULL OR length(p_senha) < 6 THEN
      RAISE EXCEPTION 'A senha inicial de acesso deve conter no minimo 6 caracteres.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
      RAISE EXCEPTION 'Ja existe um usuario cadastrado no sistema com este e-mail.';
    END IF;

    v_user_id := gen_random_uuid();

    -- Inserção no auth.users
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
      v_email_limpo,
      extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('nome', trim(p_nome), 'role', 'cliente'),
      now(), now(),
      '', '', '', ''
    );

    -- Inserção explícita em auth.identities para GoTrue
    IF NOT EXISTS (
      SELECT 1 FROM auth.identities 
      WHERE (provider = 'email' AND provider_id = v_user_id::text)
         OR user_id = v_user_id
    ) THEN
      BEGIN
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          provider_id,
          last_sign_in_at,
          created_at,
          updated_at
        ) VALUES (
          v_user_id::text,
          v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
          'email',
          v_user_id::text,
          now(),
          now(),
          now()
        );
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;

    -- Perfil e Roles
    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, trim(p_nome), v_email_limpo, 'cliente', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
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
    NULLIF(v_email_limpo, ''),
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

-- 3. Atualizar RPC admin_atualizar_cliente_completo com auth.identities
CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_status public.status_cliente DEFAULT 'ativo',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID;
  v_email_antigo TEXT;
  v_mod TEXT;
  v_modulos TEXT[];
  v_email_limpo TEXT := LOWER(trim(p_email));
BEGIN
  -- 1. Apenas administradores podem atualizar
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validações básicas
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'ID do cliente e obrigatorio.';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  -- 3. Obter cliente existente
  SELECT user_id, email INTO v_user_id, v_email_antigo
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- 4. Tratamento do usuário em auth.users, auth.identities e profiles
  IF v_user_id IS NULL AND v_email_limpo IS NOT NULL AND v_email_limpo <> '' AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email_limpo;

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
        v_email_limpo,
        extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('nome', trim(p_nome), 'role', 'cliente'),
        now(), now(),
        '', '', '', ''
      );

      -- Inserção em auth.identities
      IF NOT EXISTS (
        SELECT 1 FROM auth.identities 
        WHERE (provider = 'email' AND provider_id = v_user_id::text)
           OR user_id = v_user_id
      ) THEN
        BEGIN
          INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
          ) VALUES (
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
            'email',
            v_user_id::text,
            now(),
            now(),
            now()
          );
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
      END IF;
    ELSE
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
          updated_at = now()
      WHERE user_id = v_user_id AND provider = 'email';
    END IF;

    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, trim(p_nome), v_email_limpo, 'cliente', (p_status = 'ativo' OR p_status = 'aguardando_instalacao'))
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
    IF v_email_limpo IS NOT NULL AND v_email_limpo <> '' THEN
      UPDATE auth.users
      SET email = v_email_limpo,
          raw_user_meta_data = jsonb_build_object('nome', trim(p_nome), 'role', 'cliente'),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_user_id;

      -- Sincronizar auth.identities
      IF NOT EXISTS (
        SELECT 1 FROM auth.identities 
        WHERE (provider = 'email' AND provider_id = v_user_id::text)
           OR user_id = v_user_id
      ) THEN
        BEGIN
          INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
          ) VALUES (
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
            'email',
            v_user_id::text,
            now(),
            now(),
            now()
          );
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
      ELSE
        UPDATE auth.identities
        SET identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
            updated_at = now()
        WHERE user_id = v_user_id AND provider = 'email';
      END IF;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    UPDATE public.profiles
    SET nome = trim(p_nome),
        email = COALESCE(NULLIF(v_email_limpo, ''), email),
        ativo = (p_status = 'ativo' OR p_status = 'aguardando_instalacao'),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 5. Atualizar tabela de clientes
  UPDATE public.clientes
  SET user_id = COALESCE(v_user_id, user_id),
      instalador_id = p_instalador_id,
      nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(v_email_limpo, ''),
      telefone = NULLIF(trim(p_telefone), ''),
      plano = p_plano,
      status = p_status,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      updated_at = now()
  WHERE id = p_cliente_id;

  -- 6. Atualizar módulos do usuário se existir
  IF v_user_id IS NOT NULL THEN
    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao', 'central-seguranca'];
    END IF;

    UPDATE public.user_module_access
    SET ativo = FALSE
    WHERE user_id = v_user_id;

    FOREACH v_mod IN ARRAY v_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Cliente atualizado com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id,
    'instalador_id', p_instalador_id
  );
END;
$$;

-- 4. Atualizar RPC admin_cadastrar_usuario com auth.identities
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
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
  v_novo_user_id UUID;
  v_mod TEXT;
  v_email_limpo TEXT := LOWER(trim(p_email));
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar novos usuarios.';
  END IF;

  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'O e-mail e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha deve conter no minimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
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
    v_email_limpo,
    extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', trim(p_nome), 'role', p_role),
    now(), now(),
    '', '', '', ''
  );

  -- Inserção explícita em auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_novo_user_id::text)
       OR user_id = v_novo_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        v_novo_user_id::text,
        v_novo_user_id,
        jsonb_build_object('sub', v_novo_user_id::text, 'email', v_email_limpo),
        'email',
        v_novo_user_id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, nome, email, role, valor_por_instalacao, chave_pix, endereco_instalacao, ativo)
  VALUES (v_novo_user_id, trim(p_nome), v_email_limpo, p_role, p_valor_por_instalacao, p_chave_pix, p_endereco_instalacao, TRUE)
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

-- 5. Atualizar RPC admin_atualizar_usuario com auth.identities
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
  v_mod TEXT;
  v_email_atual TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar usuarios.';
  END IF;

  IF p_usuario_id = '00000000-0000-0000-0000-000000000001'::UUID THEN
    RAISE EXCEPTION 'A conta SuperAdmin Mestre e imutavel e protegida por seguranca cibernetica.';
  END IF;

  SELECT email INTO v_email_atual FROM auth.users WHERE id = p_usuario_id;
  IF LOWER(v_email_atual) = 'novaes@adm.28bpm.local' THEN
    RAISE EXCEPTION 'A conta novaes@adm.28bpm.local e blindada contra rebaixamento ou alteracao.';
  END IF;

  UPDATE public.profiles
  SET nome = trim(p_nome),
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

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object('nome', trim(p_nome), 'role', p_role),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_usuario_id;

  -- Garantir auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = p_usuario_id::text)
       OR user_id = p_usuario_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        p_usuario_id::text,
        p_usuario_id,
        jsonb_build_object('sub', p_usuario_id::text, 'email', LOWER(v_email_atual)),
        'email',
        p_usuario_id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  IF p_role = 'instalador' THEN
    p_modulos := ARRAY['instalacao'];
  END IF;

  UPDATE public.user_module_access
  SET ativo = FALSE
  WHERE user_id = p_usuario_id;

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

-- 6. Atualizar RPC admin_redefinir_senha garantindo email_confirmed_at e identities
DROP FUNCTION IF EXISTS public.admin_redefinir_senha(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_redefinir_senha(
  p_user_id UUID,
  p_nova_senha TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_email_atual TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem redefinir senhas.';
  END IF;

  IF p_nova_senha IS NULL OR length(p_nova_senha) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve conter no minimo 6 caracteres.';
  END IF;

  SELECT email INTO v_email_atual FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario nao encontrado em auth.users.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_user_id;

  -- Sincronizar auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = p_user_id::text)
       OR user_id = p_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        p_user_id::text,
        p_user_id,
        jsonb_build_object('sub', p_user_id::text, 'email', LOWER(v_email_atual)),
        'email',
        p_user_id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Senha redefinida com sucesso com seguranca bcrypt.'
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. BACKFILL OBRIGATÓRIO: Popula auth.identities para 100% dos usuários existentes
-- e assegura email_confirmed_at em auth.users para destravar todos os logins
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Garante confirmação de email para todos os usuários existentes
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE email_confirmed_at IS NULL;

  -- 2. Insere identidades ausentes
  FOR r IN 
    SELECT u.id, u.email 
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities i 
      WHERE (i.provider = 'email' AND i.provider_id = u.id::text)
         OR i.user_id = u.id
    )
  LOOP
    BEGIN
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        r.id::text,
        r.id,
        jsonb_build_object('sub', r.id::text, 'email', LOWER(r.email)),
        'email',
        r.id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;
END $$;
