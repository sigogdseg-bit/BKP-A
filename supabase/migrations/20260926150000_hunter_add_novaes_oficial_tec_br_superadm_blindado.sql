-- Migration: 20260926150000_hunter_add_novaes_oficial_tec_br_superadm_blindado.sql
-- Objetivo: Incluir novaes@oficial.tec.br como conta SuperADM blindada idêntica e intercambiável com novaes@adm.28bpm.local

-- 1. Atualizar Trigger de Blindagem contra Mutação e Exclusão do SuperADM
CREATE OR REPLACE FUNCTION public.bloquear_mutacao_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF LOWER(OLD.email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    IF (TG_OP = 'DELETE') THEN
      RAISE EXCEPTION 'A conta SuperADM e imutavel e nao pode ser excluida.';
    ELSIF (TG_OP = 'UPDATE') THEN
      IF NEW.email <> OLD.email OR NEW.role <> 'superadmin' OR NEW.ativo = FALSE THEN
        RAISE EXCEPTION 'A conta SuperADM nao pode ter seu email, role ou status alterados.';
      END IF;
    END IF;
  ELSE
    -- Nenhuma outra conta pode receber a role de superadmin
    IF (TG_OP = 'UPDATE') THEN
      IF NEW.role = 'superadmin' THEN
        RAISE EXCEPTION 'Apenas os 2 e-mails oficiais de governanca (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.';
      END IF;
    END IF;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacao_superadmin ON public.profiles;
CREATE TRIGGER trg_bloquear_mutacao_superadmin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_superadmin();

-- 2. Atualizar Autoprovisionamento de Perfis (handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.hunter_role;
  v_nome TEXT;
BEGIN
  IF LOWER(NEW.email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    v_role := 'superadmin'::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'SuperADM Novaes');
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  END IF;

  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, LOWER(NEW.email), v_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = CASE WHEN LOWER(EXCLUDED.email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN 'superadmin'::public.hunter_role ELSE public.profiles.role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  -- Se for uma das contas SuperADM, concede todos os módulos de governança
  IF v_role = 'superadmin' THEN
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT NEW.id, m, TRUE
    FROM unnest(ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'rastreadores', 'dispositivos', 
      'instalacao', 'manutencao', 'mensalidades', 'financeiro', 'estoque', 
      'whatsapp', 'temas', 'usuarios'
    ]) AS m
    ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Atualizar RPC admin_cadastrar_usuario (Somente os 2 emails podem ser SuperADM)
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

  IF p_role = 'superadmin' AND v_email_limpo NOT IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    RAISE EXCEPTION 'Apenas as contas oficiais de governanca (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.';
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

  INSERT INTO public.profiles (id, nome, email, role, valor_por_instalacao, chave_pix, endereco_instalacao, ativo)
  VALUES (
    v_novo_user_id,
    trim(p_nome),
    v_email_limpo,
    p_role,
    p_valor_por_instalacao,
    p_chave_pix,
    p_endereco_instalacao,
    TRUE
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_novo_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF p_role = 'superadmin' OR p_role = 'adm' THEN
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT v_novo_user_id, m, TRUE
    FROM unnest(ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'rastreadores', 'dispositivos', 
      'instalacao', 'manutencao', 'mensalidades', 'financeiro', 'estoque', 
      'whatsapp', 'temas', 'usuarios'
    ]) AS m
    ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
  ELSIF p_role = 'instalador' THEN
    INSERT INTO public.user_module_access (user_id, module, ativo)
    VALUES (v_novo_user_id, 'instalacao', TRUE)
    ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
  ELSIF p_modulos IS NOT NULL AND array_length(p_modulos, 1) > 0 THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_novo_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario cadastrado com sucesso.',
    'user_id', v_novo_user_id
  );
END;
$$;

-- 4. Atualizar RPC admin_atualizar_usuario com ambos os emails blindados
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
  p_email TEXT DEFAULT NULL
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
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar usuarios.';
  END IF;

  SELECT email INTO v_email_atual FROM auth.users WHERE id = p_usuario_id;
  SELECT role INTO v_role_atual FROM public.profiles WHERE id = p_usuario_id;

  -- Blindagem das contas SuperADM (novaes@adm.28bpm.local e novaes@oficial.tec.br):
  IF LOWER(COALESCE(v_email_atual, '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') 
     OR p_usuario_id = '00000000-0000-0000-0000-000000000001'::UUID 
     OR v_role_atual = 'superadmin' THEN
    
    UPDATE public.profiles
    SET nome = trim(p_nome),
        role = 'superadmin',
        ativo = TRUE,
        updated_at = now()
    WHERE id = p_usuario_id;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'role', 'superadmin'),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = p_usuario_id;

    DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, m, TRUE
    FROM unnest(ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'rastreadores', 'dispositivos', 
      'instalacao', 'manutencao', 'mensalidades', 'financeiro', 'estoque', 
      'whatsapp', 'temas', 'usuarios'
    ]) AS m;

    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'Perfil SuperADM atualizado com sucesso. Privilégios e governança mantidos integralmente.'
    );
  END IF;

  -- Proibição absoluta: apenas as duas contas de governança podem ser SuperADM
  IF p_role = 'superadmin' THEN
    RAISE EXCEPTION 'Apenas as contas oficiais de governança (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.';
  END IF;

  v_email_novo := LOWER(trim(COALESCE(p_email, v_email_atual)));
  IF v_email_novo IS NOT NULL AND v_email_novo <> '' AND v_email_novo <> LOWER(COALESCE(v_email_atual, '')) THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_novo AND id <> p_usuario_id) THEN
      RAISE EXCEPTION 'O e-mail informado já está em uso por outro usuário.';
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

  DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
  IF p_role = 'superadmin' OR p_role = 'adm' THEN
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, m, TRUE
    FROM unnest(ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'rastreadores', 'dispositivos', 
      'instalacao', 'manutencao', 'mensalidades', 'financeiro', 'estoque', 
      'whatsapp', 'temas', 'usuarios'
    ]) AS m;
  ELSIF p_role = 'instalador' THEN
    INSERT INTO public.user_module_access (user_id, module, ativo)
    VALUES (p_usuario_id, 'instalacao', TRUE);
  ELSIF p_modulos IS NOT NULL AND array_length(p_modulos, 1) > 0 THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_usuario_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'message', 'Usuário e acessos atualizados com sucesso.');
END;
$$;

-- 4. Atualizar RPC admin_excluir_usuario
CREATE OR REPLACE FUNCTION public.admin_excluir_usuario(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_email TEXT;
  v_nome TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuários.';
  END IF;

  SELECT email, nome INTO v_user_email, v_nome FROM public.profiles WHERE id = p_user_id;

  IF LOWER(v_user_email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') OR p_user_id = '00000000-0000-0000-0000-000000000001'::UUID THEN
    RAISE EXCEPTION 'A conta SuperADM é protegida por segurança cibernética e não pode ser excluída.';
  END IF;

  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', TRUE, 'message', 'Usuário excluído com sucesso.');
END;
$$;

-- 5. Atualizar Blindagem de Privacidade SuperADM
CREATE OR REPLACE FUNCTION public.fn_blindar_privacidade_superadm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_is_superadm BOOLEAN := FALSE;
    v_is_cliente_titular BOOLEAN := FALSE;
    v_cliente_user_id UUID;
BEGIN
    IF NOT (OLD.privacidade_localizacao = TRUE AND NEW.privacidade_localizacao = FALSE) THEN
        RETURN NEW;
    END IF;

    v_user_id := auth.uid();
    v_user_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

    IF v_user_email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
        v_is_superadm := TRUE;
    ELSE
        SELECT (role = 'superadmin') INTO v_is_superadm
        FROM public.profiles
        WHERE id = v_user_id;
    END IF;

    IF COALESCE(v_is_superadm, FALSE) THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'clientes' THEN
        IF OLD.user_id IS NOT NULL AND OLD.user_id = v_user_id THEN
            v_is_cliente_titular := TRUE;
        END IF;
    ELSIF TG_TABLE_NAME = 'veiculos' THEN
        IF OLD.cliente_id IS NOT NULL THEN
            SELECT user_id INTO v_cliente_user_id
            FROM public.clientes
            WHERE id = OLD.cliente_id;

            IF v_cliente_user_id IS NOT NULL AND v_cliente_user_id = v_user_id THEN
                v_is_cliente_titular := TRUE;
            END IF;
        END IF;
    END IF;

    IF COALESCE(v_is_cliente_titular, FALSE) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Acesso Negado: Apenas o SuperADM ou o Cliente titular possuem autorização para desmarcar a privacidade de localização do veículo.'
        USING ERRCODE = '42501';

    RETURN NEW;
END;
$$;

-- 6. Atualizar Função is_adm()
CREATE OR REPLACE FUNCTION public.is_adm()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND (role IN ('superadmin', 'adm') OR email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
      AND ativo = TRUE
  )
  OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'));
$$;

-- 7. Promover conta novaes@oficial.tec.br se já existir
DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE LOWER(email) = 'novaes@oficial.tec.br';
  IF v_uid IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'superadmin',
        ativo = TRUE,
        updated_at = now()
    WHERE id = v_uid;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'superadmin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'superadmin';

    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT v_uid, m, TRUE
    FROM unnest(ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'rastreadores', 'dispositivos', 
      'instalacao', 'manutencao', 'mensalidades', 'financeiro', 'estoque', 
      'whatsapp', 'temas', 'usuarios'
    ]) AS m
    ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;

    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'superadmin'),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_uid;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
