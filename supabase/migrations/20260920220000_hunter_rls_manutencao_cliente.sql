-- ============================================================================
-- HUNTER — CORREÇÃO DE RLS: MANUTENÇÃO PREVENTIVA DO CLIENTE (FOR ALL)
-- ============================================================================
-- Permite que o cliente proprietário do veículo possa criar, editar e excluir
-- os itens de manutenção e revisões do seu próprio carro.
DROP POLICY IF EXISTS "Planos manutencao visiveis para o cliente do veiculo" ON public.planos_manutencao_preventiva;
DROP POLICY IF EXISTS "Planos manutencao gerenciados pelo cliente do veiculo" ON public.planos_manutencao_preventiva;

CREATE POLICY "Planos manutencao gerenciados pelo cliente do veiculo"
ON public.planos_manutencao_preventiva FOR ALL TO authenticated
USING (
  veiculo_id IN (
    SELECT v.id FROM public.veiculos v
    JOIN public.clientes c ON v.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
)
WITH CHECK (
  veiculo_id IN (
    SELECT v.id FROM public.veiculos v
    JOIN public.clientes c ON v.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Agendamentos clientes visualizam e criam" ON public.agendamentos_manutencao;
DROP POLICY IF EXISTS "Clientes visualizam e criam seus agendamentos" ON public.agendamentos_manutencao;
CREATE POLICY "Clientes visualizam e gerenciam seus agendamentos"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
)
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
