-- ============================================================================
-- HUNTER — MÓDULO DE INSTALAÇÃO, PERFIL INSTALADOR E REPASSES FINANCEIROS
-- ============================================================================
-- Diretrizes: DJR-NEW & DJR-APP
-- Versão Alvo: 1.5.2.0
-- ============================================================================

-- 1. Adicionar o papel 'instalador' no ENUM hunter_role (deve rodar fora de bloco DO no Postgres)
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'instalador';

-- 2. Adicionar coluna de valor por instalação no perfil do instalador
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS valor_por_instalacao NUMERIC(10,2) DEFAULT 0.00;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 3. Tabela de Instalações Técnicas
CREATE TABLE IF NOT EXISTS public.instalacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  
  -- Dados do Veículo
  placa TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  ano INT,
  cor TEXT,
  km_instalacao INT NOT NULL DEFAULT 0,
  
  -- Dados do Rastreador e Dispositivo
  rastreador_imei TEXT NOT NULL,
  rastreador_modelo TEXT DEFAULT 'J16 4G',
  chip_iccid TEXT,
  chip_operadora TEXT,
  posicao_instalacao TEXT,
  
  -- Status Operacional da Instalação
  status TEXT NOT NULL DEFAULT 'nao_instalado' CHECK (status IN ('nao_instalado', 'concluida_com_pendencia', 'concluida')),
  motivo_pendencia_recusa TEXT,
  observacoes TEXT,
  
  -- Financeiro e Repasse ao Instalador
  valor_instalacao NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente', 'pago')),
  pago_em TIMESTAMPTZ,
  pago_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  comprovante_pagamento TEXT,
  
  -- Metadados e Conclusão
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instalacoes_instalador ON public.instalacoes(instalador_id);
CREATE INDEX IF NOT EXISTS idx_instalacoes_cliente ON public.instalacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_instalacoes_status ON public.instalacoes(status);
CREATE INDEX IF NOT EXISTS idx_instalacoes_pagamento ON public.instalacoes(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_instalacoes_placa ON public.instalacoes(placa);

-- 4. Tabela de Histórico de Atendimentos da Instalação (Linha do Tempo Imutável)
CREATE TABLE IF NOT EXISTS public.instalacoes_historico_atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instalacao_id UUID NOT NULL REFERENCES public.instalacoes(id) ON DELETE CASCADE,
  instalador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status_atendimento TEXT NOT NULL,
  motivo TEXT,
  observacoes TEXT,
  km_no_atendimento INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instalacoes_hist_inst ON public.instalacoes_historico_atendimentos(instalacao_id, created_at DESC);

-- 5. Habilitar Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.instalacoes;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 6. Row Level Security (RLS) Estrito
ALTER TABLE public.instalacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instalacoes_historico_atendimentos ENABLE ROW LEVEL SECURITY;

-- 6.1. Políticas de RLS em 'instalacoes'
DROP POLICY IF EXISTS "Instaladores acessam estritamente suas proprias instalacoes" ON public.instalacoes;
CREATE POLICY "Instaladores acessam estritamente suas proprias instalacoes"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  instalador_id = auth.uid()
);

DROP POLICY IF EXISTS "Instaladores podem cadastrar instalacoes" ON public.instalacoes;
CREATE POLICY "Instaladores podem cadastrar instalacoes"
ON public.instalacoes FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  instalador_id = auth.uid()
);

DROP POLICY IF EXISTS "Instaladores e Administradores podem atualizar instalacoes" ON public.instalacoes;
CREATE POLICY "Instaladores e Administradores podem atualizar instalacoes"
ON public.instalacoes FOR UPDATE TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  instalador_id = auth.uid()
);

-- 6.2. Políticas de RLS em 'instalacoes_historico_atendimentos'
DROP POLICY IF EXISTS "Historico visivel para administradores e instalador responsavel" ON public.instalacoes_historico_atendimentos;
CREATE POLICY "Historico visivel para administradores e instalador responsavel"
ON public.instalacoes_historico_atendimentos FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  instalador_id = auth.uid()
);

DROP POLICY IF EXISTS "Historico inserivel por administradores e instaladores" ON public.instalacoes_historico_atendimentos;
CREATE POLICY "Historico inserivel por administradores e instaladores"
ON public.instalacoes_historico_atendimentos FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  instalador_id = auth.uid()
);

-- 7. RPC Transacional para Salvar ou Reabrir Atendimento de Instalação
CREATE OR REPLACE FUNCTION public.salvar_atendimento_instalacao(
  p_instalacao_id UUID DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL,
  p_placa TEXT DEFAULT NULL,
  p_marca TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_km_instalacao INT DEFAULT 0,
  p_rastreador_imei TEXT DEFAULT NULL,
  p_rastreador_modelo TEXT DEFAULT 'J16 4G',
  p_chip_iccid TEXT DEFAULT NULL,
  p_chip_operadora TEXT DEFAULT NULL,
  p_posicao_instalacao TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'nao_instalado',
  p_motivo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_instalador_id UUID;
  v_valor_unitario NUMERIC(10,2) := 0.00;
  v_instalacao_id UUID;
  v_veiculo_id UUID := NULL;
  v_concluida_at TIMESTAMPTZ := NULL;
  v_placa_limpa TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  v_placa_limpa := UPPER(TRIM(REPLACE(COALESCE(p_placa, ''), '-', '')));

  -- Se for nova instalação, o instalador é o usuário logado (ou admin indicando a si)
  IF p_instalacao_id IS NULL THEN
    v_instalador_id := v_user_id;

    -- Carrega o valor por instalação cadastrado no perfil do instalador
    SELECT COALESCE(valor_por_instalacao, 0.00)
    INTO v_valor_unitario
    FROM public.profiles
    WHERE id = v_instalador_id;

    IF p_status = 'concluida' THEN
      v_concluida_at := NOW();
    END IF;

    -- Insere registro mestre da instalação
    INSERT INTO public.instalacoes (
      instalador_id,
      cliente_id,
      placa,
      marca,
      modelo,
      ano,
      cor,
      km_instalacao,
      rastreador_imei,
      rastreador_modelo,
      chip_iccid,
      chip_operadora,
      posicao_instalacao,
      status,
      motivo_pendencia_recusa,
      observacoes,
      valor_instalacao,
      concluida_at
    ) VALUES (
      v_instalador_id,
      p_cliente_id,
      v_placa_limpa,
      p_marca,
      p_modelo,
      p_ano,
      p_cor,
      p_km_instalacao,
      p_rastreador_imei,
      p_rastreador_modelo,
      p_chip_iccid,
      p_chip_operadora,
      p_posicao_instalacao,
      p_status,
      p_motivo,
      p_observacoes,
      v_valor_unitario,
      v_concluida_at
    ) RETURNING id INTO v_instalacao_id;

  ELSE
    -- Atualização / Reabertura de instalação existente
    v_instalacao_id := p_instalacao_id;

    SELECT instalador_id, concluida_at, veiculo_id
    INTO v_instalador_id, v_concluida_at, v_veiculo_id
    FROM public.instalacoes
    WHERE id = v_instalacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instalação não encontrada.';
    END IF;

    IF p_status = 'concluida' AND v_concluida_at IS NULL THEN
      v_concluida_at := NOW();
    END IF;

    UPDATE public.instalacoes
    SET
      cliente_id = COALESCE(p_cliente_id, cliente_id),
      placa = COALESCE(v_placa_limpa, placa),
      marca = COALESCE(p_marca, marca),
      modelo = COALESCE(p_modelo, modelo),
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      km_instalacao = COALESCE(p_km_instalacao, km_instalacao),
      rastreador_imei = COALESCE(p_rastreador_imei, rastreador_imei),
      rastreador_modelo = COALESCE(p_rastreador_modelo, rastreador_modelo),
      chip_iccid = COALESCE(p_chip_iccid, chip_iccid),
      chip_operadora = COALESCE(p_chip_operadora, chip_operadora),
      posicao_instalacao = COALESCE(p_posicao_instalacao, posicao_instalacao),
      status = p_status,
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      concluida_at = v_concluida_at,
      updated_at = NOW()
    WHERE id = v_instalacao_id;
  END IF;

  -- Grava o registro histórico imutável na timeline de atendimentos
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_instalacao_id,
    v_user_id,
    p_status,
    p_motivo,
    p_observacoes,
    p_km_instalacao
  );

  -- Se a instalação for concluída com sucesso, cadastra ou vincula o veículo na frota
  IF p_status = 'concluida' THEN
    -- Verifica se o veículo já existe por placa
    SELECT id INTO v_veiculo_id
    FROM public.veiculos
    WHERE placa = v_placa_limpa
    LIMIT 1;

    IF v_veiculo_id IS NULL THEN
      -- Cadastra o novo veículo
      INSERT INTO public.veiculos (
        cliente_id,
        placa,
        marca_modelo,
        ano,
        cor,
        odometro_km,
        status_operacional,
        rastreador_imei
      ) VALUES (
        p_cliente_id,
        v_placa_limpa,
        format('%s %s', p_marca, p_modelo),
        p_ano,
        p_cor,
        p_km_instalacao,
        'estacionado',
        p_rastreador_imei
      ) RETURNING id INTO v_veiculo_id;
    ELSE
      -- Atualiza odômetro e imei se necessário
      UPDATE public.veiculos
      SET
        odometro_km = GREATEST(odometro_km, p_km_instalacao),
        rastreador_imei = COALESCE(p_rastreador_imei, rastreador_imei),
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;

    -- Vincula o veiculo_id na instalação
    UPDATE public.instalacoes
    SET veiculo_id = v_veiculo_id
    WHERE id = v_instalacao_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'instalacao_id', v_instalacao_id,
    'status', p_status,
    'veiculo_id', v_veiculo_id
  );
END;
$$;

-- 8. RPC Administrativa para Marcar Pagamento de Repasse
CREATE OR REPLACE FUNCTION public.marcar_pagamento_instalacao(
  p_instalacao_id UUID,
  p_status_pagamento TEXT, -- 'pago' ou 'pendente'
  p_comprovante TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT public.is_admin_or_superadmin(v_user_id) THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem gerenciar repasses financeiros.';
  END IF;

  IF p_status_pagamento NOT IN ('pago', 'pendente') THEN
    RAISE EXCEPTION 'Status de pagamento inválido.';
  END IF;

  UPDATE public.instalacoes
  SET
    status_pagamento = p_status_pagamento,
    pago_em = CASE WHEN p_status_pagamento = 'pago' THEN NOW() ELSE NULL END,
    pago_por = CASE WHEN p_status_pagamento = 'pago' THEN v_user_id ELSE NULL END,
    comprovante_pagamento = p_comprovante,
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- Registra auditoria
  INSERT INTO public.system_activity_logs (
    usuario_id,
    acao,
    detalhe
  ) VALUES (
    v_user_id,
    'REPASSE_INSTALACAO_ALTERADO',
    format('Repasse da instalação %s alterado para %s.', p_instalacao_id, UPPER(p_status_pagamento))
  );

  RETURN jsonb_build_object('sucesso', true, 'instalacao_id', p_instalacao_id, 'status_pagamento', p_status_pagamento);
END;
$$;

-- 9. Atualizar admin_cadastrar_usuario para salvar valor_por_instalacao
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico',
  p_valor_por_instalacao NUMERIC DEFAULT 0.00
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
    'manutencao', 'usuarios', 'instalacao'
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

  -- 3. Se for adm ou superadmin, todos os módulos devem ser liberados automaticamente. Se for instalador, apenas 'instalacao'
  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSIF p_role = 'instalador' THEN
    v_modulos_finais := ARRAY['instalacao'];
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
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('nome', p_nome, 'role', p_role),
    now(), now(), '', '', '', ''
  );

  -- 5. Atualiza ou insere perfil em public.profiles
  INSERT INTO public.profiles (id, nome, email, role, ativo, valor_por_instalacao)
  VALUES (v_user_id, p_nome, LOWER(trim(p_email)), p_role, TRUE, COALESCE(p_valor_por_instalacao, 0.00))
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      valor_por_instalacao = COALESCE(EXCLUDED.valor_por_instalacao, public.profiles.valor_por_instalacao),
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

  -- 9. Registro de auditoria forense
  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    'USUARIO_CRIADO',
    format('Usuario %s (%s) criado com role %s por %s. Valor por instalacao: %s', p_nome, p_email, p_role, v_caller_id, COALESCE(p_valor_por_instalacao, 0.00))
  );

  RETURN jsonb_build_object('success', true, 'message', 'Usuario cadastrado com sucesso!', 'user_id', v_user_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 10. Atualizar admin_atualizar_usuario para salvar valor_por_instalacao
CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_user_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT NULL,
  p_valor_por_instalacao NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_mod TEXT;
  v_modulos_finais TEXT[];
  v_modulos_todos TEXT[] := ARRAY[
    'monitor-gps', 'atendimento', 'clientes', 'mensalidades',
    'rastreadores', 'central-seguranca', 'logs', 'dispositivos',
    'manutencao', 'usuarios', 'instalacao'
  ];
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerenciar usuarios.';
  END IF;

  IF p_role IN ('superadmin', 'adm') THEN
    v_modulos_finais := v_modulos_todos;
  ELSIF p_role = 'instalador' THEN
    v_modulos_finais := ARRAY['instalacao'];
  ELSE
    v_modulos_finais := p_modulos;
  END IF;

  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      valor_por_instalacao = COALESCE(p_valor_por_instalacao, valor_por_instalacao),
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role <> p_role;

  UPDATE public.user_module_access
  SET ativo = FALSE
  WHERE user_id = p_user_id;

  IF v_modulos_finais IS NOT NULL AND array_length(v_modulos_finais, 1) > 0 THEN
    FOREACH v_mod IN ARRAY v_modulos_finais LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_user_id, trim(v_mod), TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  IF p_role = 'cliente' AND p_plano IS NOT NULL THEN
    UPDATE public.clientes
    SET plano = p_plano, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.system_activity_logs (usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    'USUARIO_ATUALIZADO',
    format('Usuario %s atualizado para role %s. Ativo: %s', p_user_id, p_role, p_ativo)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Usuario atualizado com sucesso!');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
