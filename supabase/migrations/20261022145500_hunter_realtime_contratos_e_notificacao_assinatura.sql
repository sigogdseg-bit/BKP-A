-- Migração: Habilitação de Realtime para contratos_clientes e documentos_emitidos
-- Garante reatividade instantânea via WebSockets quando o cliente assina pelo celular
-- Data: 2026-10-22

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contratos_clientes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.contratos_clientes;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'documentos_emitidos'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_emitidos;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
