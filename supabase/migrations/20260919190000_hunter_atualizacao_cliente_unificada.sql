-- ============================================================================
-- HUNTER — ATUALIZAÇÃO UNIFICADA DE CLIENTES E CREDENCIAIS DE ACESSO
-- ============================================================================
-- Permite ao administrador atualizar todos os dados cadastrais, status, plano,
-- parâmetros financeiros e senha/login de acesso do cliente de forma atômica.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_status public.status_cliente DEFAULT 'ativo',
  p_plano public.plano_cliente DEFAULT 'basico',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_senha TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_mod TEXT;
  v_modulos TEXT[];
  v_email_antigo TEXT;
BEGIN
  -- 1. Apenas administradores podem atualizar clientes
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validações do cliente
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  -- 3. Obter dados atuais do cliente
  SELECT user_id, email INTO v_user_id, v_email_antigo
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- 4. Tratamento do usuário em auth.users e profiles
  -- Caso A: Cliente ainda não tem user_id, mas foi informado e-mail e senha
  IF v_user_id IS NULL AND p_email IS NOT NULL AND trim(p_email) <> '' AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email));

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
        LOWER(trim(p_email)),
        extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('nome', p_nome, 'role', 'cliente'),
        now(), now(),
        '', '', '', ''
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- Cria / atualiza profile
    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'cliente', (p_status = 'ativo' OR p_status = 'aguardando_instalacao'))
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        role = 'cliente',
        ativo = EXCLUDED.ativo,
        updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- Caso B: Cliente já possui user_id vinculado
  ELSIF v_user_id IS NOT NULL THEN
    IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
      UPDATE auth.users
      SET email = LOWER(trim(p_email)),
          raw_user_meta_data = jsonb_build_object('nome', p_nome, 'role', 'cliente'),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    UPDATE public.profiles
    SET nome = trim(p_nome),
        email = COALESCE(NULLIF(LOWER(trim(p_email)), ''), email),
        ativo = (p_status = 'ativo' OR p_status = 'aguardando_instalacao'),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Sincroniza os módulos com base no plano comercial
  IF v_user_id IS NOT NULL THEN
    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao', 'central-seguranca'];
    END IF;

    DELETE FROM public.user_module_access WHERE user_id = v_user_id;
    FOREACH v_mod IN ARRAY v_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 5. Atualização atômica na tabela public.clientes
  UPDATE public.clientes
  SET user_id = COALESCE(v_user_id, clientes.user_id),
      nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(LOWER(trim(p_email)), ''),
      telefone = NULLIF(trim(p_telefone), ''),
      status = p_status,
      plano = p_plano,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      updated_at = now()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Ficha do cliente e credenciais atualizadas com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id
  );
END;
$$;
