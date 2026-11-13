-- ============================================================================
-- MIGRAÇÃO HUNTER: PREFERÊNCIAS DO USUÁRIO MULTI-DISPOSITIVO (BD CANÔNICO)
-- Data: 21/10/2026
-- Objetivo: Salvar em banco de dados e sincronizar imediatamente entre todos
-- os dispositivos do cliente:
--   1. Ícone do mapa (Pin genérico vs Veículo 3D)
--   2. Identificação por placa no mapa (com_placa, sem_placa, auto)
--   3. Cores do painel / card theme (modo, cores primárias/secundárias)
--   4. Tema do mapa (streets, dark, satellite, etc.)
--   5. Tema da aplicação (light, dark, neumorphic)
-- ============================================================================

-- 1. Colunas canônicas em public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS icone_mapa_pin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS modo_placa_mapa TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS map_theme_preference TEXT NOT NULL DEFAULT 'streets';

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS card_theme_preference JSONB DEFAULT NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'light';

-- 2. RPC para Salvar Preferências Unificadas
CREATE OR REPLACE FUNCTION public.salvar_preferencias_usuario(
  p_preferencias JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não autenticado');
  END IF;

  UPDATE public.profiles
  SET
    icone_mapa_pin = COALESCE((p_preferencias->>'icone_mapa_pin')::BOOLEAN, icone_mapa_pin),
    modo_placa_mapa = COALESCE(p_preferencias->>'modo_placa_mapa', modo_placa_mapa),
    map_theme_preference = COALESCE(p_preferencias->>'map_theme_preference', map_theme_preference),
    card_theme_preference = CASE 
      WHEN p_preferencias ? 'card_theme_preference' THEN p_preferencias->'card_theme_preference'
      ELSE card_theme_preference
    END,
    theme_preference = COALESCE(p_preferencias->>'theme_preference', theme_preference),
    updated_at = NOW()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'sucesso', true,
    'user_id', v_uid
  );
END;
$$;

-- Sobrecarga com 1 argumento para compatibilidade direta de chamadas
CREATE OR REPLACE FUNCTION public.salvar_preferencias_usuario(p_preferencias JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.salvar_preferencias_usuario(p_preferencias, auth.uid());
END;
$$;

-- 3. RPC para Obter Preferências Unificadas
CREATE OR REPLACE FUNCTION public.obter_preferencias_usuario(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_pref JSONB;
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não autenticado');
  END IF;

  SELECT jsonb_build_object(
    'sucesso', true,
    'icone_mapa_pin', COALESCE(icone_mapa_pin, false),
    'modo_placa_mapa', COALESCE(modo_placa_mapa, 'auto'),
    'map_theme_preference', COALESCE(map_theme_preference, 'streets'),
    'card_theme_preference', card_theme_preference,
    'theme_preference', COALESCE(theme_preference, 'light')
  )
  INTO v_pref
  FROM public.profiles
  WHERE id = v_uid;

  RETURN COALESCE(v_pref, jsonb_build_object(
    'sucesso', true,
    'icone_mapa_pin', false,
    'modo_placa_mapa', 'auto',
    'map_theme_preference', 'streets',
    'card_theme_preference', NULL,
    'theme_preference', 'light'
  ));
END;
$$;

-- 4. Função legada salvar_preferencia_card_theme preservada para retrocompatibilidade
CREATE OR REPLACE FUNCTION public.salvar_preferencia_card_theme(p_config JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.salvar_preferencias_usuario(jsonb_build_object('card_theme_preference', p_config));
END;
$$;

-- 5. Grants explícitos de permissão
GRANT EXECUTE ON FUNCTION public.salvar_preferencias_usuario(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_preferencias_usuario(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_preferencias_usuario(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_preferencias_usuario() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_preferencia_card_theme(JSONB) TO authenticated, service_role;

-- 6. Notificar recarga de schema PostgREST
NOTIFY pgrst, 'reload schema';
