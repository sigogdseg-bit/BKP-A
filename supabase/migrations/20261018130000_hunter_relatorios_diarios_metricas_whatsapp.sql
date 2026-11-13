-- 1. Adicionar dia_ciclo e consumo_mb na tabela chips com valores padrão
ALTER TABLE public.chips ADD COLUMN IF NOT EXISTS dia_ciclo INT DEFAULT 23;
ALTER TABLE public.chips ADD COLUMN IF NOT EXISTS consumo_mb NUMERIC(8, 2) DEFAULT 0.00;

-- Calibra o consumo real da linha ativa em monitoramento
UPDATE public.chips SET consumo_mb = 38.11 WHERE linha = '5516910198056';

-- 2. Tabela de controle e histórico de relatórios diários enviados via WhatsApp
CREATE TABLE IF NOT EXISTS public.relatorios_diarios_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia DATE NOT NULL UNIQUE,
  hora_disparo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  telefone_destinatario TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status_envio TEXT NOT NULL DEFAULT 'pendente',
  resposta_gateway JSONB,
  metricas_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_relatorios_diarios_data ON public.relatorios_diarios_whatsapp(data_referencia);

-- RLS Estrito
ALTER TABLE public.relatorios_diarios_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperADM visualiza relatórios diários de métricas" ON public.relatorios_diarios_whatsapp;
CREATE POLICY "SuperADM visualiza relatórios diários de métricas"
  ON public.relatorios_diarios_whatsapp
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'superadmin'
    )
  );

GRANT ALL ON TABLE public.relatorios_diarios_whatsapp TO service_role;
GRANT SELECT ON TABLE public.relatorios_diarios_whatsapp TO authenticated;

-- Invalidação de cache obrigatória
NOTIFY pgrst, 'reload schema';
