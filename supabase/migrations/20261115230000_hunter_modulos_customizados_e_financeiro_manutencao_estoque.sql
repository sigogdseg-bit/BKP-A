-- ============================================================================
-- Migration: 20261115230000_hunter_modulos_customizados_e_financeiro_manutencao_estoque.sql
-- Descrição: Precedência obrigatória da escolha de módulos pelo usuário/administrador,
--            inclusão canônica de 'manutencao' e 'estoque' no perfil Financeiro,
--            e liberação de RLS em Manutenção e Estoque para Financeiro e módulos concedidos.
-- ============================================================================

-- 1. Políticas RLS em public.planos_manutencao_preventiva
DROP POLICY IF EXISTS "Planos manutencao visiveis para administradores e operadores" ON public.planos_manutencao_preventiva;
CREATE POLICY "Planos manutencao visiveis para administradores e operadores"
ON public.planos_manutencao_preventiva FOR ALL TO authenticated
USING (
  public.is_admin_or_superadmin() OR
  public.is_financeiro() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'financeiro')) OR
  EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid() AND module = 'manutencao' AND ativo = TRUE)
)
WITH CHECK (
  public.is_admin_or_superadmin() OR
  public.is_financeiro() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'financeiro')) OR
  EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid() AND module = 'manutencao' AND ativo = TRUE)
);

-- 2. Políticas RLS em public.agendamentos_manutencao
DROP POLICY IF EXISTS "Agendamentos gerenciados por administradores e operadores" ON public.agendamentos_manutencao;
CREATE POLICY "Agendamentos gerenciados por administradores e operadores"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (
  public.is_admin_or_superadmin() OR
  public.is_financeiro() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'financeiro')) OR
  EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid() AND module = 'manutencao' AND ativo = TRUE)
)
WITH CHECK (
  public.is_admin_or_superadmin() OR
  public.is_financeiro() OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'financeiro')) OR
  EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = auth.uid() AND module = 'manutencao' AND ativo = TRUE)
);

-- 3. Função de permissão para gerenciamento de estoque
CREATE OR REPLACE FUNCTION public.pode_gerenciar_estoque()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email TEXT := (auth.jwt() ->> 'email');
  v_pode BOOLEAN := FALSE;
BEGIN
  IF v_email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('superadmin', 'adm') OR role = 'financeiro')
      AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('superadmin', 'adm', 'financeiro')
  ) OR EXISTS (
    SELECT 1 FROM public.user_module_access
    WHERE user_id = auth.uid()
      AND module = 'estoque'
      AND ativo = TRUE
  ) INTO v_pode;

  RETURN COALESCE(v_pode, FALSE);
END;
$$;

-- 4. Função de permissão para visualização de estoque
CREATE OR REPLACE FUNCTION public.pode_visualizar_estoque()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email TEXT := (auth.jwt() ->> 'email');
  v_pode BOOLEAN := FALSE;
BEGIN
  IF v_email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('superadmin', 'adm', 'operador', 'instalador', 'financeiro'))
      AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('superadmin', 'adm', 'operador', 'instalador', 'financeiro')
  ) OR EXISTS (
    SELECT 1 FROM public.user_module_access
    WHERE user_id = auth.uid()
      AND module = 'estoque'
      AND ativo = TRUE
  ) INTO v_pode;

  RETURN COALESCE(v_pode, FALSE);
END;
$$;

-- 5. Atualizar admin_cadastrar_usuario garantindo PRECEDÊNCIA TOTAL da escolha de módulos
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

  -- Regra Canônica Hunter: Precedência total da escolha do usuário/administrador
  -- Se p_modulos foi informado com elementos, a escolha prevalece!
  -- Se p_modulos for nulo ou vazio, aplica os módulos padrão canônicos do perfil.
  IF p_modulos IS NULL OR array_length(p_modulos, 1) IS NULL OR array_length(p_modulos, 1) = 0 THEN
    IF p_role = 'instalador' THEN
      p_modulos := ARRAY['instalacao'];
    ELSIF p_role = 'financeiro' THEN
      p_modulos := ARRAY[
        'financeiro', 'mensalidades', 'propostas', 'clientes', 'revendedores',
        'instalacao', 'abastecimento', 'manutencao', 'estoque', 'chat', 'atendimento',
        'configuracoes', 'temas'
      ];
    ELSIF p_role = 'operador' THEN
      p_modulos := ARRAY[
        'atendimento', 'clientes', 'configuracoes', 'estoque', 'financeiro',
        'instalacao', 'monitor-gps', 'mensalidades', 'temas'
      ];
    ELSIF p_role = 'superadmin' OR p_role = 'adm' OR p_role = 'superadmin_auditor' THEN
      p_modulos := ARRAY[
        'monitor-gps', 'rotas', 'frota', 'atendimento', 'clientes', 'mensalidades', 'financeiro',
        'rastreadores', 'central-seguranca', 'logs', 'dispositivos', 'manutencao',
        'instalacao', 'estoque', 'temas', 'configuracoes', 'usuarios', 'propostas',
        'revendedores', 'abastecimento', 'motoristas', 'funcionarios'
      ];
    END IF;
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

-- 6. Atualizar admin_atualizar_usuario garantindo PRECEDÊNCIA TOTAL da escolha de módulos
CREATE OR REPLACE FUNCTION public.admin_atualizar_usuario(
  p_usuario_id UUID,
  p_nome TEXT,
  p_role public.hunter_role,
  p_modulos TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_plano public.plano_cliente DEFAULT 'basico',
  p_valor_por_instalacao NUMERIC DEFAULT 0.00,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_nova_senha TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_mod TEXT;
  v_telefone_limpo TEXT := NULLIF(trim(p_telefone), '');
  v_role_atual public.hunter_role;
  v_email_atual TEXT;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar usuarios.';
  END IF;

  SELECT role, email INTO v_role_atual, v_email_atual
  FROM public.profiles WHERE id = p_usuario_id;

  IF v_email_atual IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    p_role := 'superadmin';
  END IF;

  UPDATE public.profiles
  SET nome = trim(p_nome),
      role = p_role,
      valor_por_instalacao = p_valor_por_instalacao,
      chave_pix = p_chave_pix,
      endereco_instalacao = p_endereco_instalacao,
      telefone = COALESCE(v_telefone_limpo, public.profiles.telefone),
      ativo = p_ativo,
      updated_at = now()
  WHERE id = p_usuario_id;

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'role', p_role),
      updated_at = now()
  WHERE id = p_usuario_id;

  UPDATE public.user_roles
  SET role = p_role
  WHERE user_id = p_usuario_id;

  IF p_nova_senha IS NOT NULL AND length(trim(p_nova_senha)) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(trim(p_nova_senha), extensions.gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = p_usuario_id;
  END IF;

  -- Regra Canônica Hunter: Precedência total da escolha do usuário/administrador
  IF p_modulos IS NULL OR array_length(p_modulos, 1) IS NULL OR array_length(p_modulos, 1) = 0 THEN
    IF p_role = 'instalador' THEN
      p_modulos := ARRAY['instalacao'];
    ELSIF p_role = 'financeiro' THEN
      p_modulos := ARRAY[
        'financeiro', 'mensalidades', 'propostas', 'clientes', 'revendedores',
        'instalacao', 'abastecimento', 'manutencao', 'estoque', 'chat', 'atendimento',
        'configuracoes', 'temas'
      ];
    ELSIF p_role = 'operador' THEN
      p_modulos := ARRAY[
        'atendimento', 'clientes', 'configuracoes', 'estoque', 'financeiro',
        'instalacao', 'monitor-gps', 'mensalidades', 'temas'
      ];
    ELSIF p_role = 'superadmin' OR p_role = 'adm' OR p_role = 'superadmin_auditor' THEN
      p_modulos := ARRAY[
        'monitor-gps', 'rotas', 'frota', 'atendimento', 'clientes', 'mensalidades', 'financeiro',
        'rastreadores', 'central-seguranca', 'logs', 'dispositivos', 'manutencao',
        'instalacao', 'estoque', 'temas', 'configuracoes', 'usuarios', 'propostas',
        'revendedores', 'abastecimento', 'motoristas', 'funcionarios'
      ];
    END IF;
  END IF;

  DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;

  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      INSERT INTO public.user_module_access (user_id, module, ativo)
      VALUES (p_usuario_id, v_mod, TRUE)
      ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario atualizado com sucesso.'
  );
END;
$$;

-- 7. Atribuir 'manutencao' e 'estoque' para usuários com perfil financeiro já cadastrados
INSERT INTO public.user_module_access (user_id, module, ativo)
SELECT p.id, m.mod, TRUE
FROM public.profiles p
CROSS JOIN (VALUES ('manutencao'), ('estoque')) AS m(mod)
WHERE p.role = 'financeiro'
ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;

-- 8. Recarregar Schema do PostgREST
NOTIFY pgrst, 'reload schema';
