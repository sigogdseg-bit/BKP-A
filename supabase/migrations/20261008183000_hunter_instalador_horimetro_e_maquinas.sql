-- ============================================================================
-- HUNTER — MÓDULO DO INSTALADOR (2 VALORES COM/SEM BLOQUEADOR, CONFERÊNCIA ESTRITA),
-- HORÍMETRO GERAL (PÓS-CHAVE OU IGNIÇÃO) E VEÍCULOS TIPO "MÁQUINA"
-- ============================================================================

-- 1. VALORES DE INSTALAÇÃO COM/SEM BLOQUEADOR EM PROFILES
DO $$
BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS valor_instalacao_sem_bloqueador NUMERIC(10,2) DEFAULT 0.00;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS valor_instalacao_com_bloqueador NUMERIC(10,2) DEFAULT 0.00;
  
  -- Migrar valor_por_instalacao legado para valor_instalacao_sem_bloqueador caso esteja zerado
  UPDATE public.profiles
  SET valor_instalacao_sem_bloqueador = valor_por_instalacao
  WHERE (valor_instalacao_sem_bloqueador IS NULL OR valor_instalacao_sem_bloqueador = 0)
    AND valor_por_instalacao > 0;

  UPDATE public.profiles
  SET valor_instalacao_com_bloqueador = valor_instalacao_sem_bloqueador + 30.00
  WHERE (valor_instalacao_com_bloqueador IS NULL OR valor_instalacao_com_bloqueador = 0)
    AND valor_instalacao_sem_bloqueador > 0;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. CAMPOS NA TABELA DE INSTALAÇÕES
DO $$
BEGIN
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS com_bloqueador BOOLEAN DEFAULT FALSE;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS posicao_instalacao TEXT;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS horimetro_inicial NUMERIC(10,2) DEFAULT 0.00;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS tipo_bloqueador TEXT DEFAULT 'rele_combustivel';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. CONFIGURAÇÃO DE HORÍMETRO E FIDELIDADE EM CLIENTES
DO $$
BEGIN
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS regra_horimetro TEXT DEFAULT 'pos_chave';
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tem_fidelidade BOOLEAN DEFAULT TRUE;
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'basico';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. SUPORTE A TIPO "MÁQUINA" E HORÍMETRO EM VEÍCULOS
DO $$
BEGIN
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS horimetro_horas NUMERIC(10,2) DEFAULT 0.00;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS horimetro_modo TEXT DEFAULT 'pos_chave';

  -- Atualizar constraint de tipo_veiculo para incluir 'maquina'
  ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS chk_tipo_veiculo;
  ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS veiculos_tipo_veiculo_check;
  ALTER TABLE public.veiculos ADD CONSTRAINT chk_tipo_veiculo
    CHECK (tipo_veiculo IN (
      'carro', 'moto', 'caminhao', 'van', 'ambulancia', 'onibus', 
      'suv', 'camionete', 'quadriciculo', 'triciclo', 'jetski', 
      'maquina', 'trator', 'outro'
    ));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 5. SUPORTE A HORAS DE HORÍMETRO EM MANUTENÇÃO PREVENTIVA
DO $$
BEGIN
  ALTER TABLE public.planos_manutencao_preventiva ADD COLUMN IF NOT EXISTS intervalo_horas NUMERIC(10,2);
  ALTER TABLE public.planos_manutencao_preventiva ADD COLUMN IF NOT EXISTS ultimo_horas_realizado NUMERIC(10,2) DEFAULT 0;
  ALTER TABLE public.planos_manutencao_preventiva ADD COLUMN IF NOT EXISTS proximo_horas_alvo NUMERIC(10,2);
  ALTER TABLE public.planos_manutencao_preventiva ADD COLUMN IF NOT EXISTS aviso_antecipado_horas NUMERIC(10,2) DEFAULT 20;
  ALTER TABLE public.planos_manutencao_preventiva ADD COLUMN IF NOT EXISTS tipo_metrica TEXT DEFAULT 'km';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 6. RPC: INSTALADOR FINALIZAR INSTALAÇÃO COM VALIDAÇÃO ESTRITA DE IMEI
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
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  -- Obter a ordem de instalação
  SELECT * INTO v_inst FROM public.instalacoes WHERE id = p_instalacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  -- Se for instalador, garantir que a ordem é dele
  IF v_role NOT IN ('superadmin', 'adm', 'operador') AND v_inst.instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: esta instalação não está atribuída ao seu usuário.');
  END IF;

  -- 1. VALIDAÇÃO ESTRITA DO IMEI
  v_imei_limpo := regexp_replace(trim(p_imei_conferido), '\D', '', 'g');
  v_imei_esperado := regexp_replace(trim(COALESCE(v_inst.rastreador_imei, '')), '\D', '', 'g');

  IF v_imei_esperado <> '' AND v_imei_limpo <> v_imei_esperado THEN
    RETURN jsonb_build_object(
      'success', false, 
      'divergencia_imei', true,
      'message', 'Rastreador não confere com o disponibilizado para este veículo. IMEI esperado: ' || v_inst.rastreador_imei
    );
  END IF;

  -- 2. CALCULAR VALOR DA INSTALAÇÃO (COM OU SEM BLOQUEADOR)
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

  -- 3. CRIAR OU ATUALIZAR VEÍCULO DO CLIENTE
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

  -- 4. CONCLUIR ORDEM DE INSTALAÇÃO E GERAR PENDÊNCIA DE REPASSE FINANCEIRO
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
    concluida_at = NOW(),
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- 5. ATUALIZAR STATUS DO CLIENTE
  UPDATE public.clientes
  SET
    status = 'ativo',
    status_agendamento = 'concluido',
    updated_at = NOW()
  WHERE id = v_inst.cliente_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Instalação concluída com sucesso! Pendência de repasse financeiro gerada para o operador.',
    'instalacao_id', p_instalacao_id,
    'valor_instalacao', v_valor_final,
    'veiculo_id', v_veiculo_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_concluir_atendimento(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, INT, NUMERIC, TEXT) TO authenticated;

-- 7. ATUALIZAR RPC CANÔNICA DE DEMANDAS DO INSTALADOR COM ESTATÍSTICAS FINANCEIRAS SEGREGADAS
CREATE OR REPLACE FUNCTION public.instalador_obter_minhas_demandas(
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_alvo_id UUID;
  v_ordens JSONB;
  v_agendamentos JSONB;
  v_resumo JSONB;
  v_total_a_receber NUMERIC(10,2) := 0.00;
  v_total_recebido NUMERIC(10,2) := 0.00;
  v_total_agendados_qtd INT := 0;
  v_total_a_agendar_qtd INT := 0;
  v_valor_previsto_agendados NUMERIC(10,2) := 0.00;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  IF v_role IN ('superadmin', 'adm', 'operador') THEN
    v_alvo_id := COALESCE(p_instalador_id, v_caller_id);
  ELSE
    v_alvo_id := v_caller_id;
  END IF;

  -- 1. Coletar Ordens da tabela public.instalacoes
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'instalador_id', i.instalador_id,
      'instalador_nome', COALESCE(p.nome, 'Instalador'),
      'instalador_chave_pix', p.chave_pix,
      'instalador_valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
      'instalador_valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador,
      'cliente_id', i.cliente_id,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_documento', c.documento,
      'cliente_telefone', c.telefone,
      'cliente_plano', c.plano,
      'cliente_tem_fidelidade', c.tem_fidelidade,
      'cliente_regra_horimetro', c.regra_horimetro,
      'veiculo_id', i.veiculo_id,
      'placa', COALESCE(i.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, 'A DEFINIR'),
      'modelo', COALESCE(i.modelo, 'Veículo do Cliente'),
      'ano', i.ano,
      'cor', i.cor,
      'tipo_veiculo', COALESCE(i.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'horimetro_inicial', COALESCE(i.horimetro_inicial, 0.00),
      'rastreador_id', i.rastreador_id,
      'rastreador_imei', COALESCE(i.rastreador_imei, 'PENDENTE'),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, 'J16 4G'),
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'com_bloqueador', COALESCE(i.com_bloqueador, FALSE),
      'tipo_bloqueador', i.tipo_bloqueador,
      'posicao_instalacao', i.posicao_instalacao,
      'status', i.status,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'valor_instalacao', COALESCE(i.valor_instalacao, 50.00),
      'status_pagamento', COALESCE(i.status_pagamento, 'pendente'),
      'pago_em', i.pago_em,
      'pago_por', i.pago_por,
      'comprovante_pagamento', i.comprovante_pagamento,
      'kit_determinado_em', i.kit_determinado_em,
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, FALSE),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id;

  -- 2. Coletar Clientes Agendados ou Aguardando Agendamento
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome_razao_social', c.nome_razao_social,
      'documento', c.documento,
      'telefone', c.telefone,
      'email', c.email,
      'status', c.status,
      'plano', c.plano,
      'tem_fidelidade', c.tem_fidelidade,
      'regra_horimetro', c.regra_horimetro,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', c.instalador_id,
      'instalador', jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'endereco_instalacao', p.endereco_instalacao,
        'valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
        'valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador
      ),
      'veiculos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 
          'placa', v.placa, 
          'modelo', v.marca_modelo, 
          'tipo_veiculo', v.tipo_veiculo,
          'horimetro_horas', v.horimetro_horas
        ))
        FROM public.veiculos v
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = c.instalador_id
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Métricas Financeiras e Operacionais Específicas do Instalador
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'concluida' AND status_pagamento = 'pendente' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status = 'concluida' AND status_pagamento = 'pago' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status = 'agendada' THEN valor_instalacao ELSE 0 END), 0.00),
    COUNT(CASE WHEN status = 'agendada' THEN 1 END)
  INTO 
    v_total_a_receber,
    v_total_recebido,
    v_valor_previsto_agendados,
    v_total_agendados_qtd
  FROM public.instalacoes
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR instalador_id = v_alvo_id;

  SELECT COUNT(*)
  INTO v_total_a_agendar_qtd
  FROM public.clientes
  WHERE ((v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL) OR instalador_id = v_alvo_id)
    AND (status_agendamento IS NULL OR status_agendamento = 'aguardando_agendamento')
    AND status = 'aguardando_instalacao';

  v_resumo := jsonb_build_object(
    'total_ordens', jsonb_array_length(v_ordens),
    'total_agendamentos', jsonb_array_length(v_agendamentos),
    'a_receber', v_total_a_receber,
    'recebido', v_total_recebido,
    'agendados_qtd', v_total_agendados_qtd,
    'a_agendar_qtd', v_total_a_agendar_qtd,
    'valor_previsto_agendados', v_valor_previsto_agendados
  );

  RETURN jsonb_build_object(
    'success', true,
    'ordens', v_ordens,
    'agendamentos', v_agendamentos,
    'resumo', v_resumo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_obter_minhas_demandas(UUID) TO authenticated;

-- 8. RPC: AUTO-CADASTRO DE INSTALADOR POR CONVITE COM 2 VALORES
DROP FUNCTION IF EXISTS public.cadastrar_instalador_por_convite(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.cadastrar_instalador_por_convite(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.cadastrar_instalador_por_convite(
  p_token TEXT,
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_telefone TEXT DEFAULT NULL,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_valor_instalacao_sem_bloqueador NUMERIC DEFAULT 0,
  p_valor_instalacao_com_bloqueador NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_convite RECORD;
  v_user_id UUID;
  v_nome_limpo TEXT;
  v_email_limpo TEXT;
  v_encrypted_pw TEXT;
  v_val_sem NUMERIC;
  v_val_com NUMERIC;
BEGIN
  v_val_sem := COALESCE(p_valor_instalacao_sem_bloqueador, 0);
  v_val_com := COALESCE(p_valor_instalacao_com_bloqueador, 0);

  SELECT * INTO v_convite
  FROM public.convites_instalador
  WHERE token = TRIM(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite nao localizado ou invalido.';
  END IF;

  IF v_convite.usado THEN
    RAISE EXCEPTION 'Este link de convite ja foi utilizado e nao e mais valido.';
  END IF;

  IF v_convite.expira_em < NOW() THEN
    RAISE EXCEPTION 'Este link de convite expirou. Solicite um novo link a administracao.';
  END IF;

  v_nome_limpo := TRIM(p_nome);
  v_email_limpo := LOWER(TRIM(p_email));

  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Nome completo e obrigatorio.';
  END IF;

  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'E-mail e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR LENGTH(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha deve conter no minimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Este e-mail ja esta cadastrado no sistema.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_senha, extensions.gen_salt('bf'));
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email_limpo,
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}'::JSONB,
    jsonb_build_object(
      'nome', v_nome_limpo,
      'role', 'instalador',
      'telefone', p_telefone,
      'convite_token', p_token
    ),
    NOW(),
    NOW()
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
    'email',
    v_email_limpo,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  INSERT INTO public.profiles (
    id, nome, email, role, ativo,
    telefone, chave_pix, endereco_instalacao,
    valor_instalacao_sem_bloqueador, valor_instalacao_com_bloqueador,
    valor_por_instalacao, primeiro_acesso, created_at, updated_at
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    'instalador',
    FALSE,
    p_telefone,
    p_chave_pix,
    p_endereco_instalacao,
    v_val_sem,
    v_val_com,
    v_val_sem,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    telefone = EXCLUDED.telefone,
    chave_pix = EXCLUDED.chave_pix,
    endereco_instalacao = EXCLUDED.endereco_instalacao,
    valor_instalacao_sem_bloqueador = EXCLUDED.valor_instalacao_sem_bloqueador,
    valor_instalacao_com_bloqueador = EXCLUDED.valor_instalacao_com_bloqueador,
    valor_por_instalacao = EXCLUDED.valor_por_instalacao,
    primeiro_acesso = FALSE,
    updated_at = NOW();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'instalador')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_module_access (user_id, module, ativo)
  VALUES (v_user_id, 'instalacao', TRUE)
  ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;

  UPDATE public.convites_instalador
  SET
    usado = TRUE,
    usado_em = NOW(),
    usado_por = v_user_id
  WHERE token = TRIM(p_token);

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'mensagem', 'Cadastro realizado com sucesso! Aguarde a ativacao da sua conta pela administracao.',
    'user_id', v_user_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.cadastrar_instalador_por_convite(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO anon, authenticated;

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
