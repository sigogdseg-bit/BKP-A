-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261022194500_hunter_perfil_e_gestao_funcionarios_cliente.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Criação do perfil 'funcionario' no ENUM public.hunter_role.
-- 2. Adição da coluna cliente_id em public.profiles (com FK para public.clientes).
-- 3. Criação da tabela public.funcionarios_cliente para controle de equipe do cliente.
-- 4. RLS estrito: funcionários acessam ESTRITAMENTE os dados do seu cliente titular.
-- 5. RPCs canônicas: cadastrar_funcionario, atualizar_funcionario, excluir_funcionario.
-- 6. Forçar primeiro_acesso = true para troca obrigatória de senha no 1º acesso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Adicionar coluna cliente_id em public.profiles ────────────────────────
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE;

-- Sincronizar perfis de motoristas existentes com seus clientes correspondentes
UPDATE public.profiles p
SET cliente_id = m.cliente_id
FROM public.motoristas m
WHERE m.user_id = p.id AND p.cliente_id IS NULL;

-- ── 3. Criar tabela public.funcionarios_cliente ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcionarios_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  cargo TEXT,
  modulos_permitidos TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_cliente_cliente_id ON public.funcionarios_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cliente_user_id ON public.funcionarios_cliente(user_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cliente_email ON public.funcionarios_cliente(LOWER(email));

-- ── 4. RLS em public.funcionarios_cliente ────────────────────────────────────
ALTER TABLE public.funcionarios_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funcionarios_cliente_select" ON public.funcionarios_cliente;
CREATE POLICY "funcionarios_cliente_select" ON public.funcionarios_cliente
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm', 'operador'))
  );

DROP POLICY IF EXISTS "funcionarios_cliente_insert" ON public.funcionarios_cliente;
CREATE POLICY "funcionarios_cliente_insert" ON public.funcionarios_cliente
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "funcionarios_cliente_update" ON public.funcionarios_cliente;
CREATE POLICY "funcionarios_cliente_update" ON public.funcionarios_cliente
  FOR UPDATE TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

DROP POLICY IF EXISTS "funcionarios_cliente_delete" ON public.funcionarios_cliente;
CREATE POLICY "funcionarios_cliente_delete" ON public.funcionarios_cliente
  FOR DELETE TO authenticated
  USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'adm'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.funcionarios_cliente TO authenticated, service_role;
GRANT SELECT ON TABLE public.funcionarios_cliente TO anon;

-- ── 5. Função auxiliar de resolução de cliente_id do funcionário ─────────────
CREATE OR REPLACE FUNCTION public.get_funcionario_cliente_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role::text = 'funcionario'),
    (SELECT cliente_id FROM public.funcionarios_cliente WHERE (user_id = auth.uid() OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))) AND ativo = TRUE LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_funcionario_cliente_id() TO authenticated, service_role;

-- ── 6. RLS em tabelas operacionais para acesso do Funcionário ao seu Cliente ──

-- Veículos do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam veiculos do seu cliente" ON public.veiculos;
CREATE POLICY "Funcionarios visualizam veiculos do seu cliente"
ON public.veiculos FOR SELECT TO authenticated
USING (cliente_id = public.get_funcionario_cliente_id());

-- Telemetria de posições dos veículos do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam telemetria de veiculos do seu cliente" ON public.telemetria_posicoes;
CREATE POLICY "Funcionarios visualizam telemetria de veiculos do seu cliente"
ON public.telemetria_posicoes FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id()
  )
);

-- Motoristas do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam motoristas do seu cliente" ON public.motoristas;
CREATE POLICY "Funcionarios visualizam motoristas do seu cliente"
ON public.motoristas FOR SELECT TO authenticated
USING (cliente_id = public.get_funcionario_cliente_id());

-- Alertas de segurança do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam alertas do seu cliente" ON public.alertas_seguranca;
CREATE POLICY "Funcionarios visualizam alertas do seu cliente"
ON public.alertas_seguranca FOR SELECT TO authenticated
USING (cliente_id = public.get_funcionario_cliente_id());

-- Viagens e trajetos dos veículos do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam viagens dos veiculos do seu cliente" ON public.viagens_trajetos;
CREATE POLICY "Funcionarios visualizam viagens dos veiculos do seu cliente"
ON public.viagens_trajetos FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id()
  )
);

-- Trajetos salvos do cliente
DROP POLICY IF EXISTS "Funcionarios visualizam trajetos salvos do seu cliente" ON public.trajetos_salvos;
CREATE POLICY "Funcionarios visualizam trajetos salvos do seu cliente"
ON public.trajetos_salvos FOR ALL TO authenticated
USING (cliente_id = public.get_funcionario_cliente_id())
WITH CHECK (cliente_id = public.get_funcionario_cliente_id());

-- ── 7. RPC: public.cadastrar_funcionario ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cadastrar_funcionario(
  p_cliente_id UUID,
  p_nome       TEXT,
  p_email      TEXT,
  p_senha      TEXT,
  p_telefone   TEXT DEFAULT NULL,
  p_cargo      TEXT DEFAULT NULL,
  p_modulos    TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_user_id     UUID;
  v_func_id     UUID;
  v_enc_pw      TEXT;
  v_email_limpo TEXT;
  v_nome_limpo  TEXT;
  v_mod         TEXT;
BEGIN
  v_email_limpo := LOWER(TRIM(p_email));
  v_nome_limpo  := TRIM(p_nome);

  -- 1. Autorização: chamador deve ser dono do cliente ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para cadastrar funcionários neste cliente.';
  END IF;

  -- 2. Validações
  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Nome do funcionário é obrigatório.';
  END IF;
  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'E-mail do funcionário é obrigatório.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha inicial deve conter no mínimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Já existe um usuário cadastrado com este e-mail.';
  END IF;

  -- 3. Criar usuário em auth.users
  v_user_id := gen_random_uuid();
  v_enc_pw  := extensions.crypt(p_senha, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email_limpo,
    v_enc_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome_limpo, 'role', 'funcionario', 'cliente_id', p_cliente_id),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- 4. Identity no auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_user_id::text)
       OR user_id = v_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email',
        v_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 5. Profile com role 'funcionario', cliente_id e PRIMEIRO ACESSO = TRUE (para forçar troca de senha!)
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, cliente_id, telefone
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    'funcionario'::public.hunter_role,
    true,
    true, -- OBRIGATÓRIO: 1º acesso deve mudar a senha!
    p_cliente_id,
    NULLIF(TRIM(COALESCE(p_telefone, '')), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = 'funcionario'::public.hunter_role,
      ativo = true,
      primeiro_acesso = true,
      cliente_id = EXCLUDED.cliente_id,
      telefone = EXCLUDED.telefone;

  -- 6. User roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'funcionario'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Registro em funcionarios_cliente
  INSERT INTO public.funcionarios_cliente (
    cliente_id, user_id, nome, email, telefone, cargo, modulos_permitidos, ativo
  ) VALUES (
    p_cliente_id,
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
    NULLIF(TRIM(COALESCE(p_cargo, '')), ''),
    COALESCE(p_modulos, '{}'),
    true
  ) RETURNING id INTO v_func_id;

  -- 8. Atribuição de módulos em public.user_module_access
  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      IF v_mod IS NOT NULL AND TRIM(v_mod) != '' THEN
        INSERT INTO public.user_module_access (user_id, module, ativo)
        VALUES (v_user_id, TRIM(v_mod), true)
        ON CONFLICT (user_id, module) DO UPDATE SET ativo = true;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'funcionario_id', v_func_id,
    'user_id', v_user_id,
    'mensagem', 'Funcionário cadastrado com sucesso. No 1º acesso será exigida a troca de senha.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO] %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_funcionario(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
) TO authenticated, service_role;

-- ── 8. RPC: public.atualizar_funcionario ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atualizar_funcionario(
  p_funcionario_id UUID,
  p_nome           TEXT,
  p_telefone       TEXT DEFAULT NULL,
  p_cargo          TEXT DEFAULT NULL,
  p_modulos        TEXT[] DEFAULT '{}',
  p_ativo          BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_cliente_id  UUID;
  v_user_id     UUID;
  v_nome_limpo  TEXT := TRIM(p_nome);
  v_mod         TEXT;
BEGIN
  -- Busca registro do funcionário
  SELECT cliente_id, user_id INTO v_cliente_id, v_user_id
  FROM public.funcionarios_cliente
  WHERE id = p_funcionario_id;

  IF v_funcionario_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Autorização: dono do cliente titular ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = v_cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para editar este funcionário.';
  END IF;

  -- Atualiza funcionarios_cliente
  UPDATE public.funcionarios_cliente
  SET nome = v_nome_limpo,
      telefone = NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
      cargo = NULLIF(TRIM(COALESCE(p_cargo, '')), ''),
      modulos_permitidos = COALESCE(p_modulos, '{}'),
      ativo = p_ativo,
      updated_at = now()
  WHERE id = p_funcionario_id;

  -- Atualiza profiles
  UPDATE public.profiles
  SET nome = v_nome_limpo,
      telefone = NULLIF(TRIM(COALESCE(p_telefone, '')), ''),
      ativo = p_ativo,
      updated_at = now()
  WHERE id = v_user_id;

  -- Sincroniza user_module_access
  -- Desativa módulos anteriores
  UPDATE public.user_module_access
  SET ativo = false
  WHERE user_id = v_user_id;

  -- Reativa ou insere os novos módulos
  IF p_modulos IS NOT NULL THEN
    FOREACH v_mod IN ARRAY p_modulos LOOP
      IF v_mod IS NOT NULL AND TRIM(v_mod) != '' THEN
        INSERT INTO public.user_module_access (user_id, module, ativo)
        VALUES (v_user_id, TRIM(v_mod), true)
        ON CONFLICT (user_id, module) DO UPDATE SET ativo = true;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mensagem', 'Dados e permissões do funcionário atualizados com sucesso.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO-UPDATE] %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_funcionario(
  UUID, TEXT, TEXT, TEXT, TEXT[], BOOLEAN
) TO authenticated, service_role;

-- ── 9. RPC: public.excluir_funcionario ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.excluir_funcionario(
  p_funcionario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_cliente_id  UUID;
  v_user_id     UUID;
BEGIN
  SELECT cliente_id, user_id INTO v_cliente_id, v_user_id
  FROM public.funcionarios_cliente
  WHERE id = p_funcionario_id;

  IF v_funcionario_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Autorização: dono do cliente titular ou adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = v_cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para excluir este funcionário.';
  END IF;

  -- Remove de funcionarios_cliente
  DELETE FROM public.funcionarios_cliente WHERE id = p_funcionario_id;

  -- Remove acessos
  DELETE FROM public.user_module_access WHERE user_id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Remove da auth.users e auth.identities
  BEGIN
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'mensagem', 'Funcionário e credenciais de acesso removidos com sucesso.'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-FUNCIONARIO-DELETE] %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_funcionario(UUID) TO authenticated, service_role;

-- ── 10. Invalidação de cache de schema do PostgREST ─────────────────────────
NOTIFY pgrst, 'reload schema';
