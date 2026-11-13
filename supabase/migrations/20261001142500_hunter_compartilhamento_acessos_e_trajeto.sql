-- ============================================================================
-- MIGRATION: Hunter - Rastreamento e Auditoria de Acessos a Links de Compartilhamento
-- Registra IP, data, hora, tempo de acesso, local de início, local de término,
-- histórico do trajeto percorrido e auditoria de período com Modo Stealth ativado.
-- ============================================================================
-- Protocolo: DJR-NEW e HUNTER-GUARDIAN
-- ============================================================================

-- 1. Colunas de auditoria de Modo Stealth em public.compartilhamentos_temporarios
ALTER TABLE public.compartilhamentos_temporarios
  ADD COLUMN IF NOT EXISTS stealth_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stealth_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS stealth_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS stealth_rumo NUMERIC,
  ADD COLUMN IF NOT EXISTS stealth_ativado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stealth_desativado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stealth_periodos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Atualização canônica de alternar_stealth_compartilhamento com gravação de períodos
CREATE OR REPLACE FUNCTION public.alternar_stealth_compartilhamento(
  p_token TEXT,
  p_ativo BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_share RECORD;
  v_veiculo RECORD;
  v_periodos JSONB;
BEGIN
  SELECT id, veiculo_id, revogado, expira_em, stealth_ativo, stealth_ativado_em, stealth_periodos
  INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não localizado.');
  END IF;

  IF v_share.revogado THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link foi revogado.');
  END IF;

  IF v_share.expira_em IS NOT NULL AND v_share.expira_em < now() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link expirou.');
  END IF;

  IF p_ativo THEN
    -- Busca posição atual do veículo para congelar
    SELECT ultima_latitude, ultima_longitude, rumo
    INTO v_veiculo
    FROM public.veiculos
    WHERE id = v_share.veiculo_id;

    UPDATE public.compartilhamentos_temporarios
    SET
      stealth_ativo = TRUE,
      stealth_latitude = v_veiculo.ultima_latitude,
      stealth_longitude = v_veiculo.ultima_longitude,
      stealth_rumo = v_veiculo.rumo,
      stealth_ativado_em = now()
    WHERE token = p_token;

    RETURN jsonb_build_object(
      'sucesso', true,
      'stealth_ativo', true,
      'stealth_ativado_em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'mensagem', 'Modo Stealth ativado: posição congelada com sucesso.'
    );
  ELSE
    -- Desativação: adiciona período completo ao histórico
    v_periodos := COALESCE(v_share.stealth_periodos, '[]'::jsonb);
    IF v_share.stealth_ativado_em IS NOT NULL THEN
      v_periodos := v_periodos || jsonb_build_array(
        jsonb_build_object(
          'ativado_em', to_char(v_share.stealth_ativado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'desativado_em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'duracao_segundos', GREATEST(0, EXTRACT(EPOCH FROM (now() - v_share.stealth_ativado_em))::INTEGER)
        )
      );
    END IF;

    UPDATE public.compartilhamentos_temporarios
    SET
      stealth_ativo = FALSE,
      stealth_desativado_em = now(),
      stealth_periodos = v_periodos
    WHERE token = p_token;

    RETURN jsonb_build_object(
      'sucesso', true,
      'stealth_ativo', false,
      'stealth_desativado_em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'mensagem', 'Modo Stealth desativado: tempo real restabelecido.'
    );
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.alternar_stealth_compartilhamento(TEXT, BOOLEAN) TO authenticated, anon, service_role;

-- 3. Criação da tabela de acessos aos compartilhamentos com rastreamento de Stealth
CREATE TABLE IF NOT EXISTS public.compartilhamentos_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compartilhamento_id UUID REFERENCES public.compartilhamentos_temporarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE CASCADE NOT NULL,
  ip TEXT,
  user_agent TEXT,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_ping_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  duracao_segundos INTEGER NOT NULL DEFAULT 0,
  inicio_latitude DOUBLE PRECISION,
  inicio_longitude DOUBLE PRECISION,
  inicio_endereco TEXT,
  fim_latitude DOUBLE PRECISION,
  fim_longitude DOUBLE PRECISION,
  fim_endereco TEXT,
  distancia_percorrida_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  velocidade_maxima INTEGER NOT NULL DEFAULT 0,
  stealth_observado BOOLEAN NOT NULL DEFAULT FALSE,
  stealth_inicio_em TIMESTAMPTZ,
  stealth_fim_em TIMESTAMPTZ,
  stealth_duracao_segundos INTEGER NOT NULL DEFAULT 0,
  stealth_periodos JSONB NOT NULL DEFAULT '[]'::jsonb,
  trajeto JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante existência das colunas se tabela já foi criada anteriormente
ALTER TABLE public.compartilhamentos_acessos
  ADD COLUMN IF NOT EXISTS stealth_observado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stealth_inicio_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stealth_fim_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stealth_duracao_segundos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stealth_periodos JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_comp_acessos_token ON public.compartilhamentos_acessos(token);
CREATE INDEX IF NOT EXISTS idx_comp_acessos_compartilhamento_id ON public.compartilhamentos_acessos(compartilhamento_id);
CREATE INDEX IF NOT EXISTS idx_comp_acessos_veiculo_id ON public.compartilhamentos_acessos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_comp_acessos_iniciado_em ON public.compartilhamentos_acessos(iniciado_em DESC);

-- 5. Habilita RLS Estrito
ALTER TABLE public.compartilhamentos_acessos ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de RLS
DROP POLICY IF EXISTS "Acesso seguro leitura compartilhamentos_acessos" ON public.compartilhamentos_acessos;
CREATE POLICY "Acesso seguro leitura compartilhamentos_acessos"
ON public.compartilhamentos_acessos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.veiculos v
    WHERE v.id = compartilhamentos_acessos.veiculo_id
      AND public.check_acesso_cliente_veiculo(v.cliente_id)
  ) OR EXISTS (
    SELECT 1 FROM public.compartilhamentos_temporarios ct
    WHERE ct.id = compartilhamentos_acessos.compartilhamento_id
      AND public.check_acesso_cliente_veiculo(ct.cliente_id)
  )
);

DROP POLICY IF EXISTS "Service role gerencia compartilhamentos_acessos" ON public.compartilhamentos_acessos;
CREATE POLICY "Service role gerencia compartilhamentos_acessos"
ON public.compartilhamentos_acessos FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 7. RPC Pública Segura para Registrar Início de Acesso ao Link
CREATE OR REPLACE FUNCTION public.registrar_acesso_link_publico(
  p_token TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_endereco_inicio TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share RECORD;
  v_veiculo RECORD;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_vel INTEGER;
  v_ign BOOLEAN;
  v_acesso_id UUID;
  v_trajeto JSONB;
  v_is_stealth BOOLEAN;
  v_stealth_inicio TIMESTAMPTZ;
  v_stealth_fim TIMESTAMPTZ;
BEGIN
  -- 1. Valida o link de compartilhamento
  SELECT * INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link não localizado.');
  END IF;

  IF v_share.revogado = TRUE THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link revogado.');
  END IF;

  IF v_share.expira_em IS NOT NULL AND v_share.expira_em < now() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link expirado.');
  END IF;

  -- 2. Busca veículo
  SELECT * INTO v_veiculo
  FROM public.veiculos
  WHERE id = v_share.veiculo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Veículo não localizado.');
  END IF;

  -- 3. Resolve posição inicial e estado de Stealth
  v_is_stealth := (v_share.stealth_ativo = TRUE);
  IF v_is_stealth THEN
    v_lat := COALESCE(v_share.stealth_latitude, v_veiculo.ultima_latitude);
    v_lng := COALESCE(v_share.stealth_longitude, v_veiculo.ultima_longitude);
    v_vel := 0;
    v_ign := false;
    v_stealth_inicio := now();
    v_stealth_fim := now();
  ELSE
    v_lat := v_veiculo.ultima_latitude;
    v_lng := v_veiculo.ultima_longitude;
    v_vel := COALESCE(v_veiculo.velocidade_atual, 0);
    v_ign := COALESCE(v_veiculo.ignicao_status, false);
    v_stealth_inicio := NULL;
    v_stealth_fim := NULL;
  END IF;

  -- Trajeto inicial com o ponto de abertura
  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    v_trajeto := jsonb_build_array(
      jsonb_build_object(
        'lat', v_lat,
        'lng', v_lng,
        't', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'vel', v_vel,
        'ign', v_ign,
        'stealth', v_is_stealth
      )
    );
  ELSE
    v_trajeto := '[]'::jsonb;
  END IF;

  -- 4. Cria o registro de acesso
  INSERT INTO public.compartilhamentos_acessos (
    compartilhamento_id,
    token,
    veiculo_id,
    ip,
    user_agent,
    iniciado_em,
    ultimo_ping_em,
    inicio_latitude,
    inicio_longitude,
    inicio_endereco,
    fim_latitude,
    fim_longitude,
    fim_endereco,
    distancia_percorrida_km,
    velocidade_maxima,
    stealth_observado,
    stealth_inicio_em,
    stealth_fim_em,
    stealth_duracao_segundos,
    trajeto
  ) VALUES (
    v_share.id,
    p_token,
    v_share.veiculo_id,
    COALESCE(p_ip, 'Desconhecido'),
    p_user_agent,
    now(),
    now(),
    v_lat,
    v_lng,
    p_endereco_inicio,
    v_lat,
    v_lng,
    p_endereco_inicio,
    0,
    v_vel,
    v_is_stealth,
    v_stealth_inicio,
    v_stealth_fim,
    0,
    v_trajeto
  ) RETURNING id INTO v_acesso_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'acesso_id', v_acesso_id,
    'inicio_latitude', v_lat,
    'inicio_longitude', v_lng,
    'stealth_observado', v_is_stealth
  );
END;
$$;

-- 8. RPC Pública Segura para Ping / Heartbeat e Acúmulo de Trajeto e Período Stealth
CREATE OR REPLACE FUNCTION public.ping_acesso_link_publico(
  p_acesso_id UUID,
  p_token TEXT,
  p_endereco_atual TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acesso RECORD;
  v_share RECORD;
  v_veiculo RECORD;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_vel INTEGER;
  v_ign BOOLEAN;
  v_duracao INTEGER;
  v_trajeto JSONB;
  v_ultimo_ponto JSONB;
  v_ultimo_lat DOUBLE PRECISION;
  v_ultimo_lng DOUBLE PRECISION;
  v_dist_km NUMERIC;
  v_novo_trajeto JSONB;
  v_vel_max INTEGER;
  v_is_stealth BOOLEAN;
  v_stealth_observado BOOLEAN;
  v_stealth_inicio TIMESTAMPTZ;
  v_stealth_fim TIMESTAMPTZ;
  v_stealth_duracao INTEGER;
  v_delta_segundos INTEGER;
BEGIN
  -- 1. Busca o acesso existente
  SELECT * INTO v_acesso
  FROM public.compartilhamentos_acessos
  WHERE id = p_acesso_id AND token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sessão de acesso não localizada.');
  END IF;

  -- 2. Busca compartilhamento
  SELECT * INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE id = v_acesso.compartilhamento_id
  LIMIT 1;

  -- 3. Busca veículo
  SELECT * INTO v_veiculo
  FROM public.veiculos
  WHERE id = v_acesso.veiculo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Veículo não localizado.');
  END IF;

  v_is_stealth := (v_share.stealth_ativo = TRUE);

  -- Se stealth ativo, mantém posição congelada
  IF v_is_stealth THEN
    v_lat := COALESCE(v_share.stealth_latitude, v_veiculo.ultima_latitude);
    v_lng := COALESCE(v_share.stealth_longitude, v_veiculo.ultima_longitude);
    v_vel := 0;
    v_ign := false;
  ELSE
    v_lat := v_veiculo.ultima_latitude;
    v_lng := v_veiculo.ultima_longitude;
    v_vel := COALESCE(v_veiculo.velocidade_atual, 0);
    v_ign := COALESCE(v_veiculo.ignicao_status, false);
  END IF;

  -- 4. Cálculo de tempo e período Stealth
  v_duracao := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_acesso.iniciado_em))::INTEGER);
  v_delta_segundos := GREATEST(1, EXTRACT(EPOCH FROM (now() - v_acesso.ultimo_ping_em))::INTEGER);

  v_stealth_observado := COALESCE(v_acesso.stealth_observado, false);
  v_stealth_inicio := v_acesso.stealth_inicio_em;
  v_stealth_fim := v_acesso.stealth_fim_em;
  v_stealth_duracao := COALESCE(v_acesso.stealth_duracao_segundos, 0);

  IF v_is_stealth THEN
    v_stealth_observado := TRUE;
    IF v_stealth_inicio IS NULL THEN
      v_stealth_inicio := now();
    END IF;
    v_stealth_fim := now();
    v_stealth_duracao := v_stealth_duracao + v_delta_segundos;
  END IF;

  v_trajeto := COALESCE(v_acesso.trajeto, '[]'::jsonb);
  v_novo_trajeto := v_trajeto;
  v_dist_km := COALESCE(v_acesso.distancia_percorrida_km, 0);
  v_vel_max := GREATEST(COALESCE(v_acesso.velocidade_maxima, 0), v_vel);

  -- 5. Adiciona novo ponto ao trajeto se houver deslocamento significativo
  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    IF jsonb_array_length(v_trajeto) > 0 THEN
      v_ultimo_ponto := v_trajeto->(jsonb_array_length(v_trajeto) - 1);
      v_ultimo_lat := (v_ultimo_ponto->>'lat')::DOUBLE PRECISION;
      v_ultimo_lng := (v_ultimo_ponto->>'lng')::DOUBLE PRECISION;

      -- Verifica se houve mudança significativa de posição (> 0.00008 grau ~ 8 metros) ou alteração de estado stealth
      IF ABS(v_lat - v_ultimo_lat) > 0.00008 OR ABS(v_lng - v_ultimo_lng) > 0.00008 THEN
        v_novo_trajeto := v_trajeto || jsonb_build_object(
          'lat', v_lat,
          'lng', v_lng,
          't', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'vel', v_vel,
          'ign', v_ign,
          'stealth', v_is_stealth
        );
        -- Estimativa haversine do trecho em km
        v_dist_km := v_dist_km + ROUND((111.0 * SQRT(POW(v_lat - v_ultimo_lat, 2) + POW((v_lng - v_ultimo_lng) * COS(RADIANS(v_lat)), 2)))::NUMERIC, 2);
      END IF;
    ELSE
      v_novo_trajeto := jsonb_build_array(
        jsonb_build_object(
          'lat', v_lat,
          'lng', v_lng,
          't', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'vel', v_vel,
          'ign', v_ign,
          'stealth', v_is_stealth
        )
      );
    END IF;
  END IF;

  -- 6. Atualiza sessão de acesso
  UPDATE public.compartilhamentos_acessos
  SET
    ultimo_ping_em = now(),
    duracao_segundos = v_duracao,
    fim_latitude = v_lat,
    fim_longitude = v_lng,
    fim_endereco = COALESCE(p_endereco_atual, fim_endereco),
    distancia_percorrida_km = v_dist_km,
    velocidade_maxima = v_vel_max,
    stealth_observado = v_stealth_observado,
    stealth_inicio_em = v_stealth_inicio,
    stealth_fim_em = v_stealth_fim,
    stealth_duracao_segundos = v_stealth_duracao,
    trajeto = v_novo_trajeto,
    updated_at = now()
  WHERE id = p_acesso_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'duracao_segundos', v_duracao,
    'pontos_trajeto', jsonb_array_length(v_novo_trajeto),
    'stealth_observado', v_stealth_observado,
    'stealth_duracao_segundos', v_stealth_duracao
  );
END;
$$;

-- 9. RPC Pública Segura para Finalizar Acesso ao Link
CREATE OR REPLACE FUNCTION public.finalizar_acesso_link_publico(
  p_acesso_id UUID,
  p_token TEXT,
  p_endereco_fim TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acesso RECORD;
  v_share RECORD;
  v_duracao INTEGER;
  v_stealth_fim TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_acesso
  FROM public.compartilhamentos_acessos
  WHERE id = p_acesso_id AND token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Sessão de acesso não localizada.');
  END IF;

  SELECT * INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE id = v_acesso.compartilhamento_id
  LIMIT 1;

  v_duracao := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_acesso.iniciado_em))::INTEGER);

  IF v_share.stealth_ativo = TRUE THEN
    v_stealth_fim := now();
  ELSE
    v_stealth_fim := v_acesso.stealth_fim_em;
  END IF;

  UPDATE public.compartilhamentos_acessos
  SET
    finalizado_em = now(),
    ultimo_ping_em = now(),
    duracao_segundos = v_duracao,
    fim_endereco = COALESCE(p_endereco_fim, fim_endereco),
    stealth_fim_em = COALESCE(v_stealth_fim, stealth_fim_em),
    updated_at = now()
  WHERE id = p_acesso_id;

  RETURN jsonb_build_object('sucesso', true, 'duracao_segundos', v_duracao);
END;
$$;

-- 10. Concessão de permissões GRANT
GRANT EXECUTE ON FUNCTION public.registrar_acesso_link_publico(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ping_acesso_link_publico(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_acesso_link_publico(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- 11. Realtime para a tabela de acessos
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.compartilhamentos_acessos;
EXCEPTION WHEN others THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
