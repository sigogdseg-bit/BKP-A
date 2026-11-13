-- Hunter: Ativação de Realtime para viagens_trajetos
-- Garante reatividade instantânea ao iniciar e concluir ciclos de ignição

ALTER TABLE public.viagens_trajetos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'viagens_trajetos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.viagens_trajetos;
  END IF;
END $$;
