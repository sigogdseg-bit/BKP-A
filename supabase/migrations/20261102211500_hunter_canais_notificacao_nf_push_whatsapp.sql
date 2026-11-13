-- Migration: 20261102211500_hunter_canais_notificacao_nf_push_whatsapp.sql
-- Descricao: Adiciona controle independente de canais (Push e WhatsApp) para Notas Fiscais e Comprovantes em public.clientes

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS canais_notificacao_nf JSONB NOT NULL DEFAULT '{"push": true, "whatsapp": true}'::jsonb;

-- Sincroniza clientes existentes que haviam desativado notificacoes
UPDATE public.clientes
SET canais_notificacao_nf = '{"push": false, "whatsapp": false}'::jsonb
WHERE notificar_nf_pendente = false;

-- Notifica o PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
