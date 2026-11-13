-- Migração: hunter_card_theme_multi_device
-- Objetivo: Sincronização multi-dispositivo (Mac, iPhone, iPad, Android) de tema e cores dos cards

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS card_theme_preference JSONB DEFAULT NULL;

-- Função RPC para persistência segura da preferência de cores dos cards do usuário autenticado
CREATE OR REPLACE FUNCTION public.salvar_preferencia_card_theme(p_config JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Usuário não autenticado');
  END IF;

  UPDATE public.profiles
  SET card_theme_preference = p_config,
      updated_at = NOW()
  WHERE id = v_uid;

  RETURN jsonb_build_object('sucesso', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_preferencia_card_theme(JSONB) TO authenticated;
