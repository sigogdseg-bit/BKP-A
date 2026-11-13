-- =============================================================================
-- Hunter — Correção das RPCs de Gestão de Funcionários do Cliente
-- Data: 22/10/2026
-- Objetivo: Corrigir erro de coluna inexistente "v_funcionario_id" em atualizar_funcionario
--           e excluir_funcionario, além de robustecer a verificação de cliente titular.
-- =============================================================================

-- ── 1. RPC: public.cadastrar_funcionario ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cadastrar_funcionario(
  p_cliente_id UUID,
  p_nome       TEXT,
  p_email      TEXT,
  p_senha      TEXT,
  p_telefone   TEXT DEFAULT NULL,
  p_cargo      TEXT DEFAULT NULL,
  p_modulos    TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_nome_limpo  TEXT := TRIM(p_nome);
  v_email_limpo TEXT := LOWER(TRIM(p_email));
  v_user_id     UUID;
  v_enc_pw      TEXT;
  v_func_id     UUID;
  v_mod         TEXT;
BEGIN
  -- 1. Autorização: chamador deve ser dono do cliente titular ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes 
    WHERE id = p_cliente_id 
      AND (
        user_id = v_caller_id 
        OR LOWER(email) = (SELECT LOWER(email) FROM public.profiles WHERE id = v_caller_id)
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para cadastrar funcionários neste cliente.';
  END IF;

  -- 2. Validações
  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Nome do funcionário é obrigatório.';
  END IF;
  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'E-mail do funcionário é obrigatório.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha inicial deve conter no mínimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Já existe um usuário cadastrado com este e-mail.';
  END IF;

  -- 3. Criar usuário em auth.users
  v_user_id := gen_random_uuid();
  v_enc_pw  := extensions.crypt(p_senha, extensions.gen_salt('bf', 10));

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
    jsonb_build_object('nome', v_nome_limpo, 'role', 'funcionario', 'cliente_id', p_cliente_id),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- 4. Identity no auth.identities
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
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email',
        v_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 5. Profile com role 'funcionario', cliente_id e PRIMEIRO ACESSO = TRUE
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, cliente_id, telefone
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    'funcionario'::public.hunter_role,
    true,
    true,
    p_cliente_id,
    NULLIF(TRIM(COALESCE(p_telefone, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = 'funcionario'::public.hunter_role,
      ativo = true,
      primeiro_acesso = true,
      cliente_id = EXCLUDED.cliente_id,
      telefone = EXCLUDED.telefone;

  -- 6. User roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'funcionario'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Registro em funcionarios_cliente
  INSERT INTO public.funcionarios_cliente (
    cliente_id, user_id, nome, email, telefone, cargo, modulos_permitidos, ativo
  ) VALUES (
    p_cliente_id,
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
    NULLIF(TRIM(COALESCE(p_cargo, '')), ''),
    COALESCE(p_modulos, '{}'),
    true
  ) RETURNING id INTO v_func_id;

  -- 8. Atribuição de módulos em public.user_module_access
  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      IF v_mod IS NOT NULL AND TRIM(v_mod) != '' THEN
        INSERT INTO public.user_module_access (user_id, module, ativo)
        VALUES (v_user_id, TRIM(v_mod), true)
        ON CONFLICT (user_id, module) DO UPDATE SET ativo = true;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'funcionario_id', v_func_id,
    'user_id', v_user_id,
    'mensagem', 'Funcionário cadastrado com sucesso. No 1º acesso será exigida a troca de senha.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO] %', SQLERRM;
END;
$$;

-- ── 2. RPC: public.atualizar_funcionario ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atualizar_funcionario(
  p_funcionario_id UUID,
  p_nome           TEXT,
  p_telefone       TEXT DEFAULT NULL,
  p_cargo          TEXT DEFAULT NULL,
  p_modulos        TEXT[] DEFAULT '{}',
  p_ativo          BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_cliente_id  UUID;
  v_user_id     UUID;
  v_nome_limpo  TEXT := TRIM(p_nome);
  v_mod         TEXT;
BEGIN
  -- Busca registro do funcionário
  SELECT cliente_id, user_id INTO v_cliente_id, v_user_id
  FROM public.funcionarios_cliente
  WHERE id = p_funcionario_id;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Autorização: dono do cliente titular ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes 
    WHERE id = v_cliente_id 
      AND (
        user_id = v_caller_id 
        OR LOWER(email) = (SELECT LOWER(email) FROM public.profiles WHERE id = v_caller_id)
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para editar este funcionário.';
  END IF;

  -- Atualiza funcionarios_cliente
  UPDATE public.funcionarios_cliente
  SET nome = v_nome_limpo,
      telefone = NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
      cargo = NULLIF(TRIM(COALESCE(p_cargo, '')), ''),
      modulos_permitidos = COALESCE(p_modulos, '{}'),
      ativo = p_ativo,
      updated_at = now()
  WHERE id = p_funcionario_id;

  -- Atualiza profiles
  UPDATE public.profiles
  SET nome = v_nome_limpo,
      telefone = NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
      ativo = p_ativo,
      updated_at = now()
  WHERE id = v_user_id;

  -- Sincroniza user_module_access
  -- Desativa módulos anteriores
  UPDATE public.user_module_access
  SET ativo = false
  WHERE user_id = v_user_id;

  -- Reativa ou insere os novos módulos
  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      IF v_mod IS NOT NULL AND TRIM(v_mod) != '' THEN
        INSERT INTO public.user_module_access (user_id, module, ativo)
        VALUES (v_user_id, TRIM(v_mod), true)
        ON CONFLICT (user_id, module) DO UPDATE SET ativo = true;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mensagem', 'Dados e permissões do funcionário atualizados com sucesso.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO-UPDATE] %', SQLERRM;
END;
$$;

-- ── 3. RPC: public.excluir_funcionario ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.excluir_funcionario(
  p_funcionario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_cliente_id  UUID;
  v_user_id     UUID;
BEGIN
  SELECT cliente_id, user_id INTO v_cliente_id, v_user_id
  FROM public.funcionarios_cliente
  WHERE id = p_funcionario_id;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Autorização: dono do cliente titular ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes 
    WHERE id = v_cliente_id 
      AND (
        user_id = v_caller_id 
        OR LOWER(email) = (SELECT LOWER(email) FROM public.profiles WHERE id = v_caller_id)
      )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para excluir este funcionário.';
  END IF;

  -- Remove de funcionarios_cliente
  DELETE FROM public.funcionarios_cliente WHERE id = p_funcionario_id;

  -- Remove acessos
  DELETE FROM public.user_module_access WHERE user_id = v_user_id;

  -- Desativa profile (soft delete para manter integridade referencial)
  UPDATE public.profiles
  SET ativo = false, updated_at = now()
  WHERE id = v_user_id;

  -- Desativa em auth.users
  BEGIN
    UPDATE auth.users
    SET banned_until = '2099-01-01 00:00:00+00'::timestamptz,
        updated_at = now()
    WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'mensagem', 'Colaborador removido com sucesso e seus acessos foram revogados.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO-DELETE] %', SQLERRM;
END;
$$;

-- Permissões explícitas para a Data API
GRANT EXECUTE ON FUNCTION public.cadastrar_funcionario(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_funcionario(UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_funcionario(UUID) TO authenticated, service_role;

-- Invalidação compulsória do schema cache
NOTIFY pgrst, 'reload schema';
