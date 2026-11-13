-- ==============================================================================
-- HUNTER — Módulo Comercial: Revendedores e Vendedores
-- Hierarquia, Split de Comissões, Convites e Esteira de Onboarding do Cliente
-- Migration: 20261027210000_hunter_modulo_revendedores_vendedores.sql
-- ==============================================================================

-- 1. Tabela de Revendedores
CREATE TABLE IF NOT EXISTS public.revendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  valor_base_sistema NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  chave_pix TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Tabela de Vendedores (Subordinados a um Revendedor)
CREATE TABLE IF NOT EXISTS public.vendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedor_id UUID NOT NULL REFERENCES public.revendedores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  valor_base_vendedor NUMERIC(10,2) NOT NULL DEFAULT 40.00,
  chave_pix TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Atualização da Tabela de Clientes com vínculos e comissões
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS etapa_onboarding INTEGER NOT NULL DEFAULT 6;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS repasse_instalador_status TEXT NOT NULL DEFAULT 'isento';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS valor_repasse_instalador NUMERIC(10,2) DEFAULT 0;

-- 4. Extensão da Tabela de Convites para Suportar Toda a Rede Comercial
CREATE TABLE IF NOT EXISTS public.convites_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tipo_convite TEXT NOT NULL DEFAULT 'cliente',
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
  valor_mensalidade_proposta NUMERIC(10,2),
  taxa_instalacao_proposta NUMERIC(10,2),
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  usado_em TIMESTAMPTZ,
  usado_por_cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days'),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS tipo_convite TEXT NOT NULL DEFAULT 'cliente';
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS valor_mensalidade_proposta NUMERIC(10,2);
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS taxa_instalacao_proposta NUMERIC(10,2);

-- 5. Tabela de Acompanhamento da Esteira de Onboarding (6 Etapas Transparentes)
CREATE TABLE IF NOT EXISTS public.onboarding_etapas_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  etapa_atual INTEGER NOT NULL DEFAULT 1,
  taxa_paga BOOLEAN NOT NULL DEFAULT FALSE,
  taxa_paga_em TIMESTAMPTZ,
  instalador_atribuido_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  instalacao_concluida BOOLEAN NOT NULL DEFAULT FALSE,
  instalacao_concluida_em TIMESTAMPTZ,
  contrato_assinado BOOLEAN NOT NULL DEFAULT FALSE,
  contrato_assinado_em TIMESTAMPTZ,
  ativacao_operador_concluida BOOLEAN NOT NULL DEFAULT FALSE,
  ativado_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ativado_em TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Índices B-Tree Compostos para Alta Performance
CREATE INDEX IF NOT EXISTS idx_revendedores_user_id ON public.revendedores(user_id);
CREATE INDEX IF NOT EXISTS idx_revendedores_ativo ON public.revendedores(ativo);
CREATE INDEX IF NOT EXISTS idx_vendedores_revendedor_id ON public.vendedores(revendedor_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_user_id ON public.vendedores(user_id);
CREATE INDEX IF NOT EXISTS idx_vendedores_ativo ON public.vendedores(ativo);
CREATE INDEX IF NOT EXISTS idx_clientes_revendedor_vendedor ON public.clientes(revendedor_id, vendedor_id);
CREATE INDEX IF NOT EXISTS idx_convites_token_tipo ON public.convites_cliente(token, tipo_convite);
CREATE INDEX IF NOT EXISTS idx_onboarding_etapas_cliente_id ON public.onboarding_etapas_cliente(cliente_id);

-- 7. Configuração de RLS (Row Level Security) Estrito
ALTER TABLE public.revendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_etapas_cliente ENABLE ROW LEVEL SECURITY;

-- Políticas para revendedores
DROP POLICY IF EXISTS "Superadmin e Adm gerenciam revendedores" ON public.revendedores;
CREATE POLICY "Superadmin e Adm gerenciam revendedores"
  ON public.revendedores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

DROP POLICY IF EXISTS "Revendedor visualiza seu proprio cadastro" ON public.revendedores;
CREATE POLICY "Revendedor visualiza seu proprio cadastro"
  ON public.revendedores
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Políticas para vendedores
DROP POLICY IF EXISTS "Superadmin e Adm gerenciam todos os vendedores" ON public.vendedores;
CREATE POLICY "Superadmin e Adm gerenciam todos os vendedores"
  ON public.vendedores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

DROP POLICY IF EXISTS "Revendedor gerencia seus vendedores" ON public.vendedores;
CREATE POLICY "Revendedor gerencia seus vendedores"
  ON public.vendedores
  FOR ALL
  TO authenticated
  USING (
    revendedor_id IN (
      SELECT r.id FROM public.revendedores r WHERE r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    revendedor_id IN (
      SELECT r.id FROM public.revendedores r WHERE r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendedor visualiza seu proprio cadastro" ON public.vendedores;
CREATE POLICY "Vendedor visualiza seu proprio cadastro"
  ON public.vendedores
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Políticas para onboarding_etapas_cliente
DROP POLICY IF EXISTS "Acesso pleno as etapas por admins e operadores" ON public.onboarding_etapas_cliente;
CREATE POLICY "Acesso pleno as etapas por admins e operadores"
  ON public.onboarding_etapas_cliente
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('superadmin', 'adm', 'operador') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  );

DROP POLICY IF EXISTS "Cliente visualiza suas proprias etapas" ON public.onboarding_etapas_cliente;
CREATE POLICY "Cliente visualiza suas proprias etapas"
  ON public.onboarding_etapas_cliente
  FOR SELECT
  TO authenticated
  USING (
    cliente_id IN (
      SELECT c.id FROM public.clientes c WHERE c.user_id = auth.uid()
    )
  );

-- Políticas em convites para revendedores e vendedores gerenciarem seus links
DROP POLICY IF EXISTS "Revendedores e vendedores gerenciam seus proprios convites" ON public.convites_cliente;
CREATE POLICY "Revendedores e vendedores gerenciam seus proprios convites"
  ON public.convites_cliente
  FOR ALL
  TO authenticated
  USING (
    criado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  )
  WITH CHECK (
    criado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  );

-- 8. Permissões Explícitas da Data API (Supabase October 30 Compliance)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.revendedores TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendedores TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onboarding_etapas_cliente TO authenticated, service_role;

GRANT SELECT ON TABLE public.revendedores TO anon;
GRANT SELECT ON TABLE public.vendedores TO anon;
GRANT SELECT ON TABLE public.onboarding_etapas_cliente TO anon;

-- 9. Realtime Publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.revendedores;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vendedores;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_etapas_cliente;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.revendedores REPLICA IDENTITY FULL;
ALTER TABLE public.vendedores REPLICA IDENTITY FULL;
ALTER TABLE public.onboarding_etapas_cliente REPLICA IDENTITY FULL;

-- 10. Invalidação Atômica do Cache PostgREST
NOTIFY pgrst, 'reload schema';
