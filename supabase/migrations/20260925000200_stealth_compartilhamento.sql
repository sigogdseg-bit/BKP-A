-- =============================================================================
-- GD RASTREAMENTO — MIGRATION: MODO STEALTH NO COMPARTILHAMENTO TEMPORÁRIO
-- =============================================================================

-- 1. Adiciona colunas do Modo Stealth em public.compartilhamentos_temporarios
ALTER TABLE public.compartilhamentos_temporarios
  ADD COLUMN IF NOT EXISTS stealth_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stealth_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS stealth_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS stealth_rumo NUMERIC;

-- 2. Cria RPC de alternância do Modo Stealth
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
BEGIN
  SELECT id, veiculo_id, revogado, expira_em
  INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não localizado.');
  END IF;

  IF v_share.revogado THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link foi revogado.');
  END IF;

  IF v_share.expira_em < now() THEN
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
      stealth_rumo = v_veiculo.rumo
    WHERE token = p_token;

    RETURN jsonb_build_object(
      'sucesso', true,
      'stealth_ativo', true,
      'mensagem', 'Modo Stealth ativado: posição congelada com sucesso.'
    );
  ELSE
    UPDATE public.compartilhamentos_temporarios
    SET stealth_ativo = FALSE
    WHERE token = p_token;

    RETURN jsonb_build_object(
      'sucesso', true,
      'stealth_ativo', false,
      'mensagem', 'Modo Stealth desativado: compartilhamento em tempo real restabelecido.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alternar_stealth_compartilhamento(TEXT, BOOLEAN) TO authenticated, anon, service_role;

-- 3. Atualiza a RPC pública de consulta com camuflagem total
CREATE OR REPLACE FUNCTION public.consultar_veiculo_por_token_publico(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_share RECORD;
  v_veiculo RECORD;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_rumo NUMERIC;
  v_vel NUMERIC;
  v_ign BOOLEAN;
  v_status TEXT;
  v_ult_atualizacao TEXT;
BEGIN
  SELECT id, veiculo_id, expira_em, revogado, stealth_ativo, stealth_latitude, stealth_longitude, stealth_rumo
  INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não encontrado.');
  END IF;

  IF v_share.revogado THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este compartilhamento foi revogado pelo proprietário.');
  END IF;

  IF v_share.expira_em < now() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link de compartilhamento expirou.');
  END IF;

  SELECT
    id, placa, marca_modelo, cor, ignicao_status, velocidade_atual,
    ultima_latitude, ultima_longitude, ultima_atualizacao, status_operacional,
    rumo
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = v_share.veiculo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Veículo não localizado.');
  END IF;

  IF v_share.stealth_ativo = TRUE THEN
    -- Posição congelada e camuflada (Modo Stealth)
    v_lat := COALESCE(v_share.stealth_latitude, v_veiculo.ultima_latitude);
    v_lng := COALESCE(v_share.stealth_longitude, v_veiculo.ultima_longitude);
    v_rumo := COALESCE(v_share.stealth_rumo, v_veiculo.rumo, 0);
    v_vel := 0;
    v_ign := FALSE;
    v_status := 'estacionado';
    -- Horário avança em tempo real simulando repouso contínuo
    v_ult_atualizacao := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  ELSE
    -- Posição em tempo real
    v_lat := v_veiculo.ultima_latitude;
    v_lng := v_veiculo.ultima_longitude;
    v_rumo := v_veiculo.rumo;
    v_vel := COALESCE(v_veiculo.velocidade_atual, 0);
    v_ign := COALESCE(v_veiculo.ignicao_status, FALSE);
    v_status := COALESCE(v_veiculo.status_operacional, 'estacionado');
    v_ult_atualizacao := COALESCE(v_veiculo.ultima_atualizacao, to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo', jsonb_build_object(
      'id', v_veiculo.id,
      'placa', v_veiculo.placa,
      'marca_modelo', v_veiculo.marca_modelo,
      'cor', v_veiculo.cor,
      'ignicao', v_ign,
      'velocidade', v_vel,
      'latitude', v_lat,
      'longitude', v_lng,
      'ultima_atualizacao', v_ult_atualizacao,
      'status_operacional', v_status,
      'rumo', v_rumo
    ),
    'expira_em', v_share.expira_em
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consultar_veiculo_por_token_publico(TEXT) TO anon, authenticated, service_role;

-- 4. Notifica PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
