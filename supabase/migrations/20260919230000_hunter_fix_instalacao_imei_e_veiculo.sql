-- ============================================================================
-- HUNTER — CORREÇÃO CANÔNICA DE INSTALAÇÃO: AUTO-PROVISIONAMENTO DE IMEI E VEÍCULO
-- ============================================================================
-- Versão: 1.5.4.3
-- 1. Garante colunas rastreador_imei e status_operacional na tabela public.veiculos.
-- 2. Atualiza a RPC public.salvar_atendimento_instalacao:
--    - Auto-provisiona o rastreador na tabela public.rastreadores caso o IMEI não exista.
--    - Auto-provisiona o chip M2M na tabela public.chips caso o ICCID seja informado.
--    - Vincula rastreador_id e rastreador_imei no veículo rastreado.
--    - Ativa o cliente e conclui agendamento caso status seja 'concluida'.
-- 3. Recarrega o schema cache do PostgREST.
-- ============================================================================

-- 1. Colunas na tabela public.veiculos
DO $$ BEGIN
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS rastreador_imei TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS status_operacional TEXT DEFAULT 'estacionado';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_veiculos_rastreador_imei ON public.veiculos(rastreador_imei);

-- 2. Atualização da RPC public.salvar_atendimento_instalacao
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
  p_observacoes TEXT DEFAULT NULL
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autenticado.';
  END IF;

  -- Validacao estrita de status
  IF p_status NOT IN ('nao_instalado', 'concluida_com_pendencia', 'concluida') THEN
    RAISE EXCEPTION 'Status de instalacao invalido: %', p_status;
  END IF;

  -- Se for 'nao_instalado' ou 'concluida_com_pendencia', motivo e estritamente obrigatorio
  IF p_status IN ('nao_instalado', 'concluida_com_pendencia') AND (p_motivo IS NULL OR trim(p_motivo) = '') THEN
    RAISE EXCEPTION 'E obrigatorio informar o motivo para status de pendencia ou nao instalado.';
  END IF;

  v_placa_limpa := UPPER(trim(p_placa));
  v_imei_limpo := NULLIF(trim(p_rastreador_imei), '');
  v_iccid_limpo := NULLIF(trim(p_chip_iccid), '');

  IF p_status = 'concluida' AND (v_imei_limpo IS NULL OR v_imei_limpo = '') THEN
    RAISE EXCEPTION 'O IMEI do rastreador e obrigatorio para concluir a instalacao.';
  END IF;

  -- 1. Auto-provisionamento de Chip SIM caso ICCID informado
  IF v_iccid_limpo IS NOT NULL THEN
    SELECT id INTO v_chip_id
    FROM public.chips
    WHERE iccid = v_iccid_limpo
    LIMIT 1;

    IF v_chip_id IS NULL THEN
      INSERT INTO public.chips (
        iccid,
        operadora,
        status
      ) VALUES (
        v_iccid_limpo,
        COALESCE(NULLIF(trim(p_chip_operadora), ''), 'Vivo'),
        'ativo'
      ) RETURNING id INTO v_chip_id;
    END IF;
  END IF;

  -- 2. Auto-provisionamento de Rastreador na tabela public.rastreadores (elimina erro de IMEI inexistente)
  IF v_imei_limpo IS NOT NULL THEN
    SELECT id INTO v_rastreador_id
    FROM public.rastreadores
    WHERE imei = v_imei_limpo
    LIMIT 1;

    IF v_rastreador_id IS NULL THEN
      INSERT INTO public.rastreadores (
        imei,
        modelo,
        chip_id,
        status
      ) VALUES (
        v_imei_limpo,
        COALESCE(NULLIF(trim(p_rastreador_modelo), ''), 'J16 4G'),
        v_chip_id,
        CASE WHEN p_status = 'concluida' THEN 'instalado'::public.status_rastreador ELSE 'estoque'::public.status_rastreador END
      ) RETURNING id INTO v_rastreador_id;
    ELSE
      UPDATE public.rastreadores
      SET
        status = CASE WHEN p_status = 'concluida' THEN 'instalado'::public.status_rastreador ELSE status END,
        modelo = COALESCE(NULLIF(trim(p_rastreador_modelo), ''), modelo),
        chip_id = COALESCE(v_chip_id, chip_id),
        updated_at = NOW()
      WHERE id = v_rastreador_id;
    END IF;
  END IF;

  -- 3. Identificação do instalador responsável e valor unitário
  IF p_cliente_id IS NOT NULL THEN
    SELECT instalador_id INTO v_cliente_instalador_id
    FROM public.clientes
    WHERE id = p_cliente_id;
  END IF;

  IF p_instalacao_id IS NULL THEN
    -- Nova Ordem de Instalacao
    -- Prioriza o instalador atribuido ao cliente se o executor for admin/operador, ou usa o caller
    IF v_cliente_instalador_id IS NOT NULL THEN
      v_instalador_id := v_cliente_instalador_id;
    ELSE
      v_instalador_id := v_user_id;
    END IF;

    -- Obter o valor da instalacao configurado no cadastro do instalador
    SELECT COALESCE(valor_por_instalacao, 0.00) INTO v_valor_unitario
    FROM public.profiles
    WHERE id = v_instalador_id;

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
      concluida_at
    ) VALUES (
      v_instalador_id,
      p_cliente_id,
      v_placa_limpa,
      p_marca,
      p_modelo,
      p_ano,
      p_cor,
      p_km_instalacao,
      COALESCE(v_imei_limpo, 'SEM-IMEI'),
      COALESCE(NULLIF(trim(p_rastreador_modelo), ''), 'J16 4G'),
      v_iccid_limpo,
      p_chip_operadora,
      p_posicao_instalacao,
      p_status,
      p_motivo,
      p_observacoes,
      v_valor_unitario,
      v_concluida_at
    ) RETURNING id INTO v_instalacao_id;

  ELSE
    -- Atualizacao de instalacao existente
    v_instalacao_id := p_instalacao_id;

    SELECT instalador_id, concluida_at, veiculo_id
    INTO v_instalador_id, v_concluida_at, v_veiculo_id
    FROM public.instalacoes
    WHERE id = v_instalacao_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instalacao nao encontrada.';
    END IF;

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
      rastreador_modelo = COALESCE(NULLIF(trim(p_rastreador_modelo), ''), rastreador_modelo),
      chip_iccid = COALESCE(v_iccid_limpo, chip_iccid),
      chip_operadora = COALESCE(p_chip_operadora, chip_operadora),
      posicao_instalacao = COALESCE(p_posicao_instalacao, posicao_instalacao),
      status = p_status,
      motivo_pendencia_recusa = p_motivo,
      observacoes = p_observacoes,
      concluida_at = v_concluida_at,
      updated_at = NOW()
    WHERE id = v_instalacao_id;
  END IF;

  -- 4. Registro historico imutavel na timeline
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

  -- 5. Se a instalacao for concluida:
  --    - Cadastra ou atualiza o veiculo com rastreador_id e rastreador_imei
  --    - Ativa o cliente associado
  IF p_status = 'concluida' THEN
    SELECT id INTO v_veiculo_id
    FROM public.veiculos
    WHERE placa = v_placa_limpa
    LIMIT 1;

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
        ativo
      ) VALUES (
        p_cliente_id,
        v_placa_limpa,
        format('%s %s', p_marca, p_modelo),
        p_ano,
        p_cor,
        p_km_instalacao,
        v_rastreador_id,
        v_imei_limpo,
        'estacionado',
        TRUE
      ) RETURNING id INTO v_veiculo_id;

      -- Inicializa manutencao preventiva se existir procedure
      BEGIN
        PERFORM public.inicializar_itens_manutencao_veiculo(v_veiculo_id, p_km_instalacao);
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    ELSE
      UPDATE public.veiculos
      SET
        cliente_id = COALESCE(p_cliente_id, cliente_id),
        odometro_km = GREATEST(odometro_km, p_km_instalacao),
        rastreador_id = COALESCE(v_rastreador_id, rastreador_id),
        rastreador_imei = COALESCE(v_imei_limpo, rastreador_imei),
        status_operacional = 'estacionado',
        ativo = TRUE,
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;

    -- Vincula o veiculo na ordem de instalacao
    UPDATE public.instalacoes
    SET veiculo_id = v_veiculo_id
    WHERE id = v_instalacao_id;

    -- Ativa o cliente associado e conclui o agendamento
    IF p_cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET
        status = 'ativo',
        status_agendamento = 'concluido',
        updated_at = NOW()
      WHERE id = p_cliente_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'instalacao_id', v_instalacao_id,
    'status', p_status,
    'veiculo_id', v_veiculo_id,
    'rastreador_id', v_rastreador_id,
    'rastreador_imei', v_imei_limpo
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
