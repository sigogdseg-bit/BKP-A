-- ============================================================================
-- HUNTER — MIGRAÇÃO DE TELEMETRIA AVANÇADA, CICLO DE IGNIÇÃO E ALERTAS DE ACIDENTE
-- ============================================================================
-- Diretrizes: DJR-NEW & DJR-APP
-- Versão Alvo: 1.2.0.0
-- ============================================================================

-- 1. Colunas adicionais de sensores físicos na tabela telemetria_posicoes
DO $$ BEGIN
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS inclinacao_graus INT DEFAULT 0;
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS vibracao_g NUMERIC(4,2) DEFAULT 0.00;
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS alerta_acidente BOOLEAN DEFAULT FALSE;
  ALTER TABLE public.telemetria_posicoes ADD COLUMN IF NOT EXISTS alerta_tipo TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 2. Tabela de Alertas de Segurança e Acidentes (Impacto, Capotamento e Colisão)
CREATE TABLE IF NOT EXISTS public.alertas_seguranca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'colisao_impacto', 'capotamento_inclinacao', 'parada_repentina_colisao'
  gravidade TEXT NOT NULL DEFAULT 'alta', -- 'critica', 'alta', 'media'
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  velocidade INT NOT NULL DEFAULT 0,
  vibracao_g NUMERIC(4,2) DEFAULT 0.00,
  inclinacao_graus INT DEFAULT 0,
  detalhes TEXT NOT NULL,
  reconhecido BOOLEAN NOT NULL DEFAULT FALSE,
  reconhecido_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reconhecido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_veiculo ON public.alertas_seguranca(veiculo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_cliente ON public.alertas_seguranca(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_reconhecido ON public.alertas_seguranca(reconhecido);

-- 3. Função Auxiliar de Verificação de Privilégio Administrativo
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = COALESCE(p_user_id, auth.uid()) AND role IN ('superadmin', 'adm')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid()) AND role IN ('superadmin', 'adm')
  );
$$;

-- 4. Habilitação de RLS na tabela alertas_seguranca
ALTER TABLE public.alertas_seguranca ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de RLS em alertas_seguranca
DROP POLICY IF EXISTS "Alertas visiveis para administradores e operadores" ON public.alertas_seguranca;
CREATE POLICY "Alertas visiveis para administradores e operadores"
ON public.alertas_seguranca FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

DROP POLICY IF EXISTS "Alertas visiveis para o cliente proprietario do veiculo" ON public.alertas_seguranca;
CREATE POLICY "Alertas visiveis para o cliente proprietario do veiculo"
ON public.alertas_seguranca FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Administradores podem gerenciar alertas" ON public.alertas_seguranca;
CREATE POLICY "Administradores podem gerenciar alertas"
ON public.alertas_seguranca FOR ALL TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

-- 5. RPC para Reconhecimento Operacional do Alerta
CREATE OR REPLACE FUNCTION public.reconhecer_alerta_seguranca(
  p_alerta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  UPDATE public.alertas_seguranca
  SET
    reconhecido = TRUE,
    reconhecido_por = v_user_id,
    reconhecido_at = NOW()
  WHERE id = p_alerta_id;

  RETURN jsonb_build_object('sucesso', true, 'alerta_id', p_alerta_id);
END;
$$;

-- 6. Função para Processamento de Telemetria e Ciclo de Ignição / Viagem
-- Ao ligar e desligar o veículo, gera 1 evento completo de viagem com velocidade média e km rodado
CREATE OR REPLACE FUNCTION public.processar_telemetria_veiculo(
  p_veiculo_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_velocidade INT,
  p_ignicao BOOLEAN,
  p_odometro INT DEFAULT NULL,
  p_inclinacao INT DEFAULT 0,
  p_vibracao NUMERIC DEFAULT 0.00,
  p_rumo INT DEFAULT 0
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
BEGIN
  -- Busca estado atual do veículo
  SELECT id, cliente_id, ignicao_status, velocidade_atual, odometro_km, ultima_latitude, ultima_longitude
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  v_novo_odometro := COALESCE(p_odometro, v_veiculo.odometro_km);

  -- 6.1. Detecção de Anomalias Físicas e Acidentes
  -- Regra 1: Inclinação >= 45 graus (Capotamento ou Tombamento)
  IF p_inclinacao >= 45 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'capotamento_inclinacao';
    v_detalhe_alerta := format('Inclinação crítica de %s graus detectada com veículo a %s km/h.', p_inclinacao, p_velocidade);
  
  -- Regra 2: Vibração / Choque extremo >= 2.5G (Impacto Severo / Colisão)
  ELSIF p_vibracao >= 2.50 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'colisao_impacto';
    v_detalhe_alerta := format('Força G extrema de %sG detectada com veículo a %s km/h.', p_vibracao, p_velocidade);

  -- Regra 3: Parada repentina de alta velocidade (>= 35 km/h para 0 km/h) com indício de choque
  ELSIF v_veiculo.velocidade_atual >= 35 AND p_velocidade = 0 AND p_vibracao >= 1.50 THEN
    v_alerta_gerado := TRUE;
    v_tipo_alerta := 'parada_repentina_colisao';
    v_detalhe_alerta := format('Desaceleração violenta de %s km/h para 0 km/h com choque de %sG.', v_veiculo.velocidade_atual, p_vibracao);
  END IF;

  -- Se houve alerta crítico, insere em alertas_seguranca
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
      'critica',
      p_latitude,
      p_longitude,
      p_velocidade,
      p_vibracao,
      p_inclinacao,
      v_detalhe_alerta
    );
  END IF;

  -- 6.2. Registro do Ponto Histórico na Telemetria
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
    v_alerta_gerado,
    v_tipo_alerta,
    NOW()
  );

  -- 6.3. Gerenciamento do Ciclo de Ignição e Eventos de Viagem
  -- Caso A: Ignição acabou de ser ligada (transição de FALSE para TRUE)
  IF NOT v_veiculo.ignicao_status AND p_ignicao THEN
    -- Inicia novo registro consolidado de viagem
    INSERT INTO public.viagens_trajetos (
      veiculo_id,
      inicio_at,
      fim_at,
      km_percorrido,
      velocidade_media,
      velocidade_maxima,
      status
    ) VALUES (
      p_veiculo_id,
      NOW(),
      NULL,
      0.00,
      p_velocidade,
      p_velocidade,
      'em_andamento'
    );

  -- Caso B: Ignição acabou de ser desligada (transição de TRUE para FALSE)
  ELSIF v_veiculo.ignicao_status AND NOT p_ignicao THEN
    -- Localiza a viagem em aberto mais recente
    SELECT id, inicio_at, km_percorrido, velocidade_media, velocidade_maxima
    INTO v_viagem_aberta
    FROM public.viagens_trajetos
    WHERE veiculo_id = p_veiculo_id AND status = 'em_andamento'
    ORDER BY inicio_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Calcula a distância percorrida com base nos pontos daquela viagem
      SELECT
        COALESCE(MAX(odometro) - MIN(odometro), 0),
        COALESCE(ROUND(AVG(velocidade)), 0),
        COALESCE(MAX(velocidade), 0)
      INTO v_distancia_km, v_viagem_aberta.velocidade_media, v_viagem_aberta.velocidade_maxima
      FROM public.telemetria_posicoes
      WHERE veiculo_id = p_veiculo_id
        AND data_hora_gps >= v_viagem_aberta.inicio_at;

      UPDATE public.viagens_trajetos
      SET
        fim_at = NOW(),
        km_percorrido = GREATEST(v_distancia_km, 0.00),
        velocidade_media = v_viagem_aberta.velocidade_media,
        velocidade_maxima = v_viagem_aberta.velocidade_maxima,
        status = 'concluida'
      WHERE id = v_viagem_aberta.id;
    END IF;

  -- Caso C: Veículo continua em movimento com ignição ligada
  ELSIF p_ignicao THEN
    -- Atualiza velocidade máxima da viagem corrente
    UPDATE public.viagens_trajetos
    SET
      velocidade_maxima = GREATEST(velocidade_maxima, p_velocidade)
    WHERE veiculo_id = p_veiculo_id AND status = 'em_andamento';
  END IF;

  -- 6.4. Atualização do Cadastro do Veículo
  UPDATE public.veiculos
  SET
    ignicao_status = p_ignicao,
    velocidade_atual = p_velocidade,
    odometro_km = v_novo_odometro,
    ultima_latitude = p_latitude,
    ultima_longitude = p_longitude,
    ultima_atualizacao = NOW()
  WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'alerta_gerado', v_alerta_gerado,
    'tipo_alerta', v_tipo_alerta
  );
END;
$$;
