-- ============================================================================
-- HUNTER — UNIFICAÇÃO ATÔMICA DE CADASTRO DE CLIENTES E USUÁRIOS DE ACESSO
-- ============================================================================
-- Permite ao administrador cadastrar o cliente, gerar o login de acesso
-- (auth.users, profiles, user_roles, user_module_access) e ativar o primeiro
-- veículo em uma única transação atômica ACID, eliminando cadastros duplicados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_cadastrar_cliente_completo(
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_criar_usuario BOOLEAN DEFAULT TRUE,
  p_senha TEXT DEFAULT NULL,
  p_placa TEXT DEFAULT NULL,
  p_marca_modelo TEXT DEFAULT NULL,
  p_km_inicial INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_id UUID := NULL;
  v_cliente_id UUID;
  v_veiculo_id UUID;
  v_mod TEXT;
  v_modulos TEXT[];
BEGIN
  -- 1. Apenas administradores podem cadastrar
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validações básicas do cliente
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  -- 3. Criação de usuário em auth.users se solicitado
  IF p_criar_usuario THEN
    IF p_email IS NULL OR trim(p_email) = '' THEN
      RAISE EXCEPTION 'O e-mail e obrigatorio para liberar acesso ao sistema.';
    END IF;

    IF p_senha IS NULL OR length(p_senha) < 6 THEN
      RAISE EXCEPTION 'A senha inicial de acesso deve conter no minimo 6 caracteres.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
      RAISE EXCEPTION 'Ja existe um usuario cadastrado no sistema com este e-mail.';
    END IF;

    -- Cria o ID do usuário
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

    -- Perfil de acesso do cliente
    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'cliente', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        role = 'cliente',
        ativo = TRUE,
        updated_at = now();

    -- Role em user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Define módulos conforme plano do cliente
    IF p_plano = 'basico' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades'];
    ELSIF p_plano = 'pro' THEN
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao'];
    ELSE
      v_modulos := ARRAY['monitor-gps', 'atendimento', 'mensalidades', 'manutencao', 'central-seguranca'];
    END IF;

    FOREACH v_mod IN ARRAY v_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  -- 4. Inserção na tabela public.clientes vinculada ao v_user_id
  v_cliente_id := gen_random_uuid();
  INSERT INTO public.clientes (
    id,
    user_id,
    nome_razao_social,
    documento,
    email,
    telefone,
    plano,
    status,
    dia_vencimento,
    valor_mensalidade,
    dias_historico_plano,
    dias_retencao_banco,
    created_at,
    updated_at
  ) VALUES (
    v_cliente_id,
    v_user_id,
    trim(p_nome),
    NULLIF(trim(p_documento), ''),
    NULLIF(LOWER(trim(p_email)), ''),
    NULLIF(trim(p_telefone), ''),
    p_plano,
    'ativo',
    COALESCE(p_dia_vencimento, 10),
    COALESCE(p_valor_mensalidade, 79.90),
    COALESCE(p_dias_historico, 7),
    COALESCE(p_dias_retencao, 10),
    now(),
    now()
  );

  -- 5. Se informou placa, ativa o veículo inicial do cliente
  IF p_placa IS NOT NULL AND trim(p_placa) <> '' THEN
    v_veiculo_id := gen_random_uuid();
    INSERT INTO public.veiculos (
      id,
      cliente_id,
      placa,
      marca_modelo,
      km_inicial,
      odometro_km,
      data_ativacao,
      ativo,
      created_at,
      updated_at
    ) VALUES (
      v_veiculo_id,
      v_cliente_id,
      UPPER(trim(p_placa)),
      COALESCE(NULLIF(trim(p_marca_modelo), ''), 'Veículo Hunter Padrão'),
      COALESCE(p_km_inicial, 0),
      COALESCE(p_km_inicial, 0),
      now(),
      TRUE,
      now(),
      now()
    );

    -- Inicializa itens preventivos via RPC existente
    PERFORM public.inicializar_itens_manutencao_veiculo(v_veiculo_id, COALESCE(p_km_inicial, 0));
  END IF;

  -- 6. Auditoria forense
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'CADASTRO_CLIENTE_UNIFICADO',
    format('Cliente %s cadastrado com sucesso. Usuario de acesso gerado: %s. Veiculo inicial: %s.',
           p_nome,
           CASE WHEN p_criar_usuario THEN 'SIM (' || p_email || ')' ELSE 'NAO' END,
           COALESCE(p_placa, 'NENHUM'))
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'cliente_id', v_cliente_id,
    'user_id', v_user_id,
    'veiculo_id', v_veiculo_id,
    'message', 'Cliente e credenciais de acesso cadastrados com sucesso!'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_cadastrar_cliente_completo IS 'Unifica cadastro de clientes, criacao de conta auth.users, definicao de permissoes por plano e ativacao de veiculo em transacao atomica.';
