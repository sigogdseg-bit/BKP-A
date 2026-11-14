-- ─────────────────────────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: 20260930223500_hunter_registro_relatorio_frota_forense.sql
-- DESCRIÇÃO: Registra relatórios de frota e documento emitido pelo usuário para conferência forense
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documentos_emitidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL UNIQUE,
  tipo_documento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  emissor_nome TEXT NOT NULL,
  emissor_email TEXT NOT NULL,
  emissor_user_id UUID,
  emissor_role TEXT NOT NULL DEFAULT 'operador',
  tamanho_bytes BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_hash ON public.documentos_emitidos(hash_sha256);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_created_at ON public.documentos_emitidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_emitidos_tipo ON public.documentos_emitidos(tipo_documento);

GRANT ALL ON public.documentos_emitidos TO authenticated;
GRANT ALL ON public.documentos_emitidos TO anon;
GRANT ALL ON public.documentos_emitidos TO service_role;

ALTER TABLE public.documentos_emitidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de documentos emitidos para operadores e administradores" ON public.documentos_emitidos;
CREATE POLICY "Leitura de documentos emitidos para operadores e administradores"
ON public.documentos_emitidos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  emissor_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Insercao de documentos emitidos por usuarios autorizados" ON public.documentos_emitidos;
CREATE POLICY "Insercao de documentos emitidos por usuarios autorizados"
ON public.documentos_emitidos
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  OR
  auth.role() = 'service_role'
);

-- Inserção do documento emitido pelo usuário em teste para conferência imediata
INSERT INTO public.documentos_emitidos (
  nome_arquivo,
  hash_sha256,
  tipo_documento,
  descricao,
  emissor_nome,
  emissor_email,
  emissor_role,
  tamanho_bytes,
  metadata,
  created_at
) VALUES (
  'relatorio_frota_todos_os_clientes_1790817924847.pdf',
  '4dec9194b9d029ecfbe475c2a0c79e48a089fe09228cfe6a3bec24c3b806937d',
  'RELATORIO_FROTA_TELEMETRIA',
  'Relatório Forense de Desempenho da Frota - Todos os Clientes (Todos os Veículos)',
  'Administrador',
  'novaes@oficial.tec.br',
  'superadmin',
  14950,
  '{"cliente": "Todos os Clientes", "veiculo_filtro": "todos", "periodo_dias": 7}'::jsonb,
  NOW()
) ON CONFLICT (hash_sha256) DO NOTHING;
