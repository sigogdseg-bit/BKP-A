-- Migration: 20260926101500_hunter_retirada_e_remanejamento_rastreadores.sql
-- Descrição: Suporte canônico a Ordens Técnicas de Retirada, Remanejamento e Isolamento de Histórico

-- 1. Novas colunas em public.instalacoes
ALTER TABLE public.instalacoes
ADD COLUMN IF NOT EXISTS tipo_servico TEXT NOT NULL DEFAULT 'instalacao';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_instalacoes_tipo_servico'
  ) THEN
    ALTER TABLE public.instalacoes 
    ADD CONSTRAINT chk_instalacoes_tipo_servico 
    CHECK (tipo_servico IN ('instalacao', 'retirada'));
  END IF;
END $$;

ALTER TABLE public.instalacoes
ADD COLUMN IF NOT EXISTS ordem_vinculada_id UUID REFERENCES public.instalacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instalacoes_tipo_servico ON public.instalacoes(tipo_servico);
CREATE INDEX IF NOT EXISTS idx_instalacoes_ordem_vinculada ON public.instalacoes(ordem_vinculada_id);

-- 2. Status no hardware public.rastreadores
ALTER TABLE public.rastreadores
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'disponivel';

CREATE INDEX IF NOT EXISTS idx_rastreadores_status ON public.rastreadores(status);

-- 3. RPC Atômica para Solicitar Apenas Retirada (Cancelamento ou Inadimplência)
CREATE OR REPLACE FUNCTION public.solicitar_retirada_rastreador(
  p_veiculo_id UUID,
  p_instalador_id UUID,
  p_valor_retirada NUMERIC DEFAULT 0.00,
  p_motivo TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_veiculo RECORD;
  v_nova_os_id UUID;
  v_valor_final NUMERIC(10,2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autenticado.';
  END IF;

  SELECT v.id, v.cliente_id, v.placa, v.marca_modelo, v.ano, v.cor, v.odometro_km,
         v.rastreador_id, v.rastreador_imei, r.chip_id, c.iccid, c.operadora
  INTO v_veiculo
  FROM public.veiculos v
  LEFT JOIN public.rastreadores r ON r.id = v.rastreador_id
  LEFT JOIN public.chips c ON c.id = r.chip_id
  WHERE v.id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veiculo nao encontrado para retirada.';
  END IF;

  IF v_veiculo.rastreador_imei IS NULL AND v_veiculo.rastreador_id IS NULL THEN
    RAISE EXCEPTION 'O veiculo selecionado nao possui rastreador vinculado para retirada.';
  END IF;

  v_valor_final := GREATEST(COALESCE(p_valor_retirada, 0.00), 0.00);

  INSERT INTO public.instalacoes (
    instalador_id,
    cliente_id,
    veiculo_id,
    tipo_servico,
    placa,
    marca,
    modelo,
    ano,
    cor,
    km_instalacao,
    rastreador_imei,
    chip_iccid,
    chip_operadora,
    status,
    motivo_pendencia_recusa,
    observacoes,
    valor_instalacao,
    status_pagamento
  ) VALUES (
    p_instalador_id,
    v_veiculo.cliente_id,
    v_veiculo.id,
    'retirada',
    v_veiculo.placa,
    SPLIT_PART(COALESCE(v_veiculo.marca_modelo, 'Veiculo'), ' ', 1),
    COALESCE(SUBSTRING(v_veiculo.marca_modelo FROM ' +(.*)'), 'Modelo'),
    v_veiculo.ano,
    v_veiculo.cor,
    COALESCE(v_veiculo.odometro_km, 0),
    COALESCE(v_veiculo.rastreador_imei, 'A CONFERIR'),
    v_veiculo.iccid,
    v_veiculo.operadora,
    'nao_instalado',
    p_motivo,
    p_observacoes,
    v_valor_final,
    'pendente'
  )
  RETURNING id INTO v_nova_os_id;

  -- Histórico do atendimento inicial
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_nova_os_id,
    v_user_id,
    'nao_instalado',
    p_motivo,
    COALESCE(p_observacoes, 'Ordem de retirada emitida pela gestao Hunter.'),
    COALESCE(v_veiculo.odometro_km, 0)
  );

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'instalacao_id', v_nova_os_id,
    'tipo_servico', 'retirada'
  );
END;
$$;

-- 4. RPC Atômica para Solicitar Remanejamento de Rastreador (Troca de Veículo / Cliente)
CREATE OR REPLACE FUNCTION public.solicitar_remanejamento_rastreador(
  p_veiculo_origem_id UUID,
  p_cliente_destino_id UUID,
  p_novo_veiculo_placa TEXT,
  p_novo_veiculo_marca TEXT,
  p_novo_veiculo_modelo TEXT,
  p_novo_veiculo_ano INT DEFAULT NULL,
  p_novo_veiculo_cor TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_valor_retirada NUMERIC DEFAULT 0.00,
  p_valor_instalacao NUMERIC DEFAULT 350.00,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_origem RECORD;
  v_os_retirada_id UUID;
  v_os_instalacao_id UUID;
  v_placa_nova TEXT;
  v_valor_retirada_final NUMERIC(10,2);
  v_valor_instalacao_final NUMERIC(10,2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autenticado.';
  END IF;

  v_placa_nova := UPPER(TRIM(p_novo_veiculo_placa));
  IF v_placa_nova IS NULL OR v_placa_nova = '' THEN
    RAISE EXCEPTION 'A placa do novo veiculo e obrigatoria.';
  END IF;

  -- 1. Busca veiculo e rastreador de origem
  SELECT v.id, v.cliente_id, v.placa, v.marca_modelo, v.ano, v.cor, v.odometro_km,
         v.rastreador_id, v.rastreador_imei, r.chip_id, c.iccid, c.operadora
  INTO v_origem
  FROM public.veiculos v
  LEFT JOIN public.rastreadores r ON r.id = v.rastreador_id
  LEFT JOIN public.chips c ON c.id = r.chip_id
  WHERE v.id = p_veiculo_origem_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veiculo de origem nao encontrado.';
  END IF;

  IF v_origem.rastreador_imei IS NULL AND v_origem.rastreador_id IS NULL THEN
    RAISE EXCEPTION 'O veiculo de origem nao possui rastreador para remanejamento.';
  END IF;

  v_valor_retirada_final := GREATEST(COALESCE(p_valor_retirada, 0.00), 0.00);
  v_valor_instalacao_final := GREATEST(COALESCE(p_valor_instalacao, 0.00), 0.00);

  -- 2. Cria OS 1: Retirada no Veículo de Origem
  INSERT INTO public.instalacoes (
    instalador_id,
    cliente_id,
    veiculo_id,
    tipo_servico,
    placa,
    marca,
    modelo,
    ano,
    cor,
    km_instalacao,
    rastreador_imei,
    chip_iccid,
    chip_operadora,
    status,
    motivo_pendencia_recusa,
    observacoes,
    valor_instalacao,
    status_pagamento
  ) VALUES (
    p_instalador_id,
    v_origem.cliente_id,
    v_origem.id,
    'retirada',
    v_origem.placa,
    SPLIT_PART(COALESCE(v_origem.marca_modelo, 'Veiculo'), ' ', 1),
    COALESCE(SUBSTRING(v_origem.marca_modelo FROM ' +(.*)'), 'Modelo'),
    v_origem.ano,
    v_origem.cor,
    COALESCE(v_origem.odometro_km, 0),
    COALESCE(v_origem.rastreador_imei, 'A CONFERIR'),
    v_origem.iccid,
    v_origem.operadora,
    'nao_instalado',
    'Remanejamento para novo veiculo: ' || v_placa_nova,
    p_observacoes,
    v_valor_retirada_final,
    'pendente'
  )
  RETURNING id INTO v_os_retirada_id;

  -- 3. Cria OS 2: Instalação no Novo Veículo de Destino
  INSERT INTO public.instalacoes (
    instalador_id,
    cliente_id,
    veiculo_id,
    tipo_servico,
    placa,
    marca,
    modelo,
    ano,
    cor,
    km_instalacao,
    rastreador_imei,
    chip_iccid,
    chip_operadora,
    status,
    motivo_pendencia_recusa,
    observacoes,
    valor_instalacao,
    status_pagamento,
    ordem_vinculada_id
  ) VALUES (
    p_instalador_id,
    COALESCE(p_cliente_destino_id, v_origem.cliente_id),
    NULL, -- Sera vinculado ou criado ao concluir a instalacao
    'instalacao',
    v_placa_nova,
    TRIM(p_novo_veiculo_marca),
    TRIM(p_novo_veiculo_modelo),
    p_novo_veiculo_ano,
    p_novo_veiculo_cor,
    0,
    COALESCE(v_origem.rastreador_imei, 'A CONFERIR'),
    v_origem.iccid,
    v_origem.operadora,
    'nao_instalado',
    'Aguardando conclusao da retirada do veiculo ' || v_origem.placa,
    p_observacoes,
    v_valor_instalacao_final,
    'pendente',
    v_os_retirada_id
  )
  RETURNING id INTO v_os_instalacao_id;

  -- 4. Vincula reciprocamente a OS de Retirada a OS de Instalacao
  UPDATE public.instalacoes
  SET ordem_vinculada_id = v_os_instalacao_id
  WHERE id = v_os_retirada_id;

  -- 5. Histórico da Retirada
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_os_retirada_id,
    v_user_id,
    'nao_instalado',
    'Remanejamento / Troca de Veiculo',
    'Ordem de retirada gerada em conjunto com a instalacao da placa ' || v_placa_nova,
    COALESCE(v_origem.odometro_km, 0)
  );

  -- 6. Histórico da Instalação
  INSERT INTO public.instalacoes_historico_atendimentos (
    instalacao_id,
    instalador_id,
    status_atendimento,
    motivo,
    observacoes,
    km_no_atendimento
  ) VALUES (
    v_os_instalacao_id,
    v_user_id,
    'nao_instalado',
    'Remanejamento / Troca de Veiculo',
    'Ordem de instalacao gerada em conjunto com a retirada da placa ' || v_origem.placa,
    0
  );

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'ordem_retirada_id', v_os_retirada_id,
    'ordem_instalacao_id', v_os_instalacao_id
  );
END;
$$;

-- 5. Atualização da RPC salvar_atendimento_instalacao para suportar Retiradas e Instalações com isolamento
DROP FUNCTION IF EXISTS public.salvar_atendimento_instalacao(UUID, UUID, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.salvar_atendimento_instalacao(UUID, UUID, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autenticado.';
  END IF;

  IF p_status NOT IN ('nao_instalado', 'concluida_com_pendencia', 'concluida') THEN
    RAISE EXCEPTION 'Status de atendimento invalido: %', p_status;
  END IF;

  IF p_status IN ('nao_instalado', 'concluida_com_pendencia') AND (p_motivo IS NULL OR TRIM(p_motivo) = '') THEN
    RAISE EXCEPTION 'E obrigatorio informar o motivo para status de pendencia ou nao executado.';
  END IF;

  v_placa_limpa := UPPER(TRIM(p_placa));
  v_imei_limpo := NULLIF(TRIM(p_rastreador_imei), '');
  v_iccid_limpo := NULLIF(TRIM(p_chip_iccid), '');

  IF p_status = 'concluida' AND (v_imei_limpo IS NULL OR v_imei_limpo = '') THEN
    RAISE EXCEPTION 'O IMEI do rastreador e obrigatorio para concluir o atendimento.';
  END IF;

  -- 1. Busca dados da instalação se existente
  IF p_instalacao_id IS NOT NULL THEN
    SELECT * INTO v_ordem FROM public.instalacoes WHERE id = p_instalacao_id;
    IF FOUND THEN
      v_tipo_servico := COALESCE(v_ordem.tipo_servico, 'instalacao');
      v_instalacao_id := v_ordem.id;
      v_veiculo_id := v_ordem.veiculo_id;
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

      -- Desvincula veículo e inativa do mapa
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

      -- Atualiza rastreador físico para status 'em_estoque'
      IF v_imei_limpo IS NOT NULL THEN
        UPDATE public.rastreadores
        SET
          veiculo_id = NULL,
          status = 'em_estoque',
          updated_at = NOW()
        WHERE imei = v_imei_limpo;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'sucesso', TRUE,
      'tipo_servico', 'retirada',
      'instalacao_id', v_instalacao_id,
      'veiculo_id', v_veiculo_id
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
      VALUES (v_iccid_limpo, COALESCE(NULLIF(TRIM(p_chip_operadora), ''), 'Vivo'), 'ativo')
      RETURNING id INTO v_chip_id;
    END IF;
  END IF;

  -- Auto-provisionamento ou ativação do Rastreador
  IF v_imei_limpo IS NOT NULL THEN
    SELECT id INTO v_rastreador_id FROM public.rastreadores WHERE imei = v_imei_limpo LIMIT 1;
    IF v_rastreador_id IS NULL THEN
      INSERT INTO public.rastreadores (imei, modelo, chip_id, status)
      VALUES (v_imei_limpo, COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), 'J16 4G'), v_chip_id, 'ativo')
      RETURNING id INTO v_rastreador_id;
    ELSE
      UPDATE public.rastreadores
      SET
        chip_id = COALESCE(v_chip_id, chip_id),
        modelo = COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), modelo),
        status = 'ativo',
        updated_at = NOW()
      WHERE id = v_rastreador_id;
    END IF;
  END IF;

  IF p_instalacao_id IS NULL THEN
    SELECT id INTO v_instalador_id FROM public.profiles WHERE id = v_user_id AND role = 'instalador';
    IF v_instalador_id IS NULL THEN
      SELECT instalador_id INTO v_instalador_id FROM public.clientes WHERE id = p_cliente_id;
      IF v_instalador_id IS NULL THEN
        SELECT id INTO v_instalador_id FROM public.profiles WHERE role = 'instalador' AND ativo = TRUE LIMIT 1;
      END IF;
    END IF;

    IF v_instalador_id IS NULL THEN
      RAISE EXCEPTION 'Nao foi possivel determinar o instalador credenciado.';
    END IF;

    SELECT valor_por_instalacao INTO v_valor_unitario FROM public.profiles WHERE id = v_instalador_id;
    v_valor_unitario := COALESCE(v_valor_unitario, 350.00);

    IF p_status = 'concluida' THEN
      v_concluida_at := NOW();
    END IF;

    INSERT INTO public.instalacoes (
      instalador_id,
      cliente_id,
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
      concluida_at,
      bloqueador_instalado
    ) VALUES (
      v_instalador_id,
      p_cliente_id,
      v_placa_limpa,
      p_marca,
      p_modelo,
      p_ano,
      p_cor,
      p_km_instalacao,
      v_imei_limpo,
      COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), 'J16 4G'),
      v_iccid_limpo,
      p_chip_operadora,
      p_posicao_instalacao,
      p_status,
      p_motivo,
      p_observacoes,
      v_valor_unitario,
      v_concluida_at,
      v_bloqueador
    )
    RETURNING id INTO v_instalacao_id;
  ELSE
    v_instalacao_id := p_instalacao_id;

    IF p_status = 'concluida' AND v_concluida_at IS NULL THEN
      v_concluida_at := NOW();
    END IF;

    UPDATE public.instalacoes
    SET
      cliente_id = COALESCE(p_cliente_id, cliente_id),
      placa = COALESCE(v_placa_limpa, placa),
      marca = COALESCE(p_marca, marca),
      modelo = COALESCE(p_modelo, modelo),
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      km_instalacao = COALESCE(p_km_instalacao, km_instalacao),
      rastreador_imei = COALESCE(v_imei_limpo, rastreador_imei),
      rastreador_modelo = COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), rastreador_modelo),
      chip_iccid = COALESCE(v_iccid_limpo, chip_iccid),
      chip_operadora = COALESCE(p_chip_operadora, chip_operadora),
      posicao_instalacao = COALESCE(p_posicao_instalacao, posicao_instalacao),
      status = p_status,
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      concluida_at = v_concluida_at,
      bloqueador_instalado = v_bloqueador,
      updated_at = NOW()
    WHERE id = v_instalacao_id;
  END IF;

  -- Registro de histórico imutável
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

  -- Conclusão da Instalação: ativação do veículo
  IF p_status = 'concluida' THEN
    SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;

    -- Se o veículo não existia, cria NOVO com ID novo (isolamento total de telemetria)
    IF v_veiculo_id IS NULL THEN
      INSERT INTO public.veiculos (
        cliente_id,
        placa,
        marca_modelo,
        ano,
        cor,
        odometro_km,
        rastreador_id,
        rastreador_imei,
        status_operacional,
        ativo,
        bloqueador_instalado
      ) VALUES (
        p_cliente_id,
        v_placa_limpa,
        FORMAT('%s %s', p_marca, p_modelo),
        p_ano,
        p_cor,
        p_km_instalacao,
        v_rastreador_id,
        v_imei_limpo,
        'estacionado',
        TRUE,
        v_bloqueador
      ) RETURNING id INTO v_veiculo_id;

      BEGIN
        PERFORM public.inicializar_itens_manutencao_veiculo(v_veiculo_id, p_km_instalacao);
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    ELSE
      -- Veículo já existente: dá continuidade ao histórico daquele carro
      UPDATE public.veiculos
      SET
        cliente_id = COALESCE(p_cliente_id, cliente_id),
        odometro_km = GREATEST(odometro_km, p_km_instalacao),
        rastreador_id = COALESCE(v_rastreador_id, rastreador_id),
        rastreador_imei = COALESCE(v_imei_limpo, rastreador_imei),
        status_operacional = 'estacionado',
        ativo = TRUE,
        bloqueador_instalado = v_bloqueador,
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;

    -- Vincula rastreador ao veículo ativo
    IF v_rastreador_id IS NOT NULL AND v_veiculo_id IS NOT NULL THEN
      UPDATE public.rastreadores
      SET
        veiculo_id = v_veiculo_id,
        status = 'ativo',
        updated_at = NOW()
      WHERE id = v_rastreador_id;
    END IF;

    UPDATE public.instalacoes
    SET veiculo_id = v_veiculo_id
    WHERE id = v_instalacao_id AND (veiculo_id IS NULL OR veiculo_id <> v_veiculo_id);

    IF p_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET
        status = 'ativo',
        status_agendamento = 'concluido',
        updated_at = NOW()
      WHERE id = p_cliente_id AND status <> 'ativo';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'tipo_servico', 'instalacao',
    'instalacao_id', v_instalacao_id,
    'veiculo_id', v_veiculo_id,
    'bloqueador_instalado', v_bloqueador
  );
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.solicitar_retirada_rastreador TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_remanejamento_rastreador TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_atendimento_instalacao(UUID, UUID, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
