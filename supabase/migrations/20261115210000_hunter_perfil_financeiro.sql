-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Criação Canônica do Perfil 'financeiro' (DJR-NEW)
-- Migration: 20261115210000_hunter_perfil_financeiro.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Cria o perfil 'financeiro' no ENUM hunter_role e concede estritamente os acessos
-- pertinentes ao setor financeiro:
-- - Acessa: Mensalidades e Cobrança, Financeiro e Fluxo de Caixa, Propostas Comerciais,
--           Visualização/Faturamento de Clientes, Repasses de Instalações Técnicas e
--           Comissões de Revendedores/Vendedores.
-- - Bloqueado: Rastreamento em tempo real (GPS), rotas, telemetria de frota, comandos
--              de bancada J16/USB, bloqueio veicular remoto, almoxarifado/estoque físico
--              e governança/gestão de usuários do sistema.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adicionar valor 'financeiro' ao ENUM public.hunter_role (deve rodar fora de bloco DO)
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'financeiro';

-- 2. Função de Verificação de Perfil Financeiro
CREATE OR REPLACE FUNCTION public.is_financeiro(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_fin BOOLEAN := FALSE;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role = 'financeiro'::public.hunter_role AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'financeiro'::public.hunter_role
  ) INTO v_is_fin;

  RETURN COALESCE(v_is_fin, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_financeiro(UUID) TO authenticated, anon;

-- 3. Atualizar admin_cadastrar_usuario para auto-atribuir módulos financeiros
CREATE OR REPLACE FUNCTION public.admin_cadastrar_usuario(
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico',
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_novo_user_id UUID;
  v_mod TEXT;
  v_email_limpo TEXT := LOWER(trim(p_email));
  v_telefone_limpo TEXT := NULLIF(trim(p_telefone), '');
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem criar novos usuarios.';
  END IF;

  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'O e-mail e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha deve conter no minimo 6 caracteres.';
  END IF;

  IF p_role = 'superadmin' AND v_email_limpo NOT IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    RAISE EXCEPTION 'Apenas as contas oficiais de governanca (novaes@adm.28bpm.local e novaes@oficial.tec.br) podem ser SuperADM.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Ja existe um usuario cadastrado com este e-mail.';
  END IF;

  v_novo_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_novo_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email_limpo,
    extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nome', trim(p_nome), 'role', p_role, 'telefone', v_telefone_limpo),
    now(), now(),
    '', '', '', ''
  );

  -- auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_novo_user_id::text)
       OR user_id = v_novo_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_novo_user_id::text, v_novo_user_id,
        jsonb_build_object('sub', v_novo_user_id::text, 'email', v_email_limpo),
        'email', v_novo_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (
    id, nome, email, role, valor_por_instalacao, chave_pix, endereco_instalacao, telefone, ativo
  )
  VALUES (
    v_novo_user_id, trim(p_nome), v_email_limpo, p_role, p_valor_por_instalacao, p_chave_pix, p_endereco_instalacao, v_telefone_limpo, TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      role = EXCLUDED.role,
      valor_por_instalacao = EXCLUDED.valor_por_instalacao,
      chave_pix = EXCLUDED.chave_pix,
      endereco_instalacao = EXCLUDED.endereco_instalacao,
      telefone = COALESCE(EXCLUDED.telefone, public.profiles.telefone),
      ativo = TRUE,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_novo_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Módulos automáticos por perfil
  IF p_role = 'instalador' THEN
    p_modulos := ARRAY['instalacao'];
  ELSIF p_role = 'financeiro' THEN
    p_modulos := ARRAY[
      'financeiro', 'mensalidades', 'propostas', 'clientes', 'revendedores',
      'instalacao', 'chat', 'atendimento', 'configuracoes', 'temas'
    ];
  ELSIF p_role = 'superadmin' OR p_role = 'adm' OR p_role = 'superadmin_auditor' THEN
    p_modulos := ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'mensalidades', 'financeiro',
      'rastreadores', 'central-seguranca', 'logs', 'dispositivos', 'manutencao',
      'instalacao', 'estoque', 'temas', 'configuracoes', 'usuarios', 'propostas',
      'revendedores'
    ];
  END IF;

  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (v_novo_user_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario criado com sucesso.',
    'user_id', v_novo_user_id
  );
END;
$$;

-- 4. Atualizar admin_atualizar_usuario para auto-atribuir módulos financeiros
CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_usuario_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_ativo BOOLEAN,
  p_plano public.plano_cliente DEFAULT 'basico',
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_valor_por_instalacao NUMERIC DEFAULT 0,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_email TEXT;
  v_target_email TEXT;
BEGIN
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = auth.uid();
  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_usuario_id;

  -- Governança: Criação/atribuição de superadmin e superadmin_auditor restrita a contas de governança
  IF p_role IN ('superadmin'::public.hunter_role, 'superadmin_auditor'::public.hunter_role) THEN
    IF LOWER(COALESCE(v_caller_email, '')) NOT IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
      RAISE EXCEPTION 'Acesso negado: apenas o SuperADM pode atribuir perfis de governança ou auditoria.';
    END IF;
  END IF;

  -- Blindagem das contas originais de SuperADM
  IF LOWER(COALESCE(v_target_email, '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    p_role := 'superadmin'::public.hunter_role;
    p_ativo := true;
  END IF;

  UPDATE public.profiles
  SET nome = p_nome,
      role = p_role,
      ativo = p_ativo,
      telefone = COALESCE(p_telefone, telefone),
      valor_por_instalacao = p_valor_por_instalacao,
      chave_pix = p_chave_pix,
      endereco_instalacao = p_endereco_instalacao,
      updated_at = NOW()
  WHERE id = p_usuario_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_usuario_id, p_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  -- Se for perfil financeiro e nenhum módulo foi explicitamente passado, atribui os canônicos
  IF p_role = 'financeiro'::public.hunter_role AND (p_modulos IS NULL OR cardinality(p_modulos) = 0) THEN
    DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, unnest(ARRAY[
      'financeiro', 'mensalidades', 'propostas', 'clientes', 'revendedores',
      'instalacao', 'chat', 'atendimento', 'configuracoes', 'temas'
    ]), true;
  ELSIF p_role = 'superadmin_auditor'::public.hunter_role THEN
    DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, unnest(ARRAY[
      'monitor-gps', 'rotas', 'frota', 'abastecimento', 'manutencao', 'instalacao',
      'clientes', 'motoristas', 'funcionarios', 'financeiro', 'mensalidades',
      'estoque', 'atendimento', 'chat', 'temas', 'demonstracao', 'configuracoes',
      'usuarios', 'central-seguranca', 'dispositivos', 'logs', 'rastreadores',
      'revendedores', 'propostas'
    ]), true;
  ELSIF p_modulos IS NOT NULL AND cardinality(p_modulos) > 0 THEN
    DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, unnest(p_modulos), true;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Usuário atualizado com sucesso.');
END;
$$;

-- 5. POLÍTICAS RLS ESPECÍFICAS PARA O SETOR FINANCEIRO

-- 5.1. Mensalidades: Acesso pleno para gestão de cobrança, faturas e baixas
DROP POLICY IF EXISTS "Financeiro gerencia mensalidades" ON public.mensalidades;
CREATE POLICY "Financeiro gerencia mensalidades"
ON public.mensalidades FOR ALL TO authenticated
USING (public.is_financeiro() OR public.is_adm())
WITH CHECK (public.is_financeiro() OR public.is_adm());

-- 5.2. Clientes: Consulta cadastral e atualização de dados financeiros (vencimento, mensalidade)
DROP POLICY IF EXISTS "Financeiro visualiza clientes" ON public.clientes;
CREATE POLICY "Financeiro visualiza clientes"
ON public.clientes FOR SELECT TO authenticated
USING (public.is_financeiro() OR public.is_adm());

DROP POLICY IF EXISTS "Financeiro atualiza faturamento clientes" ON public.clientes;
CREATE POLICY "Financeiro atualiza faturamento clientes"
ON public.clientes FOR UPDATE TO authenticated
USING (public.is_financeiro() OR public.is_adm())
WITH CHECK (public.is_financeiro() OR public.is_adm());

-- 5.3. Veículos: Consulta estrita para identificação de placas em cobranças (SEM permissão de alteração/comando)
DROP POLICY IF EXISTS "Financeiro visualiza dados cadastrais de veiculos" ON public.veiculos;
CREATE POLICY "Financeiro visualiza dados cadastrais de veiculos"
ON public.veiculos FOR SELECT TO authenticated
USING (public.is_financeiro() OR public.is_adm());

-- 5.4. Instalações: Consulta e liquidação de repasses técnicos a instaladores
DROP POLICY IF EXISTS "Financeiro visualiza instalacoes para repasses" ON public.instalacoes;
CREATE POLICY "Financeiro visualiza instalacoes para repasses"
ON public.instalacoes FOR SELECT TO authenticated
USING (public.is_financeiro() OR public.is_adm());

DROP POLICY IF EXISTS "Financeiro atualiza repasses instalacoes" ON public.instalacoes;
CREATE POLICY "Financeiro atualiza repasses instalacoes"
ON public.instalacoes FOR UPDATE TO authenticated
USING (public.is_financeiro() OR public.is_adm())
WITH CHECK (public.is_financeiro() OR public.is_adm());

-- 5.5. Revendedores e Vendedores: Consulta de bases e repasses de comissão
DROP POLICY IF EXISTS "Financeiro visualiza revendedores para repasses" ON public.revendedores;
CREATE POLICY "Financeiro visualiza revendedores para repasses"
ON public.revendedores FOR SELECT TO authenticated
USING (public.is_financeiro() OR public.is_adm());

DROP POLICY IF EXISTS "Financeiro visualiza vendedores para comissoes" ON public.vendedores;
CREATE POLICY "Financeiro visualiza vendedores para comissoes"
ON public.vendedores FOR SELECT TO authenticated
USING (public.is_financeiro() OR public.is_adm());

-- 5.6. Propostas Comerciais: Gestão de orçamentos e propostas emitidas
DROP POLICY IF EXISTS "Financeiro gerencia propostas comerciais" ON public.propostas_comerciais;
CREATE POLICY "Financeiro gerencia propostas comerciais"
ON public.propostas_comerciais FOR ALL TO authenticated
USING (public.is_financeiro() OR public.is_adm())
WITH CHECK (public.is_financeiro() OR public.is_adm());

-- 6. Recarregar Schema do PostgREST
NOTIFY pgrst, 'reload schema';
