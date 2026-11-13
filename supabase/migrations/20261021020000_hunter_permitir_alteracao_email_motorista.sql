-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261021020000_hunter_permitir_alteracao_email_motorista.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Permite alteração atômica do e-mail do motorista com sincronização
--    completa entre public.motoristas, auth.users, auth.identities e public.profiles.
-- 2. Atualiza a RPC public.garantir_login_motorista(UUID, TEXT, TEXT).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.garantir_login_motorista(
  p_motorista_id UUID,
  p_nova_senha   TEXT DEFAULT NULL,
  p_novo_email   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_mot         RECORD;
  v_user_id     UUID;
  v_enc_pw      TEXT;
  v_email_alvo  TEXT;
  v_email_antigo TEXT;
BEGIN
  -- 1. Localizar o motorista
  SELECT * INTO v_mot FROM public.motoristas WHERE id = p_motorista_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motorista não encontrado no sistema.';
  END IF;

  -- 2. Validação de Autorização (SuperADM, ADM ou Dono do Cliente)
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = v_mot.cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin', 'adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para alterar o acesso deste motorista.';
  END IF;

  v_email_antigo := LOWER(TRIM(v_mot.email));

  -- 3. Tratar e-mail alvo (atual ou novo)
  IF p_novo_email IS NOT NULL AND TRIM(p_novo_email) <> '' THEN
    v_email_alvo := LOWER(TRIM(p_novo_email));
    
    -- Validação de formato de e-mail
    IF v_email_alvo !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
      RAISE EXCEPTION 'O e-mail informado possui formato inválido.';
    END IF;

    -- Verificar se já existe outro motorista com esse novo e-mail
    IF EXISTS (
      SELECT 1 FROM public.motoristas 
      WHERE LOWER(TRIM(email)) = v_email_alvo AND id <> p_motorista_id
    ) THEN
      RAISE EXCEPTION 'Este e-mail já está em uso por outro motorista no sistema.';
    END IF;

    -- Verificar se já existe outro usuário em auth.users com esse novo e-mail
    IF EXISTS (
      SELECT 1 FROM auth.users 
      WHERE LOWER(TRIM(email)) = v_email_alvo 
        AND id <> COALESCE(v_mot.user_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ) THEN
      RAISE EXCEPTION 'Este e-mail já está vinculado a outra conta de usuário no sistema.';
    END IF;
  ELSE
    v_email_alvo := v_email_antigo;
  END IF;

  -- 4. Tratar criptografia de senha se informada
  IF p_nova_senha IS NOT NULL AND TRIM(p_nova_senha) <> '' THEN
    IF length(TRIM(p_nova_senha)) < 6 THEN
      RAISE EXCEPTION 'A nova senha deve ter no mínimo 6 caracteres.';
    END IF;
    v_enc_pw := extensions.crypt(TRIM(p_nova_senha), extensions.gen_salt('bf', 10));
  ELSE
    v_enc_pw := NULL;
  END IF;

  -- 5. Verificar se já existe auth.users vinculado ou por e-mail antigo/novo
  v_user_id := v_mot.user_id;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(TRIM(email)) IN (v_email_antigo, v_email_alvo) LIMIT 1;
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    -- Atualizar auth.users existente
    UPDATE auth.users
    SET email = v_email_alvo,
        encrypted_password = COALESCE(v_enc_pw, encrypted_password),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Criar novo usuário em auth.users
    v_user_id := gen_random_uuid();
    IF v_enc_pw IS NULL THEN
      v_enc_pw := extensions.crypt('Mudar@123', extensions.gen_salt('bf', 10));
    END IF;

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email_alvo,
      v_enc_pw,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_mot.nome, 'role', 'motorista', 'cliente_id', v_mot.cliente_id),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
  END IF;

  -- 6. Atualizar public.motoristas (e-mail e user_id)
  UPDATE public.motoristas 
  SET email = v_email_alvo,
      user_id = v_user_id, 
      updated_at = now() 
  WHERE id = p_motorista_id;

  -- 7. Garantir identidade atualizada em auth.identities
  BEGIN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email_alvo, 'email_verified', true),
      'email',
      v_user_id::text,
      now(), now(), now()
    )
    ON CONFLICT (id) DO UPDATE
    SET identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email_alvo, 'email_verified', true),
        updated_at = now();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 8. Garantir Profile sincronizado
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, telefone
  ) VALUES (
    v_user_id,
    v_mot.nome,
    v_email_alvo,
    'motorista'::public.hunter_role,
    true,
    false,
    v_mot.telefone
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = v_email_alvo,
      role = 'motorista'::public.hunter_role,
      ativo = true;

  -- 9. Garantir User Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'motorista'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Dados de acesso do motorista atualizados com sucesso.',
    'user_id', v_user_id,
    'email', v_email_alvo
  );
END;
$$;

-- Garantir permissões canônicas da Data API
GRANT EXECUTE ON FUNCTION public.garantir_login_motorista(UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
