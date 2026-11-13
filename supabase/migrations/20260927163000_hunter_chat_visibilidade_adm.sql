-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Visibilidade de Administradores no Chat para Clientes (v1.10.0.4)
-- Permite que administradores ativem ou desativem sua visibilidade no chat dos clientes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS visivel_no_chat BOOLEAN NOT NULL DEFAULT false;

-- RPC para alternar ou salvar a visibilidade do próprio administrador
CREATE OR REPLACE FUNCTION public.alterar_visibilidade_chat(p_visivel BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET visivel_no_chat = p_visivel,
      updated_at = now()
  WHERE id = auth.uid();

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alterar_visibilidade_chat(BOOLEAN) TO authenticated;
