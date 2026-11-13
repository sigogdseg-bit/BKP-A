-- =========================================================================
-- HUNTER: Convite de Uso Único e Auto-Cadastro de Instalador Técnico
-- Permite que o operador ou administrador gere um link de uso único.
-- O técnico preenche seus dados cadastrais (PIX, endereço, login, senha).
-- A conta é criada OBRIGATORIAMENTE INATIVA (ativo = false) aguardando aprovação.
-- O token é de uso estritamente único e expira após o envio.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.convites_instalador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  usado_em TIMESTAMPTZ,
  usado_por_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.convites_instalador ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Operadores e administradores podem gerenciar convites" ON public.convites_instalador;
CREATE POLICY "Operadores e administradores podem gerenciar convites"
  ON public.convites_instalador
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  );

DROP POLICY IF EXISTS "Leitura pública de token de convite válido" ON public.convites_instalador;
CREATE POLICY "Leitura pública de token de convite válido"
  ON public.convites_instalador
  FOR SELECT
  TO public
  USING (usado = FALSE AND expira_em > NOW());

-- 1. RPC para Gerar Novo Convite de Uso Único
CREATE OR REPLACE FUNCTION public.gerar_convite_instalador(p_observacoes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_novo_token UUID;
  v_convite_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autorizado. Faca login no sistema.';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
    RAISE EXCEPTION 'Apenas operadores e administradores podem gerar links de convite para instalador.';
  END IF;

  INSERT INTO public.convites_instalador (
    criado_por,
    observacoes
  ) VALUES (
    v_user_id,
    p_observacoes
  )
  RETURNING id, token INTO v_convite_id, v_novo_token;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'convite_id', v_convite_id,
    'token', v_novo_token,
    'expira_em', (NOW() + INTERVAL '7 days')
  );
END;
$$;

-- 2. RPC para Validar se o Convite é Válido e não foi Usado
CREATE OR REPLACE FUNCTION public.validar_convite_instalador(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_convite RECORD;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('valido', FALSE, 'mensagem', 'Link de convite invalido.');
  END IF;

  SELECT * INTO v_convite FROM public.convites_instalador WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', FALSE, 'mensagem', 'Link de convite nao encontrado ou inexistente.');
  END IF;

  IF v_convite.usado THEN
    RETURN jsonb_build_object('valido', FALSE, 'mensagem', 'Este link de convite ja foi utilizado anteriormente e nao pode ser reutilizado.');
  END IF;

  IF v_convite.expira_em <= NOW() THEN
    RETURN jsonb_build_object('valido', FALSE, 'mensagem', 'Este link de convite expirou o prazo limite de validade.');
  END IF;

  RETURN jsonb_build_object(
    'valido', TRUE,
    'mensagem', 'Convite valido para auto-cadastro de instalador tecnico.',
    'token', v_convite.token,
    'expira_em', v_convite.expira_em
  );
END;
$$;

-- 3. RPC para Realizar o Auto-Cadastro do Instalador via Convite
CREATE OR REPLACE FUNCTION public.cadastrar_instalador_por_convite(
  p_token UUID,
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
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_convite RECORD;
  v_user_id UUID;
  v_encrypted_pw TEXT;
  v_email_limpo TEXT;
  v_nome_limpo TEXT;
BEGIN
  -- 1. Validar Token de Uso Único
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Token de convite obrigatorio.';
  END IF;

  SELECT * INTO v_convite 
  FROM public.convites_instalador 
  WHERE token = p_token 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de convite nao encontrado.';
  END IF;

  IF v_convite.usado THEN
    RAISE EXCEPTION 'Este link de convite ja foi utilizado. Solicite um novo link a administracao.';
  END IF;

  IF v_convite.expira_em <= NOW() THEN
    RAISE EXCEPTION 'Este link de convite expirou.';
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

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email_limpo) THEN
    RAISE EXCEPTION 'Este e-mail ja esta cadastrado no sistema.';
  END IF;

  -- 3. Gerar Hash de Senha Seguro
  v_encrypted_pw := crypt(p_senha, gen_salt('bf'));
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
      'telefone', p_telefone
    ),
    NOW(),
    NOW()
  );

  -- 5. Criar Perfil em public.profiles: OBRIGATORIAMENTE INATIVO (ativo = false)
  INSERT INTO public.profiles (
    id, nome, email, role, ativo,
    telefone, chave_pix, endereco_instalacao,
    valor_por_instalacao, created_at, updated_at
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    'instalador',
    FALSE, -- OBRIGATORIAMENTE SEM ESTAR ATIVA E HABILITADA
    p_telefone,
    p_chave_pix,
    p_endereco_instalacao,
    50.00,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = 'instalador',
    ativo = FALSE,
    telefone = EXCLUDED.telefone,
    chave_pix = EXCLUDED.chave_pix,
    endereco_instalacao = EXCLUDED.endereco_instalacao,
    updated_at = NOW();

  -- 6. Liberar Acesso ao Módulo de Instalações
  INSERT INTO public.user_module_access (user_id, module, ativo)
  VALUES (v_user_id, 'instalacao', TRUE)
  ON CONFLICT (user_id, module) DO NOTHING;

  -- 7. Queimar o Token de Convite (Uso Único Imediato)
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
