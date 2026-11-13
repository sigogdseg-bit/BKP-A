-- ============================================================================
-- HUNTER — DESPESAS RECORRENTES, PARCELADAS E EM DÓLAR (USD) COM CONVERSÃO
-- ============================================================================
-- Versão Alvo: 1.5.8.0
-- Permite lançar despesas avulsas, parceladas a prazo (ex: 6x, 10x) ou recorrentes
-- mensais contínuas (sem prazo pré-definido) e despesas em Dólar (USD).
-- ============================================================================

DO $$
BEGIN
  -- 1. Coluna de identificação da recorrência / lote parcelado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'recorrencia_id'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN recorrencia_id TEXT;
  END IF;

  -- 2. Coluna de modalidade do lançamento (avulsa, parcelada, recorrente)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'modalidade'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN modalidade TEXT DEFAULT 'avulsa';
  END IF;

  -- 3. Coluna de parcela atual e total de parcelas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'parcela_atual'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN parcela_atual INT DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'total_parcelas'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN total_parcelas INT DEFAULT 1;
  END IF;

  -- 4. Status de vigência da recorrência contínua
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'recorrencia_ativa'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN recorrencia_ativa BOOLEAN DEFAULT TRUE;
  END IF;

  -- 5. Colunas de moeda estrangeira (Dólar USD) e taxa de câmbio aplicada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'moeda'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN moeda TEXT DEFAULT 'BRL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'valor_moeda_original'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN valor_moeda_original NUMERIC(10, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'transacoes_financeiras' AND column_name = 'cotacao_moeda'
  ) THEN
    ALTER TABLE public.transacoes_financeiras ADD COLUMN cotacao_moeda NUMERIC(10, 4) DEFAULT 1.0;
  END IF;
END $$;

-- Índices de Performance para o Planejamento Financeiro
CREATE INDEX IF NOT EXISTS idx_transacoes_recorrencia_id ON public.transacoes_financeiras(recorrencia_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_modalidade ON public.transacoes_financeiras(modalidade);
CREATE INDEX IF NOT EXISTS idx_transacoes_moeda ON public.transacoes_financeiras(moeda);
