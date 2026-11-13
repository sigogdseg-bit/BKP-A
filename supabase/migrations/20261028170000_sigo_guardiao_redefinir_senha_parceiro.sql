-- ==============================================================================
-- SIGO Guardião — Módulo Comercial: Redefinição de Senha de Revendedor e Vendedor
-- Força primeiro_acesso = TRUE no Profile para Troca Obrigatória no Primeiro Acesso
-- Migration: 20261028170000_sigo_guardiao_redefinir_senha_parceiro.sql
-- ==============================================================================

-- 1. Atualizar RPC admin_redefinir_senha para SEMPRE marcar primeiro_acesso = TRUE
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

  -- 1.1 Atualizar senha no auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = p_user_id;

  -- 1.2 Sincronizar auth.identities
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

  -- 1.3 Forçar troca obrigatória no 1º acesso
  UPDATE public.profiles
  SET primeiro_acesso = TRUE,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Senha redefinida com sucesso. O usuario devera alterar a senha no primeiro acesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_redefinir_senha(UUID, TEXT) TO authenticated, service_role;

-- 2. RPC canônica para redefinir senha de Revendedor ou Vendedor
CREATE OR REPLACE FUNCTION public.redefinir_senha_parceiro(
  p_tipo TEXT,
  p_id UUID,
  p_nova_senha TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID;
  v_email TEXT;
  v_nome TEXT;
  v_telefone TEXT;
  v_cpf_cnpj TEXT;
  v_chave_pix TEXT;
  v_encrypted_pw TEXT;
  v_is_adm BOOLEAN := public.is_adm();
  v_rev_user_id UUID;
BEGIN
  -- 2.1 Validação de Senha
  IF p_nova_senha IS NULL OR length(p_nova_senha) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve ter no minimo 6 caracteres.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10));

  -- 2.2 Localização e Validação de Permissão Conforme o Tipo
  IF p_tipo = 'revendedor' THEN
    IF NOT v_is_adm THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores podem redefinir a senha de revendedores.';
    END IF;

    SELECT user_id, email, nome, telefone, documento, chave_pix
    INTO v_user_id, v_email, v_nome, v_telefone, v_cpf_cnpj, v_chave_pix
    FROM public.revendedores
    WHERE id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Revendedor nao encontrado.';
    END IF;

  ELSIF p_tipo = 'vendedor' THEN
    SELECT v.user_id, v.email, v.nome, v.telefone, v.documento, v.chave_pix, r.user_id
    INTO v_user_id, v_email, v_nome, v_telefone, v_cpf_cnpj, v_chave_pix, v_rev_user_id
    FROM public.vendedores v
    JOIN public.revendedores r ON r.id = v.revendedor_id
    WHERE v.id = p_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendedor nao encontrado.';
    END IF;

    -- Permissão: SuperADM/Adm OU o revendedor responsável pelo vendedor
    IF NOT v_is_adm AND (v_caller_id IS NULL OR v_rev_user_id <> v_caller_id) THEN
      RAISE EXCEPTION 'Acesso negado: voce nao tem permissao para alterar a senha deste vendedor.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Tipo de parceiro invalido. Use revendedor ou vendedor.';
  END IF;

  -- 2.3 Resolução do user_id (caso estivesse nulo na tabela comercial)
  IF v_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(v_email)) LIMIT 1;
  END IF;

  -- 2.4 Atualização ou Criação em auth.users
  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    IF v_email IS NULL OR TRIM(v_email) = '' THEN
      RAISE EXCEPTION 'O parceiro nao possui e-mail cadastrado para login.';
    END IF;

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
      LOWER(TRIM(v_email)),
      v_encrypted_pw,
      now(), now(), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', p_tipo),
      jsonb_build_object('nome', v_nome, 'role', p_tipo, 'telefone', v_telefone, 'cpf_cnpj', v_cpf_cnpj),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
  END IF;

  -- 2.5 Vincular user_id na tabela correspondente se estava nulo
  IF p_tipo = 'revendedor' THEN
    UPDATE public.revendedores SET user_id = v_user_id, updated_at = now() WHERE id = p_id;
  ELSIF p_tipo = 'vendedor' THEN
    UPDATE public.vendedores SET user_id = v_user_id, updated_at = now() WHERE id = p_id;
  END IF;

  -- 2.6 Sincronizar auth.identities
  BEGIN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', LOWER(TRIM(v_email)), 'email_verified', true),
      'email',
      v_user_id::text,
      now(), now(), now()
    )
    ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data,
        updated_at = now();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2.7 Atualizar ou Criar Profile com primeiro_acesso = TRUE (Força troca no 1º login)
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, telefone, chave_pix, updated_at
  ) VALUES (
    v_user_id,
    v_nome,
    LOWER(TRIM(v_email)),
    p_tipo::public.hunter_role,
    TRUE,
    TRUE,
    v_telefone,
    v_chave_pix,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    ativo = TRUE,
    primeiro_acesso = TRUE,
    telefone = COALESCE(EXCLUDED.telefone, profiles.telefone),
    chave_pix = COALESCE(EXCLUDED.chave_pix, profiles.chave_pix),
    updated_at = now();

  -- Atualiza cpf_cnpj dinamicamente caso a coluna exista em profiles (blindagem total contra falhas DDL)
  BEGIN
    IF v_cpf_cnpj IS NOT NULL THEN
      EXECUTE 'UPDATE public.profiles SET cpf_cnpj = $1 WHERE id = $2 AND (cpf_cnpj IS NULL OR cpf_cnpj = '''')'
      USING v_cpf_cnpj, v_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 2.8 Atualizar public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_tipo::public.hunter_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.user_roles
  WHERE user_id = v_user_id AND role <> p_tipo::public.hunter_role;

  -- 2.9 Auditoria de Segurança
  BEGIN
    INSERT INTO public.system_activity_logs (
      usuario_id, acao, detalhe
    ) VALUES (
      v_caller_id,
      'redefinicao_senha_' || p_tipo,
      'Senha redefinida pelo gestor/operador para ' || p_tipo || ' (' || v_nome || ' - ' || v_email || '). Troca obrigatoria ativada no primeiro acesso.'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'message', 'Senha redefinida com sucesso. O usuario devera cadastrar nova senha no primeiro acesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redefinir_senha_parceiro(TEXT, UUID, TEXT) TO authenticated, service_role;

-- 3. Invalidação de Cache do PostgREST
NOTIFY pgrst, 'reload schema';

