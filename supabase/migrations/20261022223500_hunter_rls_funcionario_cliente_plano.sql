-- ==============================================================================
-- Hunter: RLS para Funcionários visualizarem os dados do seu Cliente Vinculado
-- Permite que funcionários herdem o plano contratado (Master, Pro, etc.) e dados do cliente titular
-- ==============================================================================

-- 1. Policy para Funcionários visualizarem o registro do cliente titular
DROP POLICY IF EXISTS "Funcionarios visualizam seu cliente vinculado" ON public.clientes;
CREATE POLICY "Funcionarios visualizam seu cliente vinculado"
ON public.clientes FOR SELECT TO authenticated
USING (id = public.get_funcionario_cliente_id());

-- 2. Grants explícitos para Data API
GRANT SELECT ON TABLE public.clientes TO authenticated;

-- 3. Invalidação imediata do Schema Cache PostgREST
NOTIFY pgrst, 'reload schema';
