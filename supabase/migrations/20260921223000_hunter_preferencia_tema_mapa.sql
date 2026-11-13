-- ============================================================================
-- HUNTER — PERSISTÊNCIA UNIVERSAL DO TEMA DE MAPA NO PERFIL (DJR-NEW)
-- ============================================================================
-- Define o padrão geral do sistema como Mapa Claro ('streets').
-- Persiste a preferência individual de mapa do usuário na nuvem (profiles),
-- garantindo que a escolha se mantenha entre logins, logouts e dispositivos.
-- ============================================================================

-- 1. Adiciona coluna map_theme_preference em public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS map_theme_preference TEXT NOT NULL DEFAULT 'streets';

-- 2. Atualiza registros existentes que estejam nulos ou vazios para 'streets'
UPDATE public.profiles
SET map_theme_preference = 'streets'
WHERE map_theme_preference IS NULL OR map_theme_preference = '';

-- 3. Cria função RPC segura para salvar a preferência de mapa do usuário logado
CREATE OR REPLACE FUNCTION public.salvar_preferencia_mapa(
  p_mapa TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_mapa IN ('streets', 'dark', 'satellite') THEN
      UPDATE public.profiles
      SET map_theme_preference = p_mapa,
          updated_at = now()
      WHERE id = auth.uid();
    END IF;
  END IF;
END;
$$;

-- Concede permissão de execução aos usuários autenticados
GRANT EXECUTE ON FUNCTION public.salvar_preferencia_mapa(TEXT) TO authenticated;
