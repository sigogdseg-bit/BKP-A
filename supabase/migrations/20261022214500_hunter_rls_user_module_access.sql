-- =============================================================================
-- Hunter — Políticas RLS para user_module_access e Invalidação de Schema
-- Data: 22/10/2026
-- Objetivo: Permitir que usuários autenticados (inclusive funcionários e operadores)
--           leiam seus próprios módulos atribuídos em user_module_access.
-- =============================================================================

-- 1. Habilitar RLS em user_module_access (caso não esteja)
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- 2. Conceder permissões na Data API (Supabase October 30 Compliance)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_module_access TO authenticated, service_role;

-- 3. Remover policies anteriores se existirem
DROP POLICY IF EXISTS "user_module_access_select" ON public.user_module_access;
DROP POLICY IF EXISTS "user_module_access_admin_all" ON public.user_module_access;

-- 4. Criar política de SELECT: o próprio usuário lê seus módulos, e Admins/SuperADMs lêem todos
CREATE POLICY "user_module_access_select"
ON public.user_module_access
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm')
  )
);

-- 5. Criar política de modificação exclusiva para Admins/SuperADMs
CREATE POLICY "user_module_access_admin_all"
ON public.user_module_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm')
  )
);

-- 6. Invalidação de cache do PostgREST
NOTIFY pgrst, 'reload schema';
