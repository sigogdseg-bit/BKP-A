-- =====================================================================
-- MIGRATION: 20260923000000_hunter_estoque_suprimentos_e_fornecedores.sql
-- Descrição: Criação das tabelas de Fornecedores, Itens de Estoque e
--            Movimentações com RLS, integração financeira e baixa técnica.
-- Regra Pétrea: NUNCA usar o caractere comercial proibido (uso estrito de "e").
-- =====================================================================

-- 1. TABELA DE FORNECEDORES
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT NOT NULL,
  cnpj_cpf TEXT,
  contato_nome TEXT,
  telefone TEXT,
  email TEXT,
  categoria TEXT NOT NULL DEFAULT 'geral', -- hardware, conectividade, consumiveis, geral
  chave_pix TEXT,
  dados_bancarios TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Fornecedores
DROP POLICY IF EXISTS "fornecedores_leitura_autenticados" ON public.fornecedores;
CREATE POLICY "fornecedores_leitura_autenticados" ON public.fornecedores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm', 'operador', 'instalador')
    )
  );

DROP POLICY IF EXISTS "fornecedores_mutacao_adm" ON public.fornecedores;
CREATE POLICY "fornecedores_mutacao_adm" ON public.fornecedores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm')
    )
  );

-- 2. TABELA DE ITENS DE ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoque_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_sku TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL, -- rastreador, chip, rele, fio_chicote, conector, insumo
  quantidade_atual NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantidade_minima NUMERIC(12,2) NOT NULL DEFAULT 5,
  unidade_medida TEXT NOT NULL DEFAULT 'unidade', -- unidade, metro, kit, pacote
  custo_medio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  localizacao TEXT DEFAULT 'Almoxarifado Principal',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estoque_itens_leitura_autenticados" ON public.estoque_itens;
CREATE POLICY "estoque_itens_leitura_autenticados" ON public.estoque_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm', 'operador', 'instalador')
    )
  );

DROP POLICY IF EXISTS "estoque_itens_mutacao_adm" ON public.estoque_itens;
CREATE POLICY "estoque_itens_mutacao_adm" ON public.estoque_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm')
    )
  );

-- 3. TABELA DE MOVIMENTAÇÕES DE ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.estoque_itens(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- entrada_compra, saida_instalacao, saida_manutencao, ajuste_inventario, devolucao
  quantidade NUMERIC(12,2) NOT NULL,
  custo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_anterior NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_posterior NUMERIC(12,2) NOT NULL DEFAULT 0,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  instalacao_id UUID REFERENCES public.instalacoes(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  instalador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  despesa_id UUID REFERENCES public.transacoes_financeiras(id) ON DELETE SET NULL,
  documento_fiscal TEXT,
  observacao TEXT,
  data_movimento TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estoque_movimentacoes_leitura_autenticados" ON public.estoque_movimentacoes;
CREATE POLICY "estoque_movimentacoes_leitura_autenticados" ON public.estoque_movimentacoes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm', 'operador', 'instalador')
    )
  );

DROP POLICY IF EXISTS "estoque_movimentacoes_insercao_equipe" ON public.estoque_movimentacoes;
CREATE POLICY "estoque_movimentacoes_insercao_equipe" ON public.estoque_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm', 'operador', 'instalador')
    )
  );

DROP POLICY IF EXISTS "estoque_movimentacoes_mutacao_adm" ON public.estoque_movimentacoes;
CREATE POLICY "estoque_movimentacoes_mutacao_adm" ON public.estoque_movimentacoes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('superadmin', 'adm')
    )
  );

-- 4. CADASTRO INICIAL: As tabelas iniciam limpas, sem dados ou saldos fictícios (HUNTER-GUARDIAN / DJR-NEW).
-- O usuário cadastra seus materiais, fornecedores e insumos reais diretamente na plataforma.

-- 5. HABILITAR REATIVIDADE REALTIME NO SUPABASE
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque_itens;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque_movimentacoes;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fornecedores;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
