-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Evolução do Protocolo J16 (GT06) e Especificação de Bloqueadores
-- Data: 02/10/2026
-- Objetivo:
-- 1. Adiciona colunas tipo_bloqueador e bloqueador_detalhes em veiculos e instalacoes.
-- 2. Adiciona colunas sinal_gsm e rele_status em veiculos e telemetria_posicoes.
-- 3. Atualiza RPC salvar_atendimento_instalacao para suportar os novos parâmetros.
-- 4. Atualiza RPC registrar_posicao_gps_com_odometro para aceitar p_sinal_gsm.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Novas colunas em public.veiculos
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS tipo_bloqueador TEXT DEFAULT 'rele_combustivel';
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS bloqueador_detalhes TEXT DEFAULT NULL;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS sinal_gsm INT DEFAULT 4;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS rele_status BOOLEAN DEFAULT NULL;

-- 2. Novas colunas em public.instalacoes
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS tipo_bloqueador TEXT DEFAULT 'rele_combustivel';
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS bloqueador_detalhes TEXT DEFAULT NULL;

-- 3. Novas colunas em public.telemetria_posicoes
ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS sinal_gsm INT DEFAULT NULL;

-- 4. Atualização da RPC salvar_atendimento_instalacao
DROP FUNCTION IF EXISTS public.salvar_atendimento_instalacao(UUID, UUID, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.salvar_atendimento_instalacao(UUID, UUID, TEXT, TEXT, TEXT, INT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT);

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
  p_bloqueador_instalado BOOLEAN DEFAULT TRUE,
  p_tipo_bloqueador TEXT DEFAULT 'rele_combustivel',
  p_bloqueador_detalhes TEXT DEFAULT NULL
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
  v_tipo_bloq TEXT := COALESCE(p_tipo_bloqueador, 'rele_combustivel');
  v_detalhes_bloq TEXT := p_bloqueador_detalhes;
  v_tipo_servico TEXT := 'instalacao';
  v_ordem RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autenticado.';
  END IF;

  IF NOT v_bloqueador THEN
    v_tipo_bloq := 'sem_bloqueador';
    v_detalhes_bloq := NULL;
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
      tipo_bloqueador = v_tipo_bloq,
      bloqueador_detalhes = v_detalhes_bloq,
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
      bloqueador_instalado,
      tipo_bloqueador,
      bloqueador_detalhes
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
      v_bloqueador,
      v_tipo_bloq,
      v_detalhes_bloq
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
      tipo_bloqueador = v_tipo_bloq,
      bloqueador_detalhes = v_detalhes_bloq,
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
        bloqueador_instalado,
        tipo_bloqueador,
        bloqueador_detalhes
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
        v_bloqueador,
        v_tipo_bloq,
        v_detalhes_bloq
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
        tipo_bloqueador = v_tipo_bloq,
        bloqueador_detalhes = v_detalhes_bloq,
        updated_at = NOW()
      WHERE id = v_veiculo_id;
    END IF;

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
    'veiculo_id', v_veiculo_id,
    'bloqueador_instalado', v_bloqueador,
    'tipo_bloqueador', v_tipo_bloq,
    'bloqueador_detalhes', v_detalhes_bloq
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_atendimento_instalacao TO authenticated, service_role;

-- 5. Atualização da RPC registrar_posicao_gps_com_odometro para aceitar p_sinal_gsm
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text);
DROP FUNCTION IF EXISTS public.registrar_posicao_gps_com_odometro(uuid, uuid, double precision, double precision, numeric, boolean, integer, integer, timestamp with time zone, integer, numeric, numeric, integer, text, integer);

CREATE OR REPLACE FUNCTION public.registrar_posicao_gps_com_odometro(
  p_veiculo_id UUID,
  p_rastreador_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_velocidade NUMERIC,
  p_ignicao BOOLEAN,
  p_satelites INT,
  p_rumo INT,
  p_data_hora_gps TIMESTAMPTZ,
  p_inclinacao_graus INT DEFAULT 0,
  p_vibracao_g NUMERIC DEFAULT 0.0,
  p_bateria_veiculo_v NUMERIC DEFAULT NULL,
  p_bateria_rastreador_pct INT DEFAULT NULL,
  p_bateria_rastreador_status TEXT DEFAULT NULL,
  p_sinal_gsm INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_dist_metros NUMERIC := 0;
  v_delta_km NUMERIC := 0;
  v_novo_odometro NUMERIC(12, 2);
  v_status_op TEXT;
  v_dlat NUMERIC;
  v_dlon NUMERIC;
  v_a NUMERIC;
  v_vel_ms NUMERIC;
  v_max_dist_plausivel NUMERIC;
BEGIN
  SELECT id, ultima_latitude, ultima_longitude, odometro_km, cliente_id, ultima_atualizacao
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo não encontrado');
  END IF;

  v_novo_odometro := COALESCE(v_veiculo.odometro_km, 0);

  IF p_velocidade > 3.0 
     AND v_veiculo.ultima_latitude IS NOT NULL 
     AND v_veiculo.ultima_longitude IS NOT NULL 
     AND (v_veiculo.ultima_latitude <> 0 OR v_veiculo.ultima_longitude <> 0)
     AND (p_latitude <> 0 OR p_longitude <> 0) THEN
    
    v_dlat := radians(p_latitude - v_veiculo.ultima_latitude);
    v_dlon := radians(p_longitude - v_veiculo.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(v_veiculo.ultima_latitude)) * cos(radians(p_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(1.0 - v_a));

    v_vel_ms := (p_velocidade / 3.6);
    v_max_dist_plausivel := GREATEST((v_vel_ms * 60.0) + 25.0, 50.0);

    IF v_dist_metros >= 3.0 AND v_dist_metros <= v_max_dist_plausivel AND v_dist_metros < 5000.0 THEN
      v_delta_km := (v_dist_metros / 1000.0);
      v_novo_odometro := ROUND((v_novo_odometro + v_delta_km)::NUMERIC, 2);
    END IF;
  ELSE
    v_delta_km := 0.0;
  END IF;

  v_status_op := CASE
    WHEN p_velocidade > 3 THEN 'em_movimento'
    WHEN p_ignicao THEN 'parado_ligado'
    ELSE 'estacionado'
  END;

  INSERT INTO public.telemetria_posicoes (
    veiculo_id,
    rastreador_id,
    latitude,
    longitude,
    velocidade,
    ignicao,
    odometro,
    satelites,
    rumo,
    data_hora_gps,
    inclinacao_graus,
    vibracao_g,
    bateria_veiculo_v,
    bateria_rastreador_pct,
    bateria_rastreador_status,
    sinal_gsm
  ) VALUES (
    p_veiculo_id,
    p_rastreador_id,
    p_latitude,
    p_longitude,
    p_velocidade,
    p_ignicao,
    v_novo_odometro,
    p_satelites,
    p_rumo,
    p_data_hora_gps,
    p_inclinacao_graus,
    p_vibracao_g,
    p_bateria_veiculo_v,
    p_bateria_rastreador_pct,
    p_bateria_rastreador_status,
    p_sinal_gsm
  );

  UPDATE public.veiculos
  SET
    ultima_latitude = p_latitude,
    ultima_longitude = p_longitude,
    velocidade_atual = p_velocidade,
    ignicao_status = p_ignicao,
    odometro_km = v_novo_odometro,
    satelites = p_satelites,
    rumo = p_rumo,
    inclinacao_graus = p_inclinacao_graus,
    vibracao_g = p_vibracao_g,
    bateria_veiculo_v = COALESCE(p_bateria_veiculo_v, bateria_veiculo_v),
    bateria_rastreador_pct = COALESCE(p_bateria_rastreador_pct, bateria_rastreador_pct),
    bateria_rastreador_status = COALESCE(p_bateria_rastreador_status, bateria_rastreador_status),
    sinal_gsm = COALESCE(p_sinal_gsm, sinal_gsm),
    status_operacional = v_status_op,
    ultima_atualizacao = NOW()
  WHERE id = p_veiculo_id;

  IF v_delta_km > 0 THEN
    UPDATE public.viagens_trajetos
    SET
      km_percorrido = ROUND((COALESCE(km_percorrido, 0) + v_delta_km)::NUMERIC, 2),
      velocidade_maxima = GREATEST(COALESCE(velocidade_maxima, 0), p_velocidade)
    WHERE veiculo_id = p_veiculo_id AND status = 'em_andamento';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'odometro_anterior', v_veiculo.odometro_km,
    'delta_km', ROUND(v_delta_km::NUMERIC, 3),
    'novo_odometro', v_novo_odometro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_posicao_gps_com_odometro TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
