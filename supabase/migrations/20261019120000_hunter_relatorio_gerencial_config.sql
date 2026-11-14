-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — MÓDULO RELATÓRIO GERENCIAL CONFIGURÁVEL
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.relatorio_gerencial_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo BOOLEAN NOT NULL DEFAULT true,
  horario_envio TEXT NOT NULL DEFAULT '10:00',
  enviar_whatsapp BOOLEAN NOT NULL DEFAULT true,
  enviar_push BOOLEAN NOT NULL DEFAULT true,
  telefones JSONB NOT NULL DEFAULT '[{"nome": "SuperADM", "telefone": "5524992494030", "padrao": true}]'::jsonb,
  secoes_ativas JSONB NOT NULL DEFAULT '{
    "frota": true,
    "alertas": true,
    "financeiro": true,
    "infraestrutura": true,
    "chips": true,
    "gateways": true
  }'::jsonb,
  ultimo_envio_em TIMESTAMPTZ,
  ultimo_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilita RLS Estrito
ALTER TABLE public.relatorio_gerencial_config ENABLE ROW LEVEL SECURITY;

-- Grants explícitos de segurança
GRANT ALL ON TABLE public.relatorio_gerencial_config TO authenticated;
GRANT ALL ON TABLE public.relatorio_gerencial_config TO service_role;
GRANT SELECT ON TABLE public.relatorio_gerencial_config TO anon;

DROP POLICY IF EXISTS "Administradores gerenciam relatorio_gerencial_config" ON public.relatorio_gerencial_config;
CREATE POLICY "Administradores gerenciam relatorio_gerencial_config"
  ON public.relatorio_gerencial_config FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'email') IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (
        role::text IN ('superadmin', 'adm', 'admin', 'administrador')
        OR email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
      )
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (
        role::text IN ('superadmin', 'adm', 'admin', 'administrador')
        OR email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
      )
    )
  );

-- Permissão de leitura para authenticated (permite carregar defaults em interfaces autorizadas)
DROP POLICY IF EXISTS "Leitura de relatorio_gerencial_config para autenticados" ON public.relatorio_gerencial_config;
CREATE POLICY "Leitura de relatorio_gerencial_config para autenticados"
  ON public.relatorio_gerencial_config FOR SELECT TO authenticated
  USING (true);

-- Inserção de semente se tabela estiver vazia
INSERT INTO public.relatorio_gerencial_config (
  ativo,
  horario_envio,
  enviar_whatsapp,
  enviar_push,
  telefones,
  secoes_ativas
)
SELECT
  true,
  '10:00',
  true,
  true,
  '[{"nome": "SuperADM", "telefone": "5524992494030", "padrao": true}]'::jsonb,
  '{"frota": true, "alertas": true, "financeiro": true, "infraestrutura": true, "chips": true, "gateways": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.relatorio_gerencial_config);

NOTIFY pgrst, 'reload schema';
