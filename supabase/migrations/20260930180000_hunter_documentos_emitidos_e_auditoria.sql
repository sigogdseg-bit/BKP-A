-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Hunter - Registro Forense de Documentos Emitidos e Conferência de Integridade
-- Versão Alvo: 1.11.0.26
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Criação da tabela de documentos emitidos
CREATE TABLE IF NOT EXISTS public.documentos_emitidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  emissor_nome TEXT NOT NULL,
  emissor_email TEXT NOT NULL,
  emissor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  emissor_role TEXT DEFAULT 'operador',
  tamanho_bytes BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices de alta performance para busca e verificação instantânea de integridade
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_hash ON public.documentos_emitidos(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_created_at ON public.documentos_emitidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_tipo ON public.documentos_emitidos(tipo_documento);

-- 3. Permissões de tabela para roles autenticadas e administrativas
GRANT ALL ON public.documentos_emitidos TO authenticated;
GRANT ALL ON public.documentos_emitidos TO anon;
GRANT ALL ON public.documentos_emitidos TO service_role;

-- 4. Row Level Security Estrito
ALTER TABLE public.documentos_emitidos ENABLE ROW LEVEL SECURITY;

-- Leitura: restrita a Operadores e Administradores (ou pelo emissor original)
DROP POLICY IF EXISTS "Leitura de documentos emitidos para operadores e administradores" ON public.documentos_emitidos;
CREATE POLICY "Leitura de documentos emitidos para operadores e administradores"
ON public.documentos_emitidos
FOR SELECT
TO authenticated
USING (
  public.is_operador() OR public.is_adm() OR emissor_user_id = auth.uid()
);

-- Inserção: permitida por usuários autorizados ou via service_role
DROP POLICY IF EXISTS "Insercao de documentos emitidos por usuarios autorizados" ON public.documentos_emitidos;
CREATE POLICY "Insercao de documentos emitidos por usuarios autorizados"
ON public.documentos_emitidos
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 5. Notifica o PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
