-- Hunter: Ativação de Supabase Realtime para veiculos e telemetria_posicoes
-- Permite que alterações de ignição, posição e status operacional atualizem a tela instantaneamente via WebSocket

ALTER TABLE public.veiculos REPLICA IDENTITY FULL;
ALTER TABLE public.telemetria_posicoes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'veiculos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'telemetria_posicoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetria_posicoes;
  END IF;
END $$;
