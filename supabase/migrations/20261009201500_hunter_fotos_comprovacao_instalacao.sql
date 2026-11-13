-- ==============================================================================
-- HUNTER-GUARDIAN MIGRATION: Fotos de Comprovação da Instalação Técnica
-- ==============================================================================

-- 1. Novas colunas em public.instalacoes para comprovação fotográfica
ALTER TABLE public.instalacoes
ADD COLUMN IF NOT EXISTS foto_placa_url TEXT,
ADD COLUMN IF NOT EXISTS foto_rastreador_url TEXT,
ADD COLUMN IF NOT EXISTS foto_local_instalacao_url TEXT,
ADD COLUMN IF NOT EXISTS foto_bloqueador_url TEXT,
ADD COLUMN IF NOT EXISTS fotos_instalacao JSONB DEFAULT '{}'::jsonb;

-- 2. Garantir bucket no Storage para fotos de instalação técnica
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'instalacoes-fotos',
  'instalacoes-fotos',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']::text[];

-- 3. Políticas de acesso para o bucket instalacoes-fotos
DROP POLICY IF EXISTS "Permitir upload em instalacoes-fotos" ON storage.objects;
CREATE POLICY "Permitir upload em instalacoes-fotos"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'instalacoes-fotos');

DROP POLICY IF EXISTS "Permitir leitura em instalacoes-fotos" ON storage.objects;
CREATE POLICY "Permitir leitura em instalacoes-fotos"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'instalacoes-fotos');

-- 4. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
