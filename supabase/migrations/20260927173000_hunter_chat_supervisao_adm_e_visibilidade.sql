-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Visibilidade de Administradores e Supervisão de Conversas (v1.10.0.5)
-- Permite que clientes visualizem operadores e administradores visíveis
-- e que SuperADM e Administradores auditem todas as conversas realizadas.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Coluna de Visibilidade no Chat no Perfil do Usuário
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS visivel_no_chat BOOLEAN NOT NULL DEFAULT false;

-- 2. Atualização de RLS em public.profiles:
-- Permite que clientes autenticados leiam perfis de operadores e de administradores que ativaram visibilidade
DROP POLICY IF EXISTS "Clientes leem perfil do seu instalador" ON public.profiles;
DROP POLICY IF EXISTS "Clientes e operadores visualizam perfis autorizados" ON public.profiles;

CREATE POLICY "Clientes e operadores visualizam perfis autorizados"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  id = auth.uid() OR
  role = 'operador' OR
  role = 'instalador' OR
  (role IN ('superadmin', 'adm') AND visivel_no_chat = true) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'instalador'))
);

-- 3. Função RPC para alternar ou salvar a visibilidade do próprio administrador
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

-- 4. Notifica recarregamento de schema
NOTIFY pgrst, 'reload schema';
