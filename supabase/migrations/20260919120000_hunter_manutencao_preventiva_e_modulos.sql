-- ============================================================================
-- HUNTER — MANUTENÇÃO PREVENTIVA, ODÔMETRO DE ATIVAÇÃO E AGENDAMENTOS PELO APP
-- ============================================================================
-- Diretrizes: DJR-NEW & DJR-APP
-- Versão: 1.3.0.0
-- ============================================================================

-- 1. Colunas de Odômetro Inicial e Data de Ativação em veiculos
DO $$ BEGIN
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS km_inicial INT NOT NULL DEFAULT 0;
  ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS data_ativacao TIMESTAMPTZ DEFAULT NOW();
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 2. Tabela de Planos de Manutenção Preventiva por Veículo
CREATE TABLE IF NOT EXISTS public.planos_manutencao_preventiva (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  item_manutencao TEXT NOT NULL, -- 'Troca de Óleo e Filtro', 'Pastilhas de Freio', 'Pneus e Balanceamento', 'Revisão Geral', 'Correia Dentada'
  intervalo_km INT NOT NULL, -- Ex: 5000, 10000
  intervalo_meses INT DEFAULT 6,
  ultimo_km_realizado INT NOT NULL DEFAULT 0,
  ultima_data_realizada DATE DEFAULT CURRENT_DATE,
  proximo_km_alvo INT NOT NULL,
  proxima_data_alvo DATE,
  aviso_antecipado_km INT NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'em_dia', -- 'em_dia', 'proxima', 'vencida'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manutencao_veiculo ON public.planos_manutencao_preventiva(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_manutencao_status ON public.planos_manutencao_preventiva(status);

-- 3. Tabela de Agendamentos de Manutenção pelo Aplicativo
CREATE TABLE IF NOT EXISTS public.agendamentos_manutencao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  item_manutencao TEXT NOT NULL,
  data_sugerida DATE NOT NULL,
  turno TEXT NOT NULL DEFAULT 'manha', -- 'manha', 'tarde'
  oficina_parceira TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'solicitado', -- 'solicitado', 'confirmado', 'concluido', 'cancelado'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON public.agendamentos_manutencao(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_veiculo ON public.agendamentos_manutencao(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos_manutencao(status);

-- 4. Habilitação de RLS em ambas as tabelas
ALTER TABLE public.planos_manutencao_preventiva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos_manutencao ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de RLS em planos_manutencao_preventiva
DROP POLICY IF EXISTS "Planos manutencao visiveis para administradores e operadores" ON public.planos_manutencao_preventiva;
CREATE POLICY "Planos manutencao visiveis para administradores e operadores"
ON public.planos_manutencao_preventiva FOR ALL TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

DROP POLICY IF EXISTS "Planos manutencao visiveis para o cliente do veiculo" ON public.planos_manutencao_preventiva;
CREATE POLICY "Planos manutencao visiveis para o cliente do veiculo"
ON public.planos_manutencao_preventiva FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT v.id FROM public.veiculos v
    JOIN public.clientes c ON v.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- 6. Políticas de RLS em agendamentos_manutencao
DROP POLICY IF EXISTS "Agendamentos gerenciados por administradores e operadores" ON public.agendamentos_manutencao;
CREATE POLICY "Agendamentos gerenciados por administradores e operadores"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador')
);

DROP POLICY IF EXISTS "Clientes visualizam e criam seus agendamentos" ON public.agendamentos_manutencao;
CREATE POLICY "Clientes visualizam e criam seus agendamentos"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
)
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- 7. Função de Inicialização dos Itens Padrão de Manutenção Preventiva do Veículo
CREATE OR REPLACE FUNCTION public.inicializar_itens_manutencao_veiculo(
  p_veiculo_id UUID,
  p_km_atual INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Troca de Óleo e Filtro (A cada 5.000 km ou 6 meses)
  INSERT INTO public.planos_manutencao_preventiva (
    veiculo_id, item_manutencao, intervalo_km, intervalo_meses,
    ultimo_km_realizado, ultima_data_realizada, proximo_km_alvo, proxima_data_alvo, status
  ) VALUES (
    p_veiculo_id, 'Troca de Óleo e Filtro', 5000, 6,
    p_km_atual, CURRENT_DATE, p_km_atual + 5000, CURRENT_DATE + INTERVAL '6 months', 'em_dia'
  );

  -- Pneus, Alinhamento e Balanceamento (A cada 10.000 km)
  INSERT INTO public.planos_manutencao_preventiva (
    veiculo_id, item_manutencao, intervalo_km, intervalo_meses,
    ultimo_km_realizado, ultima_data_realizada, proximo_km_alvo, proxima_data_alvo, status
  ) VALUES (
    p_veiculo_id, 'Pneus, Alinhamento e Balanceamento', 10000, 12,
    p_km_atual, CURRENT_DATE, p_km_atual + 10000, CURRENT_DATE + INTERVAL '12 months', 'em_dia'
  );

  -- Pastilhas de Freio e Fluidos (A cada 20.000 km)
  INSERT INTO public.planos_manutencao_preventiva (
    veiculo_id, item_manutencao, intervalo_km, intervalo_meses,
    ultimo_km_realizado, ultima_data_realizada, proximo_km_alvo, proxima_data_alvo, status
  ) VALUES (
    p_veiculo_id, 'Pastilhas de Freio e Fluidos', 20000, 12,
    p_km_atual, CURRENT_DATE, p_km_atual + 20000, CURRENT_DATE + INTERVAL '12 months', 'em_dia'
  );

  -- Revisão Geral e Correias (A cada 40.000 km)
  INSERT INTO public.planos_manutencao_preventiva (
    veiculo_id, item_manutencao, intervalo_km, intervalo_meses,
    ultimo_km_realizado, ultima_data_realizada, proximo_km_alvo, proxima_data_alvo, status
  ) VALUES (
    p_veiculo_id, 'Revisão Geral e Correias', 40000, 24,
    p_km_atual, CURRENT_DATE, p_km_atual + 40000, CURRENT_DATE + INTERVAL '24 months', 'em_dia'
  );
END;
$$;
