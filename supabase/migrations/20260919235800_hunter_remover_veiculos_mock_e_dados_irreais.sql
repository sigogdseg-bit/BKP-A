-- ============================================================================
-- HUNTER — CORREÇÃO: TRANSAÇÕES FINANCEIRAS, RELOAD SCHEMA E EXPURGO DE MOCKS
-- ============================================================================
-- Versão Alvo: 1.5.5.5
-- 1. Garante tabela public.transacoes_financeiras e RLS
-- 2. Recarrega o schema cache do PostgREST
-- 3. Desativa e remove veículos e telemetria fictícia (Frota Hunter Operacional)
-- ============================================================================

-- 1. GARANTIR TABELA TRANSAÇÕES FINANCEIRAS
CREATE TABLE IF NOT EXISTS public.transacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor > 0),
  data_competencia DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado', 'estornado')),
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

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_transacoes_data_competencia ON public.transacoes_financeiras(data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo_status ON public.transacoes_financeiras(tipo, status);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria ON public.transacoes_financeiras(categoria);
CREATE INDEX IF NOT EXISTS idx_transacoes_cliente ON public.transacoes_financeiras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_instalador ON public.transacoes_financeiras(instalador_id);

-- Habilitar RLS
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam transacoes financeiras" ON public.transacoes_financeiras;
CREATE POLICY "Admins gerenciam transacoes financeiras"
ON public.transacoes_financeiras FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

-- Sincronizar mensalidades já existentes no livro-razão caso a tabela esteja vazia
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.transacoes_financeiras LIMIT 1) THEN
    -- Inserir receitas de mensalidades pagas
    INSERT INTO public.transacoes_financeiras (
      tipo, categoria, descricao, valor, data_competencia, data_vencimento, data_pagamento, status, mensalidade_id, cliente_id, created_at
    )
    SELECT
      'receita',
      'mensalidade_rastreamento',
      format('Mensalidade Ref. %s/%s - %s', m.mes_referencia, m.ano_referencia, c.nome_razao_social),
      m.valor,
      make_date(m.ano_referencia, m.mes_referencia, 1),
      m.data_vencimento,
      m.data_pagamento,
      CASE WHEN m.status = 'paga' THEN 'pago' ELSE 'pendente' END,
      m.id,
      m.cliente_id,
      m.created_at
    FROM public.mensalidades m
    INNER JOIN public.clientes c ON m.cliente_id = c.id
    ON CONFLICT DO NOTHING;

    -- Inserir despesas de repasse de instalação aos técnicos parceiros
    INSERT INTO public.transacoes_financeiras (
      tipo, categoria, descricao, valor, data_competencia, data_vencimento, data_pagamento, status, instalacao_id, cliente_id, instalador_id, created_at
    )
    SELECT
      'despesa',
      'repasse_instalacao',
      format('Repasse de Instalação/Atendimento - OS #%s', substring(i.id::text, 1, 8)),
      i.valor_repasse,
      COALESCE(i.data_instalacao::date, CURRENT_DATE),
      COALESCE(i.data_instalacao::date, CURRENT_DATE),
      i.data_pagamento_repasse,
      CASE WHEN i.status_pagamento = 'pago' THEN 'pago' ELSE 'pendente' END,
      i.id,
      i.cliente_id,
      i.instalador_id,
      i.created_at
    FROM public.instalacoes i
    WHERE i.valor_repasse > 0
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 2. EXPURGO E DESATIVAÇÃO DE VEÍCULOS E DADOS FICTÍCIOS
-- Remove os veículos de demonstração 'HTR4G16', 'HUN1T26' e quaisquer veículos fictícios de teste
DO $$
DECLARE
  v_fake_ids UUID[];
BEGIN
  -- Identifica IDs dos veículos fictícios da 'Frota Hunter' ou placas de teste
  SELECT ARRAY_AGG(id) INTO v_fake_ids
  FROM public.veiculos
  WHERE placa IN ('HTR4G16', 'HUN1T26')
     OR marca_modelo ILIKE '%Frota Hunter%'
     OR marca_modelo ILIKE '%Simula%';

  IF v_fake_ids IS NOT NULL AND array_length(v_fake_ids, 1) > 0 THEN
    -- Remove posições de telemetria simuladas
    DELETE FROM public.telemetria_posicoes WHERE veiculo_id = ANY(v_fake_ids);
    -- Remove viagens simuladas
    DELETE FROM public.viagens_trajetos WHERE veiculo_id = ANY(v_fake_ids);
    -- Remove alertas simulados
    DELETE FROM public.alertas_seguranca WHERE veiculo_id = ANY(v_fake_ids);
    -- Remove itens de manutenção simulados
    DELETE FROM public.itens_manutencao_preventiva WHERE veiculo_id = ANY(v_fake_ids);
    -- Desativa ou remove o veículo
    DELETE FROM public.veiculos WHERE id = ANY(v_fake_ids);
  END IF;

  -- Remove clientes de demonstração chamados "Frota Hunter Operacional" se existirem
  DELETE FROM public.clientes WHERE nome_razao_social ILIKE '%Frota Hunter%';
END $$;

-- 3. NOTIFICAR O POSTGREST PARA RECARREGAR O SCHEMA CACHE IMEDIATAMENTE
NOTIFY pgrst, 'reload schema';
