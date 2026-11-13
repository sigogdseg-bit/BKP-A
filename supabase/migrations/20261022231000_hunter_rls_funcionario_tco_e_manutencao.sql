-- ==============================================================================
-- Hunter: Políticas RLS para Funcionário em Custos (TCO), Abastecimentos e Manutenção
-- Permite que o colaborador gerencie e visualize o TCO da frota do seu cliente titular
-- ==============================================================================

-- 1. Abastecimentos da frota do cliente
DROP POLICY IF EXISTS "Funcionarios gerenciam abastecimentos do seu cliente" ON public.motorista_abastecimentos;
CREATE POLICY "Funcionarios gerenciam abastecimentos do seu cliente"
ON public.motorista_abastecimentos FOR ALL TO authenticated
USING (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
)
WITH CHECK (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
);

-- 2. Despesas da frota do cliente
DROP POLICY IF EXISTS "Funcionarios gerenciam despesas do seu cliente" ON public.motorista_despesas;
CREATE POLICY "Funcionarios gerenciam despesas do seu cliente"
ON public.motorista_despesas FOR ALL TO authenticated
USING (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
)
WITH CHECK (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
);

-- 3. Planos e Itens de Manutenção Preventiva do cliente
DROP POLICY IF EXISTS "Funcionarios gerenciam manutencao dos veiculos do seu cliente" ON public.planos_manutencao_preventiva;
CREATE POLICY "Funcionarios gerenciam manutencao dos veiculos do seu cliente"
ON public.planos_manutencao_preventiva FOR ALL TO authenticated
USING (
  veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
)
WITH CHECK (
  veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
);

-- 4. Agendamentos de Manutenção do cliente
DROP POLICY IF EXISTS "Funcionarios gerenciam agendamentos do seu cliente" ON public.agendamentos_manutencao;
CREATE POLICY "Funcionarios gerenciam agendamentos do seu cliente"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
)
WITH CHECK (
  cliente_id = public.get_funcionario_cliente_id()
  OR veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = public.get_funcionario_cliente_id())
);

-- 5. Grants explícitos para Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.motorista_abastecimentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.motorista_despesas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.planos_manutencao_preventiva TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agendamentos_manutencao TO authenticated;

-- 6. Invalidação imediata do Schema Cache PostgREST
NOTIFY pgrst, 'reload schema';
