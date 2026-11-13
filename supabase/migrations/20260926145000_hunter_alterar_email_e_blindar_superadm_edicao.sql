-- Migration: 20260926145000_hunter_alterar_email_e_blindar_superadm_edicao.sql
-- Objetivo: Permitir alteração de e-mail de usuários e clientes sem bloqueio
-- e blindar o SuperADM para que ao alterar o nome mantenha sempre o cargo SuperADM sem regressão.

-- 1. Limpar versões anteriores de admin_atualizar_usuario
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'admin_atualizar_usuario'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
  END LOOP;
END $$;

-- 2. Criar RPC admin_atualizar_usuario definitiva
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

  -- Blindagem canônica do SuperADM (novaes@adm.28bpm.local):
  -- Permite alterar o NOME, mas blinda o e-mail e preserva 100% o papel de SuperADM sem regressão de privilégio.
  IF LOWER(COALESCE(v_email_atual, '')) = 'novaes@adm.28bpm.local' 
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

    -- Concede todos os módulos da governança
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

  -- Para outros usuários: processa alteração de e-mail se informada
  v_email_novo := LOWER(trim(COALESCE(p_email, v_email_atual)));
  IF v_email_novo IS NOT NULL AND v_email_novo <> '' AND v_email_novo <> LOWER(COALESCE(v_email_atual, '')) THEN
    -- Validar se já existe em auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_novo AND id <> p_usuario_id) THEN
      RAISE EXCEPTION 'O e-mail informado já está em uso por outro usuário.';
    END IF;

    -- Atualiza auth.users
    UPDATE auth.users
    SET email = v_email_novo,
        raw_user_meta_data = raw_user_meta_data || jsonb_build_object('email', v_email_novo),
        updated_at = now()
    WHERE id = p_usuario_id;

    -- Atualiza auth.identities
    UPDATE auth.identities
    SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_novo)),
        provider_id = v_email_novo
    WHERE user_id = p_usuario_id AND provider = 'email';
  END IF;

  -- Atualiza public.profiles
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

  -- Módulos
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

-- 3. Atualizar RPC admin_atualizar_cliente_completo para sincronizar e-mail em auth.users, auth.identities e profiles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_sig
    FROM pg_proc
    WHERE proname = 'admin_atualizar_cliente_completo'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_status public.status_cliente DEFAULT 'aguardando_instalacao',
  p_plano public.plano_cliente DEFAULT 'basico',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_meses_contrato INT DEFAULT 12,
  p_data_inicio_contrato DATE DEFAULT CURRENT_DATE,
  p_tipo_renovacao TEXT DEFAULT 'mesma_vigencia',
  p_meses_renovacao INT DEFAULT 12,
  p_foro_comarca TEXT DEFAULT 'Volta Redonda/RJ',
  p_gerar_parcelas_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID;
  v_email_antigo TEXT;
  v_email_limpo TEXT := LOWER(trim(COALESCE(p_email, '')));
  v_meses_c INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_resultado_parcelas JSONB;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'ID do cliente e obrigatorio.';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  SELECT user_id, email, data_inicio_contrato INTO v_user_id, v_email_antigo, v_data_inicio
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  v_meses_c := GREATEST(1, COALESCE(p_meses_contrato, 12));
  v_data_inicio := COALESCE(p_data_inicio_contrato, v_data_inicio, CURRENT_DATE);
  v_data_fim := (v_data_inicio + (v_meses_c || ' months')::INTERVAL)::DATE;

  -- Se o cliente já possui usuário cadastrado em auth.users:
  IF v_user_id IS NOT NULL THEN
    -- Sincronizar e-mail se foi alterado
    IF v_email_limpo <> '' AND v_email_limpo <> LOWER(COALESCE(v_email_antigo, '')) THEN
      IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo AND id <> v_user_id) THEN
        RAISE EXCEPTION 'O e-mail informado já está em uso por outro usuário.';
      END IF;

      UPDATE auth.users
      SET email = v_email_limpo,
          raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'email', v_email_limpo),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE public.profiles
      SET email = v_email_limpo,
          nome = trim(p_nome),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_limpo)),
          provider_id = v_email_limpo
      WHERE user_id = v_user_id AND provider = 'email';
    ELSE
      -- Atualiza apenas o nome se o e-mail não mudou
      UPDATE public.profiles
      SET nome = trim(p_nome),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.users
      SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- Se forneceu nova senha, atualiza credencial
    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

  -- Se não possui usuário ainda, mas tem e-mail e senha: cria conta
  ELSIF v_email_limpo <> '' AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email_limpo;
    IF v_user_id IS NULL THEN
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
        v_email_limpo,
        extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('nome', trim(p_nome), 'role', 'cliente', 'email', v_email_limpo),
        now(), now(),
        '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email',
        v_email_limpo,
        now(), now(), now()
      );

      INSERT INTO public.profiles (id, nome, email, role, ativo, created_at, updated_at)
      VALUES (v_user_id, trim(p_nome), v_email_limpo, 'cliente', TRUE, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        nome = trim(p_nome),
        email = v_email_limpo,
        role = 'cliente',
        ativo = TRUE,
        updated_at = now();

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'cliente')
      ON CONFLICT (user_id, role) DO UPDATE SET role = 'cliente';

      -- Módulos padrão do cliente
      INSERT INTO public.user_module_access (user_id, module, ativo)
      SELECT v_user_id, m, TRUE
      FROM unnest(ARRAY['monitor-gps', 'manutencao', 'mensalidades', 'atendimento']) AS m
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END IF;
  END IF;

  -- Atualizar registro em public.clientes
  UPDATE public.clientes
  SET nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(v_email_limpo, ''),
      telefone = NULLIF(trim(p_telefone), ''),
      user_id = COALESCE(user_id, v_user_id),
      plano = p_plano,
      status = p_status,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      instalador_id = p_instalador_id,
      meses_contrato = v_meses_c,
      data_inicio_contrato = v_data_inicio,
      data_fim_contrato = v_data_fim,
      tipo_renovacao = COALESCE(p_tipo_renovacao, tipo_renovacao),
      meses_renovacao = COALESCE(p_meses_renovacao, meses_renovacao),
      foro_comarca = COALESCE(p_foro_comarca, 'Volta Redonda/RJ'),
      updated_at = now()
  WHERE id = p_cliente_id;

  IF p_gerar_parcelas_ausentes THEN
    v_resultado_parcelas := public.admin_gerar_parcelas_contrato(p_cliente_id);
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Dados do cliente e credenciais atualizados com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

-- 4. Permissões
GRANT EXECUTE ON FUNCTION public.admin_atualizar_usuario(UUID, TEXT, public.hunter_role, BOOLEAN, public.plano_cliente, TEXT[], NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID, INT, DATE, TEXT, INT, TEXT, BOOLEAN) TO authenticated;
