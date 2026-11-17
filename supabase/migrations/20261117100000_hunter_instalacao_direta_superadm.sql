-- ============================================================================
-- HUNTER — INSTALAÇÃO DIRETA PARA SUPERADM (VEÍCULOS PREVIAMENTE INSTALADOS)
-- Migration: 20261117100000_hunter_instalacao_direta_superadm.sql
-- ============================================================================
-- 1. Cria a RPC public.registrar_instalacao_direta permitindo que o SuperADM
--    ou Administrador ative diretamente um veículo previamente instalado,
--    vinculando o rastreador disponível em estoque e ativando o cliente,
--    sem gerar agendamento, tramitação ou repasse financeiro de terceiro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_instalacao_direta(
  p_cliente_id UUID,
  p_placa TEXT,
  p_marca TEXT,
  p_modelo TEXT,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_tipo_veiculo TEXT DEFAULT 'carro',
  p_chassi TEXT DEFAULT NULL,
  p_km_instalacao INT DEFAULT 0,
  p_horimetro_inicial NUMERIC DEFAULT 0,
  p_rastreador_id UUID DEFAULT NULL,
  p_rastreador_imei TEXT DEFAULT NULL,
  p_rastreador_modelo TEXT DEFAULT 'J16 4G',
  p_chip_iccid TEXT DEFAULT NULL,
  p_chip_operadora TEXT DEFAULT NULL,
  p_chip_linha TEXT DEFAULT NULL,
  p_bloqueador_instalado BOOLEAN DEFAULT TRUE,
  p_tipo_bloqueador TEXT DEFAULT 'rele_combustivel',
  p_bloqueador_detalhes TEXT DEFAULT NULL,
  p_posicao_instalacao TEXT DEFAULT 'painel_interno',
  p_observacoes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_veiculo_id UUID := NULL;
  v_rastreador_id UUID := NULL;
  v_rastreador RECORD;
  v_chip_id UUID := NULL;
  v_chip RECORD;
  v_placa_limpa TEXT;
  v_imei_limpo TEXT;
  v_iccid_limpo TEXT;
  v_operadora_limpa TEXT;
  v_tipo_veiculo TEXT;
  v_marca_modelo_final TEXT;
  v_chassi_limpo TEXT;
  v_instalacao_id UUID;
  v_bloqueador BOOLEAN := COALESCE(p_bloqueador_instalado, TRUE);
  v_tipo_bloq TEXT := COALESCE(p_tipo_bloqueador, 'rele_combustivel');
  v_detalhes_bloq TEXT := p_bloqueador_detalhes;
  v_is_sem_placa BOOLEAN;
  v_chassi_sufixo TEXT;
BEGIN
  -- 1. Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso não autenticado.');
  END IF;

  -- 2. Autorização: Apenas SuperADM e ADM (e Operador) podem registrar instalação direta
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas SuperADM e Administradores possuem permissão para realizar instalação direta.');
  END IF;

  -- 3. Validação do Cliente
  IF p_cliente_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cliente inválido ou não encontrado.');
  END IF;

  -- 4. Sanitização do Tipo e Placa
  v_tipo_veiculo := LOWER(TRIM(COALESCE(p_tipo_veiculo, 'carro')));
  IF v_tipo_veiculo = 'quadriciclo' THEN v_tipo_veiculo := 'quadriciculo'; END IF;

  v_is_sem_placa := (v_tipo_veiculo IN ('maquina', 'trator', 'equipamento', 'moto_eletrica'));
  v_placa_limpa := UPPER(REGEXP_REPLACE(COALESCE(p_placa, ''), '[^A-Z0-9-]', '', 'g'));
  v_chassi_limpo := NULLIF(UPPER(TRIM(COALESCE(p_chassi, ''))), '');

  IF v_chassi_limpo IS NOT NULL AND LENGTH(v_chassi_limpo) >= 6 THEN
    v_chassi_sufixo := SUBSTRING(v_chassi_limpo FROM LENGTH(v_chassi_limpo) - 5);
  ELSE
    v_chassi_sufixo := NULL;
  END IF;

  IF v_placa_limpa = '' OR v_placa_limpa IN ('A DEFINIR', 'SEMPLACA', 'SEM PLACA') THEN
    IF v_is_sem_placa THEN
      v_placa_limpa := COALESCE(v_chassi_sufixo, 'SEMPLACA');
    ELSE
      v_placa_limpa := 'A DEFINIR';
    END IF;
  END IF;

  IF v_placa_limpa = 'A DEFINIR' AND NOT v_is_sem_placa THEN
    RETURN jsonb_build_object('success', false, 'message', 'A placa do veículo é obrigatória para conclusão da instalação direta.');
  END IF;

  -- 5. Sanitização do Bloqueador
  IF NOT v_bloqueador THEN
    v_tipo_bloq := 'sem_bloqueador';
    v_detalhes_bloq := NULL;
  END IF;

  -- 6. Localização e Validação do Rastreador
  v_imei_limpo := NULLIF(TRIM(COALESCE(p_rastreador_imei, '')), '');

  IF p_rastreador_id IS NOT NULL THEN
    SELECT * INTO v_rastreador FROM public.rastreadores WHERE id = p_rastreador_id;
  ELSIF v_imei_limpo IS NOT NULL THEN
    SELECT * INTO v_rastreador FROM public.rastreadores WHERE imei = v_imei_limpo LIMIT 1;
  END IF;

  IF v_rastreador.id IS NULL THEN
    IF v_imei_limpo IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Selecione ou informe um rastreador para a instalação direta.');
    END IF;
    -- Auto-provisiona rastreador caso informado manualmente
    INSERT INTO public.rastreadores (imei, modelo, status)
    VALUES (v_imei_limpo, COALESCE(NULLIF(TRIM(p_rastreador_modelo), ''), 'J16 4G'), 'estoque'::public.status_rastreador)
    RETURNING * INTO v_rastreador;
  END IF;

  v_rastreador_id := v_rastreador.id;
  v_imei_limpo := v_rastreador.imei;

  -- Verifica se o rastreador já está em uso em outro veículo ativo diferente
  IF v_rastreador.veiculo_id IS NOT NULL THEN
    SELECT id, placa INTO v_veiculo_id, v_placa_limpa FROM public.veiculos WHERE id = v_rastreador.veiculo_id AND ativo = TRUE LIMIT 1;
    IF FOUND AND (p_placa IS NULL OR UPPER(TRIM(p_placa)) <> v_placa_limpa) THEN
      RETURN jsonb_build_object('success', false, 'message', FORMAT('O rastreador IMEI %s já está instalado e ativo no veículo %s.', v_imei_limpo, v_placa_limpa));
    END IF;
  END IF;

  -- Busca dados do chip vinculado
  IF v_rastreador.chip_id IS NOT NULL THEN
    SELECT * INTO v_chip FROM public.chips WHERE id = v_rastreador.chip_id;
    IF FOUND THEN
      v_chip_id := v_chip.id;
      v_iccid_limpo := v_chip.iccid;
      v_operadora_limpa := v_chip.operadora;
    END IF;
  END IF;

  IF v_iccid_limpo IS NULL THEN
    v_iccid_limpo := NULLIF(TRIM(COALESCE(p_chip_iccid, '')), '');
    v_operadora_limpa := COALESCE(NULLIF(TRIM(p_chip_operadora), ''), 'Algar');
  END IF;

  -- 7. Criação ou Atualização do Veículo
  v_marca_modelo_final := TRIM(CONCAT(COALESCE(p_marca, 'Veículo'), ' ', COALESCE(p_modelo, 'Padrão')));

  -- Checa se já existe veículo cadastrado com esta placa
  SELECT id INTO v_veiculo_id FROM public.veiculos WHERE placa = v_placa_limpa LIMIT 1;

  IF v_veiculo_id IS NULL THEN
    INSERT INTO public.veiculos (
      cliente_id,
      placa,
      marca_modelo,
      ano,
      cor,
      tipo_veiculo,
      chassi,
      odometro_km,
      horimetro_horas,
      rastreador_id,
      rastreador_imei,
      status_operacional,
      ativo,
      bloqueado,
      bloqueador_instalado,
      tipo_bloqueador,
      bloqueador_detalhes,
      pendente_aprovacao_operador
    ) VALUES (
      p_cliente_id,
      v_placa_limpa,
      v_marca_modelo_final,
      p_ano,
      p_cor,
      v_tipo_veiculo,
      v_chassi_limpo,
      COALESCE(p_km_instalacao, 0),
      COALESCE(p_horimetro_inicial, 0),
      v_rastreador_id,
      v_imei_limpo,
      'estacionado',
      TRUE,
      FALSE,
      v_bloqueador,
      v_tipo_bloq,
      v_detalhes_bloq,
      FALSE
    ) RETURNING id INTO v_veiculo_id;

    BEGIN
      PERFORM public.inicializar_itens_manutencao_veiculo(v_veiculo_id, COALESCE(p_km_instalacao, 0));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSE
    UPDATE public.veiculos
    SET
      cliente_id = p_cliente_id,
      marca_modelo = v_marca_modelo_final,
      ano = COALESCE(p_ano, ano),
      cor = COALESCE(p_cor, cor),
      tipo_veiculo = v_tipo_veiculo,
      chassi = COALESCE(v_chassi_limpo, chassi),
      odometro_km = GREATEST(odometro_km, COALESCE(p_km_instalacao, 0)),
      horimetro_horas = GREATEST(COALESCE(horimetro_horas, 0), COALESCE(p_horimetro_inicial, 0)),
      rastreador_id = v_rastreador_id,
      rastreador_imei = v_imei_limpo,
      status_operacional = 'estacionado',
      ativo = TRUE,
      bloqueador_instalado = v_bloqueador,
      tipo_bloqueador = v_tipo_bloq,
      bloqueador_detalhes = v_detalhes_bloq,
      pendente_aprovacao_operador = FALSE,
      updated_at = NOW()
    WHERE id = v_veiculo_id;
  END IF;

  -- 8. Atualiza o Rastreador para Instalado
  UPDATE public.rastreadores
  SET
    veiculo_id = v_veiculo_id,
    status = 'instalado'::public.status_rastreador,
    updated_at = NOW()
  WHERE id = v_rastreador_id;

  -- 9. Atualiza o Chip se aplicável
  IF v_chip_id IS NOT NULL THEN
    UPDATE public.chips
    SET status = 'vinculado', updated_at = NOW()
    WHERE id = v_chip_id;
  END IF;

  -- 10. Criação da Ordem em instalacoes (status 'concluida' e isenta de repasse de instalador)
  INSERT INTO public.instalacoes (
    instalador_id,
    cliente_id,
    veiculo_id,
    placa,
    marca,
    modelo,
    ano,
    cor,
    tipo_veiculo,
    km_instalacao,
    horimetro_inicial,
    rastreador_id,
    rastreador_imei,
    rastreador_modelo,
    chip_iccid,
    chip_operadora,
    posicao_instalacao,
    status,
    concluida_at,
    valor_instalacao,
    status_pagamento,
    kit_confirmado_instalador,
    kit_confirmado_em,
    imei_confirmado,
    observacoes,
    tipo_servico,
    bloqueador_instalado,
    tipo_bloqueador,
    bloqueador_detalhes
  ) VALUES (
    v_user_id,
    p_cliente_id,
    v_veiculo_id,
    v_placa_limpa,
    COALESCE(p_marca, 'Veículo'),
    COALESCE(p_modelo, 'Padrão'),
    p_ano,
    p_cor,
    v_tipo_veiculo,
    COALESCE(p_km_instalacao, 0),
    COALESCE(p_horimetro_inicial, 0),
    v_rastreador_id,
    v_imei_limpo,
    COALESCE(v_rastreador.modelo, 'J16 4G'),
    v_iccid_limpo,
    v_operadora_limpa,
    COALESCE(p_posicao_instalacao, 'painel_interno'),
    'concluida',
    NOW(),
    0.00,
    'pago',
    TRUE,
    NOW(),
    v_imei_limpo,
    COALESCE(p_observacoes, 'Instalação direta realizada pelo SuperADM (veículo previamente instalado).'),
    'instalacao',
    v_bloqueador,
    v_tipo_bloq,
    v_detalhes_bloq
  ) RETURNING id INTO v_instalacao_id;

  -- 11. Histórico de Atendimento
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
    'concluida',
    'Instalação direta (já instalado)',
    'Ativação imediata pelo SuperADM sem tramitação de instalador.',
    COALESCE(p_km_instalacao, 0)
  );

  -- 12. Atualiza status do Cliente
  UPDATE public.clientes
  SET
    status = 'ativo',
    status_agendamento = 'concluido',
    updated_at = NOW()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Instalação direta realizada com sucesso e veículo ativado no Monitor GPS!',
    'veiculo_id', v_veiculo_id,
    'instalacao_id', v_instalacao_id,
    'rastreador_id', v_rastreador_id,
    'imei', v_imei_limpo,
    'placa', v_placa_limpa
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_instalacao_direta TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
