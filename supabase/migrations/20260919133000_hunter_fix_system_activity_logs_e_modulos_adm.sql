-- =============================================================================
-- Hunter — Correção Canônica: system_activity_logs (usuario_id) e Acesso Total ADM
-- =============================================================================

-- 1. Compatibilização de colunas em public.system_activity_logs
-- Garante a coexistência e integridade das colunas user_id e usuario_id
ALTER TABLE public.system_activity_logs 
ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Sincronização bidirecional de dados legados
UPDATE public.system_activity_logs 
SET usuario_id = user_id 
WHERE usuario_id IS NULL AND user_id IS NOT NULL;

UPDATE public.system_activity_logs 
SET user_id = usuario_id 
WHERE user_id IS NULL AND usuario_id IS NOT NULL;

-- 2. Atualização da RPC: admin_cadastrar_usuario
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
SET search_path = public, auth, pg_temp
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

  -- 2. SuperAdmin Mestre tem e-mail reservado
  IF LOWER(trim(p_email)) = 'novaes@adm.28bpm.local' AND p_role <> 'superadmin' THEN
    RAISE EXCEPTION 'O e-mail novaes@adm.28bpm.local e reservado exclusivamente para a conta SuperAdmin Mestre.';
  END IF;

  -- 3. Se for adm ou superadmin, todos os módulos devem ser liberados automaticamente
  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  -- 4. Cria conta em auth.users
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
    crypt(p_senha, gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(), now(),
    '', '', '', ''
  );

  -- 5. Atualiza ou insere perfil em public.profiles
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (v_user_id, p_nome, LOWER(trim(p_email)), p_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      ativo = TRUE,
      updated_at = now();

  -- 6. Registra role em public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Atribui módulos permitidos
  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 8. Se for cliente, cria registro vinculado em public.clientes
  IF p_role = 'cliente' THEN
    INSERT INTO public.clientes (user_id, nome_razao_social, email, plano, status)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), COALESCE(p_plano, 'basico'), 'ativo');
  END IF;

  -- 9. Registro de auditoria forense (compatível com user_id e usuario_id)
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

-- 3. Atualização da RPC: admin_atualizar_usuario
CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_user_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_modulos TEXT[],
  p_plano public.plano_cliente DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_email TEXT;
  v_mod TEXT;
  v_modulos_finais TEXT[];
  v_modulos_todos TEXT[] := ARRAY[
    'monitor-gps', 'atendimento', 'clientes', 'mensalidades',
    'rastreadores', 'central-seguranca', 'logs', 'dispositivos',
    'manutencao', 'usuarios'
  ];
BEGIN
  -- 1. Validação de privilégio
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem alterar usuarios.';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = p_user_id;

  -- 2. Blindagem inegociável do SuperAdmin
  IF LOWER(v_user_email) = 'novaes@adm.28bpm.local' THEN
    IF p_role <> 'superadmin' OR p_ativo = FALSE THEN
      RAISE EXCEPTION 'A conta SuperAdmin mestre e imutavel e nao pode ter perfil ou status alterados.';
    END IF;
  END IF;

  -- 3. Se for adm ou superadmin, todos os módulos devem ser liberados automaticamente
  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  -- 4. Atualiza perfil
  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      updated_at = now()
  WHERE id = p_user_id;

  -- 5. Atualiza role
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);

  -- 6. Atualiza módulos
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 7. Se for cliente, atualiza plano se informado
  IF p_role = 'cliente' AND p_plano IS NOT NULL THEN
    UPDATE public.clientes
    SET plano = p_plano, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- 8. Log de auditoria (compatível com user_id e usuario_id)
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'ATUALIZACAO_USUARIO',
    'Usuario atualizado: ' || p_nome || ' (' || v_user_email || ') - Role: ' || p_role || ' - Ativo: ' || p_ativo
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario atualizado com sucesso.'
  );
END;
$$;

-- 4. Atualização da RPC: admin_redefinir_senha
CREATE OR REPLACE FUNCTION public.admin_redefinir_senha(
  p_user_id UUID,
  p_nova_senha TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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

  -- Atualiza a senha em auth.users
  UPDATE auth.users
  SET encrypted_password = crypt(p_nova_senha, gen_salt('bf', 10)),
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

-- 5. Atualização da RPC: admin_excluir_usuario
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
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuarios.';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = p_user_id;

  -- Blindagem inegociável do SuperAdmin
  IF LOWER(v_user_email) = 'novaes@adm.28bpm.local' THEN
    RAISE EXCEPTION 'A conta SuperAdmin mestre e inviolavel e nao pode ser excluida.';
  END IF;

  -- Remove de clientes se existir
  DELETE FROM public.clientes WHERE user_id = p_user_id;
  -- Remove acessos
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  -- Log de auditoria (compatível com user_id e usuario_id)
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'EXCLUSAO_USUARIO',
    'Usuario excluido: ' || v_user_email
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario excluido com sucesso.'
  );
END;
$$;

-- 6. Concede imediatamente TODOS os módulos para qualquer SuperAdmin e Administrador existente
INSERT INTO public.user_module_access (user_id, module, ativo)
SELECT p.id, m.module, TRUE
FROM public.profiles p
CROSS JOIN (
  VALUES 
    ('monitor-gps'), ('atendimento'), ('clientes'), ('mensalidades'),
    ('rastreadores'), ('central-seguranca'), ('logs'), ('dispositivos'),
    ('manutencao'), ('usuarios')
) AS m(module)
WHERE p.role IN ('superadmin', 'adm')
ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
