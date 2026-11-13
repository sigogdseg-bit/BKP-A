-- ==============================================================================
-- HUNTER / SIGO GUARDIÃO — Propostas Comerciais via WhatsApp e Diálogo Interativo
-- Suporte a Revendedores, Vendedores, Base Mínima de Repasse e Notificação ao SuperADM
-- Migration: 20261102223000_hunter_propostas_whatsapp_dialogo_e_notificacao_adm.sql
-- ==============================================================================

-- 1. Tabela para Persistência de Sessões de Diálogo Conversacional no WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_sessoes_dialogo (
    telefone TEXT PRIMARY KEY,
    fluxo TEXT NOT NULL,
    etapa TEXT NOT NULL,
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativação de RLS e permissões de acesso
ALTER TABLE public.whatsapp_sessoes_dialogo ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.whatsapp_sessoes_dialogo TO authenticated;
GRANT ALL ON TABLE public.whatsapp_sessoes_dialogo TO service_role;
GRANT ALL ON TABLE public.whatsapp_sessoes_dialogo TO anon;

DROP POLICY IF EXISTS "Acesso total a whatsapp_sessoes_dialogo" ON public.whatsapp_sessoes_dialogo;
CREATE POLICY "Acesso total a whatsapp_sessoes_dialogo"
ON public.whatsapp_sessoes_dialogo
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Extensão da Tabela propostas_comerciais para Revendedores, Vendedores e Origem
ALTER TABLE public.propostas_comerciais
ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quantidade_veiculos INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS origem_emissao TEXT NOT NULL DEFAULT 'web',
ADD COLUMN IF NOT EXISTS valor_base_repasse NUMERIC(10,2) DEFAULT 0.00;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_revendedor ON public.propostas_comerciais(revendedor_id);
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_vendedor ON public.propostas_comerciais(vendedor_id);

NOTIFY pgrst, 'reload schema';
