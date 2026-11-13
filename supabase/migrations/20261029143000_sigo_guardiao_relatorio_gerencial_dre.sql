-- Migration: Inclusao da secao DRE no Relatorio Gerencial Diario do SuperADM
-- Atualiza default da coluna secoes_ativas e registros existentes de forma idempotente

DO $$
BEGIN
  -- 1. Atualiza registros existentes que ainda nao possuem a chave 'dre' em secoes_ativas
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'relatorio_gerencial_config' 
    AND column_name = 'secoes_ativas'
  ) THEN
    UPDATE public.relatorio_gerencial_config
    SET secoes_ativas = secoes_ativas || '{"dre": true}'::jsonb
    WHERE NOT (secoes_ativas ? 'dre');

    -- 2. Altera o valor DEFAULT da coluna para incluir dre: true
    ALTER TABLE public.relatorio_gerencial_config 
    ALTER COLUMN secoes_ativas SET DEFAULT '{
      "frota": true,
      "alertas": true,
      "financeiro": true,
      "infraestrutura": true,
      "chips": true,
      "gateways": true,
      "dre": true
    }'::jsonb;
  END IF;
END $$;

-- 3. Notifica invalidacao do schema cache PostgREST
NOTIFY pgrst, 'reload schema';
