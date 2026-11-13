-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Aprimoramento da Autenticidade Forense de Documentos e Contratos
-- Permite verificar tanto pela tabela contratos_clientes quanto por documentos_emitidos
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante permissões na tabela documentos_emitidos para verificação pública anônima
GRANT SELECT ON TABLE public.documentos_emitidos TO anon, authenticated, service_role;

-- 2. Política de RLS para consulta anônima por hash SHA-256 no portal de autenticidade
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'documentos_emitidos'
      AND policyname = 'documentos_emitidos_select_anon_hash'
  ) THEN
    CREATE POLICY "documentos_emitidos_select_anon_hash"
    ON public.documentos_emitidos
    FOR SELECT TO anon
    USING (true);
  END IF;
END $$;

-- 3. Atualiza RPC hunter_verificar_autenticidade_contrato para buscar em ambas as tabelas
CREATE OR REPLACE FUNCTION public.hunter_verificar_autenticidade_contrato(
  p_identificador TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato RECORD;
  v_cliente RECORD;
  v_doc RECORD;
  v_identificador_limpo TEXT;
BEGIN
  v_identificador_limpo := UPPER(TRIM(p_identificador));

  -- 1. Tenta buscar em contratos_clientes
  BEGIN
    SELECT * INTO v_contrato
    FROM public.contratos_clientes
    WHERE selo_autenticidade = v_identificador_limpo
       OR codigo_verificacao = v_identificador_limpo
       OR hash_pdf_assinado = LOWER(v_identificador_limpo)
       OR hash_pdf_original = LOWER(v_identificador_limpo)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Busca dados do cliente
      SELECT nome_razao_social, documento, email INTO v_cliente
      FROM public.clientes
      WHERE id = v_contrato.cliente_id;

      RETURN jsonb_build_object(
        'autentico', true,
        'mensagem', 'Contrato autêntico localizado no sistema SIGO Guardião.',
        'contrato_id', v_contrato.id,
        'numero_contrato', v_contrato.numero_contrato,
        'selo_autenticidade', v_contrato.selo_autenticidade,
        'codigo_verificacao', v_contrato.codigo_verificacao,
        'status', v_contrato.status,
        'data_emissao', v_contrato.data_emissao,
        'data_assinatura', v_contrato.data_assinatura,
        'cliente_nome', COALESCE(v_cliente.nome_razao_social, 'N/I'),
        'hash_pdf_original', v_contrato.hash_pdf_original,
        'hash_pdf_assinado', v_contrato.hash_pdf_assinado
      );
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      -- Se a tabela não existir, continua para documentos_emitidos
      NULL;
  END;

  -- 2. Tenta buscar em documentos_emitidos (cadeia de custódia forense global)
  BEGIN
    SELECT * INTO v_doc
    FROM public.documentos_emitidos
    WHERE hash_sha256 = LOWER(v_identificador_limpo)
       OR (metadata->>'selo') = v_identificador_limpo
       OR (metadata->>'codigo') = v_identificador_limpo
       OR (metadata->>'numero_contrato') = v_identificador_limpo
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'autentico', true,
        'mensagem', 'Documento oficial autêntico localizado no sistema SIGO Guardião.',
        'contrato_id', v_doc.id,
        'numero_contrato', COALESCE(v_doc.metadata->>'numero_contrato', v_doc.nome_arquivo, 'DOC-OFICIAL'),
        'selo_autenticidade', COALESCE(v_doc.metadata->>'selo', 'SGD-' || UPPER(SUBSTRING(v_doc.id::text FROM 1 FOR 8))),
        'codigo_verificacao', COALESCE(v_doc.metadata->>'codigo', UPPER(SUBSTRING(v_doc.id::text FROM 1 FOR 6))),
        'status', 'assinado',
        'data_emissao', v_doc.created_at,
        'data_assinatura', v_doc.created_at,
        'cliente_nome', COALESCE(v_doc.metadata->>'cliente_nome', v_doc.descricao, 'Cliente'),
        'hash_pdf_original', v_doc.hash_sha256,
        'hash_pdf_assinado', v_doc.hash_sha256
      );
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  -- 3. Documento não localizado
  RETURN jsonb_build_object(
    'autentico', false,
    'mensagem', 'Nenhum contrato ou documento localizado com este identificador de autenticidade.'
  );
END;
$$;

-- 4. Suporte a status 'atualizado' e rastreamento de substituição de contratos
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contratos_clientes_status_check'
  ) THEN
    ALTER TABLE public.contratos_clientes DROP CONSTRAINT contratos_clientes_status_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contratos_clientes'
  ) THEN
    ALTER TABLE public.contratos_clientes
      ADD CONSTRAINT contratos_clientes_status_check
      CHECK (status IN (
        'pendente_assinatura',
        'enviado_cliente',
        'assinado',
        'cancelado',
        'expirado',
        'atualizado'
      ));

    ALTER TABLE public.contratos_clientes
      ADD COLUMN IF NOT EXISTS contrato_substituto_id UUID REFERENCES public.contratos_clientes(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS motivo_invalidacao TEXT;
  END IF;
END $$;

-- 5. Permissões explícitas para a Data API e invalidação de cache
GRANT EXECUTE ON FUNCTION public.hunter_verificar_autenticidade_contrato(TEXT) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
