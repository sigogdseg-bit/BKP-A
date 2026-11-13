-- =====================================================================
-- MIGRATION: 20260923001000_hunter_rpcs_estoque_e_financeiro.sql
-- Descrição: RPCs atômicas para entrada de compras com integração
--            financeira e baixa técnica de materiais por instalação.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

-- 1. RPC: Registrar Entrada de Compra Integrada com o Financeiro
CREATE OR REPLACE FUNCTION public.registrar_entrada_estoque_financeiro(
  p_item_id UUID,
  p_quantidade NUMERIC,
  p_custo_unitario NUMERIC,
  p_fornecedor_id UUID DEFAULT NULL,
  p_documento_fiscal TEXT DEFAULT NULL,
  p_data_pagamento DATE DEFAULT CURRENT_DATE,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_fornecedor RECORD;
  v_valor_total NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_posterior NUMERIC;
  v_novo_custo_medio NUMERIC;
  v_categoria_fin TEXT;
  v_despesa_id UUID;
  v_movimentacao_id UUID;
  v_fornecedor_nome TEXT := 'Fornecedor Avulso';
BEGIN
  -- Validar item
  SELECT * INTO v_item FROM public.estoque_itens WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Item de estoque não encontrado.');
  END IF;

  IF p_quantidade <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'A quantidade deve ser maior que zero.');
  END IF;

  v_valor_total := ROUND(p_quantidade * p_custo_unitario, 2);
  v_saldo_anterior := v_item.quantidade_atual;
  v_saldo_posterior := v_saldo_anterior + p_quantidade;

  -- Calcular novo custo médio ponderado
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
  IF v_item.categoria = 'rastreador' THEN
    v_categoria_fin := 'aquisicao_equipamentos';
  ELSIF v_item.categoria = 'chip' THEN
    v_categoria_fin := 'chips_conectividade';
  ELSE
    v_categoria_fin := 'material_consumo';
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
    'Compra de Estoque: ' || p_quantidade || ' ' || v_item.unidade_medida || ' de ' || v_item.nome || ' (' || v_fornecedor_nome || ')',
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

  -- 2. Atualizar saldo e custo médio do item no estoque
  UPDATE public.estoque_itens
  SET
    quantidade_atual = v_saldo_posterior,
    custo_medio_unitario = v_novo_custo_medio,
    updated_at = now()
  WHERE id = p_item_id;

  -- 3. Registrar movimentação auditável no estoque
  INSERT INTO public.estoque_movimentacoes (
    item_id,
    tipo,
    quantidade,
    custo_unitario,
    valor_total,
    saldo_anterior,
    saldo_posterior,
    fornecedor_id,
    despesa_id,
    documento_fiscal,
    observacao,
    data_movimento
  ) VALUES (
    p_item_id,
    'entrada_compra',
    p_quantidade,
    p_custo_unitario,
    v_valor_total,
    v_saldo_anterior,
    v_saldo_posterior,
    p_fornecedor_id,
    v_despesa_id,
    p_documento_fiscal,
    p_observacoes,
    now()
  )
  RETURNING id INTO v_movimentacao_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Entrada de estoque e lançamento financeiro registrados com sucesso!',
    'despesa_id', v_despesa_id,
    'movimentacao_id', v_movimentacao_id,
    'novo_saldo', v_saldo_posterior,
    'novo_custo_medio', v_novo_custo_medio
  );
END;
$$;

-- 2. RPC: Registrar Baixa de Materiais por Instalação Técnica
CREATE OR REPLACE FUNCTION public.registrar_baixa_estoque_instalacao(
  p_instalacao_id UUID,
  p_itens JSONB, -- Array de objetos: [{ "item_id": "uuid", "quantidade": 1, "observacao": "texto" }]
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instalacao RECORD;
  v_elem JSONB;
  v_item_id UUID;
  v_qtd NUMERIC;
  v_obs TEXT;
  v_item RECORD;
  v_saldo_ant NUMERIC;
  v_saldo_post NUMERIC;
  v_total_baixados INT := 0;
BEGIN
  -- Validar instalação
  SELECT * INTO v_instalacao FROM public.instalacoes WHERE id = p_instalacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Instalação não encontrada.');
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := (v_elem->>'item_id')::UUID;
    v_qtd := COALESCE((v_elem->>'quantidade')::NUMERIC, 1);
    v_obs := v_elem->>'observacao';

    IF v_qtd > 0 THEN
      SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_id FOR UPDATE;
      IF FOUND THEN
        v_saldo_ant := v_item.quantidade_atual;
        v_saldo_post := GREATEST(0, v_saldo_ant - v_qtd);

        -- Atualizar saldo do item
        UPDATE public.estoque_itens
        SET quantidade_atual = v_saldo_post, updated_at = now()
        WHERE id = v_item_id;

        -- Registrar movimentação de saída
        INSERT INTO public.estoque_movimentacoes (
          item_id,
          tipo,
          quantidade,
          custo_unitario,
          valor_total,
          saldo_anterior,
          saldo_posterior,
          instalacao_id,
          veiculo_id,
          instalador_id,
          observacao,
          data_movimento
        ) VALUES (
          v_item_id,
          'saida_instalacao',
          v_qtd,
          v_item.custo_medio_unitario,
          ROUND(v_qtd * v_item.custo_medio_unitario, 2),
          v_saldo_ant,
          v_saldo_post,
          p_instalacao_id,
          v_instalacao.veiculo_id,
          COALESCE(p_instalador_id, auth.uid()),
          COALESCE(v_obs, 'Baixa automática por conclusão de instalação'),
          now()
        );

        v_total_baixados := v_total_baixados + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Baixa de materiais realizada com sucesso!',
    'itens_baixados', v_total_baixados
  );
END;
$$;
