-- =========================================================================
-- HUNTER: Sincronização Inteligente de Materiais da Instalação com Estoque
-- Suporta: Baixa, Estorno (devolução ao desmarcar) e Histórico Completo
-- =========================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estoque_movimentacoes_tipo_check'
  ) THEN
    ALTER TABLE public.estoque_movimentacoes DROP CONSTRAINT estoque_movimentacoes_tipo_check;
    ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check 
      CHECK (tipo IN ('entrada_compra', 'saida_instalacao', 'estorno_instalacao', 'ajuste_manual', 'perda_avaria'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.obter_materiais_instalacao(p_instalacao_id UUID)
RETURNS TABLE (
  item_id UUID,
  nome TEXT,
  codigo_sku TEXT,
  unidade_medida TEXT,
  quantidade NUMERIC,
  custo_unitario NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.item_id,
    i.nome,
    i.codigo_sku,
    i.unidade_medida,
    SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END)::NUMERIC AS quantidade,
    COALESCE(MAX(m.custo_unitario), i.custo_medio_unitario)::NUMERIC AS custo_unitario
  FROM public.estoque_movimentacoes m
  JOIN public.estoque_itens i ON i.id = m.item_id
  WHERE m.instalacao_id = p_instalacao_id
  GROUP BY m.item_id, i.nome, i.codigo_sku, i.unidade_medida, i.custo_medio_unitario
  HAVING SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_estoque_instalacao(
  p_instalacao_id UUID,
  p_itens JSONB,
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instalacao RECORD;
  v_item_ant RECORD;
  v_elem JSONB;
  v_item_id UUID;
  v_qtd_nova NUMERIC;
  v_qtd_ant NUMERIC;
  v_diff NUMERIC;
  v_obs TEXT;
  v_item RECORD;
  v_saldo_ant NUMERIC;
  v_saldo_post NUMERIC;
  v_estornados INT := 0;
  v_baixados INT := 0;
  v_itens_processados UUID[] := '{}';
BEGIN
  SELECT * INTO v_instalacao FROM public.instalacoes WHERE id = p_instalacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Instalação não encontrada.');
  END IF;

  IF v_instalacao.status = 'nao_instalado' THEN
    FOR v_item_ant IN (
      SELECT m.item_id, SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) AS qtd_atual
      FROM public.estoque_movimentacoes m
      WHERE m.instalacao_id = p_instalacao_id
      GROUP BY m.item_id
      HAVING SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) > 0
    ) LOOP
      SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_ant.item_id FOR UPDATE;
      IF FOUND THEN
        v_saldo_ant := v_item.quantidade_atual;
        v_saldo_post := v_saldo_ant + v_item_ant.qtd_atual;

        UPDATE public.estoque_itens
        SET quantidade_atual = v_saldo_post, updated_at = now()
        WHERE id = v_item.id;

        INSERT INTO public.estoque_movimentacoes (
          item_id, tipo, quantidade, custo_unitario, valor_total,
          saldo_anterior, saldo_posterior, instalacao_id, veiculo_id,
          instalador_id, observacao, data_movimento
        ) VALUES (
          v_item.id, 'estorno_instalacao', v_item_ant.qtd_atual, v_item.custo_medio_unitario,
          ROUND(v_item_ant.qtd_atual * v_item.custo_medio_unitario, 2),
          v_saldo_ant, v_saldo_post, p_instalacao_id, v_instalacao.veiculo_id,
          COALESCE(p_instalador_id, auth.uid()),
          'Estorno integral: Instalação cancelada ou marcada como Não Instalada',
          now()
        );
        v_estornados := v_estornados + 1;
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Instalação não realizada. Materiais estornados ao estoque.',
      'itens_estornados', v_estornados,
      'itens_baixados', 0
    );
  END IF;

  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
      v_item_id := (v_elem->>'item_id')::UUID;
      v_qtd_nova := GREATEST(0, COALESCE((v_elem->>'quantidade')::NUMERIC, 0));
      v_obs := v_elem->>'observacao';

      v_itens_processados := array_append(v_itens_processados, v_item_id);

      SELECT COALESCE(SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END), 0)
      INTO v_qtd_ant
      FROM public.estoque_movimentacoes m
      WHERE m.instalacao_id = p_instalacao_id AND m.item_id = v_item_id;

      v_diff := v_qtd_nova - v_qtd_ant;

      IF v_diff > 0 THEN
        SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_id FOR UPDATE;
        IF FOUND THEN
          v_saldo_ant := v_item.quantidade_atual;
          v_saldo_post := GREATEST(0, v_saldo_ant - v_diff);

          UPDATE public.estoque_itens
          SET quantidade_atual = v_saldo_post, updated_at = now()
          WHERE id = v_item_id;

          INSERT INTO public.estoque_movimentacoes (
            item_id, tipo, quantidade, custo_unitario, valor_total,
            saldo_anterior, saldo_posterior, instalacao_id, veiculo_id,
            instalador_id, observacao, data_movimento
          ) VALUES (
            v_item_id, 'saida_instalacao', v_diff, v_item.custo_medio_unitario,
            ROUND(v_diff * v_item.custo_medio_unitario, 2),
            v_saldo_ant, v_saldo_post, p_instalacao_id, v_instalacao.veiculo_id,
            COALESCE(p_instalador_id, auth.uid()),
            COALESCE(v_obs, 'Baixa de material por instalação do veículo placa ' || COALESCE(v_instalacao.placa, '')),
            now()
          );
          v_baixados := v_baixados + 1;
        END IF;

      ELSIF v_diff < 0 THEN
        SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_id FOR UPDATE;
        IF FOUND THEN
          v_saldo_ant := v_item.quantidade_atual;
          v_saldo_post := v_saldo_ant + ABS(v_diff);

          UPDATE public.estoque_itens
          SET quantidade_atual = v_saldo_post, updated_at = now()
          WHERE id = v_item_id;

          INSERT INTO public.estoque_movimentacoes (
            item_id, tipo, quantidade, custo_unitario, valor_total,
            saldo_anterior, saldo_posterior, instalacao_id, veiculo_id,
            instalador_id, observacao, data_movimento
          ) VALUES (
            v_item_id, 'estorno_instalacao', ABS(v_diff), v_item.custo_medio_unitario,
            ROUND(ABS(v_diff) * v_item.custo_medio_unitario, 2),
            v_saldo_ant, v_saldo_post, p_instalacao_id, v_instalacao.veiculo_id,
            COALESCE(p_instalador_id, auth.uid()),
            'Estorno / Devolução ao estoque por redução na instalação placa ' || COALESCE(v_instalacao.placa, ''),
            now()
          );
          v_estornados := v_estornados + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  FOR v_item_ant IN (
    SELECT m.item_id, SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) AS qtd_atual
    FROM public.estoque_movimentacoes m
    WHERE m.instalacao_id = p_instalacao_id
      AND NOT (m.item_id = ANY(v_itens_processados))
    GROUP BY m.item_id
    HAVING SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) > 0
  ) LOOP
    SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_ant.item_id FOR UPDATE;
    IF FOUND THEN
      v_saldo_ant := v_item.quantidade_atual;
      v_saldo_post := v_saldo_ant + v_item_ant.qtd_atual;

      UPDATE public.estoque_itens
      SET quantidade_atual = v_saldo_post, updated_at = now()
      WHERE id = v_item.id;

      INSERT INTO public.estoque_movimentacoes (
        item_id, tipo, quantidade, custo_unitario, valor_total,
        saldo_anterior, saldo_posterior, instalacao_id, veiculo_id,
        instalador_id, observacao, data_movimento
      ) VALUES (
        v_item.id, 'estorno_instalacao', v_item_ant.qtd_atual, v_item.custo_medio_unitario,
        ROUND(v_item_ant.qtd_atual * v_item.custo_medio_unitario, 2),
        v_saldo_ant, v_saldo_post, p_instalacao_id, v_instalacao.veiculo_id,
        COALESCE(p_instalador_id, auth.uid()),
        'Devolução ao estoque: Material desmarcado da instalação placa ' || COALESCE(v_instalacao.placa, ''),
        now()
      );
      v_estornados := v_estornados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Estoque sincronizado com sucesso.',
    'itens_baixados', v_baixados,
    'itens_estornados', v_estornados
  );
END;
$$;
