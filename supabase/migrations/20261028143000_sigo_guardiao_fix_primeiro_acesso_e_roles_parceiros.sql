-- SIGO Guardião — Fix Primeiro Acesso no Autocadastro e Correção de Roles Parceiros (Revendedor/Vendedor)
-- Migration: 20261028143000_sigo_guardiao_fix_primeiro_acesso_e_roles_parceiros.sql

-- 1. ALTERAR DEFAULT DE PRIMEIRO_ACESSO PARA FALSE
ALTER TABLE public.profiles ALTER COLUMN primeiro_acesso SET DEFAULT FALSE;

-- 1.1 GARANTIR CONSTRAINTS UNIQUE EM USER_ID DE REVENDEDORES E VENDEDORES
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_revendedores_user_id'
  ) THEN
    ALTER TABLE public.revendedores ADD CONSTRAINT uq_revendedores_user_id UNIQUE (user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_vendedores_user_id'
  ) THEN
    ALTER TABLE public.vendedores ADD CONSTRAINT uq_vendedores_user_id UNIQUE (user_id);
  END IF;
END $$;

-- 2. ATUALIZAR USUÁRIOS EXISTENTES DE AUTOCADASTRO PARA NÃO EXIGIR TROCA DE SENHA
UPDATE public.profiles
SET primeiro_acesso = FALSE
WHERE role IN ('cliente', 'revendedor', 'vendedor', 'motorista', 'instalador');

-- 3. AUTO-CORREÇÃO DO CADASTRO DE TESTE rev@oficial.tec.br
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE email = 'rev@oficial.tec.br';
  
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'revendedor'::public.hunter_role,
        primeiro_acesso = FALSE,
        updated_at = NOW()
    WHERE id = v_user_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'revendedor'::public.hunter_role)
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'revendedor'::public.hunter_role;

    -- Remove eventual role incorreta de cliente
    DELETE FROM public.user_roles
    WHERE user_id = v_user_id AND role = 'cliente'::public.hunter_role;

    INSERT INTO public.revendedores (user_id, nome, email, valor_base_sistema, ativo)
    VALUES (v_user_id, 'Revendedor', 'rev@oficial.tec.br', 40.00, TRUE)
    ON CONFLICT (user_id) DO UPDATE SET ativo = TRUE;
  END IF;
END $$;

-- 4. RPC ATÔMICA OFICIAL DE CADASTRO DE PARCEIRO POR CONVITE (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.cadastrar_parceiro_por_convite(
  p_token TEXT,
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_telefone TEXT DEFAULT NULL,
  p_documento TEXT DEFAULT NULL,
  p_chave_pix TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_convite RECORD;
  v_user_id UUID;
  v_nome_limpo TEXT;
  v_email_limpo TEXT;
  v_encrypted_pw TEXT;
  v_tipo TEXT;
  v_valor_base NUMERIC(10,2);
  v_rev_id UUID;
BEGIN
  -- 1. Validar e travar o convite comercial
  SELECT * INTO v_convite
  FROM public.convites_cliente
  WHERE token = TRIM(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'Link de convite comercial não localizado ou inválido.');
  END IF;

  IF v_convite.usado THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'Este link de convite já foi utilizado.');
  END IF;

  IF v_convite.expira_em < NOW() THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'Este link de convite expirou.');
  END IF;

  v_tipo := v_convite.tipo_convite;
  IF v_tipo NOT IN ('revendedor', 'vendedor') THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'Este convite não é destinado a parceiros comerciais.');
  END IF;

  v_nome_limpo := TRIM(p_nome);
  v_email_limpo := LOWER(TRIM(p_email));

  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'Nome completo ou Razão Social é obrigatório.');
  END IF;

  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'E-mail de acesso é obrigatório.');
  END IF;

  IF p_senha IS NULL OR LENGTH(p_senha) < 6 THEN
    RETURN jsonb_build_object('sucesso', FALSE, 'mensagem', 'A senha de acesso deve ter pelo menos 6 caracteres.');
  END IF;

  -- 2. Localiza ou cria em auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email_limpo;
  v_encrypted_pw := extensions.crypt(p_senha, extensions.gen_salt('bf'));

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email_limpo,
      v_encrypted_pw,
      NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', v_tipo),
      jsonb_build_object('nome', v_nome_limpo, 'role', v_tipo, 'telefone', p_telefone, 'cpf_cnpj', p_documento),
      NOW(),
      NOW()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', v_nome_limpo, 'role', v_tipo),
        raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', v_tipo),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- 3. Atualizar public.profiles
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, telefone, cpf_cnpj, chave_pix, primeiro_acesso, updated_at
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    v_tipo::public.hunter_role,
    TRUE,
    TRIM(p_telefone),
    TRIM(p_documento),
    TRIM(p_chave_pix),
    FALSE,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    ativo = TRUE,
    telefone = EXCLUDED.telefone,
    cpf_cnpj = EXCLUDED.cpf_cnpj,
    chave_pix = EXCLUDED.chave_pix,
    primeiro_acesso = FALSE,
    updated_at = NOW();

  -- 4. Atualizar public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_tipo::public.hunter_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.user_roles
  WHERE user_id = v_user_id AND role <> v_tipo::public.hunter_role;

  -- 5. Atualizar tabelas específicas de revendedores ou vendedores
  v_valor_base := COALESCE(v_convite.valor_mensalidade_proposta, 40.00);

  IF v_tipo = 'revendedor' THEN
    INSERT INTO public.revendedores (
      user_id, nome, documento, email, telefone, chave_pix, valor_base_sistema, ativo
    ) VALUES (
      v_user_id,
      v_nome_limpo,
      TRIM(p_documento),
      v_email_limpo,
      TRIM(p_telefone),
      TRIM(p_chave_pix),
      v_valor_base,
      TRUE
    )
    ON CONFLICT (user_id) DO UPDATE SET
      nome = EXCLUDED.nome,
      documento = EXCLUDED.documento,
      email = EXCLUDED.email,
      telefone = EXCLUDED.telefone,
      chave_pix = EXCLUDED.chave_pix,
      valor_base_sistema = EXCLUDED.valor_base_sistema,
      ativo = TRUE;
  ELSIF v_tipo = 'vendedor' THEN
    v_rev_id := v_convite.revendedor_id;
    INSERT INTO public.vendedores (
      user_id, revendedor_id, nome, documento, email, telefone, chave_pix, valor_base_vendedor, ativo
    ) VALUES (
      v_user_id,
      v_rev_id,
      v_nome_limpo,
      TRIM(p_documento),
      v_email_limpo,
      TRIM(p_telefone),
      TRIM(p_chave_pix),
      v_valor_base,
      TRUE
    )
    ON CONFLICT (user_id) DO UPDATE SET
      revendedor_id = EXCLUDED.revendedor_id,
      nome = EXCLUDED.nome,
      documento = EXCLUDED.documento,
      email = EXCLUDED.email,
      telefone = EXCLUDED.telefone,
      chave_pix = EXCLUDED.chave_pix,
      valor_base_vendedor = EXCLUDED.valor_base_vendedor,
      ativo = TRUE;
  END IF;

  -- 6. Marcar o convite como utilizado
  UPDATE public.convites_cliente
  SET usado = TRUE,
      usado_em = NOW(),
      usado_por_user_id = v_user_id
  WHERE id = v_convite.id;

  -- 7. Inserir GoTrue auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_user_id::text)
       OR user_id = v_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email', v_user_id::text,
        NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'mensagem', 'Cadastro realizado com sucesso!',
    'user_id', v_user_id,
    'tipo', v_tipo
  );
END;
$$;

-- 5. GRANTS DE DATA API
GRANT EXECUTE ON FUNCTION public.cadastrar_parceiro_por_convite TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 6. RECARREGAMENTO DE CACHE DO SCHEMA
NOTIFY pgrst, 'reload schema';
