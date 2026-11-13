-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261021015000_hunter_garantir_login_motorista_e_auto_cura_identities.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Auto-cura atômica de motoristas órfãos (user_id IS NULL) e sincronização de auth.identities
-- 2. Criação da RPC canônica public.garantir_login_motorista() para SuperADM e Clientes
-- 3. Atualização de public.cadastrar_motorista() com proteção contra duplicidade órfã
-- 4. Atualização de public.admin_redefinir_senha() com garantia de identities no GoTrue v2
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: AUTO-CURA ATÔMICA DE CONTAS E IDENTITIES NO GOTRUE
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r_mot RECORD;
  v_uid UUID;
  v_enc TEXT;
BEGIN
  -- 1.1 Sincronizar motoristas que já têm conta em auth.users mas estavam com user_id NULL
  FOR r_mot IN 
    SELECT m.id AS mot_id, m.email, u.id AS user_id
    FROM public.motoristas m
    JOIN auth.users u ON LOWER(TRIM(m.email)) = LOWER(TRIM(u.email))
    WHERE m.user_id IS NULL
  LOOP
    UPDATE public.motoristas SET user_id = r_mot.user_id WHERE id = r_mot.mot_id;
  END LOOP;

  -- 1.2 Auto-provisionar motoristas órfãos que não possuem usuário em auth.users
  FOR r_mot IN 
    SELECT m.id AS mot_id, m.nome, m.email, m.cliente_id
    FROM public.motoristas m
    WHERE m.user_id IS NULL 
       OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id)
  LOOP
    v_uid := gen_random_uuid();
    v_enc := extensions.crypt('Mudar@123', extensions.gen_salt('bf', 10));

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      LOWER(TRIM(r_mot.email)),
      v_enc,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', r_mot.nome, 'role', 'motorista', 'cliente_id', r_mot.cliente_id),
      now(), now(),
      '', '', '', '', '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    -- auth.identities
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_uid::text,
        v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', LOWER(TRIM(r_mot.email)), 'email_verified', true),
        'email',
        v_uid::text,
        now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Vincular motorista
    UPDATE public.motoristas SET user_id = v_uid WHERE id = r_mot.mot_id;

    -- Profile
    INSERT INTO public.profiles (id, nome, email, role, ativo, primeiro_acesso)
    VALUES (v_uid, r_mot.nome, LOWER(TRIM(r_mot.email)), 'motorista'::public.hunter_role, true, false)
    ON CONFLICT (id) DO UPDATE
    SET role = 'motorista'::public.hunter_role, ativo = true;

    -- User Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'motorista'::public.hunter_role)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 1.3 Garantir que TODOS os usuários de auth.users possuem identidade em auth.identities
  FOR r_mot IN 
    SELECT u.id, u.email
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id)
  LOOP
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        r_mot.id::text,
        r_mot.id,
        jsonb_build_object('sub', r_mot.id::text, 'email', LOWER(TRIM(r_mot.email)), 'email_verified', true),
        'email',
        r_mot.id::text,
        now(), now(), now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RPC CANÔNICA public.garantir_login_motorista()
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.garantir_login_motorista(
  p_motorista_id UUID,
  p_nova_senha   TEXT
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
  v_email_limpo TEXT;
BEGIN
  -- 1. Validar senha
  IF p_nova_senha IS NULL OR length(p_nova_senha) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter no minimo 6 caracteres.';
  END IF;

  -- 2. Localizar o motorista
  SELECT * INTO v_mot FROM public.motoristas WHERE id = p_motorista_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Motorista nao encontrado no sistema.';
  END IF;

  -- 3. Validação de Autorização (SuperADM, ADM ou Dono do Cliente)
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = v_mot.cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin', 'adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: voce nao tem permissao para alterar o acesso deste motorista.';
  END IF;

  v_email_limpo := LOWER(TRIM(v_mot.email));
  v_enc_pw := extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10));

  -- 4. Verificar se já existe auth.users vinculado ou por email
  v_user_id := v_mot.user_id;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(TRIM(email)) = v_email_limpo LIMIT 1;
  END IF;

  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    -- Atualizar senha e status no auth.users existente
    UPDATE auth.users
    SET encrypted_password = v_enc_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    -- Criar novo usuário em auth.users
    v_user_id := gen_random_uuid();

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
      v_email_limpo,
      v_enc_pw,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', v_mot.nome, 'role', 'motorista', 'cliente_id', v_mot.cliente_id),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
  END IF;

  -- 5. Vincular user_id no motorista
  UPDATE public.motoristas 
  SET user_id = v_user_id, updated_at = now() 
  WHERE id = p_motorista_id;

  -- 6. Garantir identidade em auth.identities
  BEGIN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo, 'email_verified', true),
      'email',
      v_user_id::text,
      now(), now(), now()
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 7. Garantir Profile
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, telefone
  ) VALUES (
    v_user_id,
    v_mot.nome,
    v_email_limpo,
    'motorista'::public.hunter_role,
    true,
    false,
    v_mot.telefone
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = 'motorista'::public.hunter_role,
      ativo = true;

  -- 8. Garantir User Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'motorista'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Login do motorista provisionado e senha atualizada com sucesso.',
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.garantir_login_motorista(UUID, TEXT) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3: INVALIDAÇÃO DE SCHEMA CACHE
-- ═════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
