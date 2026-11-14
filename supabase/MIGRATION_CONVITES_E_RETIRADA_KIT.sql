-- =========================================================================
-- GD RASTREAMENTO / HUNTER — CONVITE DE AUTO-CADASTRO E DEVOLUÇÃO DE KIT
-- Execute este script no SQL Editor do Painel Supabase
-- =========================================================================

-- 1. TABELA DE CONVITES DE INSTALADOR (USO ÚNICO)
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

-- 2. RPC: GERAR NOVO CONVITE DE USO ÚNICO
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

-- 3. RPC: VALIDAR CONVITE
CREATE OR REPLACE FUNCTION public.validar_convite_instalador(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_convite RECORD;
BEGIN
  SELECT * INTO v_convite
  FROM public.convites_instalador
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valido', FALSE,
      'mensagem', 'Link de convite invalido ou inexistente.'
    );
  END IF;

  IF v_convite.usado THEN
    RETURN jsonb_build_object(
      'valido', FALSE,
      'mensagem', 'Este link de convite ja foi utilizado e nao e mais valido.'
    );
  END IF;

  IF v_convite.expira_em <= NOW() THEN
    RETURN jsonb_build_object(
      'valido', FALSE,
      'mensagem', 'Este link de convite expirou. Solicite um novo link a administracao.'
    );
  END IF;

  RETURN jsonb_build_object(
    'valido', TRUE,
    'convite_id', v_convite.id,
    'mensagem', 'Convite valido para auto-cadastro de instalador.'
  );
END;
$$;

-- 4. RPC: CADASTRAR INSTALADOR POR CONVITE (OBRIGATORIAMENTE INATIVO)
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
  v_novo_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- 1. Validar Token de Uso Único
  SELECT * INTO v_convite
  FROM public.convites_instalador
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de convite invalido.';
  END IF;

  IF v_convite.usado THEN
    RAISE EXCEPTION 'Este link de convite ja foi utilizado.';
  END IF;

  IF v_convite.expira_em <= NOW() THEN
    RAISE EXCEPTION 'Este link de convite expirou.';
  END IF;

  -- 2. Verificar se o e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = LOWER(TRIM(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario cadastrado com este e-mail.';
  END IF;

  -- 3. Criar usuário no auth.users
  v_novo_user_id := gen_random_uuid();
  v_encrypted_pw := extensions.crypt(p_senha, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_novo_user_id,
    'authenticated',
    'authenticated',
    LOWER(TRIM(p_email)),
    v_encrypted_pw,
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object(
      'nome', TRIM(p_nome),
      'role', 'instalador'
    ),
    NOW(),
    NOW()
  );

  -- 4. Criar ou Atualizar Profile como OBRIGATORIAMENTE INATIVO (ativo = false)
  INSERT INTO public.profiles (
    id,
    email,
    nome,
    role,
    ativo,
    telefone,
    chave_pix,
    endereco_instalacao,
    created_at,
    updated_at
  ) VALUES (
    v_novo_user_id,
    LOWER(TRIM(p_email)),
    TRIM(p_nome),
    'instalador',
    FALSE, -- OBRIGATORIAMENTE DESABILITADA ATÉ APROVAÇÃO
    p_telefone,
    p_chave_pix,
    p_endereco_instalacao,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    role = 'instalador',
    ativo = FALSE,
    telefone = EXCLUDED.telefone,
    chave_pix = EXCLUDED.chave_pix,
    endereco_instalacao = EXCLUDED.endereco_instalacao,
    updated_at = NOW();

  -- 5. Atribuir Módulo Estrito de Instalação
  DELETE FROM public.user_modules WHERE user_id = v_novo_user_id;
  INSERT INTO public.user_modules (user_id, module)
  VALUES (v_novo_user_id, 'instalacao');

  -- 6. Queimar o Token de Convite (Uso Único)
  UPDATE public.convites_instalador
  SET
    usado = TRUE,
    usado_em = NOW(),
    usado_por_user_id = v_novo_user_id
  WHERE id = v_convite.id;

  -- 7. Registrar Log de Auditoria
  INSERT INTO public.system_activity_logs (
    usuario_id,
    usuario_email,
    usuario_role,
    acao,
    detalhes,
    created_at
  ) VALUES (
    v_novo_user_id,
    LOWER(TRIM(p_email)),
    'instalador',
    'auto_cadastro_convite',
    jsonb_build_object(
      'convite_id', v_convite.id,
      'status_inicial', 'inativo_aguardando_aprovacao',
      'endereco', p_endereco_instalacao
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'user_id', v_novo_user_id,
    'mensagem', 'Cadastro realizado com sucesso! Sua conta aguarda ativacao pela administracao.'
  );
END;
$$;

-- 5. RPC: CONSULTAR ITENS INSTALADOS NO VEÍCULO (RETORNO AO ESTOQUE NA RETIRADA)
CREATE OR REPLACE FUNCTION public.obter_itens_instalados_veiculo(p_veiculo_id UUID)
RETURNS TABLE (
  item_id UUID,
  nome TEXT,
  codigo_sku TEXT,
  quantidade INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    em.item_id,
    ei.nome,
    ei.codigo_sku,
    CAST(SUM(em.quantidade) AS INT) AS quantidade
  FROM public.estoque_movimentacoes em
  JOIN public.estoque_itens ei ON ei.id = em.item_id
  WHERE em.veiculo_id = p_veiculo_id
    AND em.tipo_movimentacao = 'saida_instalacao'
  GROUP BY em.item_id, ei.nome, ei.codigo_sku
  HAVING SUM(em.quantidade) > 0;
END;
$$;

-- 6. PERMISSÕES DE EXECUÇÃO
GRANT EXECUTE ON FUNCTION public.gerar_convite_instalador TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_convite_instalador TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cadastrar_instalador_por_convite TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_itens_instalados_veiculo TO authenticated;

-- Forçar recarga do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
