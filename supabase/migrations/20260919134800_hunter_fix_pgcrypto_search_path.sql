-- =============================================================================
-- Hunter — Correção Canônica: pgcrypto schema extensions em admin_cadastrar_usuario e admin_redefinir_senha
-- =============================================================================

-- 1. Atualização da RPC: admin_cadastrar_usuario com extensions no search_path e chamada qualificada
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID;
  v_mod TEXT;
  v_modulos_finais TEXT[];
  v_modulos_todos TEXT[] := ARRAY[
    'monitor-gps', 'atendimento', 'clientes', 'mensalidades',
    'rastreadores', 'central-seguranca', 'logs', 'dispositivos',
    'manutencao', 'usuarios'
  ];
BEGIN
  -- 1. Apenas administradores podem cadastrar
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem cadastrar usuarios.';
  END IF;

  -- 2. Validação básica
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome do usuario e obrigatorio.';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'O e-mail do usuario e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha inicial deve conter pelo menos 6 caracteres.';
  END IF;

  -- 3. SuperAdmin Mestre tem e-mail reservado
  IF LOWER(trim(p_email)) = 'novaes@adm.28bpm.local' AND p_role <> 'superadmin' THEN
    RAISE EXCEPTION 'O e-mail novaes@adm.28bpm.local e reservado exclusivamente para a conta SuperAdmin Mestre.';
  END IF;

  -- 4. Se for adm ou superadmin, todos os módulos devem ser liberados automaticamente
  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  -- 5. Verifica se já existe em auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario cadastrado com este e-mail.';
  END IF;

  -- 6. Cria conta em auth.users usando extensions.crypt e extensions.gen_salt
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
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(), now(),
    '', '', '', ''
  );

  -- 7. Atualiza ou insere perfil em public.profiles
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (v_user_id, p_nome, LOWER(trim(p_email)), p_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      ativo = TRUE,
      updated_at = now();

  -- 8. Registra role em public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 9. Atribui módulos permitidos
  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 10. Se for cliente, cria registro vinculado em public.clientes
  IF p_role = 'cliente' THEN
    INSERT INTO public.clientes (user_id, nome_razao_social, email, plano, status)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), COALESCE(p_plano, 'basico'), 'ativo');
  END IF;

  -- 11. Registro de auditoria forense (compatível com user_id e usuario_id)
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'CADASTRO_USUARIO',
    'Usuario criado: ' || p_nome || ' (' || LOWER(trim(p_email)) || ') com perfil ' || p_role
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'message', 'Usuario cadastrado com sucesso.'
  );
END;
$$;

-- 2. Atualização da RPC: admin_redefinir_senha com extensions no search_path e chamada qualificada
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
  v_caller_id UUID := auth.uid();
  v_user_email TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem redefinir senhas.';
  END IF;

  IF p_nova_senha IS NULL OR length(p_nova_senha) < 6 THEN
    RAISE EXCEPTION 'A nova senha deve conter pelo menos 6 caracteres.';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = p_user_id;

  -- Atualiza a senha em auth.users usando extensions.crypt e extensions.gen_salt
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_user_id;

  -- Log de auditoria (compatível com user_id e usuario_id)
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'REDEFINICAO_SENHA',
    'Senha redefinida pelo administrador para o usuario: ' || v_user_email
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Senha redefinida com sucesso.'
  );
END;
$$;
