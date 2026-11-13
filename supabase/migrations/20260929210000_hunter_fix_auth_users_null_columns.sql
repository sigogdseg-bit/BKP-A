-- ====================================================================================
-- MIGRAÇÃO: Correção de inserção na auth.users (Supabase GoTrue NULL values)
-- ====================================================================================

-- Função corrigida para incluir confirmation_token, recovery_token, email_change_token_new, email_change como strings vazias.
-- Caso fiquem NULL, o GoTrue falha no login com 'Database error querying schema'.

CREATE OR REPLACE FUNCTION public.admin_criar_motorista(
  p_cliente_id UUID,
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_cpf TEXT,
  p_data_nascimento DATE,
  p_telefone TEXT,
  p_cnh_numero TEXT,
  p_cnh_categoria TEXT,
  p_cnh_validade DATE,
  p_cnh_primeira_habilitacao DATE,
  p_cnh_renach TEXT,
  p_cnh_observacoes TEXT,
  p_acesso_mapa BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_enc_pw TEXT;
  v_cliente_existe BOOLEAN;
  v_motorista_id UUID;
BEGIN
  -- 1. Verificar permissões
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Não autorizado. Faça login primeiro.';
  END IF;

  -- 2. Validar Cliente
  SELECT EXISTS(SELECT 1 FROM public.clientes WHERE id = p_cliente_id) INTO v_cliente_existe;
  IF NOT v_cliente_existe THEN
    RAISE EXCEPTION 'Cliente % não encontrado.', p_cliente_id;
  END IF;

  -- Criptografar senha
  v_enc_pw := extensions.crypt(p_senha, extensions.gen_salt('bf'));

  -- 3. Inserir no auth.users
  v_user_id := extensions.gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    LOWER(trim(p_email)), v_enc_pw, NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('nome', p_nome),
    NOW(), NOW(),
    '', '', '', ''
  );

  -- 4. Criar identity para login por e-mail
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), v_user_id, LOWER(trim(p_email)),
    jsonb_build_object('sub', v_user_id::TEXT, 'email', LOWER(trim(p_email))),
    'email', NOW(), NOW(), NOW()
  );

  -- 5. Inserir na tabela de motoristas (gerado o perfil publico)
  INSERT INTO public.motoristas (
    cliente_id, user_id, nome, cpf, data_nascimento, telefone, email,
    cnh_numero, cnh_categoria, cnh_validade, cnh_primeira_habilitacao,
    cnh_renach, cnh_observacoes, acesso_mapa, ativo
  ) VALUES (
    p_cliente_id, v_user_id, p_nome, p_cpf, p_data_nascimento, p_telefone, LOWER(trim(p_email)),
    p_cnh_numero, p_cnh_categoria, p_cnh_validade, p_cnh_primeira_habilitacao,
    p_cnh_renach, p_cnh_observacoes, p_acesso_mapa, true
  )
  RETURNING id INTO v_motorista_id;

  -- 6. Inserir perfil (para a autenticação/autorização unificada)
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, cliente_id
  ) VALUES (
    v_user_id, p_nome, LOWER(trim(p_email)), 'motorista', true, true, p_cliente_id
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'motorista_id', v_motorista_id,
    'user_id', v_user_id
  );
END;
$$;
