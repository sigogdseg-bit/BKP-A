-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Correção Canônica do RPC de Compartilhamento Público e RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige incompatibilidade de tipos no COALESCE (timestamptz vs text)
-- e adiciona política de leitura segura por token para fallback do cliente anon
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante colunas de suporte ao Modo Stealth em compartilhamentos_temporarios
ALTER TABLE public.compartilhamentos_temporarios
ADD COLUMN IF NOT EXISTS stealth_ativo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stealth_latitude NUMERIC(10, 7),
ADD COLUMN IF NOT EXISTS stealth_longitude NUMERIC(10, 7),
ADD COLUMN IF NOT EXISTS stealth_rumo NUMERIC(5, 2);

-- 2. Permissão de SELECT para leitura de token ativo por visitantes anônimos
DROP POLICY IF EXISTS "Leitura pública de compartilhamento por token" ON public.compartilhamentos_temporarios;
CREATE POLICY "Leitura pública de compartilhamento por token"
ON public.compartilhamentos_temporarios FOR SELECT TO anon, authenticated
USING (
  token IS NOT NULL
  AND revogado = false
  AND (expira_em IS NULL OR expira_em > now())
);

-- 3. Função RPC Pública com SECURITY DEFINER e tipagem estrita
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
  -- Normaliza e busca o token
  SELECT id, veiculo_id, expira_em, revogado, stealth_ativo, stealth_latitude, stealth_longitude, stealth_rumo
  INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = TRIM(p_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não localizado.');
  END IF;

  IF v_share.revogado THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este compartilhamento foi revogado pelo proprietário.');
  END IF;

  IF v_share.expira_em IS NOT NULL AND v_share.expira_em < now() THEN
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

-- 4. Concessão de permissões
GRANT EXECUTE ON FUNCTION public.consultar_veiculo_por_token_publico(TEXT) TO anon, authenticated, service_role;
GRANT SELECT ON public.compartilhamentos_temporarios TO anon, authenticated;

-- 5. Notificação de recarga do cache PostgREST
NOTIFY pgrst, 'reload schema';
