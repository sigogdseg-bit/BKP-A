-- Migration Hunter: Inclusão de custo_mao_de_obra no Kit e remoção de registros do extrato de movimentação ao desmarcar itens da instalação
-- Data: 2026-09-24

-- 1. Coluna custo_mao_de_obra em estoque_kits
ALTER TABLE public.estoque_kits 
ADD COLUMN IF NOT EXISTS custo_mao_de_obra NUMERIC(12,2) DEFAULT 0;

-- 2. Atualizar RPC salvar_kit_estoque_seguro
CREATE OR REPLACE FUNCTION public.salvar_kit_estoque_seguro(
  p_id UUID DEFAULT NULL,
  p_codigo_sku TEXT DEFAULT NULL,
  p_nome TEXT DEFAULT NULL,
  p_descricao TEXT DEFAULT NULL,
  p_custo_total NUMERIC DEFAULT 0,
  p_preco_venda NUMERIC DEFAULT 0,
  p_markup_percentual NUMERIC DEFAULT 0,
  p_itens JSONB DEFAULT '[]'::jsonb,
  p_custo_mao_de_obra NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_kit_id UUID := p_id;
  v_elem JSONB;
  v_item_id UUID;
  v_qtd NUMERIC;
BEGIN
  IF NOT public.pode_gerenciar_estoque() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Permissão negada para gerenciar kits.');
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Informe o nome do kit.');
  END IF;

  IF v_kit_id IS NOT NULL THEN
    UPDATE public.estoque_kits
    SET nome = trim(p_nome),
        descricao = trim(p_descricao),
        custo_total = p_custo_total,
        preco_venda = p_preco_venda,
        markup_percentual = p_markup_percentual,
        custo_mao_de_obra = COALESCE(p_custo_mao_de_obra, 0),
        updated_at = NOW()
    WHERE id = v_kit_id;

    -- Remove itens anteriores para recriar
    DELETE FROM public.estoque_kit_itens WHERE kit_id = v_kit_id;
  ELSE
    INSERT INTO public.estoque_kits (
      codigo_sku,
      nome,
      descricao,
      custo_total,
      preco_venda,
      markup_percentual,
      custo_mao_de_obra
    ) VALUES (
      COALESCE(trim(p_codigo_sku), 'KIT-' || TO_CHAR(NOW(), 'YYMMDDHH24MISS')),
      trim(p_nome),
      trim(p_descricao),
      p_custo_total,
      p_preco_venda,
      p_markup_percentual,
      COALESCE(p_custo_mao_de_obra, 0)
    )
    RETURNING id INTO v_kit_id;
  END IF;

  -- Inserir itens do kit
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := (v_elem->>'item_id')::UUID;
    v_qtd := COALESCE((v_elem->>'quantidade')::NUMERIC, 1);
    IF v_item_id IS NOT NULL AND v_qtd > 0 THEN
      INSERT INTO public.estoque_kit_itens (kit_id, item_id, quantidade)
      VALUES (v_kit_id, v_item_id, v_qtd);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Kit de materiais salvo com sucesso!',
    'id', v_kit_id
  );
END;
$$;

-- 3. Atualizar sincronizar_estoque_instalacao com limpeza do extrato
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

  -- Caso a instalação seja cancelada ou não instalada:
  -- Devolve o saldo ao estoque e remove os registros de movimentação correspondentes (extrato limpo).
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

        v_estornados := v_estornados + 1;
      END IF;
    END LOOP;

    -- Remove as movimentações da instalação do extrato
    DELETE FROM public.estoque_movimentacoes WHERE instalacao_id = p_instalacao_id;

    RETURN jsonb_build_object(
      'sucesso', true,
      'mensagem', 'Instalação não realizada. Materiais devolvidos ao estoque e extrato limpo.',
      'itens_estornados', v_estornados,
      'itens_baixados', 0
    );
  END IF;

  -- Processar itens enviados na sincronização
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
        -- Saída / Adição de quantidade
        SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_id FOR UPDATE;
        IF FOUND THEN
          v_saldo_ant := v_item.quantidade_atual;
          v_saldo_post := GREATEST(0, v_saldo_ant - v_diff);

          UPDATE public.estoque_itens
          SET quantidade_atual = v_saldo_post, updated_at = now()
          WHERE id = v_item_id;

          -- Se já existe linha de saída para esta instalação e item, atualiza a quantidade total; senão, insere
          IF EXISTS (SELECT 1 FROM public.estoque_movimentacoes WHERE instalacao_id = p_instalacao_id AND item_id = v_item_id AND tipo = 'saida_instalacao') THEN
            UPDATE public.estoque_movimentacoes
            SET quantidade = v_qtd_nova,
                valor_total = ROUND(v_qtd_nova * custo_unitario, 2),
                saldo_posterior = v_saldo_post,
                updated_at = now()
            WHERE instalacao_id = p_instalacao_id AND item_id = v_item_id AND tipo = 'saida_instalacao';
          ELSE
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
          END IF;
          v_baixados := v_baixados + 1;
        END IF;

      ELSIF v_diff < 0 THEN
        -- Redução de quantidade ou remoção parcial
        SELECT * INTO v_item FROM public.estoque_itens WHERE id = v_item_id FOR UPDATE;
        IF FOUND THEN
          v_saldo_ant := v_item.quantidade_atual;
          v_saldo_post := v_saldo_ant + ABS(v_diff);

          UPDATE public.estoque_itens
          SET quantidade_atual = v_saldo_post, updated_at = now()
          WHERE id = v_item_id;

          IF v_qtd_nova = 0 THEN
            -- Se zerou a quantidade, remove o registro do extrato de movimentação
            DELETE FROM public.estoque_movimentacoes
            WHERE instalacao_id = p_instalacao_id AND item_id = v_item_id;
          ELSE
            -- Se apenas diminuiu, ajusta a linha existente no extrato sem criar estorno poluidor
            UPDATE public.estoque_movimentacoes
            SET quantidade = v_qtd_nova,
                valor_total = ROUND(v_qtd_nova * custo_unitario, 2),
                saldo_posterior = v_saldo_post,
                updated_at = now()
            WHERE instalacao_id = p_instalacao_id AND item_id = v_item_id AND tipo = 'saida_instalacao';
          END IF;

          v_estornados := v_estornados + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Processar itens que foram desmarcados (estavam vinculados antes mas não vieram em p_itens)
  -- Devolve o saldo ao estoque e remove a linha do extrato de movimentação
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

      -- Remove a linha do extrato de movimentação para este item desmarcado
      DELETE FROM public.estoque_movimentacoes
      WHERE instalacao_id = p_instalacao_id AND item_id = v_item_ant.item_id;

      v_estornados := v_estornados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Estoque sincronizado com sucesso. Extrato atualizado sem resíduos.',
    'itens_baixados', v_baixados,
    'itens_estornados', v_estornados
  );
END;
$$;
