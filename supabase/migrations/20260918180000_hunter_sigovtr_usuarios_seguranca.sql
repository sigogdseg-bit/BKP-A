-- ============================================================================
-- HUNTER — MIGRAÇÃO SIGOVTR: GESTÃO DE USUÁRIOS, TEMAS E CENTRAL DE SEGURANÇA
-- ============================================================================
-- Diretrizes: DJR-NEW, DJR-APP & DJR-TELA
-- ============================================================================

-- 1. ADICIONAR PREFERÊNCIA DE TEMA EM PROFILES
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'dark';

-- 2. GARANTIR EXTENSÃO PGCRYPTO
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. RPC: CADASTRAR USUÁRIO PELO ADMINISTRADOR (PADRÃO SIGOVTR)
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
  v_user_id UUID;
  v_caller_id UUID := auth.uid();
  v_mod TEXT;
  v_encrypted_pw TEXT;
BEGIN
  -- 1. Validação de privilégio administrativo
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem cadastrar usuarios.';
  END IF;

  -- 2. Validação dos campos obrigatórios
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome do usuario e obrigatorio.';
  END IF;

  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'O e-mail do usuario e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha inicial deve conter pelo menos 6 caracteres.';
  END IF;

  -- 3. Verifica se e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario cadastrado com este e-mail.';
  END IF;

  -- 4. Criação do usuário em auth.users
  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_senha, gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    LOWER(trim(p_email)),
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(),
    now()
  );

  -- 5. Perfil em public.profiles (garante caso o trigger não tenha rodado)
  INSERT INTO public.profiles (id, nome, email, role, ativo, theme_preference)
  VALUES (v_user_id, p_nome, LOWER(trim(p_email)), p_role, TRUE, 'dark')
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      ativo = TRUE;

  -- 6. Role em public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Módulos concedidos em public.user_module_access
  IF p_modulos IS NOT NULL AND array_length(p_modulos, 1) > 0 THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
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

  -- 9. Registro de auditoria forense
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
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

-- 4. RPC: ATUALIZAR USUÁRIO (NOME, ROLE, STATUS, MÓDULOS)
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

  -- 3. Atualiza perfil
  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      updated_at = now()
  WHERE id = p_user_id;

  -- 4. Atualiza role
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);

  -- 5. Atualiza módulos
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  IF p_modulos IS NOT NULL AND array_length(p_modulos, 1) > 0 THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 6. Se for cliente, atualiza plano se informado
  IF p_role = 'cliente' AND p_plano IS NOT NULL THEN
    UPDATE public.clientes
    SET plano = p_plano, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- 7. Log de auditoria
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
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

-- 5. RPC: REDEFINIR SENHA DO USUÁRIO
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

  -- Log de auditoria
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
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

-- 6. RPC: EXCLUIR USUÁRIO
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

  IF LOWER(v_user_email) = 'novaes@adm.28bpm.local' THEN
    RAISE EXCEPTION 'A conta SuperAdmin mestre e imutavel e nao pode ser excluida.';
  END IF;

  -- Exclui em cascade de auth.users (removerá profiles, roles e modules por FK cascade)
  DELETE FROM auth.users WHERE id = p_user_id;

  -- Log de auditoria
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    'EXCLUSAO_USUARIO',
    'Usuario excluido: ' || v_user_email
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario removido com sucesso.'
  );
END;
$$;

-- 7. RPC: SALVAR PREFERÊNCIA DE TEMA DO USUÁRIO
CREATE OR REPLACE FUNCTION public.salvar_preferencia_tema(
  p_tema TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.profiles
    SET theme_preference = p_tema,
        updated_at = now()
    WHERE id = auth.uid();
  END IF;
END;
$$;
