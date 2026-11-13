-- Migration: 20261016120000_hunter_cobranca_apos_primeiro_veiculo_ativo.sql
-- Objetivo: Blindagem canônica de cobrança: débitos de mensalidade só iniciam APÓS a ativação do 1º veículo/rastreador.
-- A partir da data da instalação e ativação no sistema começam a contar os dias e a vigência para cobrança.

-- 1. Atualizar admin_gerar_parcelas_contrato: só gera se o cliente possuir ao menos 1 veículo ativo
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
  v_tem_veiculo_ativo BOOLEAN;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar parcelas de contrato.';
  END IF;

  SELECT id, dia_vencimento, valor_mensalidade, meses_contrato, data_inicio_contrato, status
  INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  -- Regra Canônica Hunter-Guardian:
  -- O cliente só inicia cobrança e tem parcelas geradas APÓS o primeiro veículo ativo no sistema.
  SELECT EXISTS (
    SELECT 1 FROM public.veiculos v
    WHERE v.cliente_id = p_cliente_id AND v.ativo = TRUE
  ) INTO v_tem_veiculo_ativo;

  IF NOT v_tem_veiculo_ativo OR v_cliente.status = 'aguardando_instalacao' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'parcelas_geradas', 0,
      'parcelas_existentes', 0,
      'message', 'Cliente aguardando instalação ou sem veículo ativo. Cobrança de parcelas postergada para a data de ativação.'
    );
  END IF;

  v_meses_total := GREATEST(1, COALESCE(v_cliente.meses_contrato, 12));
  v_dia_venc := COALESCE(v_cliente.dia_vencimento, 10);

  FOR v_i IN 0..(v_meses_total - 1) LOOP
    v_data_ref := (COALESCE(v_cliente.data_inicio_contrato, CURRENT_DATE) + (v_i || ' months')::INTERVAL)::DATE;
    v_mes_ref := EXTRACT(MONTH FROM v_data_ref)::INT;
    v_ano_ref := EXTRACT(YEAR FROM v_data_ref)::INT;

    -- Calcula o último dia válido do mês em questão
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
    'parcelas_geradas', v_geradas,
    'parcelas_existentes', v_existentes,
    'message', v_geradas || ' parcelas geradas com sucesso a partir da data de ativação.'
  );
END;
$$;

-- 2. Atualizar admin_gerar_mensalidades_mes: só gera mensalidades para clientes com ao menos 1 veículo ativo
CREATE OR REPLACE FUNCTION public.admin_gerar_mensalidades_mes(
  p_mes INT,
  p_ano INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente RECORD;
  v_dia_max INT;
  v_dia_final INT;
  v_data_venc DATE;
  v_status_inicial public.status_mensalidade;
  v_total_clientes INT := 0;
  v_geradas INT := 0;
  v_ja_existentes INT := 0;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar mensalidades em lote.';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mês de referência inválido: deve estar entre 1 e 12.';
  END IF;

  IF p_ano < 2024 OR p_ano > 2099 THEN
    RAISE EXCEPTION 'Ano de referência inválido.';
  END IF;

  v_dia_max := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day'))::INT;

  FOR v_cliente IN
    SELECT c.id, c.dia_vencimento, c.valor_mensalidade, c.nome_razao_social
    FROM public.clientes c
    WHERE c.status <> 'bloqueado'
      AND c.status <> 'aguardando_instalacao'
      AND c.valor_mensalidade > 0
      AND EXISTS (
        SELECT 1 FROM public.veiculos v
        WHERE v.cliente_id = c.id
          AND v.ativo = TRUE
      )
  LOOP
    v_total_clientes := v_total_clientes + 1;

    v_dia_final := LEAST(COALESCE(v_cliente.dia_vencimento, 10), v_dia_max);
    v_data_venc := make_date(p_ano, p_mes, v_dia_final);

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
      v_cliente.id,
      p_mes,
      p_ano,
      v_cliente.valor_mensalidade,
      v_data_venc,
      v_status_inicial,
      NOW(),
      NOW()
    )
    ON CONFLICT (cliente_id, mes_referencia, ano_referencia) DO NOTHING;

    IF FOUND THEN
      v_geradas := v_geradas + 1;
    ELSE
      v_ja_existentes := v_ja_existentes + 1;
    END IF;
  END LOOP;

  INSERT INTO public.system_activity_logs (
    user_id,
    acao,
    detalhe,
    created_at
  ) VALUES (
    auth.uid(),
    'GERACAO_MENSALIDADES_LOTE',
    'Competência: ' || LPAD(p_mes::TEXT, 2, '0') || '/' || p_ano::TEXT ||
    ' | Geradas: ' || v_geradas::TEXT ||
    ' | Já existentes: ' || v_ja_existentes::TEXT ||
    ' | Clientes com veículo ativo: ' || v_total_clientes::TEXT,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'geradas', v_geradas,
    'ja_existentes', v_ja_existentes,
    'total_clientes', v_total_clientes,
    'message', v_geradas || ' mensalidades geradas com sucesso para a competência ' || LPAD(p_mes::TEXT, 2, '0') || '/' || p_ano::TEXT || '.'
  );
END;
$$;

-- 3. Atualizar instalador_concluir_atendimento: ao ativar o veículo e concluir instalação, inicia a cobrança das mensalidades
CREATE OR REPLACE FUNCTION public.instalador_concluir_atendimento(
  p_instalacao_id UUID,
  p_imei_conferido TEXT,
  p_com_bloqueador BOOLEAN,
  p_posicao_instalacao TEXT,
  p_placa TEXT,
  p_marca TEXT,
  p_modelo TEXT,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_tipo_veiculo TEXT DEFAULT 'carro',
  p_km_instalacao INT DEFAULT 0,
  p_horimetro_inicial NUMERIC DEFAULT 0.00,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_inst RECORD;
  v_valor_final NUMERIC(10,2);
  v_veiculo_id UUID;
  v_imei_limpo TEXT;
  v_imei_esperado TEXT;
  v_tem_mensalidades BOOLEAN;
  v_data_ativacao DATE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  SELECT * INTO v_inst FROM public.instalacoes WHERE id = p_instalacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  IF v_role NOT IN ('superadmin', 'adm', 'operador') AND v_inst.instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: esta instalação não está atribuída ao seu usuário.');
  END IF;

  -- 1. Validação de IMEI
  v_imei_limpo := regexp_replace(trim(p_imei_conferido), '\D', '', 'g');
  v_imei_esperado := regexp_replace(trim(COALESCE(v_inst.rastreador_imei, '')), '\D', '', 'g');

  IF v_imei_esperado <> '' AND v_imei_limpo <> v_imei_esperado THEN
    RETURN jsonb_build_object(
      'success', false, 
      'divergencia_imei', true,
      'message', 'Rastreador não confere com o disponibilizado para este veículo. IMEI esperado: ' || v_inst.rastreador_imei
    );
  END IF;

  -- 2. Valor de repasse da instalação
  IF p_com_bloqueador THEN
    SELECT COALESCE(valor_instalacao_com_bloqueador, valor_por_instalacao, 80.00)
    INTO v_valor_final
    FROM public.profiles
    WHERE id = v_inst.instalador_id;
  ELSE
    SELECT COALESCE(valor_instalacao_sem_bloqueador, valor_por_instalacao, 50.00)
    INTO v_valor_final
    FROM public.profiles
    WHERE id = v_inst.instalador_id;
  END IF;

  IF v_valor_final IS NULL OR v_valor_final <= 0 THEN
    v_valor_final := CASE WHEN p_com_bloqueador THEN 80.00 ELSE 50.00 END;
  END IF;

  -- 3. Ativar veículo do cliente
  v_veiculo_id := v_inst.veiculo_id;
  IF v_veiculo_id IS NULL THEN
    INSERT INTO public.veiculos (
      cliente_id,
      placa,
      marca_modelo,
      ano,
      cor,
      tipo_veiculo,
      odometro_km,
      horimetro_horas,
      ativo,
      ignicao_status,
      created_at,
      updated_at
    ) VALUES (
      v_inst.cliente_id,
      trim(upper(p_placa)),
      trim(p_marca || ' ' || p_modelo),
      p_ano,
      p_cor,
      p_tipo_veiculo,
      COALESCE(p_km_instalacao, 0),
      COALESCE(p_horimetro_inicial, 0.00),
      TRUE,
      FALSE,
      NOW(),
      NOW()
    ) RETURNING id INTO v_veiculo_id;
  ELSE
    UPDATE public.veiculos
    SET
      placa = trim(upper(p_placa)),
      marca_modelo = trim(p_marca || ' ' || p_modelo),
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      tipo_veiculo = p_tipo_veiculo,
      odometro_km = CASE WHEN p_km_instalacao > 0 THEN p_km_instalacao ELSE odometro_km END,
      horimetro_horas = CASE WHEN p_horimetro_inicial > 0 THEN p_horimetro_inicial ELSE horimetro_horas END,
      ativo = TRUE,
      updated_at = NOW()
    WHERE id = v_veiculo_id;
  END IF;

  v_data_ativacao := CURRENT_DATE;

  -- 4. Concluir ordem de instalação
  UPDATE public.instalacoes
  SET
    veiculo_id = v_veiculo_id,
    placa = trim(upper(p_placa)),
    marca = trim(p_marca),
    modelo = trim(p_modelo),
    ano = p_ano,
    cor = p_cor,
    tipo_veiculo = p_tipo_veiculo,
    km_instalacao = COALESCE(p_km_instalacao, 0),
    horimetro_inicial = COALESCE(p_horimetro_inicial, 0.00),
    com_bloqueador = p_com_bloqueador,
    tipo_bloqueador = CASE WHEN p_com_bloqueador THEN 'rele_combustivel' ELSE 'sem_bloqueador' END,
    posicao_instalacao = trim(p_posicao_instalacao),
    valor_instalacao = v_valor_final,
    status = 'concluida',
    status_pagamento = 'pendente',
    kit_confirmado_instalador = TRUE,
    imei_confirmado = v_imei_limpo,
    observacoes = COALESCE(p_observacoes, observacoes),
    data_instalacao = v_data_ativacao,
    concluida_at = NOW(),
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- 5. Atualizar status do cliente para ativo e fixar data de início do contrato na ativação real
  UPDATE public.clientes
  SET
    status = 'ativo',
    status_agendamento = 'concluido',
    data_inicio_contrato = COALESCE(data_inicio_contrato, v_data_ativacao),
    updated_at = NOW()
  WHERE id = v_inst.cliente_id;

  -- 6. Iniciar geração das parcelas de cobrança a partir da data de ativação (se ainda não geradas)
  SELECT EXISTS (
    SELECT 1 FROM public.mensalidades WHERE cliente_id = v_inst.cliente_id
  ) INTO v_tem_mensalidades;

  IF NOT v_tem_mensalidades THEN
    PERFORM public.admin_gerar_parcelas_contrato(v_inst.cliente_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Instalação concluída com sucesso! Veículo ativado e cobrança iniciada a partir da data de instalação.',
    'instalacao_id', p_instalacao_id,
    'valor_instalacao', v_valor_final,
    'veiculo_id', v_veiculo_id
  );
END;
$$;

-- 4. Atualizar admin_cadastrar_cliente_completo: veículo cadastrado inicia com ativo = FALSE (aguardando instalação)
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

  -- 5. Cadastro do primeiro veiculo se informado (inicia com ativo = FALSE ate a conclusao da instalacao/ativacao)
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
      FALSE,
      FALSE,
      now(),
      now()
    );
  END IF;

  -- 6. Tenta gerar parcelas do contrato (admin_gerar_parcelas_contrato somente gera se houver veiculo ativo)
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
    'message', 'Cliente e contrato cadastrados com sucesso. Cobrança de parcelas iniciará após a ativação do primeiro veículo.',
    'cliente_id', v_cliente_id,
    'user_id', v_user_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

-- 5. Excluir quaisquer mensalidades prematuras de clientes que ainda estejam sem nenhum veículo ativo
DELETE FROM public.mensalidades
WHERE cliente_id IN (
  SELECT c.id FROM public.clientes c
  WHERE c.status = 'aguardando_instalacao'
     OR NOT EXISTS (
       SELECT 1 FROM public.veiculos v WHERE v.cliente_id = c.id AND v.ativo = TRUE
     )
);

-- 6. Permissões
GRANT EXECUTE ON FUNCTION public.admin_gerar_parcelas_contrato(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gerar_mensalidades_mes(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instalador_concluir_atendimento(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, INT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cadastrar_cliente_completo(TEXT, TEXT, TEXT, TEXT, public.plano_cliente, INT, NUMERIC, INT, INT, BOOLEAN, TEXT, TEXT, TEXT, INT, UUID, INT, DATE, TEXT, INT, TEXT) TO authenticated;

-- 7. Invalidação de Cache PostgREST Obrigatória (Regra Pétrea)
NOTIFY pgrst, 'reload schema';

