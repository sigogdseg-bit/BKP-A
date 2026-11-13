-- =====================================================================
-- MIGRATION: 20260924200000_hunter_fix_categoria_transacao_estoque.sql
-- Descrição: Corrige tipo da coluna categoria em transacoes_financeiras
--            e remove cast inválido categoria_transacao_enum na RPC
--            registrar_entrada_estoque_financeiro.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

DO $$
BEGIN
  -- 1. Garantir que a coluna categoria em transacoes_financeiras aceite TEXT
  -- evitando quebras caso o enum obsoleto categoria_transacao_enum/categoria_transacao_financeira divirja
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' 
      AND column_name = 'categoria' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ALTER COLUMN categoria TYPE TEXT USING categoria::TEXT;
  END IF;

  -- 2. Garantir colunas em estoque_movimentacoes para compatibilidade
  ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS despesa_financeira_id UUID REFERENCES public.transacoes_financeiras(id) ON DELETE SET NULL;
  ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS observacoes TEXT;
  ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
END $$;

-- 3. Dropar assinatura legada de 7 parâmetros para evitar ambiguidade de overload
DROP FUNCTION IF EXISTS public.registrar_entrada_estoque_financeiro(uuid, numeric, numeric, uuid, text, date, text);

-- 4. Atualizar RPC de Entrada de Compra com suporte a Frete e sem erro de enum
CREATE OR REPLACE FUNCTION public.registrar_entrada_estoque_financeiro(
  p_item_id UUID,
  p_quantidade NUMERIC,
  p_custo_unitario NUMERIC,
  p_fornecedor_id UUID DEFAULT NULL,
  p_documento_fiscal TEXT DEFAULT NULL,
  p_data_pagamento DATE DEFAULT CURRENT_DATE,
  p_observacoes TEXT DEFAULT NULL,
  p_valor_frete NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_fornecedor RECORD;
  v_saldo_anterior NUMERIC;
  v_saldo_posterior NUMERIC;
  v_novo_custo_medio NUMERIC;
  v_valor_frete NUMERIC;
  v_valor_itens NUMERIC;
  v_valor_total NUMERIC;
  v_despesa_id UUID;
  v_categoria_fin TEXT := 'material_consumo';
  v_fornecedor_nome TEXT := 'Fornecedor Avulso';
  v_desc_financeiro TEXT;
BEGIN
  -- Validar item
  SELECT * INTO v_item FROM public.estoque_itens WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Item de estoque não encontrado.');
  END IF;

  IF p_quantidade <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'A quantidade deve ser maior que zero.');
  END IF;

  v_valor_frete := ROUND(COALESCE(p_valor_frete, 0), 2);
  v_valor_itens := ROUND(p_quantidade * p_custo_unitario, 2);
  v_valor_total := v_valor_itens + v_valor_frete;

  v_saldo_anterior := v_item.quantidade_atual;
  v_saldo_posterior := v_saldo_anterior + p_quantidade;

  -- Calcular novo custo médio ponderado incorporando o frete ao valor do estoque
  IF v_saldo_posterior > 0 THEN
    v_novo_custo_medio := ROUND(
      ((v_saldo_anterior * v_item.custo_medio_unitario) + v_valor_total) / v_saldo_posterior,
      2
    );
  ELSE
    v_novo_custo_medio := p_custo_unitario;
  END IF;

  -- Buscar dados do fornecedor se informado
  IF p_fornecedor_id IS NOT NULL THEN
    SELECT * INTO v_fornecedor FROM public.fornecedores WHERE id = p_fornecedor_id;
    IF FOUND THEN
      v_fornecedor_nome := COALESCE(v_fornecedor.nome_fantasia, v_fornecedor.razao_social);
    END IF;
  END IF;

  -- Determinar categoria financeira apropriada
  IF LOWER(v_item.categoria) LIKE '%rastreador%' THEN
    v_categoria_fin := 'aquisicao_equipamentos';
  ELSIF LOWER(v_item.categoria) LIKE '%chip%' THEN
    v_categoria_fin := 'chips_conectividade';
  ELSE
    v_categoria_fin := 'material_consumo';
  END IF;

  v_desc_financeiro := 'Compra de Estoque: ' || p_quantidade || ' ' || v_item.unidade_medida || ' de ' || v_item.nome || ' (' || v_fornecedor_nome || ')';
  IF v_valor_frete > 0 THEN
    v_desc_financeiro := v_desc_financeiro || ' [Frete: R$ ' || TO_CHAR(v_valor_frete, 'FM999990.00') || ']';
  END IF;

  -- 1. Inserir despesa no sistema financeiro (categoria em texto puro compatível)
  INSERT INTO public.transacoes_financeiras (
    tipo,
    categoria,
    descricao,
    valor,
    data_competencia,
    data_vencimento,
    data_pagamento,
    status,
    observacoes,
    modalidade,
    moeda,
    created_by
  ) VALUES (
    'saida',
    v_categoria_fin,
    v_desc_financeiro,
    v_valor_total,
    CURRENT_DATE,
    COALESCE(p_data_pagamento, CURRENT_DATE),
    COALESCE(p_data_pagamento, CURRENT_DATE),
    'concluido',
    'NF/Doc: ' || COALESCE(p_documento_fiscal, 'S/N') || CASE WHEN p_observacoes IS NOT NULL THEN ' | ' || p_observacoes ELSE '' END,
    'avulsa',
    'BRL',
    auth.uid()
  )
  RETURNING id INTO v_despesa_id;

  -- 2. Atualizar saldo e custo médio do item
  UPDATE public.estoque_itens
  SET
    quantidade_atual = v_saldo_posterior,
    custo_medio_unitario = v_novo_custo_medio,
    updated_at = now()
  WHERE id = p_item_id;

  -- 3. Registrar movimentação auditável de entrada
  INSERT INTO public.estoque_movimentacoes (
    item_id,
    tipo,
    quantidade,
    saldo_anterior,
    saldo_posterior,
    custo_unitario,
    valor_total,
    valor_frete,
    fornecedor_id,
    documento_fiscal,
    despesa_id,
    despesa_financeira_id,
    observacao,
    observacoes,
    created_by
  ) VALUES (
    p_item_id,
    'entrada_compra',
    p_quantidade,
    v_saldo_anterior,
    v_saldo_posterior,
    p_custo_unitario,
    v_valor_total,
    v_valor_frete,
    p_fornecedor_id,
    p_documento_fiscal,
    v_despesa_id,
    v_despesa_id,
    COALESCE(p_observacoes, 'Entrada de compra de estoque'),
    COALESCE(p_observacoes, 'Entrada de compra de estoque'),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Entrada de compra registrada com sucesso.',
    'saldo_anterior', v_saldo_anterior,
    'saldo_posterior', v_saldo_posterior,
    'custo_medio_unitario', v_novo_custo_medio,
    'despesa_id', v_despesa_id,
    'valor_itens', v_valor_itens,
    'valor_frete', v_valor_frete,
    'valor_total', v_valor_total
  );
END;
$$;

-- Permissões de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.registrar_entrada_estoque_financeiro(
  UUID, NUMERIC, NUMERIC, UUID, TEXT, DATE, TEXT, NUMERIC
) TO authenticated;
