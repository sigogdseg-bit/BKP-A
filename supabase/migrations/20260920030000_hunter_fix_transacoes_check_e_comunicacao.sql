-- ============================================================================
-- HUNTER — CORREÇÃO: TRANSAÇÕES FINANCEIRAS (CHECK CONSTRAINTS) E COMUNICAÇÃO
-- ============================================================================
-- Versão Alvo: 1.5.5.6
-- 1. Harmoniza constraints de tipo e status em public.transacoes_financeiras
-- 2. Permite termos canônicos e sinônimos (receita/despesa e entrada/saida)
-- 3. Permite status (pendente/pago/concluido/cancelado/estornado)
-- 4. Notifica PostgREST para recarregar o schema cache
-- ============================================================================

-- 1. GARANTE A TABELA public.transacoes_financeiras
CREATE TABLE IF NOT EXISTS public.transacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor > 0),
  data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente',
  mensalidade_id UUID REFERENCES public.mensalidades(id) ON DELETE SET NULL,
  instalacao_id UUID REFERENCES public.instalacoes(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  instalador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  comprovante_url TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AJUSTAR CHECK CONSTRAINTS PARA ACEITAR ENTRADA/SAIDA E RECEITA/DESPESA
DO $$
BEGIN
  -- Remover constraint antiga de tipo, se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'transacoes_financeiras_tipo_check' 
      AND table_name = 'transacoes_financeiras'
  ) THEN
    ALTER TABLE public.transacoes_financeiras DROP CONSTRAINT transacoes_financeiras_tipo_check;
  END IF;

  -- Adicionar nova constraint flexível e canônica
  ALTER TABLE public.transacoes_financeiras 
    ADD CONSTRAINT transacoes_financeiras_tipo_check 
    CHECK (tipo IN ('receita', 'despesa', 'entrada', 'saida'));

  -- Remover constraint antiga de status, se existir
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'transacoes_financeiras_status_check' 
      AND table_name = 'transacoes_financeiras'
  ) THEN
    ALTER TABLE public.transacoes_financeiras DROP CONSTRAINT transacoes_financeiras_status_check;
  END IF;

  -- Adicionar nova constraint flexível para status
  ALTER TABLE public.transacoes_financeiras 
    ADD CONSTRAINT transacoes_financeiras_status_check 
    CHECK (status IN ('pendente', 'pago', 'concluido', 'cancelado', 'estornado'));
END $$;

-- 3. GARANTIR VALORES DEFAULT SE data_vencimento ESTIVER NULO
ALTER TABLE public.transacoes_financeiras 
  ALTER COLUMN data_vencimento SET DEFAULT CURRENT_DATE;

-- 4. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_transacoes_data_competencia ON public.transacoes_financeiras(data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo_status ON public.transacoes_financeiras(tipo, status);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria ON public.transacoes_financeiras(categoria);
CREATE INDEX IF NOT EXISTS idx_transacoes_cliente ON public.transacoes_financeiras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_instalador ON public.transacoes_financeiras(instalador_id);

-- 5. HABILITAR RLS E POLÍTICAS DE ACESSO ADMINISTRATIVO
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam transacoes financeiras" ON public.transacoes_financeiras;
CREATE POLICY "Admins gerenciam transacoes financeiras"
ON public.transacoes_financeiras FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

-- Concede privilégios para autenticados
GRANT ALL ON public.transacoes_financeiras TO authenticated;
GRANT ALL ON public.transacoes_financeiras TO service_role;

-- 6. RECARREGAR O SCHEMA CACHE DO POSTGREST IMEDIATAMENTE
NOTIFY pgrst, 'reload schema';
