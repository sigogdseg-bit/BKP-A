-- Hunter — Correção e Sincronização de Colunas Contratuais em public.clientes
-- Migration: 20261009091500_hunter_fix_clientes_contrato_columns_schema_cache.sql

-- 1. Garantir que todas as colunas de contrato e governança existem na tabela clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_inicio_contrato DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS meses_contrato INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS data_fim_contrato DATE,
  ADD COLUMN IF NOT EXISTS tipo_renovacao TEXT NOT NULL DEFAULT 'mesma_vigencia',
  ADD COLUMN IF NOT EXISTS meses_renovacao INT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS foro_comarca TEXT NOT NULL DEFAULT 'Volta Redonda/RJ',
  ADD COLUMN IF NOT EXISTS contrato_emitido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tem_fidelidade BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacidade_localizacao BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pendente_configuracao_operador BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_agendamento TEXT DEFAULT 'aguardando_agendamento';

-- 2. Atualizar valores nulos existentes
UPDATE public.clientes
SET data_inicio_contrato = CURRENT_DATE
WHERE data_inicio_contrato IS NULL;

UPDATE public.clientes
SET data_fim_contrato = (data_inicio_contrato + (COALESCE(meses_contrato, 12) || ' months')::INTERVAL)::DATE
WHERE data_fim_contrato IS NULL;

-- 3. Recarregar imediatamente o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
