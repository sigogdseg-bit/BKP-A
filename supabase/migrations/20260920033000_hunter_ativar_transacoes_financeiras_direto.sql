-- ============================================================================
-- HUNTER — ATIVAÇÃO DIRETA: TABELA TRANSAÇÕES FINANCEIRAS (LIVRO-CAIXA)
-- ============================================================================
-- Versão Alvo: 1.5.5.7
-- Execute este script no SQL Editor do Supabase para criar e ativar a tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'entrada', 'saida')),
  categoria TEXT NOT NULL DEFAULT 'outros',
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor > 0),
  data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'concluido', 'cancelado', 'estornado')),
  mensalidade_id UUID,
  instalacao_id UUID,
  cliente_id UUID,
  instalador_id UUID,
  comprovante_url TEXT,
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_transacoes_data_competencia ON public.transacoes_financeiras(data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo_status ON public.transacoes_financeiras(tipo, status);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria ON public.transacoes_financeiras(categoria);

-- Habilitar RLS
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;

-- Política de Acesso para Usuários Autenticados
DROP POLICY IF EXISTS "Acesso total a transacoes financeiras para autenticados" ON public.transacoes_financeiras;
CREATE POLICY "Acesso total a transacoes financeiras para autenticados"
ON public.transacoes_financeiras FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Concessão de Privilégios
GRANT ALL ON public.transacoes_financeiras TO authenticated;
GRANT ALL ON public.transacoes_financeiras TO service_role;

-- Recarregar Imediatamente o Schema Cache do PostgREST
NOTIFY pgrst, 'reload schema';
