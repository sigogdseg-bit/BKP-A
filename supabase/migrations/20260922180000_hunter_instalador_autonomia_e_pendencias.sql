-- ============================================================================
-- HUNTER — AUTONOMIA DO INSTALADOR E SINCRONIZAÇÃO DE PENDÊNCIAS (DJR-NEW)
-- ============================================================================
-- 1. Permite ao instalador gerenciar sua própria chave PIX e endereço de oficina.
-- 2. Reforça a integridade da RPC de geração de pendências para instaladores.
-- ============================================================================

-- 1. RPC para o instalador atualizar seus próprios dados de repasse e endereço
CREATE OR REPLACE FUNCTION public.instalador_atualizar_proprios_dados(
  p_chave_pix TEXT,
  p_endereco_instalacao TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;

  -- Apenas instalador, administrador ou operador podem invocar
  IF v_role NOT IN ('instalador', 'superadmin', 'operador') THEN
    RAISE EXCEPTION 'Acesso não autorizado para alteração de dados de instalador.';
  END IF;

  UPDATE public.profiles
  SET
    chave_pix = NULLIF(TRIM(p_chave_pix), ''),
    endereco_instalacao = NULLIF(TRIM(p_endereco_instalacao), ''),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Dados de atendimento e chave PIX atualizados com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_atualizar_proprios_dados(TEXT, TEXT) TO authenticated;

-- 2. Reforço de RLS para o próprio instalador atualizar sua chave PIX e endereço
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'Instaladores atualizam seus proprios dados de contato'
  ) THEN
    CREATE POLICY "Instaladores atualizam seus proprios dados de contato"
    ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
  END IF;
END;
$$;

-- 3. Notificar PostgREST para recarga de schema cache
NOTIFY pgrst, 'reload schema';
