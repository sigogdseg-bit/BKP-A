-- ============================================================================
-- HUNTER — CORREÇÃO: PRIMEIRO ACESSO DO INSTALADOR E AGENDAMENTO DE INSTALAÇÕES
-- ============================================================================
-- Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- 1. Se o próprio instalador realizou o auto-cadastro por convite escolhendo sua senha,
--    NÃO deve forçar a troca de senha (primeiro_acesso = FALSE).
-- 2. Garantir inserção em public.user_roles e public.user_module_access para instaladores.
-- 3. Garantir RLS em public.clientes e public.veiculos para o instalador visualizar demandas atribuídas.
-- 4. Ajustar admin_atualizar_cliente_completo para atualizar status_agendamento ao atribuir instalador.
-- 5. Ajustar admin_gerar_pendencia_instalacao_cliente para aceitar papel 'adm'.
-- 6. Ajustar instalador_definir_agendamento para permitir agendamento caso haja ordem em instalacoes.
-- ============================================================================

-- 1. Sincronizar perfis de instaladores auto-cadastrados (primeiro_acesso = FALSE)
UPDATE public.profiles
SET primeiro_acesso = FALSE
WHERE id IN (
  SELECT usado_por_user_id 
  FROM public.convites_instalador 
  WHERE usado_por_user_id IS NOT NULL
);

UPDATE public.profiles
SET primeiro_acesso = FALSE
WHERE role = 'instalador'
  AND id IN (
    SELECT id FROM auth.users 
    WHERE raw_user_meta_data->>'convite_token' IS NOT NULL
  );

-- 2. Garantir user_roles e user_module_access para todos os instaladores cadastrados
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'instalador'::public.hunter_role
FROM public.profiles
WHERE role = 'instalador'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_module_access (user_id, module, ativo)
SELECT id, 'instalacao', TRUE
FROM public.profiles
WHERE role = 'instalador'
ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;

-- 3. Atualizar RPC cadastrar_instalador_por_convite
CREATE OR REPLACE FUNCTION public.cadastrar_instalador_por_convite(
  p_token TEXT,
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_telefone TEXT DEFAULT NULL,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL
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
BEGIN
  -- 1. Validar e travar o convite
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

  -- 2. Validar Dados
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

  -- 3. Gerar Hash de Senha Seguro
  v_encrypted_pw := extensions.crypt(p_senha, extensions.gen_salt('bf'));
  v_user_id := gen_random_uuid();

  -- 4. Criar Conta em auth.users
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

  -- 5. Criar Perfil em public.profiles: OBRIGATORIAMENTE INATIVO (ativo = false)
  -- Mas primeiro_acesso = FALSE pois ele mesmo definiu a sua senha no convite
  INSERT INTO public.profiles (
    id, nome, email, role, ativo,
    telefone, chave_pix, endereco_instalacao,
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
    50.00,
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = 'instalador',
    ativo = FALSE,
    primeiro_acesso = FALSE,
    telefone = EXCLUDED.telefone,
    chave_pix = EXCLUDED.chave_pix,
    endereco_instalacao = EXCLUDED.endereco_instalacao,
    updated_at = NOW();

  -- 6. Inserir em user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'instalador')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Liberar Acesso ao Módulo de Instalações
  INSERT INTO public.user_module_access (user_id, module, ativo)
  VALUES (v_user_id, 'instalacao', TRUE)
  ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;

  -- 8. Queimar o Token de Convite (Uso Único Imediato)
  UPDATE public.convites_instalador
  SET
    usado = TRUE,
    usado_em = NOW(),
    usado_por_user_id = v_user_id
  WHERE id = v_convite.id;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'mensagem', 'Cadastro realizado com sucesso! Sua conta foi enviada para analise e aguarda habilitacao pela administracao.',
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_instalador_por_convite TO anon, authenticated;

-- 4. RLS atualizado em public.clientes para permitir que instaladores consultem suas demandas
DROP POLICY IF EXISTS "Instaladores consultam clientes para instalacao" ON public.clientes;
CREATE POLICY "Instaladores consultam clientes para instalacao"
ON public.clientes FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  instalador_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'instalador')) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'instalador') OR
  EXISTS (SELECT 1 FROM public.instalacoes WHERE cliente_id = public.clientes.id AND instalador_id = auth.uid())
);

-- 5. RLS atualizado em public.veiculos para permitir que instaladores consultem veículos dos clientes vinculados
DROP POLICY IF EXISTS "Instaladores visualizam veiculos para instalacao" ON public.veiculos;
CREATE POLICY "Instaladores visualizam veiculos para instalacao"
ON public.veiculos FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  EXISTS (
    SELECT 1 FROM public.clientes c 
    WHERE c.id = public.veiculos.cliente_id AND c.instalador_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.instalacoes i 
    WHERE (i.veiculo_id = public.veiculos.id OR i.cliente_id = public.veiculos.cliente_id) 
      AND i.instalador_id = auth.uid()
  )
);

-- 6. Atualizar RPC admin_gerar_pendencia_instalacao_cliente para aceitar papel 'adm'
CREATE OR REPLACE FUNCTION public.admin_gerar_pendencia_instalacao_cliente(
  p_cliente_id UUID,
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_cliente RECORD;
  v_tem_veiculo_ativo BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem gerar pendência de instalação.';
    END IF;
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  -- Verifica se o cliente possui algum veículo ativo com rastreador
  SELECT EXISTS (
    SELECT 1 FROM public.veiculos
    WHERE cliente_id = p_cliente_id AND ativo = true AND rastreador_id IS NOT NULL
  ) INTO v_tem_veiculo_ativo;

  UPDATE public.clientes
  SET
    instalador_id = COALESCE(p_instalador_id, instalador_id),
    status_agendamento = 'aguardando_agendamento',
    data_agendamento = NULL,
    hora_agendamento = NULL,
    status = CASE WHEN v_tem_veiculo_ativo THEN status ELSE 'aguardando_instalacao' END,
    updated_at = NOW()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'cliente_id', p_cliente_id,
    'status_agendamento', 'aguardando_agendamento',
    'mensagem', 'Pendência de instalação gerada com sucesso para o instalador.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_gerar_pendencia_instalacao_cliente TO authenticated;

-- 7. Atualizar RPC instalador_definir_agendamento para associar instalador_id caso pendente
CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento(
  p_cliente_id UUID,
  p_data DATE,
  p_hora TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_instalador_id UUID;
  v_cliente_nome TEXT;
BEGIN
  -- 1. Obter dados do cliente
  SELECT instalador_id, nome_razao_social INTO v_instalador_id, v_cliente_nome
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- Se v_instalador_id estiver nulo no cliente, mas o chamador tiver ordem em instalacoes:
  IF v_instalador_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.instalacoes 
      WHERE cliente_id = p_cliente_id AND instalador_id = v_caller_id AND status != 'concluida'
    ) THEN
      v_instalador_id := v_caller_id;
      UPDATE public.clientes SET instalador_id = v_caller_id WHERE id = p_cliente_id;
    END IF;
  END IF;

  -- 2. Verificar se o chamador é o instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuido ou administrador podem agendar este atendimento.';
  END IF;

  -- 3. Validar data e hora
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento e obrigatoria.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horario do agendamento e obrigatorio.';
  END IF;

  -- 4. Atualizar o agendamento
  UPDATE public.clientes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Agendamento confirmado para o cliente ' || v_cliente_nome || ' em ' || to_char(p_data, 'DD/MM/YYYY') || ' as ' || trim(p_hora) || '.',
    'cliente_id', p_cliente_id,
    'data', p_data,
    'hora', trim(p_hora)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento TO authenticated;

-- 8. Atualizar RPC admin_atualizar_cliente_completo para atualizar status_agendamento ao vincular instalador
CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT,
  p_email TEXT,
  p_telefone TEXT,
  p_status public.status_cliente,
  p_plano public.plano_cliente,
  p_dia_vencimento INT,
  p_valor_mensalidade NUMERIC,
  p_dias_historico INT,
  p_dias_retencao INT,
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
  v_user_id UUID;
  v_email_limpo TEXT := lower(trim(coalesce(p_email, '')));
  v_resultado_parcelas JSONB := '[]'::JSONB;
  v_meses_c INT := COALESCE(p_meses_contrato, 12);
  v_data_inicio DATE := COALESCE(p_data_inicio_contrato, CURRENT_DATE);
  v_data_fim DATE;
  v_status_final public.status_cliente := p_status;
  v_status_agendamento_final TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar clientes.';
  END IF;

  SELECT user_id, status_agendamento INTO v_user_id, v_status_agendamento_final
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  v_data_fim := v_data_inicio + (v_meses_c || ' months')::INTERVAL;

  -- Se foi atribuído instalador e status de agendamento está pendente ou nulo:
  IF p_instalador_id IS NOT NULL THEN
    IF v_status_agendamento_final IS NULL OR v_status_agendamento_final = 'concluido' THEN
      v_status_agendamento_final := 'aguardando_agendamento';
    END IF;
    -- Se cliente não possui veículos ativos com rastreadores, força status operacional aguardando_instalacao
    IF NOT EXISTS (
      SELECT 1 FROM public.veiculos WHERE cliente_id = p_cliente_id AND ativo = TRUE AND rastreador_id IS NOT NULL
    ) THEN
      v_status_final := 'aguardando_instalacao'::public.status_cliente;
    END IF;
  END IF;

  -- Atualizar credenciais de auth se aplicável
  IF v_user_id IS NOT NULL THEN
    IF v_email_limpo <> '' THEN
      UPDATE auth.users
      SET email = v_email_limpo,
          raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'email', v_email_limpo),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE public.profiles
      SET nome = trim(p_nome),
          email = v_email_limpo,
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_limpo)),
          provider_id = v_email_limpo
      WHERE user_id = v_user_id AND provider = 'email';
    ELSE
      UPDATE public.profiles
      SET nome = trim(p_nome),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.users
      SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
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
      status = v_status_final,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      instalador_id = p_instalador_id,
      status_agendamento = COALESCE(v_status_agendamento_final, status_agendamento),
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

GRANT EXECUTE ON FUNCTION public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID, INT, DATE, TEXT, INT, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
