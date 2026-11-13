-- ============================================================================
-- MIGRATION: Hunter - Atualização da RPC de Compartilhamento Público
-- Retorna tipo_veiculo e created_at para alimentar o ícone 3D e contador progressivo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consultar_veiculo_por_token_publico(p_token TEXT)
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
  v_rumo DOUBLE PRECISION;
  v_vel NUMERIC;
  v_ign BOOLEAN;
  v_status TEXT;
  v_ult_atualizacao TEXT;
BEGIN
  -- 1. Busca o compartilhamento ativo
  SELECT * INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não localizado.');
  END IF;

  -- 2. Verifica revogação ou expiração
  IF v_share.revogado = TRUE THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este compartilhamento foi revogado pelo proprietário.');
  END IF;

  IF v_share.expira_em IS NOT NULL AND v_share.expira_em < now() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link de compartilhamento expirou.');
  END IF;

  -- 3. Busca dados do veículo
  SELECT * INTO v_veiculo
  FROM public.veiculos
  WHERE id = v_share.veiculo_id
  LIMIT 1;

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
    v_ult_atualizacao := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  ELSE
    -- Posição em tempo real com conversão segura de timestamp para texto
    v_lat := v_veiculo.ultima_latitude;
    v_lng := v_veiculo.ultima_longitude;
    v_rumo := v_veiculo.rumo;
    v_vel := COALESCE(v_veiculo.velocidade_atual, 0);
    v_ign := COALESCE(v_veiculo.ignicao_status, FALSE);
    v_status := COALESCE(v_veiculo.status_operacional, 'estacionado');
    v_ult_atualizacao := to_char(COALESCE(v_veiculo.ultima_atualizacao, now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo', jsonb_build_object(
      'id', v_veiculo.id,
      'placa', v_veiculo.placa,
      'marca_modelo', v_veiculo.marca_modelo,
      'cor', v_veiculo.cor,
      'tipo_veiculo', COALESCE(v_veiculo.tipo_veiculo, 'carro'),
      'ignicao', v_ign,
      'velocidade', v_vel,
      'latitude', v_lat,
      'longitude', v_lng,
      'ultima_atualizacao', v_ult_atualizacao,
      'status_operacional', v_status,
      'rumo', v_rumo
    ),
    'expira_em', v_share.expira_em,
    'created_at', v_share.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consultar_veiculo_por_token_publico(TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
