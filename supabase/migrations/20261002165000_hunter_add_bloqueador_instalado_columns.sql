-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Adiciona coluna bloqueador_instalado em instalacoes e veiculos
-- Data: 02/10/2026
-- Objetivo:
-- 1. Elimina erro 'column "bloqueador_instalado" of relation "instalacoes" does not exist'.
-- 2. Garante persistência e leitura de bloqueador_instalado tanto nas ordens de serviço
--    quanto na frota/veículos operacionais.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.instalacoes 
ADD COLUMN IF NOT EXISTS bloqueador_instalado BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS bloqueador_instalado BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.rastreadores 
ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL;

-- Notifica o PostgREST para recarregar o schema cache imediatamente
NOTIFY pgrst, 'reload schema';

