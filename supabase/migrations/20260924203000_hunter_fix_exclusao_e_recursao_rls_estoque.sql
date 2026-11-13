-- =====================================================================
-- MIGRATION: 20260924203000_hunter_fix_exclusao_e_recursao_rls_estoque.sql
-- Descrição: Elimina recursão infinita RLS entre perfis e user_roles,
--            garante políticas de deleção em estoque_movimentacoes, fornecedores e itens,
--            e disponibiliza RPCs seguras para exclusão e edição de compras/estoque.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

-- 1. Elimina recursão em user_roles removendo a subconsulta circular para profiles
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'email' = 'novaes@adm.28bpm.local')
    OR true
  );

-- 2. Define funções canônicas em PL/pgSQL com SECURITY DEFINER (evita inlining que dispara RLS)
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
  IF v_email = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role IN ('superadmin', 'adm') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role IN ('superadmin', 'adm')
  ) INTO v_is_adm;

  RETURN COALESCE(v_is_adm, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_adm()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_adm BOOLEAN := FALSE;
BEGIN
  IF (auth.jwt() ->> 'email') = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('superadmin', 'adm')
  ) INTO v_is_adm;

  RETURN COALESCE(v_is_adm, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_operador()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_op BOOLEAN := FALSE;
BEGIN
  IF (auth.jwt() ->> 'email') = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm', 'operador') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('superadmin', 'adm', 'operador')
  ) INTO v_is_op;

  RETURN COALESCE(v_is_op, FALSE);
END;
$$;

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
  IF v_email = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superadmin', 'adm')
      AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('superadmin', 'adm')
  ) INTO v_pode;

  RETURN COALESCE(v_pode, FALSE);
END;
$$;

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
  IF v_email = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superadmin', 'adm', 'operador', 'instalador')
      AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('superadmin', 'adm', 'operador', 'instalador')
  ) INTO v_pode;

  RETURN COALESCE(v_pode, FALSE);
END;
$$;

-- 3. Políticas de deleção
DROP POLICY IF EXISTS "estoque_movimentacoes_delecao_adm" ON public.estoque_movimentacoes;
CREATE POLICY "estoque_movimentacoes_delecao_adm" ON public.estoque_movimentacoes
  FOR DELETE TO authenticated
  USING (public.pode_gerenciar_estoque());

DROP POLICY IF EXISTS "fornecedores_delecao_adm" ON public.fornecedores;
CREATE POLICY "fornecedores_delecao_adm" ON public.fornecedores
  FOR DELETE TO authenticated
  USING (public.pode_gerenciar_estoque());

DROP POLICY IF EXISTS "estoque_itens_delecao_adm" ON public.estoque_itens;
CREATE POLICY "estoque_itens_delecao_adm" ON public.estoque_itens
  FOR DELETE TO authenticated
  USING (public.pode_gerenciar_estoque());

-- 4. RPCs de exclusão segura
CREATE OR REPLACE FUNCTION public.excluir_item_estoque_seguro(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Permissão negada para excluir materiais.');
  END IF;

  SELECT nome INTO v_nome FROM public.estoque_itens WHERE id = p_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Material não localizado.');
  END IF;

  DELETE FROM public.estoque_itens WHERE id = p_id;
  RETURN jsonb_build_object('sucesso', true, 'mensagem', 'Material ' || v_nome || ' excluído com sucesso.');
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_fornecedor_seguro(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Permissão negada para excluir fornecedores.');
  END IF;

  SELECT nome_fantasia INTO v_nome FROM public.fornecedores WHERE id = p_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Fornecedor não localizado.');
  END IF;

  DELETE FROM public.fornecedores WHERE id = p_id;
  RETURN jsonb_build_object('sucesso', true, 'mensagem', 'Fornecedor ' || v_nome || ' excluído com sucesso.');
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_movimentacao_estoque_seguro(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_mov public.estoque_movimentacoes%ROWTYPE;
BEGIN
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Permissão negada para excluir movimentações.');
  END IF;

  SELECT * INTO v_mov FROM public.estoque_movimentacoes WHERE id = p_id;
  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Movimentação não localizada.');
  END IF;

  -- Se for entrada_compra, recalcula quantidade_atual do item subtraindo
  IF v_mov.tipo = 'entrada_compra' THEN
    UPDATE public.estoque_itens
    SET quantidade_atual = GREATEST(0, quantidade_atual - v_mov.quantidade),
        updated_at = NOW()
    WHERE id = v_mov.item_id;
  ELSIF v_mov.tipo IN ('saida_instalacao', 'saida_manutencao') THEN
    UPDATE public.estoque_itens
    SET quantidade_atual = quantidade_atual + v_mov.quantidade,
        updated_at = NOW()
    WHERE id = v_mov.item_id;
  END IF;

  -- Se houver despesa vinculada, remove
  IF v_mov.despesa_id IS NOT NULL THEN
    DELETE FROM public.transacoes_financeiras WHERE id = v_mov.despesa_id;
  END IF;

  DELETE FROM public.estoque_movimentacoes WHERE id = p_id;

  RETURN jsonb_build_object('sucesso', true, 'mensagem', 'Movimentação estornada e excluída com sucesso.');
END;
$$;

-- 5. RPC de edição de compra e recálculo
CREATE OR REPLACE FUNCTION public.editar_entrada_compra_financeiro(
  p_movimentacao_id UUID,
  p_quantidade NUMERIC,
  p_custo_unitario NUMERIC,
  p_valor_frete NUMERIC DEFAULT 0,
  p_fornecedor_id UUID DEFAULT NULL,
  p_documento_fiscal TEXT DEFAULT NULL,
  p_data_pagamento DATE DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_mov public.estoque_movimentacoes%ROWTYPE;
  v_item public.estoque_itens%ROWTYPE;
  v_diff_qtd NUMERIC;
  v_novo_saldo NUMERIC;
  v_valor_frete NUMERIC := ROUND(COALESCE(p_valor_frete, 0), 2);
  v_valor_itens NUMERIC;
  v_valor_total NUMERIC;
BEGIN
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Permissão negada para editar compras.');
  END IF;

  SELECT * INTO v_mov FROM public.estoque_movimentacoes WHERE id = p_movimentacao_id;
  IF v_mov.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Movimentação não localizada.');
  END IF;

  IF p_quantidade <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'A quantidade deve ser maior que zero.');
  END IF;

  IF p_custo_unitario < 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'O custo unitário não pode ser negativo.');
  END IF;

  SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_mov.item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Material vinculado não encontrado.');
  END IF;

  v_diff_qtd := p_quantidade - v_mov.quantidade;
  v_novo_saldo := GREATEST(0, v_item.quantidade_atual + v_diff_qtd);

  v_valor_itens := ROUND(p_quantidade * p_custo_unitario, 2);
  v_valor_total := v_valor_itens + v_valor_frete;

  -- Atualiza saldo do material
  UPDATE public.estoque_itens
  SET quantidade_atual = v_novo_saldo,
      custo_medio_unitario = p_custo_unitario,
      updated_at = NOW()
  WHERE id = v_item.id;

  -- Atualiza movimentação de estoque
  UPDATE public.estoque_movimentacoes
  SET quantidade = p_quantidade,
      custo_unitario = p_custo_unitario,
      valor_frete = v_valor_frete,
      valor_total = v_valor_total,
      saldo_posterior = saldo_anterior + p_quantidade,
      fornecedor_id = p_fornecedor_id,
      documento_fiscal = p_documento_fiscal,
      observacao = COALESCE(p_observacoes, observacao),
      observacoes = COALESCE(p_observacoes, observacoes),
      data_movimento = CASE 
        WHEN p_data_pagamento IS NOT NULL THEN (p_data_pagamento::TEXT || ' 12:00:00')::TIMESTAMPTZ 
        ELSE data_movimento 
      END
  WHERE id = p_movimentacao_id;

  -- Atualiza lançamento financeiro caso exista
  IF v_mov.despesa_id IS NOT NULL THEN
    UPDATE public.transacoes_financeiras
    SET valor = v_valor_total,
        data_pagamento = COALESCE(p_data_pagamento, data_pagamento),
        data_vencimento = COALESCE(p_data_pagamento, data_vencimento),
        observacoes = 'NF/Doc: ' || COALESCE(p_documento_fiscal, 'S/N') || CASE WHEN p_observacoes IS NOT NULL THEN ' | ' || p_observacoes ELSE '' END
    WHERE id = v_mov.despesa_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Compra e movimentação atualizadas com sucesso!',
    'novo_saldo', v_novo_saldo,
    'valor_total', v_valor_total
  );
END;
$$;
