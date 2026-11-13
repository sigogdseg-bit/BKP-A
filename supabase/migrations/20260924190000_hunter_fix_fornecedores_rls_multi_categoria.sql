-- =====================================================================
-- MIGRATION: 20260924190000_hunter_fix_fornecedores_rls_multi_categoria.sql
-- Descrição: Correção definitiva de RLS para Fornecedores e Estoque,
--            permitindo mutação por SuperADM e Administradores com
--            suporte a múltiplas categorias e RPC de contingência segura.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

-- 1. Habilitar leitura autenticada de user_roles para evitar bloqueios de subquery
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'email' = 'novaes@adm.28bpm.local')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'adm') AND p.ativo = TRUE
    )
  );

-- 2. Funções canônicas de verificação de permissão de estoque (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.pode_gerenciar_estoque()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'email' = 'novaes@adm.28bpm.local')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'adm')
        AND ativo = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('superadmin', 'adm')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_visualizar_estoque()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    (auth.jwt() ->> 'email' = 'novaes@adm.28bpm.local')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'adm', 'operador', 'instalador')
        AND ativo = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('superadmin', 'adm', 'operador', 'instalador')
    )
  );
$$;

-- 3. Políticas de RLS atualizadas para Fornecedores
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fornecedores_leitura_autenticados" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_mutacao_adm" ON public.fornecedores;

CREATE POLICY "fornecedores_leitura_autenticados" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (public.pode_visualizar_estoque());

CREATE POLICY "fornecedores_mutacao_adm" ON public.fornecedores
  FOR ALL TO authenticated
  USING (public.pode_gerenciar_estoque())
  WITH CHECK (public.pode_gerenciar_estoque());

-- 4. Políticas de RLS atualizadas para Itens de Estoque e Movimentações
DROP POLICY IF EXISTS "estoque_itens_leitura_autenticados" ON public.estoque_itens;
DROP POLICY IF EXISTS "estoque_itens_mutacao_adm" ON public.estoque_itens;

CREATE POLICY "estoque_itens_leitura_autenticados" ON public.estoque_itens
  FOR SELECT TO authenticated
  USING (public.pode_visualizar_estoque());

CREATE POLICY "estoque_itens_mutacao_adm" ON public.estoque_itens
  FOR ALL TO authenticated
  USING (public.pode_gerenciar_estoque())
  WITH CHECK (public.pode_gerenciar_estoque());

DROP POLICY IF EXISTS "estoque_movimentacoes_leitura_autenticados" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "estoque_movimentacoes_insercao_equipe" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "estoque_movimentacoes_mutacao_adm" ON public.estoque_movimentacoes;

CREATE POLICY "estoque_movimentacoes_leitura_autenticados" ON public.estoque_movimentacoes
  FOR SELECT TO authenticated
  USING (public.pode_visualizar_estoque());

CREATE POLICY "estoque_movimentacoes_insercao_equipe" ON public.estoque_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_visualizar_estoque());

CREATE POLICY "estoque_movimentacoes_mutacao_adm" ON public.estoque_movimentacoes
  FOR UPDATE TO authenticated
  USING (public.pode_gerenciar_estoque());

-- 5. RPC Segura de Contingência para Salvar Fornecedor
CREATE OR REPLACE FUNCTION public.salvar_fornecedor_seguro(
  p_id UUID DEFAULT NULL,
  p_razao_social TEXT DEFAULT NULL,
  p_nome_fantasia TEXT DEFAULT NULL,
  p_cnpj_cpf TEXT DEFAULT NULL,
  p_contato_nome TEXT DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_categoria TEXT DEFAULT 'geral',
  p_chave_pix TEXT DEFAULT NULL,
  p_dados_bancarios TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret_id UUID;
BEGIN
  -- Validar permissão estrita
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Acesso negado: apenas o SuperADM e Administradores possuem autorização para gerenciar fornecedores.'
    );
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.fornecedores
    SET
      razao_social = p_razao_social,
      nome_fantasia = p_nome_fantasia,
      cnpj_cpf = p_cnpj_cpf,
      contato_nome = p_contato_nome,
      telefone = p_telefone,
      email = p_email,
      categoria = COALESCE(p_categoria, 'geral'),
      chave_pix = p_chave_pix,
      dados_bancarios = p_dados_bancarios,
      observacoes = p_observacoes,
      ativo = COALESCE(p_ativo, true),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_ret_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Fornecedor atualizado com sucesso!',
      'id', v_ret_id
    );
  ELSE
    INSERT INTO public.fornecedores (
      razao_social,
      nome_fantasia,
      cnpj_cpf,
      contato_nome,
      telefone,
      email,
      categoria,
      chave_pix,
      dados_bancarios,
      observacoes,
      ativo
    ) VALUES (
      p_razao_social,
      p_nome_fantasia,
      p_cnpj_cpf,
      p_contato_nome,
      p_telefone,
      p_email,
      COALESCE(p_categoria, 'geral'),
      p_chave_pix,
      p_dados_bancarios,
      p_observacoes,
      COALESCE(p_ativo, true)
    )
    RETURNING id INTO v_ret_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Fornecedor cadastrado com sucesso!',
      'id', v_ret_id
    );
  END IF;
END;
$$;
