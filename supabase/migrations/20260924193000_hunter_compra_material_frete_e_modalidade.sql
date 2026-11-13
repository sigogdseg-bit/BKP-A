-- =====================================================================
-- MIGRATION: 20260924193000_hunter_compra_material_frete_e_modalidade.sql
-- Descrição: Adiciona colunas faltantes em transacoes_financeiras (modalidade, moeda, etc),
--            adiciona valor_frete em estoque_movimentacoes e atualiza a RPC
--            registrar_entrada_estoque_financeiro com suporte nativo a frete.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

DO $$
BEGIN
  -- 1. Colunas de transações financeiras (despesas recorrentes, parceladas e modalidade)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'modalidade'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN modalidade TEXT DEFAULT 'avulsa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'recorrencia_id'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN recorrencia_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'parcela_atual'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN parcela_atual INT DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'total_parcelas'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN total_parcelas INT DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'recorrencia_ativa'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN recorrencia_ativa BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'moeda'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN moeda TEXT DEFAULT 'BRL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'valor_moeda_original'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN valor_moeda_original NUMERIC(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'cotacao_moeda'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN cotacao_moeda NUMERIC(10, 4) DEFAULT 1.0;
  END IF;

  -- 2. Coluna valor_frete em estoque_movimentacoes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estoque_movimentacoes' AND column_name = 'valor_frete'
  ) THEN
    ALTER TABLE public.estoque_movimentacoes ADD COLUMN valor_frete NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Índices de performance se não existirem
CREATE INDEX IF NOT EXISTS idx_transacoes_modalidade ON public.transacoes_financeiras(modalidade);
CREATE INDEX IF NOT EXISTS idx_transacoes_moeda ON public.transacoes_financeiras(moeda);
CREATE INDEX IF NOT EXISTS idx_transacoes_recorrencia_id ON public.transacoes_financeiras(recorrencia_id);

-- 3. Atualizar RPC de Entrada de Compra com suporte a Frete
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
  v_valor_itens NUMERIC;
  v_valor_frete NUMERIC;
  v_valor_total NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_posterior NUMERIC;
  v_novo_custo_medio NUMERIC;
  v_categoria_fin TEXT;
  v_despesa_id UUID;
  v_movimentacao_id UUID;
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

  -- 1. Inserir despesa no sistema financeiro
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
    custo_unitario,
    valor_total,
    valor_frete,
    saldo_anterior,
    saldo_posterior,
    fornecedor_id,
    despesa_id,
    documento_fiscal,
    observacao
  ) VALUES (
    p_item_id,
    'entrada_compra',
    p_quantidade,
    p_custo_unitario,
    v_valor_total,
    v_valor_frete,
    v_saldo_anterior,
    v_saldo_posterior,
    p_fornecedor_id,
    v_despesa_id,
    p_documento_fiscal,
    p_observacoes
  )
  RETURNING id INTO v_movimentacao_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Entrada de material registrada com sucesso no estoque e no financeiro!',
    'despesa_id', v_despesa_id,
    'movimentacao_id', v_movimentacao_id,
    'novo_saldo', v_saldo_posterior,
    'novo_custo_medio', v_novo_custo_medio,
    'valor_total', v_valor_total
  );
END;
$$;
