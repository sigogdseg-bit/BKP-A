-- ==============================================================================
-- HUNTER — Migração Canônica: Foreign Keys e Realtime do Módulo Financeiro
-- Versão: 1.5.5.9
-- Descrição:
-- 1. Cria foreign keys entre transacoes_financeiras e as tabelas clientes, profiles, mensalidades e instalacoes
-- 2. Habilita REPLICA IDENTITY FULL em transacoes_financeiras e mensalidades
-- 3. Adiciona tabelas a publicação supabase_realtime
-- ==============================================================================

DO $$
BEGIN
  -- 1. Foreign key cliente_id -> clientes(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transacoes_financeiras_cliente_id_fkey'
  ) THEN
    ALTER TABLE public.transacoes_financeiras
      ADD CONSTRAINT transacoes_financeiras_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
  END IF;

  -- 2. Foreign key instalador_id -> profiles(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transacoes_financeiras_instalador_id_fkey'
  ) THEN
    ALTER TABLE public.transacoes_financeiras
      ADD CONSTRAINT transacoes_financeiras_instalador_id_fkey
      FOREIGN KEY (instalador_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- 3. Foreign key mensalidade_id -> mensalidades(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transacoes_financeiras_mensalidade_id_fkey'
  ) THEN
    ALTER TABLE public.transacoes_financeiras
      ADD CONSTRAINT transacoes_financeiras_mensalidade_id_fkey
      FOREIGN KEY (mensalidade_id) REFERENCES public.mensalidades(id) ON DELETE CASCADE;
  END IF;

  -- 4. Foreign key instalacao_id -> instalacoes(id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transacoes_financeiras_instalacao_id_fkey'
  ) THEN
    ALTER TABLE public.transacoes_financeiras
      ADD CONSTRAINT transacoes_financeiras_instalacao_id_fkey
      FOREIGN KEY (instalacao_id) REFERENCES public.instalacoes(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Configuração de REPLICA IDENTITY para Realtime
ALTER TABLE public.transacoes_financeiras REPLICA IDENTITY FULL;
ALTER TABLE public.mensalidades REPLICA IDENTITY FULL;

-- Inclusão nas publicações Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transacoes_financeiras'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transacoes_financeiras;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mensalidades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensalidades;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
