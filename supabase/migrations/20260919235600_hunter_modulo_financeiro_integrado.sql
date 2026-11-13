-- Migration: 20260919235600_hunter_modulo_financeiro_integrado.sql
-- Objetivo: Criacao do Ledger de Transacoes Financeiras, Triggers de Sincronizacao de Mensalidades e Instalacoes

-- 1. ENUMS FINANCEIROS
DO $$ BEGIN
  CREATE TYPE public.tipo_transacao_financeira AS ENUM ('entrada', 'saida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_transacao_financeira AS ENUM ('pendente', 'concluido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.categoria_transacao_financeira AS ENUM (
    'mensalidade',
    'repasse_instalador',
    'chips_conectividade',
    'infraestrutura_servidores',
    'aquisicao_equipamentos',
    'material_consumo',
    'despesa_administrativa',
    'receita_avulsa',
    'outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. TABELA DE TRANSACOES FINANCEIRAS (LIVRO-RAZAO / LEDGER)
CREATE TABLE IF NOT EXISTS public.transacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_transacao_financeira NOT NULL,
  categoria public.categoria_transacao_financeira NOT NULL DEFAULT 'outros',
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor > 0),
  data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE,
  data_pagamento TIMESTAMPTZ,
  status public.status_transacao_financeira NOT NULL DEFAULT 'pendente',
  mensalidade_id UUID REFERENCES public.mensalidades(id) ON DELETE CASCADE,
  instalacao_id UUID REFERENCES public.instalacoes(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  instalador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  comprovante_url TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_transacao_mensalidade UNIQUE (mensalidade_id),
  CONSTRAINT uq_transacao_instalacao UNIQUE (instalacao_id)
);

-- Indices para performance de filtros por data, tipo e status
CREATE INDEX IF NOT EXISTS idx_transacoes_data_competencia ON public.transacoes_financeiras(data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo_status ON public.transacoes_financeiras(tipo, status);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria ON public.transacoes_financeiras(categoria);
CREATE INDEX IF NOT EXISTS idx_transacoes_cliente ON public.transacoes_financeiras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_instalador ON public.transacoes_financeiras(instalador_id);

-- 3. RLS ESTRITO: APENAS SUPERADMIN E ADM GERENCIAM TRANSACOES
ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam transacoes financeiras" ON public.transacoes_financeiras;
CREATE POLICY "Admins gerenciam transacoes financeiras"
ON public.transacoes_financeiras FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

-- 4. TRIGGER: SINCRONIZACAO ATOMICA DE MENSALIDADES -> TRANSACOES
CREATE OR REPLACE FUNCTION public.trg_sync_mensalidade_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_status_trans public.status_transacao_financeira;
  v_desc TEXT;
BEGIN
  -- Obter nome do cliente para enriquecer o extrato
  SELECT nome_razao_social INTO v_cliente_nome
  FROM public.clientes WHERE id = NEW.cliente_id;

  v_desc := 'Mensalidade ' || LPAD(NEW.mes_referencia::TEXT, 2, '0') || '/' || NEW.ano_referencia::TEXT ||
            ' - ' || COALESCE(v_cliente_nome, 'Cliente');

  IF NEW.status = 'pago' THEN
    v_status_trans := 'concluido';
  ELSE
    v_status_trans := 'pendente';
  END IF;

  INSERT INTO public.transacoes_financeiras (
    tipo,
    categoria,
    descricao,
    valor,
    data_competencia,
    data_vencimento,
    data_pagamento,
    status,
    mensalidade_id,
    cliente_id,
    comprovante_url,
    updated_at
  ) VALUES (
    'entrada',
    'mensalidade',
    v_desc,
    NEW.valor,
    make_date(NEW.ano_referencia, NEW.mes_referencia, 1),
    NEW.data_vencimento,
    NEW.data_pagamento,
    v_status_trans,
    NEW.id,
    NEW.cliente_id,
    NEW.comprovante_url,
    NOW()
  )
  ON CONFLICT (mensalidade_id) DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    data_vencimento = EXCLUDED.data_vencimento,
    data_pagamento = EXCLUDED.data_pagamento,
    status = EXCLUDED.status,
    comprovante_url = EXCLUDED.comprovante_url,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mensalidade_transacao ON public.mensalidades;
CREATE TRIGGER trg_sync_mensalidade_transacao
AFTER INSERT OR UPDATE ON public.mensalidades
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_mensalidade_transacao();

-- 5. TRIGGER: SINCRONIZACAO ATOMICA DE INSTALACOES (REPASSES) -> TRANSACOES
CREATE OR REPLACE FUNCTION public.trg_sync_instalacao_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_instalador_nome TEXT;
  v_cliente_nome TEXT;
  v_status_trans public.status_transacao_financeira;
  v_desc TEXT;
BEGIN
  -- Verificar se ha valor de repasse definido
  IF NEW.valor_repasse IS NULL OR NEW.valor_repasse <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_instalador_nome
  FROM public.profiles WHERE id = NEW.instalador_id;

  SELECT c.nome_razao_social INTO v_cliente_nome
  FROM public.veiculos v
  JOIN public.clientes c ON v.cliente_id = c.id
  WHERE v.id = NEW.veiculo_id;

  v_desc := 'Repasse Instalador (' || COALESCE(v_instalador_nome, 'Tecnico') || ') - Veiculo Cliente ' || COALESCE(v_cliente_nome, '');

  IF NEW.status_pagamento = 'pago' THEN
    v_status_trans := 'concluido';
  ELSE
    v_status_trans := 'pendente';
  END IF;

  INSERT INTO public.transacoes_financeiras (
    tipo,
    categoria,
    descricao,
    valor,
    data_competencia,
    data_vencimento,
    data_pagamento,
    status,
    instalacao_id,
    instalador_id,
    comprovante_url,
    updated_at
  ) VALUES (
    'saida',
    'repasse_instalador',
    v_desc,
    NEW.valor_repasse,
    COALESCE(NEW.data_instalacao::DATE, CURRENT_DATE),
    COALESCE(NEW.data_instalacao::DATE, CURRENT_DATE),
    NEW.data_pagamento_repasse,
    v_status_trans,
    NEW.id,
    NEW.instalador_id,
    NEW.comprovante_pagamento_url,
    NOW()
  )
  ON CONFLICT (instalacao_id) DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    data_pagamento = EXCLUDED.data_pagamento,
    status = EXCLUDED.status,
    comprovante_url = EXCLUDED.comprovante_url,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_instalacao_transacao ON public.instalacoes;
CREATE TRIGGER trg_sync_instalacao_transacao
AFTER INSERT OR UPDATE ON public.instalacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_instalacao_transacao();

-- 6. BACKFILL INICIAL PARA SINCRONIZAR MENSALIDADES E INSTALACOES EXISTENTES
DO $$
DECLARE
  v_m RECORD;
  v_inst RECORD;
  v_cliente_nome TEXT;
  v_instalador_nome TEXT;
BEGIN
  -- Backfill de mensalidades existentes
  FOR v_m IN SELECT * FROM public.mensalidades LOOP
    SELECT nome_razao_social INTO v_cliente_nome FROM public.clientes WHERE id = v_m.cliente_id;
    INSERT INTO public.transacoes_financeiras (
      tipo, categoria, descricao, valor, data_competencia, data_vencimento,
      data_pagamento, status, mensalidade_id, cliente_id, comprovante_url
    ) VALUES (
      'entrada',
      'mensalidade',
      'Mensalidade ' || LPAD(v_m.mes_referencia::TEXT, 2, '0') || '/' || v_m.ano_referencia::TEXT || ' - ' || COALESCE(v_cliente_nome, 'Cliente'),
      v_m.valor,
      make_date(v_m.ano_referencia, v_m.mes_referencia, 1),
      v_m.data_vencimento,
      v_m.data_pagamento,
      CASE WHEN v_m.status = 'pago' THEN 'concluido'::public.status_transacao_financeira ELSE 'pendente'::public.status_transacao_financeira END,
      v_m.id,
      v_m.cliente_id,
      v_m.comprovante_url
    ) ON CONFLICT (mensalidade_id) DO NOTHING;
  END LOOP;

  -- Backfill de instalacoes existentes
  FOR v_inst IN SELECT * FROM public.instalacoes WHERE valor_repasse > 0 LOOP
    SELECT nome INTO v_instalador_nome FROM public.profiles WHERE id = v_inst.instalador_id;
    INSERT INTO public.transacoes_financeiras (
      tipo, categoria, descricao, valor, data_competencia, data_vencimento,
      data_pagamento, status, instalacao_id, instalador_id, comprovante_url
    ) VALUES (
      'saida',
      'repasse_instalador',
      'Repasse Instalador (' || COALESCE(v_instalador_nome, 'Tecnico') || ')',
      v_inst.valor_repasse,
      COALESCE(v_inst.data_instalacao::DATE, CURRENT_DATE),
      COALESCE(v_inst.data_instalacao::DATE, CURRENT_DATE),
      v_inst.data_pagamento_repasse,
      CASE WHEN v_inst.status_pagamento = 'pago' THEN 'concluido'::public.status_transacao_financeira ELSE 'pendente'::public.status_transacao_financeira END,
      v_inst.id,
      v_inst.instalador_id,
      v_inst.comprovante_pagamento_url
    ) ON CONFLICT (instalacao_id) DO NOTHING;
  END LOOP;
END $$;

-- 7. ADICIONAR MODULO 'financeiro' AO CATALOGO DE PERMISSOES
DO $$
DECLARE
  v_admin RECORD;
BEGIN
  FOR v_admin IN
    SELECT id FROM public.profiles WHERE role IN ('superadmin', 'adm')
  LOOP
    INSERT INTO public.user_module_access (user_id, module, ativo)
    VALUES (v_admin.id, 'financeiro', TRUE)
    ON CONFLICT (user_id, module) DO UPDATE SET ativo = TRUE;
  END LOOP;
END $$;

COMMENT ON TABLE public.transacoes_financeiras IS 'Livro-Razao unificado com todas as movimentacoes de receitas, despesas, repasses e fluxo de caixa da plataforma Hunter.';
