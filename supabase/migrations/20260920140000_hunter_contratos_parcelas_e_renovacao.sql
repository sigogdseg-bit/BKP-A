-- Migration: 20260920140000_hunter_contratos_parcelas_e_renovacao.sql
-- Objetivo: Gestao contratual completa, vigencias, renovacao, parcelamento automatico e foro de Volta Redonda/RJ

-- 1. Novas colunas de gestao contratual na tabela public.clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS meses_contrato INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS data_inicio_contrato DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS data_fim_contrato DATE,
  ADD COLUMN IF NOT EXISTS tipo_renovacao TEXT NOT NULL DEFAULT 'mesma_vigencia',
  ADD COLUMN IF NOT EXISTS meses_renovacao INT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS foro_comarca TEXT NOT NULL DEFAULT 'Volta Redonda/RJ',
  ADD COLUMN IF NOT EXISTS contrato_emitido_em TIMESTAMPTZ;

-- Atualizar clientes existentes calculando a data_fim_contrato caso esteja nula
UPDATE public.clientes
SET data_fim_contrato = (data_inicio_contrato + (meses_contrato || ' months')::INTERVAL)::DATE
WHERE data_fim_contrato IS NULL;

-- 2. Funcao para calcular e gerar automaticamente as parcelas de todo o periodo contratado
CREATE OR REPLACE FUNCTION public.admin_gerar_parcelas_contrato(
  p_cliente_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente RECORD;
  v_i INT;
  v_data_ref DATE;
  v_mes_ref INT;
  v_ano_ref INT;
  v_dia_venc INT;
  v_dia_max INT;
  v_dia_final INT;
  v_data_venc DATE;
  v_status_inicial public.status_mensalidade;
  v_geradas INT := 0;
  v_existentes INT := 0;
  v_meses_total INT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar parcelas de contrato.';
  END IF;

  SELECT id, dia_vencimento, valor_mensalidade, meses_contrato, data_inicio_contrato
  INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  v_meses_total := GREATEST(1, COALESCE(v_cliente.meses_contrato, 12));
  v_dia_venc := COALESCE(v_cliente.dia_vencimento, 10);

  FOR v_i IN 0..(v_meses_total - 1) LOOP
    v_data_ref := (COALESCE(v_cliente.data_inicio_contrato, CURRENT_DATE) + (v_i || ' months')::INTERVAL)::DATE;
    v_mes_ref := EXTRACT(MONTH FROM v_data_ref)::INT;
    v_ano_ref := EXTRACT(YEAR FROM v_data_ref)::INT;

    -- Calcula o ultimo dia valido do mes em questao
    v_dia_max := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_ano_ref, v_mes_ref, 1)) + INTERVAL '1 month - 1 day'))::INT;
    v_dia_final := LEAST(v_dia_venc, v_dia_max);
    v_data_venc := make_date(v_ano_ref, v_mes_ref, v_dia_final);

    IF v_data_venc < CURRENT_DATE THEN
      v_status_inicial := 'vencido';
    ELSE
      v_status_inicial := 'pendente';
    END IF;

    INSERT INTO public.mensalidades (
      cliente_id,
      mes_referencia,
      ano_referencia,
      valor,
      data_vencimento,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_cliente_id,
      v_mes_ref,
      v_ano_ref,
      COALESCE(v_cliente.valor_mensalidade, 79.90),
      v_data_venc,
      v_status_inicial,
      NOW(),
      NOW()
    )
    ON CONFLICT (cliente_id, mes_referencia, ano_referencia) DO NOTHING;

    IF FOUND THEN
      v_geradas := v_geradas + 1;
    ELSE
      v_existentes := v_existentes + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'cliente_id', p_cliente_id,
    'total_meses_contrato', v_meses_total,
    'parcelas_geradas', v_geradas,
    'parcelas_ja_existentes', v_existentes
  );
END;
$$;

-- 3. Funcao RPC para Renovar Contrato do Cliente
CREATE OR REPLACE FUNCTION public.admin_renovar_contrato_cliente(
  p_cliente_id UUID,
  p_tipo_renovacao TEXT DEFAULT 'mesma_vigencia',
  p_meses_adicionais INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente RECORD;
  v_nova_data_inicio DATE;
  v_nova_data_fim DATE;
  v_meses_renovar INT;
  v_resultado_parcelas JSONB;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem renovar contratos.';
  END IF;

  SELECT *
  INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  IF p_tipo_renovacao = 'tempo_personalizado' THEN
    v_meses_renovar := GREATEST(1, COALESCE(p_meses_adicionais, v_cliente.meses_renovacao, 12));
  ELSIF p_tipo_renovacao = 'mensal_ate_cancelamento' THEN
    v_meses_renovar := 12; -- Projeta os proximos 12 meses renovaveis continuamente
  ELSE
    v_meses_renovar := GREATEST(1, COALESCE(v_cliente.meses_contrato, 12));
  END IF;

  -- A nova vigencia comeca a partir da data fim do contrato anterior (ou hoje se ja expirou)
  v_nova_data_inicio := GREATEST(CURRENT_DATE, COALESCE(v_cliente.data_fim_contrato, CURRENT_DATE));
  v_nova_data_fim := (v_nova_data_inicio + (v_meses_renovar || ' months')::INTERVAL)::DATE;

  UPDATE public.clientes
  SET meses_contrato = v_meses_renovar,
      data_inicio_contrato = v_nova_data_inicio,
      data_fim_contrato = v_nova_data_fim,
      tipo_renovacao = p_tipo_renovacao,
      meses_renovacao = COALESCE(p_meses_adicionais, v_cliente.meses_renovacao, v_meses_renovar),
      updated_at = NOW()
  WHERE id = p_cliente_id;

  -- Gerar as parcelas correspondentes ao periodo renovado
  v_resultado_parcelas := public.admin_gerar_parcelas_contrato(p_cliente_id);

  INSERT INTO public.system_activity_logs (
    user_id,
    acao,
    detalhe,
    created_at
  ) VALUES (
    auth.uid(),
    'RENOVACAO_CONTRATO_CLIENTE',
    'Cliente: ' || v_cliente.nome_razao_social ||
    ' | Meses renovados: ' || v_meses_renovar::TEXT ||
    ' | Nova vigencia: ' || v_nova_data_inicio::TEXT || ' ate ' || v_nova_data_fim::TEXT ||
    ' | Modo: ' || p_tipo_renovacao,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'cliente_id', p_cliente_id,
    'data_inicio_contrato', v_nova_data_inicio,
    'data_fim_contrato', v_nova_data_fim,
    'meses_renovados', v_meses_renovar,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

-- 4. Atualizar RPC admin_cadastrar_cliente_completo para suportar os novos parametros contratuais e gerar parcelas
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
  p_km_inicial INT DEFAULT 0,
  p_instalador_id UUID DEFAULT NULL,
  p_meses_contrato INT DEFAULT 12,
  p_data_inicio_contrato DATE DEFAULT CURRENT_DATE,
  p_tipo_renovacao TEXT DEFAULT 'mesma_vigencia',
  p_meses_renovacao INT DEFAULT 12,
  p_foro_comarca TEXT DEFAULT 'Volta Redonda/RJ'
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
  v_email_limpo TEXT := LOWER(trim(p_email));
  v_meses_c INT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_resultado_parcelas JSONB;
BEGIN
  -- 1. Apenas administradores podem cadastrar
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem realizar esta operacao.';
  END IF;

  -- 2. Validacoes basicas do cliente
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome ou razao social do cliente e obrigatorio.';
  END IF;

  v_meses_c := GREATEST(1, COALESCE(p_meses_contrato, 12));
  v_data_inicio := COALESCE(p_data_inicio_contrato, CURRENT_DATE);
  v_data_fim := (v_data_inicio + (v_meses_c || ' months')::INTERVAL)::DATE;

  -- 3. Criacao de usuario em auth.users se solicitado
  IF p_criar_usuario THEN
    IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
      RAISE EXCEPTION 'O e-mail e obrigatorio para liberar acesso ao sistema.';
    END IF;

    IF p_senha IS NULL OR length(p_senha) < 6 THEN
      RAISE EXCEPTION 'A senha inicial de acesso deve conter no minimo 6 caracteres.';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
      RAISE EXCEPTION 'Ja existe um usuario cadastrado no sistema com este e-mail.';
    END IF;

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
      jsonb_build_object('nome', trim(p_nome), 'role', 'cliente'),
      now(), now(),
      '', '', '', ''
    );

    IF NOT EXISTS (
      SELECT 1 FROM auth.identities 
      WHERE (provider = 'email' AND provider_id = v_user_id::text)
         OR user_id = v_user_id
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
          v_user_id::text,
          v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
          'email',
          v_user_id::text,
          now(),
          now(),
          now()
        );
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;

    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (v_user_id, trim(p_nome), v_email_limpo, 'cliente', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        role = 'cliente',
        ativo = TRUE,
        updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'cliente')
    ON CONFLICT (user_id, role) DO NOTHING;

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

  -- 4. Insercao do Cliente com os dados do Contrato
  v_cliente_id := gen_random_uuid();
  INSERT INTO public.clientes (
    id,
    user_id,
    instalador_id,
    nome_razao_social,
    documento,
    email,
    telefone,
    plano,
    status,
    status_agendamento,
    dia_vencimento,
    valor_mensalidade,
    dias_historico_plano,
    dias_retencao_banco,
    meses_contrato,
    data_inicio_contrato,
    data_fim_contrato,
    tipo_renovacao,
    meses_renovacao,
    foro_comarca,
    created_at,
    updated_at
  ) VALUES (
    v_cliente_id,
    v_user_id,
    p_instalador_id,
    trim(p_nome),
    NULLIF(trim(p_documento), ''),
    NULLIF(v_email_limpo, ''),
    NULLIF(trim(p_telefone), ''),
    p_plano,
    'aguardando_instalacao',
    'aguardando_agendamento',
    COALESCE(p_dia_vencimento, 10),
    COALESCE(p_valor_mensalidade, 79.90),
    COALESCE(p_dias_historico, 7),
    COALESCE(p_dias_retencao, 10),
    v_meses_c,
    v_data_inicio,
    v_data_fim,
    COALESCE(p_tipo_renovacao, 'mesma_vigencia'),
    COALESCE(p_meses_renovacao, v_meses_c),
    COALESCE(p_foro_comarca, 'Volta Redonda/RJ'),
    now(),
    now()
  );

  -- 5. Cadastro do primeiro veiculo se informado
  IF p_placa IS NOT NULL AND trim(p_placa) <> '' THEN
    v_veiculo_id := gen_random_uuid();
    INSERT INTO public.veiculos (
      id,
      cliente_id,
      placa,
      marca_modelo,
      km_atual,
      ativo,
      bloqueado,
      created_at,
      updated_at
    ) VALUES (
      v_veiculo_id,
      v_cliente_id,
      UPPER(trim(p_placa)),
      COALESCE(trim(p_marca_modelo), 'Veiculo Padrao'),
      COALESCE(p_km_inicial, 0),
      TRUE,
      FALSE,
      now(),
      now()
    );
  END IF;

  -- 6. Gerar automaticamente as parcelas do contrato para todo o periodo contratado
  v_resultado_parcelas := public.admin_gerar_parcelas_contrato(v_cliente_id);

  INSERT INTO public.system_activity_logs (
    user_id,
    acao,
    detalhe,
    created_at
  ) VALUES (
    v_caller_id,
    'CADASTRO_CLIENTE_COM_CONTRATO',
    'Cliente: ' || trim(p_nome) ||
    ' | Contrato: ' || v_meses_c::TEXT || ' meses' ||
    ' | Foro: ' || COALESCE(p_foro_comarca, 'Volta Redonda/RJ') ||
    ' | Parcelas geradas: ' || COALESCE(v_resultado_parcelas->>'parcelas_geradas', '0'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Cliente e contrato cadastrados com sucesso. Parcelas geradas automaticamente.',
    'cliente_id', v_cliente_id,
    'user_id', v_user_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

-- 5. Atualizar RPC admin_atualizar_cliente_completo para suportar os novos parametros contratuais
CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_status public.status_cliente DEFAULT 'ativo',
  p_dia_vencimento INT DEFAULT 10,
  p_valor_mensalidade NUMERIC DEFAULT 79.90,
  p_dias_historico INT DEFAULT 7,
  p_dias_retencao INT DEFAULT 10,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_meses_contrato INT DEFAULT 12,
  p_data_inicio_contrato DATE DEFAULT NULL,
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
  v_mod TEXT;
  v_modulos TEXT[];
  v_email_limpo TEXT := LOWER(trim(p_email));
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

  -- Tratamento do usuario em auth.users
  IF v_user_id IS NULL AND v_email_limpo IS NOT NULL AND v_email_limpo <> '' AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
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
        jsonb_build_object('nome', trim(p_nome), 'role', 'cliente'),
        now(), now(),
        '', '', '', ''
      );
    END IF;
  ELSIF v_user_id IS NOT NULL AND p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Atualizar registro do cliente
  UPDATE public.clientes
  SET nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(v_email_limpo, ''),
      telefone = NULLIF(trim(p_telefone), ''),
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
    'message', 'Dados do cliente e contrato atualizados com sucesso.',
    'cliente_id', p_cliente_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

-- Permissoes
GRANT EXECUTE ON FUNCTION public.admin_gerar_parcelas_contrato(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_renovar_contrato_cliente(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cadastrar_cliente_completo TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_cliente_completo TO authenticated;
