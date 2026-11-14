-- ==============================================================================
-- GD Rastreamento / HUNTER — Ativação do Perfil S.adm Auditor no Supabase
-- ==============================================================================
-- Execute este script no SQL Editor do painel Supabase (https://supabase.com/dashboard)
-- para habilitar o novo perfil 'superadmin_auditor' (100% Read-Only) e suas blindagens físicas.
-- ==============================================================================

-- 1. ADICIONAR VALOR 'superadmin_auditor' AO ENUM hunter_role
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'superadmin_auditor';

-- 2. FUNÇÃO E TRIGGERS DE BLOQUEIO FÍSICO DE MUTAÇÕES EM BANCO DE DADOS
CREATE OR REPLACE FUNCTION public.impedir_mutacoes_superadmin_auditor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_role public.hunter_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role = 'superadmin_auditor'::public.hunter_role THEN
      RAISE EXCEPTION 'PERMISSAO NEGADA: Perfil S.adm Auditor possui acesso 100%% READ-ONLY. Proibido cadastrar, alterar ou excluir dados no banco de dados.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_profiles ON public.profiles;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_profiles
BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_veiculos ON public.veiculos;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_veiculos
BEFORE INSERT OR UPDATE OR DELETE ON public.veiculos
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_clientes ON public.clientes;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_clientes
BEFORE INSERT OR UPDATE OR DELETE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_motoristas ON public.motoristas;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_motoristas
BEFORE INSERT OR UPDATE OR DELETE ON public.motoristas
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_funcionarios ON public.funcionarios_cliente;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_funcionarios
BEFORE INSERT OR UPDATE OR DELETE ON public.funcionarios_cliente
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_instalacoes ON public.instalacoes;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_instalacoes
BEFORE INSERT OR UPDATE OR DELETE ON public.instalacoes
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_mensalidades ON public.mensalidades;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_mensalidades
BEFORE INSERT OR UPDATE OR DELETE ON public.mensalidades
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_user_roles ON public.user_roles;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_user_roles
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_user_module_access ON public.user_module_access;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_user_module_access
BEFORE INSERT OR UPDATE OR DELETE ON public.user_module_access
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

DROP TRIGGER IF EXISTS trg_bloqueio_mutacao_auditor_atendimentos ON public.atendimentos;
CREATE TRIGGER trg_bloqueio_mutacao_auditor_atendimentos
BEFORE INSERT OR UPDATE OR DELETE ON public.atendimentos
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacoes_superadmin_auditor();

-- 3. FUNÇÕES DE VERIFICAÇÃO DE PERFIL PARA CONSULTA RLS (PERMITINDO LEITURA AO AUDITOR)
CREATE OR REPLACE FUNCTION public.is_operador()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_op BOOLEAN := FALSE;
  v_email TEXT := (auth.jwt() ->> 'email');
BEGIN
  IF v_email = 'novaes@adm.28bpm.local' OR v_email = 'novaes@oficial.tec.br' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm', 'operador', 'superadmin_auditor') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('superadmin', 'adm', 'operador', 'superadmin_auditor')
  ) INTO v_is_op;

  RETURN COALESCE(v_is_op, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_email TEXT := (auth.jwt() ->> 'email');
  v_is_adm BOOLEAN := FALSE;
BEGIN
  IF v_email = 'novaes@adm.28bpm.local' OR v_email = 'novaes@oficial.tec.br' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role IN ('superadmin', 'adm', 'superadmin_auditor') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role IN ('superadmin', 'adm', 'superadmin_auditor')
  ) INTO v_is_adm;

  RETURN COALESCE(v_is_adm, FALSE);
END;
$$;

-- 4. POLICIES RLS EXPLÍCITAS DE LEITURA PARA O PERFIL SUPERADMIN_AUDITOR
DROP POLICY IF EXISTS "Auditor visualiza veiculos autorizados" ON public.veiculos;
CREATE POLICY "Auditor visualiza veiculos autorizados"
ON public.veiculos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin_auditor' AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin_auditor'
  )
);

DROP POLICY IF EXISTS "Auditor visualiza telemetria" ON public.telemetria_posicoes;
CREATE POLICY "Auditor visualiza telemetria"
ON public.telemetria_posicoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin_auditor' AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin_auditor'
  )
);

DROP POLICY IF EXISTS "Auditor visualiza clientes" ON public.clientes;
CREATE POLICY "Auditor visualiza clientes"
ON public.clientes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin_auditor' AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin_auditor'
  )
);

DROP POLICY IF EXISTS "Auditor visualiza rastreadores" ON public.rastreadores;
CREATE POLICY "Auditor visualiza rastreadores"
ON public.rastreadores FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin_auditor' AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin_auditor'
  )
);

DROP POLICY IF EXISTS "Auditor visualiza instalacoes" ON public.instalacoes;
CREATE POLICY "Auditor visualiza instalacoes"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin_auditor' AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin_auditor'
  )
);

-- 5. BLOQUEIO DA RPC DE BLOQUEIO/DESBLOQUEIO PARA AUDITOR
CREATE OR REPLACE FUNCTION public.admin_bloquear_desbloquear_veiculo(
  p_veiculo_id UUID,
  p_bloquear BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role public.hunter_role;
  v_caller_id UUID;
  v_placa TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_id;
    IF v_role = 'superadmin_auditor'::public.hunter_role THEN
      RAISE EXCEPTION 'Ação bloqueada: Perfil S.adm Auditor possui acesso estritamente de consulta (Read-Only). Não pode realizar bloqueio de veículos.';
    END IF;
  END IF;

  SELECT placa INTO v_placa FROM public.veiculos WHERE id = p_veiculo_id;
  IF v_placa IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Veículo não encontrado.');
  END IF;

  UPDATE public.veiculos
  SET bloqueado = p_bloquear,
      rele_status = p_bloquear,
      updated_at = NOW()
  WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'success', true,
    'mensagem', CASE WHEN p_bloquear THEN 'Veículo bloqueado com sucesso.' ELSE 'Veículo desbloqueado com sucesso.' END,
    'placa', v_placa,
    'bloqueado', p_bloquear
  );
END;
$$;

-- 4. ATUALIZAR RPC admin_cadastrar_usuario
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

  IF p_role = 'instalador' THEN
    p_modulos := ARRAY['instalacao'];
  ELSIF p_role = 'superadmin' OR p_role = 'adm' OR p_role = 'superadmin_auditor' THEN
    p_modulos := ARRAY[
      'monitor-gps', 'atendimento', 'clientes', 'mensalidades', 'financeiro',
      'rastreadores', 'central-seguranca', 'logs', 'dispositivos', 'manutencao',
      'instalacao', 'estoque', 'temas', 'configuracoes', 'usuarios'
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

-- 5. ATUALIZAR RPC admin_atualizar_usuario
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

  IF p_role IN ('superadmin'::public.hunter_role, 'superadmin_auditor'::public.hunter_role) THEN
    IF LOWER(COALESCE(v_caller_email, '')) NOT IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
      RAISE EXCEPTION 'Acesso negado: apenas o SuperADM pode atribuir perfis de governança ou auditoria.';
    END IF;
  END IF;

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

  IF p_role = 'superadmin_auditor'::public.hunter_role THEN
    DELETE FROM public.user_module_access WHERE user_id = p_usuario_id;
    INSERT INTO public.user_module_access (user_id, module, ativo)
    SELECT p_usuario_id, unnest(ARRAY[
      'monitor-gps', 'rotas', 'frota', 'abastecimento', 'manutencao', 'instalacao',
      'clientes', 'motoristas', 'funcionarios', 'financeiro', 'mensalidades',
      'estoque', 'atendimento', 'chat', 'temas', 'demonstracao', 'configuracoes',
      'usuarios', 'central-seguranca', 'dispositivos', 'logs', 'rastreadores',
      'revendedores', 'propostas'
    ]), true;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Usuário atualizado com sucesso.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cadastrar_usuario TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_usuario TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bloquear_desbloquear_veiculo TO authenticated;

-- 6. RECARREGAR O SCHEMA CACHE DO POSTGREST
NOTIFY pgrst, 'reload schema';
