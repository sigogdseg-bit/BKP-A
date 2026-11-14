-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Hardening de RLS na Tabela public.documentos_emitidos
-- Versão: 2.1.6.72
-- Data: 07/11/2026
-- Objetivo: Revogar consulta anônima direta ampla em public.documentos_emitidos
--           e garantir que a conferência de autenticidade no portal /verificar
--           ocorra exclusivamente através da RPC segura hunter_verificar_autenticidade_contrato.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove a política que permitia leitura anônima direta com USING (true)
DROP POLICY IF EXISTS "documentos_emitidos_select_anon_hash" ON public.documentos_emitidos;

-- 2. Revoga SELECT direto na tabela para o papel anônimo (anon)
REVOKE SELECT ON TABLE public.documentos_emitidos FROM anon;

-- 3. Garante que authenticated e service_role mantenham permissões operacionais
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.documentos_emitidos TO authenticated, service_role;

-- 4. Garante políticas restritas para usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'documentos_emitidos'
      AND policyname = 'documentos_emitidos_select_autenticado'
  ) THEN
    CREATE POLICY "documentos_emitidos_select_autenticado"
    ON public.documentos_emitidos
    FOR SELECT TO authenticated
    USING (
      -- Apenas administradores e operadores podem consultar o acervo geral de documentos
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role::text IN ('superadmin', 'adm', 'operador', 'superadmin_auditor')
      )
    );
  END IF;
END $$;

-- 5. Atualiza a RPC hunter_verificar_autenticidade_contrato para operar como SECURITY DEFINER
--    com search_path seguro e acesso concedido ao papel anon
CREATE OR REPLACE FUNCTION public.hunter_verificar_autenticidade_contrato(
  p_identificador TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_contrato RECORD;
  v_cliente RECORD;
  v_doc RECORD;
  v_identificador_limpo TEXT;
BEGIN
  IF p_identificador IS NULL OR TRIM(p_identificador) = '' THEN
    RETURN jsonb_build_object(
      'autentico', false,
      'mensagem', 'Identificador de verificação não informado.'
    );
  END IF;

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
        'mensagem', 'Contrato autêntico localizado no sistema GD Rastreamento.',
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
        'mensagem', 'Documento oficial autêntico localizado no sistema GD Rastreamento.',
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

  RETURN jsonb_build_object(
    'autentico', false,
    'mensagem', 'Nenhum documento ou contrato autêntico localizado para o código ou hash informado.'
  );
END;
$$;

-- 6. Concede execução ao papel anônimo para permitir a verificação pontual no portal /verificar
GRANT EXECUTE ON FUNCTION public.hunter_verificar_autenticidade_contrato(TEXT) TO anon, authenticated, service_role;

-- 7. Notifica PostgREST para recarregar o schema imediatamente
NOTIFY pgrst, 'reload schema';
