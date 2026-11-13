-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Correção do Enum status_rastreador e da RPC salvar_atendimento_instalacao
-- Data: 02/10/2026
-- Objetivo:
-- 1. Elimina erro "invalid input value for enum status_rastreador: 'ativo'".
-- 2. Compatibiliza o enum status_rastreador com o valor 'ativo' por segurança defensiva.
-- 3. Restaura o uso canônico de 'instalado'::public.status_rastreador e 'estoque'::public.status_rastreador na RPC salvar_atendimento_instalacao.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Defesa em profundidade: adiciona 'ativo' ao enum status_rastreador caso ainda não exista
ALTER TYPE public.status_rastreador ADD VALUE IF NOT EXISTS 'ativo';

-- 2. Recriação da RPC salvar_atendimento_instalacao com status canônicos
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
      IF v_veiculo_id IS NULL AND v_placa_limpa IS NOT NULL THEN
        SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;
      END IF;

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

      -- Rastreador físico retirado volta para o estoque
      IF v_imei_limpo IS NOT NULL THEN
        UPDATE public.rastreadores
        SET
          veiculo_id = NULL,
          status = 'estoque'::public.status_rastreador,
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
  -- CASO B: ORDEM DE INSTALAÇÃO OU REABERTURA
  -- =========================================================================
  -- 1. Auto-provisionamento de Chip SIM
  IF v_iccid_limpo IS NOT NULL THEN
    SELECT id INTO v_chip_id FROM public.chips WHERE iccid = v_iccid_limpo LIMIT 1;
    IF v_chip_id IS NULL THEN
      INSERT INTO public.chips (iccid, operadora, status)
      VALUES (v_iccid_limpo, COALESCE(NULLIF(TRIM(p_chip_operadora), ''), 'Vivo'), 'ativo')
      RETURNING id INTO v_chip_id;
    END IF;
  END IF;

  -- 2. Auto-provisionamento ou vinculação do Rastreador com status canônico
  IF v_imei_limpo IS NOT NULL THEN
    SELECT id INTO v_rastreador_id FROM public.rastreadores WHERE imei = v_imei_limpo LIMIT 1;
    IF v_rastreador_id IS NULL THEN
      INSERT INTO public.rastreadores (imei, modelo, chip_id, status)
      VALUES (
        v_imei_limpo, 
        COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), 'J16 4G'), 
        v_chip_id, 
        CASE WHEN p_status = 'concluida' THEN 'instalado'::public.status_rastreador ELSE 'estoque'::public.status_rastreador END
      )
      RETURNING id INTO v_rastreador_id;
    ELSE
      UPDATE public.rastreadores
      SET
        chip_id = COALESCE(v_chip_id, chip_id),
        modelo = COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), modelo),
        status = CASE WHEN p_status = 'concluida' THEN 'instalado'::public.status_rastreador ELSE status END,
        updated_at = NOW()
      WHERE id = v_rastreador_id;
    END IF;
  END IF;

  -- 3. Criação ou Atualização da Instalação
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

  -- 4. Histórico de Atendimentos
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

  -- 5. Atualização ou Criação do Veículo
  IF p_status = 'concluida' THEN
    SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;

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

    -- Vincula veículo ao rastreador com status 'instalado'
    IF v_rastreador_id IS NOT NULL AND v_veiculo_id IS NOT NULL THEN
      UPDATE public.rastreadores
      SET
        veiculo_id = v_veiculo_id,
        status = 'instalado'::public.status_rastreador,
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
    'veiculo_id', v_veiculo_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_atendimento_instalacao TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
