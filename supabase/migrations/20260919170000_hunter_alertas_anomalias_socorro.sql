-- ============================================================================
-- HUNTER — SISTEMA AVANÇADO DE ALERTAS DE ACIDENTE, CAPOTAMENTO E ANOMALIAS
-- ============================================================================
-- Diretrizes: DJR-NEW & DJR-APP
-- Versão Alvo: 1.5.1.0
-- Notificação em tempo real para Usuário (Cliente) e Administradores com
-- Guia de Socorro Imediato (SAMU 192, Bombeiros 193, PM 190, PRF 191) e Ficha Cadastral.
-- ============================================================================

-- 1. Habilitar Realtime na tabela de alertas de segurança
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_seguranca;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;

-- 2. Atualizar ou enriquecer função processar_telemetria_veiculo com suporte a baterias reais e anomalias
CREATE OR REPLACE FUNCTION public.processar_telemetria_veiculo(
  p_veiculo_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_velocidade INT,
  p_ignicao BOOLEAN,
  p_odometro INT DEFAULT NULL,
  p_inclinacao INT DEFAULT 0,
  p_vibracao NUMERIC DEFAULT 0.00,
  p_rumo INT DEFAULT 0,
  p_bateria_veiculo_v NUMERIC DEFAULT NULL,
  p_bateria_rastreador_pct INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_veiculo RECORD;
  v_viagem_aberta RECORD;
  v_novo_odometro INT;
  v_distancia_km NUMERIC(8,2) := 0.00;
  v_alerta_gerado BOOLEAN := FALSE;
  v_tipo_alerta TEXT := NULL;
  v_detalhe_alerta TEXT := NULL;
  v_gravidade TEXT := 'alta';
  v_status_operacional TEXT;
BEGIN
  -- 1. Busca dados cadastrais e estado prévio do veículo
  SELECT id, cliente_id, odometro_km, ignicao_status, velocidade_atual, bloqueado, status_operacional, bateria_veiculo_v
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo % não localizado.', p_veiculo_id;
  END IF;

  v_novo_odometro := COALESCE(p_odometro, v_veiculo.odometro_km);

  -- 2. Detecção Estrita de Anomalias Físicas, Acidentes e Comportamento Anormal
  -- Regra 1: Inclinação Crítica >= 45 graus (Capotamento ou Tombamento)
  IF p_inclinacao >= 45 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'capotamento_inclinacao';
    v_gravidade := 'critica';
    v_detalhe_alerta := format('Capotamento/Inclinação crítica de %s° detectada com veículo a %s km/h.', p_inclinacao, p_velocidade);
  
  -- Regra 2: Choque / Vibração extrema >= 2.5G (Impacto Severo / Colisão)
  ELSIF p_vibracao >= 2.50 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'colisao_impacto';
    v_gravidade := 'critica';
    v_detalhe_alerta := format('Colisão/Impacto violento com força de %sG detectado a %s km/h.', p_vibracao, p_velocidade);

  -- Regra 3: Parada repentina violenta (desaceleração de >= 35 km/h para 0 com impacto >= 1.5G)
  ELSIF v_veiculo.velocidade_atual >= 35 AND p_velocidade = 0 AND p_vibracao >= 1.50 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'parada_repentina_colisao';
    v_gravidade := 'critica';
    v_detalhe_alerta := format('Desaceleração violenta de %s km/h para 0 km/h com choque de %sG.', v_veiculo.velocidade_atual, p_vibracao);

  -- Regra 4: Comportamento Anormal / Condução Perigosa (Inclinação alta em velocidade ou ziguezague/freadas bruscas)
  ELSIF (p_velocidade > 60 AND p_inclinacao >= 22) OR (p_velocidade > 30 AND p_vibracao >= 1.80) THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'comportamento_anormal';
    v_gravidade := 'alta';
    v_detalhe_alerta := format('Comportamento anormal/direção perigosa detectada: velocidade %s km/h, inclinação %s°, vibração %sG.', p_velocidade, p_inclinacao, p_vibracao);

  -- Regra 5: Corte ou Desconexão da Bateria do Carro (VCC externa cai para < 8V com carro ativo)
  ELSIF p_bateria_veiculo_v IS NOT NULL AND p_bateria_veiculo_v < 8.0 AND (p_ignicao OR p_velocidade > 0 OR v_veiculo.ignicao_status) THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'bateria_desconectada';
    v_gravidade := 'alta';
    v_detalhe_alerta := format('Alerta de alimentação: Bateria principal do carro caiu para %sV (indício de corte de fiação ou desconexão).', p_bateria_veiculo_v);
  END IF;

  -- 3. Registro do Alerta de Segurança se gerado
  IF v_alerta_gerado THEN
    INSERT INTO public.alertas_seguranca (
      veiculo_id,
      cliente_id,
      tipo,
      gravidade,
      latitude,
      longitude,
      velocidade,
      vibracao_g,
      inclinacao_graus,
      detalhes
    ) VALUES (
      p_veiculo_id,
      v_veiculo.cliente_id,
      v_tipo_alerta,
      v_gravidade,
      p_latitude,
      p_longitude,
      p_velocidade,
      p_vibracao,
      p_inclinacao,
      v_detalhe_alerta
    );
  END IF;

  -- 4. Registro Histórico na Tabela de Posições
  INSERT INTO public.telemetria_posicoes (
    veiculo_id,
    latitude,
    longitude,
    velocidade,
    ignicao,
    odometro,
    rumo,
    inclinacao_graus,
    vibracao_g,
    bateria_veiculo_v,
    bateria_rastreador_pct,
    alerta_acidente,
    alerta_tipo,
    data_hora_gps
  ) VALUES (
    p_veiculo_id,
    p_latitude,
    p_longitude,
    p_velocidade,
    p_ignicao,
    v_novo_odometro,
    p_rumo,
    p_inclinacao,
    p_vibracao,
    p_bateria_veiculo_v,
    p_bateria_rastreador_pct,
    v_alerta_gerado,
    v_tipo_alerta,
    NOW()
  );

  -- 5. Determinação do Status Operacional
  IF v_veiculo.bloqueado THEN
    v_status_operacional := 'bloqueado';
  ELSIF p_velocidade > 0 THEN
    v_status_operacional := 'em_rota';
  ELSIF p_ignicao THEN
    v_status_operacional := 'parado_ligado';
  ELSE
    v_status_operacional := 'estacionado';
  END IF;

  -- 6. Atualização em Tempo Real do Veículo
  UPDATE public.veiculos
  SET
    latitude_atual = p_latitude,
    longitude_atual = p_longitude,
    velocidade_atual = p_velocidade,
    ignicao_status = p_ignicao,
    odometro_km = v_novo_odometro,
    status_operacional = v_status_operacional,
    inclinacao_graus = p_inclinacao,
    vibracao_g = p_vibracao,
    bateria_veiculo_v = COALESCE(p_bateria_veiculo_v, bateria_veiculo_v),
    bateria_rastreador_pct = COALESCE(p_bateria_rastreador_pct, bateria_rastreador_pct),
    bateria_rastreador_status = CASE
      WHEN p_bateria_veiculo_v IS NOT NULL AND p_bateria_veiculo_v >= 9.0 THEN 'carregando'
      WHEN p_bateria_rastreador_pct IS NOT NULL AND p_bateria_rastreador_pct > 15 THEN 'bateria_interna'
      WHEN p_bateria_rastreador_pct IS NOT NULL AND p_bateria_rastreador_pct <= 15 THEN 'critica'
      ELSE bateria_rastreador_status
    END,
    alerta_acidente = v_alerta_gerado,
    alerta_tipo = v_tipo_alerta,
    ultima_comunicacao = NOW(),
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'alerta_gerado', v_alerta_gerado,
    'tipo_alerta', v_tipo_alerta,
    'status_operacional', v_status_operacional
  );
END;
$$;
