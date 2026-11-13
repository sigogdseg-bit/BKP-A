-- =========================================================================
-- HUNTER: Retorno Automático de Kit e Materiais ao Estoque na Retirada
-- Garante que rastreador, relé de bloqueio, chicote e demais insumos
-- baixados na instalação retornem integralmente ao estoque da empresa.
-- =========================================================================

-- 1. Função para consultar os materiais/kits que foram instalados no veículo
CREATE OR REPLACE FUNCTION public.obter_itens_instalados_veiculo(p_veiculo_id UUID)
RETURNS TABLE (
  item_id UUID,
  nome TEXT,
  codigo_sku TEXT,
  unidade_medida TEXT,
  quantidade_instalada NUMERIC,
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
    SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END)::NUMERIC AS quantidade_instalada,
    COALESCE(MAX(m.custo_unitario), i.custo_medio_unitario)::NUMERIC AS custo_unitario
  FROM public.estoque_movimentacoes m
  JOIN public.estoque_itens i ON i.id = m.item_id
  WHERE m.veiculo_id = p_veiculo_id
  GROUP BY m.item_id, i.nome, i.codigo_sku, i.unidade_medida, i.custo_medio_unitario
  HAVING SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) > 0;
END;
$$;

-- 2. Atualização da RPC salvar_atendimento_instalacao para devolver todos os materiais
-- instalados no veículo de volta ao estoque quando o status for 'concluida' na retirada
CREATE OR REPLACE FUNCTION public.salvar_atendimento_instalacao(
  p_instalacao_id UUID DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL,
  p_placa TEXT DEFAULT NULL,
  p_marca TEXT DEFAULT NULL,
  p_modelo TEXT DEFAULT NULL,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_km_instalacao INT DEFAULT 0,
  p_rastreador_imei TEXT DEFAULT NULL,
  p_rastreador_modelo TEXT DEFAULT 'J16 4G',
  p_chip_iccid TEXT DEFAULT NULL,
  p_chip_operadora TEXT DEFAULT NULL,
  p_posicao_instalacao TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'nao_instalado',
  p_motivo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_bloqueador_instalado BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_instalador_id UUID;
  v_instalacao_id UUID;
  v_veiculo_id UUID := NULL;
  v_rastreador_id UUID := NULL;
  v_chip_id UUID := NULL;
  v_placa_limpa TEXT;
  v_imei_limpo TEXT;
  v_iccid_limpo TEXT;
  v_cliente_instalador_id UUID := NULL;
  v_valor_unitario NUMERIC(10,2) := 0.00;
  v_concluida_at TIMESTAMPTZ := NULL;
  v_bloqueador BOOLEAN := COALESCE(p_bloqueador_instalado, TRUE);
  v_tipo_servico TEXT := 'instalacao';
  v_ordem RECORD;
  v_item_rec RECORD;
  v_item_estoque RECORD;
  v_saldo_ant NUMERIC;
  v_saldo_post NUMERIC;
  v_materiais_devolvidos INT := 0;
BEGIN
  v_user_id := auth.uid();
  v_placa_limpa := UPPER(TRIM(p_placa));
  v_imei_limpo := NULLIF(TRIM(p_rastreador_imei), '');
  v_iccid_limpo := NULLIF(TRIM(p_chip_iccid), '');

  IF p_instalacao_id IS NOT NULL THEN
    SELECT * INTO v_ordem FROM public.instalacoes WHERE id = p_instalacao_id;
    IF FOUND THEN
      v_instalacao_id := v_ordem.id;
      v_veiculo_id := v_ordem.veiculo_id;
      v_instalador_id := v_ordem.instalador_id;
      v_tipo_servico := COALESCE(v_ordem.tipo_servico, 'instalacao');
      v_concluida_at := v_ordem.concluida_at;
      IF v_placa_limpa IS NULL THEN
        v_placa_limpa := v_ordem.placa;
      END IF;
      IF v_imei_limpo IS NULL THEN
        v_imei_limpo := v_ordem.rastreador_imei;
      END IF;
    END IF;
  END IF;

  -- =========================================================================
  -- CASO A: ORDEM DE RETIRADA / DESINSTALAÇÃO
  -- =========================================================================
  IF v_tipo_servico = 'retirada' THEN
    IF p_status = 'concluida' AND v_concluida_at IS NULL THEN
      v_concluida_at := NOW();
    END IF;

    UPDATE public.instalacoes
    SET
      status = p_status,
      km_instalacao = COALESCE(p_km_instalacao, km_instalacao),
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      concluida_at = v_concluida_at,
      updated_at = NOW()
    WHERE id = v_instalacao_id;

    -- Histórico do atendimento
    INSERT INTO public.instalacoes_historico_atendimentos (
      instalacao_id,
      instalador_id,
      status_atendimento,
      motivo,
      observacoes,
      km_no_atendimento
    ) VALUES (
      v_instalacao_id,
      v_user_id,
      p_status,
      p_motivo,
      p_observacoes,
      p_km_instalacao
    );

    IF p_status = 'concluida' THEN
      -- Identifica veículo
      IF v_veiculo_id IS NULL AND v_placa_limpa IS NOT NULL THEN
        SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;
      END IF;

      -- 1. Desvincula veículo e inativa do mapa
      IF v_veiculo_id IS NOT NULL THEN
        UPDATE public.veiculos
        SET
          rastreador_id = NULL,
          rastreador_imei = NULL,
          ativo = FALSE,
          status_operacional = 'desinstalado',
          odometro_km = GREATEST(odometro_km, p_km_instalacao),
          updated_at = NOW()
        WHERE id = v_veiculo_id;
      END IF;

      -- 2. Atualiza rastreador físico para status 'em_estoque'
      IF v_imei_limpo IS NOT NULL THEN
        UPDATE public.rastreadores
        SET
          veiculo_id = NULL,
          status = 'em_estoque',
          updated_at = NOW()
        WHERE imei = v_imei_limpo;
      END IF;

      -- 3. Devolução de todos os materiais e itens de kit instalados no veículo ao estoque
      IF v_veiculo_id IS NOT NULL THEN
        FOR v_item_rec IN (
          SELECT m.item_id, 
                 SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) AS qtd_recolhida
          FROM public.estoque_movimentacoes m
          WHERE m.veiculo_id = v_veiculo_id
          GROUP BY m.item_id
          HAVING SUM(CASE WHEN m.tipo = 'saida_instalacao' THEN m.quantidade WHEN m.tipo = 'estorno_instalacao' THEN -m.quantidade ELSE 0 END) > 0
        ) LOOP
          SELECT * INTO v_item_estoque FROM public.estoque_itens WHERE id = v_item_rec.item_id FOR UPDATE;
          IF FOUND THEN
            v_saldo_ant := v_item_estoque.quantidade_atual;
            v_saldo_post := v_saldo_ant + v_item_rec.qtd_recolhida;

            UPDATE public.estoque_itens
            SET quantidade_atual = v_saldo_post, updated_at = NOW()
            WHERE id = v_item_estoque.id;

            INSERT INTO public.estoque_movimentacoes (
              item_id, tipo, quantidade, custo_unitario, valor_total,
              saldo_anterior, saldo_posterior, instalacao_id, veiculo_id,
              instalador_id, observacao, data_movimento
            ) VALUES (
              v_item_estoque.id, 'estorno_instalacao', v_item_rec.qtd_recolhida, v_item_estoque.custo_medio_unitario,
              ROUND(v_item_rec.qtd_recolhida * v_item_estoque.custo_medio_unitario, 2),
              v_saldo_ant, v_saldo_post, v_instalacao_id, v_veiculo_id,
              COALESCE(v_instalador_id, v_user_id),
              'Devolução ao estoque: Material e kit recolhidos na retirada do veículo placa ' || COALESCE(v_placa_limpa, ''),
              NOW()
            );
            v_materiais_devolvidos := v_materiais_devolvidos + 1;
          END IF;
        END LOOP;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', TRUE,
      'tipo_servico', 'retirada',
      'instalacao_id', v_instalacao_id,
      'veiculo_id', v_veiculo_id,
      'materiais_devolvidos', v_materiais_devolvidos
    );
  END IF;

  -- =========================================================================
  -- CASO B: ORDEM DE INSTALAÇÃO PADRÃO OU REINSTALAÇÃO
  -- =========================================================================
  -- Auto-provisionamento de Chip SIM
  IF v_iccid_limpo IS NOT NULL THEN
    SELECT id INTO v_chip_id FROM public.chips WHERE iccid = v_iccid_limpo LIMIT 1;
    IF v_chip_id IS NULL THEN
      INSERT INTO public.chips (iccid, operadora, status)
      VALUES (v_iccid_limpo, COALESCE(p_chip_operadora, 'Vivo'), 'ativo')
      RETURNING id INTO v_chip_id;
    END IF;
  END IF;

  -- Auto-provisionamento de Rastreador
  IF v_imei_limpo IS NOT NULL THEN
    SELECT id INTO v_rastreador_id FROM public.rastreadores WHERE imei = v_imei_limpo LIMIT 1;
    IF v_rastreador_id IS NULL THEN
      INSERT INTO public.rastreadores (imei, modelo, status, chip_id)
      VALUES (v_imei_limpo, COALESCE(p_rastreador_modelo, 'J16 4G'), 'ativo', v_chip_id)
      RETURNING id INTO v_rastreador_id;
    ELSE
      UPDATE public.rastreadores
      SET status = 'ativo',
          chip_id = COALESCE(v_chip_id, chip_id),
          updated_at = NOW()
      WHERE id = v_rastreador_id;
    END IF;
  END IF;

  -- Obter veículo
  IF v_placa_limpa IS NOT NULL THEN
    SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;
    IF v_veiculo_id IS NULL THEN
      INSERT INTO public.veiculos (
        cliente_id, placa, marca_modelo, ano, cor,
        odometro_km, rastreador_id, rastreador_imei,
        ativo, bloqueador_instalado, status_operacional
      ) VALUES (
        p_cliente_id,
        v_placa_limpa,
        CONCAT(COALESCE(p_marca, 'Veículo'), ' ', COALESCE(p_modelo, '')),
        p_ano,
        p_cor,
        COALESCE(p_km_instalacao, 0),
        v_rastreador_id,
        v_imei_limpo,
        (p_status = 'concluida'),
        v_bloqueador,
        CASE WHEN p_status = 'concluida' THEN 'ativo' ELSE 'aguardando_instalacao' END
      )
      RETURNING id INTO v_veiculo_id;
    ELSE
      UPDATE public.veiculos
      SET
        cliente_id = COALESCE(p_cliente_id, cliente_id),
        marca_modelo = CONCAT(COALESCE(p_marca, 'Veículo'), ' ', COALESCE(p_modelo, '')),
        ano = COALESCE(p_ano, ano),
        cor = COALESCE(p_cor, cor),
        odometro_km = GREATEST(odometro_km, COALESCE(p_km_instalacao, 0)),
        rastreador_id = COALESCE(v_rastreador_id, rastreador_id),
        rastreador_imei = COALESCE(v_imei_limpo, rastreador_imei),
        ativo = (p_status = 'concluida'),
        bloqueador_instalado = v_bloqueador,
        status_operacional = CASE WHEN p_status = 'concluida' THEN 'ativo' ELSE 'aguardando_instalacao' END,
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;
  END IF;

  -- Vincular veículo ao rastreador
  IF v_rastreador_id IS NOT NULL AND v_veiculo_id IS NOT NULL THEN
    UPDATE public.rastreadores
    SET veiculo_id = v_veiculo_id, status = 'ativo', updated_at = NOW()
    WHERE id = v_rastreador_id;
  END IF;

  -- Se for novo registro
  IF v_instalacao_id IS NULL THEN
    IF p_cliente_id IS NOT NULL THEN
      SELECT instalador_id INTO v_cliente_instalador_id FROM public.clientes WHERE id = p_cliente_id;
    END IF;
    v_instalador_id := COALESCE(v_cliente_instalador_id, v_user_id);

    SELECT valor_por_instalacao INTO v_valor_unitario
    FROM public.profiles
    WHERE id = v_instalador_id;
    v_valor_unitario := COALESCE(v_valor_unitario, 50.00);

    INSERT INTO public.instalacoes (
      instalador_id,
      cliente_id,
      veiculo_id,
      placa,
      marca,
      modelo,
      ano,
      cor,
      km_instalacao,
      rastreador_imei,
      rastreador_modelo,
      chip_iccid,
      chip_operadora,
      posicao_instalacao,
      status,
      motivo_pendencia_recusa,
      observacoes,
      valor_instalacao,
      status_pagamento,
      bloqueador_instalado,
      tipo_servico
    ) VALUES (
      v_instalador_id,
      p_cliente_id,
      v_veiculo_id,
      v_placa_limpa,
      COALESCE(p_marca, 'Veículo'),
      COALESCE(p_modelo, 'Modelo'),
      p_ano,
      p_cor,
      p_km_instalacao,
      COALESCE(v_imei_limpo, 'A CONFERIR'),
      COALESCE(p_rastreador_modelo, 'J16 4G'),
      v_iccid_limpo,
      p_chip_operadora,
      p_posicao_instalacao,
      p_status,
      p_motivo,
      p_observacoes,
      v_valor_unitario,
      'pendente',
      v_bloqueador,
      'instalacao'
    )
    RETURNING id INTO v_instalacao_id;
  ELSE
    UPDATE public.instalacoes
    SET
      cliente_id = COALESCE(p_cliente_id, cliente_id),
      veiculo_id = COALESCE(v_veiculo_id, veiculo_id),
      placa = v_placa_limpa,
      marca = COALESCE(p_marca, marca),
      modelo = COALESCE(p_modelo, modelo),
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      km_instalacao = p_km_instalacao,
      rastreador_imei = COALESCE(v_imei_limpo, rastreador_imei),
      rastreador_modelo = COALESCE(p_rastreador_modelo, rastreador_modelo),
      chip_iccid = COALESCE(v_iccid_limpo, chip_iccid),
      chip_operadora = COALESCE(p_chip_operadora, chip_operadora),
      posicao_instalacao = COALESCE(p_posicao_instalacao, posicao_instalacao),
      status = p_status,
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      bloqueador_instalado = v_bloqueador,
      concluida_at = CASE WHEN p_status = 'concluida' AND concluida_at IS NULL THEN NOW() ELSE concluida_at END,
      updated_at = NOW()
    WHERE id = v_instalacao_id;
  END IF;

  -- Histórico do atendimento
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_instalacao_id,
    v_user_id,
    p_status,
    p_motivo,
    p_observacoes,
    p_km_instalacao
  );

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'instalacao_id', v_instalacao_id,
    'veiculo_id', v_veiculo_id,
    'tipo_servico', 'instalacao'
  );
END;
$$;
