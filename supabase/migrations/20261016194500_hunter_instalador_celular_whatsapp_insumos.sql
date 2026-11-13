-- ==============================================================================
-- Hunter — Migração Canônica: Telefone/Celular do Instalador para WhatsApp,
-- Notificações de Instalação e Edição de Insumos pelo Instalador
-- ==============================================================================

-- 1. Garantir colunas telefone e celular em public.profiles
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS celular TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Garantir sincronização mútua entre telefone e celular se um estiver preenchido
UPDATE public.profiles
SET telefone = COALESCE(telefone, celular),
    celular = COALESCE(celular, telefone)
WHERE telefone IS NOT NULL OR celular IS NOT NULL;

-- 3. Atualizar RPC admin_atualizar_usuario para receber e persistir p_telefone
DROP FUNCTION IF EXISTS public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[], NUMERIC, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[], NUMERIC, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_usuario_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_mod TEXT;
  v_email_atual TEXT;
  v_email_novo TEXT;
  v_role_atual public.hunter_role;
  v_telefone_limpo TEXT := NULLIF(trim(p_telefone), '');
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar usuarios.';
  END IF;

  SELECT email INTO v_email_atual FROM auth.users WHERE id = p_usuario_id;
  SELECT role INTO v_role_atual FROM public.profiles WHERE id = p_usuario_id;

  -- Blindagem canonica do SuperADM (novaes@adm.28bpm.local e novaes@oficial.tec.br):
  IF LOWER(COALESCE(v_email_atual, '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
     OR p_usuario_id = '00000000-0000-0000-0000-000000000001'::UUID 
     OR v_role_atual = 'superadmin' THEN
    
    UPDATE public.profiles
    SET nome = trim(p_nome),
        role = 'superadmin',
        ativo = TRUE,
        telefone = COALESCE(v_telefone_limpo, telefone),
        celular = COALESCE(v_telefone_limpo, celular),
        updated_at = now()
    WHERE id = p_usuario_id;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
          'nome', trim(p_nome), 
          'role', 'superadmin',
          'telefone', v_telefone_limpo
        ),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = p_usuario_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Perfil SuperADM atualizado com sucesso. Privilegios e governanca mantidos integralmente.'
    );
  END IF;

  -- Proibição absoluta: apenas os dois emails oficiais podem ser SuperADM
  IF p_role = 'superadmin' THEN
    RAISE EXCEPTION 'Apenas as contas oficiais de governanca (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.';
  END IF;

  -- Para outros usuarios: processa alteracao de e-mail se informada
  v_email_novo := LOWER(trim(COALESCE(p_email, v_email_atual)));
  IF v_email_novo IS NOT NULL AND v_email_novo <> '' AND v_email_novo <> LOWER(COALESCE(v_email_atual, '')) THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_novo AND id <> p_usuario_id) THEN
      RAISE EXCEPTION 'O e-mail informado ja esta em uso por outro usuario.';
    END IF;

    UPDATE auth.users
    SET email = v_email_novo,
        raw_user_meta_data = raw_user_meta_data || jsonb_build_object('email', v_email_novo),
        updated_at = now()
    WHERE id = p_usuario_id;

    UPDATE auth.identities
    SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_novo)),
        provider_id = v_email_novo
    WHERE user_id = p_usuario_id AND provider = 'email';
  END IF;

  UPDATE public.profiles
  SET nome = trim(p_nome),
      email = v_email_novo,
      role = p_role,
      ativo = p_ativo,
      valor_por_instalacao = p_valor_por_instalacao,
      chave_pix = p_chave_pix,
      endereco_instalacao = p_endereco_instalacao,
      telefone = COALESCE(v_telefone_limpo, telefone),
      celular = COALESCE(v_telefone_limpo, celular),
      updated_at = now()
  WHERE id = p_usuario_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_usuario_id, p_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
        'nome', trim(p_nome), 
        'role', p_role,
        'telefone', v_telefone_limpo
      ),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_usuario_id;

  -- Gestão granular de módulos de acesso
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
    'message', 'Usuario e dados de contato atualizados com sucesso.'
  );
END;
$$;

-- 4. Atualizar RPC admin_cadastrar_usuario para receber e persistir p_telefone
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, TEXT[], public.plano_cliente, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_cadastrar_usuario(TEXT, TEXT, TEXT, public.hunter_role, TEXT[], public.plano_cliente, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico',
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
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
  v_telefone_limpo TEXT := NULLIF(trim(p_telefone), '');
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
    jsonb_build_object('nome', trim(p_nome), 'role', p_role, 'telefone', v_telefone_limpo),
    now(), now(),
    '', '', '', ''
  );

  -- auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_novo_user_id::text)
       OR user_id = v_novo_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_novo_user_id::text, v_novo_user_id,
        jsonb_build_object('sub', v_novo_user_id::text, 'email', v_email_limpo),
        'email', v_novo_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (
    id, nome, email, role, valor_por_instalacao, chave_pix, endereco_instalacao, telefone, celular, ativo
  )
  VALUES (
    v_novo_user_id, trim(p_nome), v_email_limpo, p_role, p_valor_por_instalacao, p_chave_pix, p_endereco_instalacao, v_telefone_limpo, v_telefone_limpo, TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      valor_por_instalacao = EXCLUDED.valor_por_instalacao,
      chave_pix = EXCLUDED.chave_pix,
      endereco_instalacao = EXCLUDED.endereco_instalacao,
      telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
      celular = COALESCE(EXCLUDED.celular, public.profiles.celular),
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

GRANT EXECUTE ON FUNCTION public.admin_atualizar_usuario TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cadastrar_usuario TO authenticated;

-- Invalidação compulsória de cache PostgREST
NOTIFY pgrst, 'reload schema';
