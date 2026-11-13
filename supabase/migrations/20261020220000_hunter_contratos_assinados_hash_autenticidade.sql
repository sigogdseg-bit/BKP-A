-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Hunter - Contratos Assinados, Hash de Integridade e Selo de Autenticidade
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────
-- Fluxo:
--   1. Contrato gerado em PDF → enviado ao cliente para assinatura
--   2. Cliente assina (digital ou manuscrita) e devolve
--   3. PDF assinado é armazenado no BD vinculado ao cliente
--   4. Hash SHA-256 é gerado e gravado como selo de autenticidade imutável
--   5. Qualquer cópia emitida carrega selo + hash para verificação
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de contratos assinados (cadeia de custódia forense)
CREATE TABLE IF NOT EXISTS public.contratos_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculo com cliente
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,

  -- Identificação do contrato
  numero_contrato TEXT NOT NULL,
  tipo_contrato TEXT NOT NULL DEFAULT 'PRESTACAO_SERVICOS',

  -- Conteúdo do PDF (armazenado como bytea para integridade total)
  pdf_original BYTEA,           -- PDF gerado pelo sistema (antes da assinatura)
  pdf_assinado BYTEA,           -- PDF devolvido pelo cliente (com assinatura)

  -- Hashes de integridade (SHA-256)
  hash_pdf_original TEXT,        -- Hash do PDF emitido
  hash_pdf_assinado TEXT,        -- Hash do PDF assinado devolvido

  -- Selo de autenticidade do sistema
  selo_autenticidade TEXT NOT NULL DEFAULT '',  -- Código único de verificação (ex: SGD-XXXXXXXX)
  codigo_verificacao TEXT NOT NULL DEFAULT '',  -- Código curto para verificação pública

  -- Status do contrato
  status TEXT NOT NULL DEFAULT 'pendente_assinatura'
    CHECK (status IN (
      'pendente_assinatura',
      'enviado_cliente',
      'assinado',
      'cancelado',
      'expirado'
    )),

  -- Datas do ciclo de vida
  data_emissao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_envio_cliente TIMESTAMPTZ,
  data_assinatura TIMESTAMPTZ,
  data_cancelamento TIMESTAMPTZ,

  -- Dados da assinatura
  assinatura_ip TEXT,
  assinatura_user_agent TEXT,
  assinatura_metodo TEXT DEFAULT 'digital'
    CHECK (assinatura_metodo IN ('digital', 'manuscrita', 'aceite_plataforma')),

  -- Rastreabilidade
  emitido_por_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  emitido_por_nome TEXT NOT NULL DEFAULT 'Sistema',
  assinado_por_nome TEXT,

  -- Vigência contratual
  vigencia_inicio DATE,
  vigencia_fim DATE,
  valor_mensalidade NUMERIC(10,2) DEFAULT 0,
  valor_total_contrato NUMERIC(12,2) DEFAULT 0,

  -- Metadata extensível
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_cliente_id
  ON public.contratos_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_status
  ON public.contratos_clientes(status);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_numero
  ON public.contratos_clientes(numero_contrato);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_selo
  ON public.contratos_clientes(selo_autenticidade);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_codigo_verificacao
  ON public.contratos_clientes(codigo_verificacao);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_hash_assinado
  ON public.contratos_clientes(hash_pdf_assinado);
CREATE INDEX IF NOT EXISTS idx_contratos_clientes_created_at
  ON public.contratos_clientes(created_at DESC);

-- 3. Trigger de updated_at automático
CREATE OR REPLACE FUNCTION public.trigger_contratos_clientes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contratos_clientes_updated_at ON public.contratos_clientes;
CREATE TRIGGER trg_contratos_clientes_updated_at
  BEFORE UPDATE ON public.contratos_clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_contratos_clientes_updated_at();

-- 4. RPC para gerar selo de autenticidade único
CREATE OR REPLACE FUNCTION public.hunter_gerar_selo_autenticidade()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_selo TEXT;
  v_existe BOOLEAN;
BEGIN
  LOOP
    -- Formato: SGD-XXXXXXXX (8 caracteres hexadecimais)
    v_selo := 'SGD-' || UPPER(SUBSTR(MD5(gen_random_uuid()::TEXT || NOW()::TEXT), 1, 8));

    SELECT EXISTS(
      SELECT 1 FROM public.contratos_clientes WHERE selo_autenticidade = v_selo
    ) INTO v_existe;

    EXIT WHEN NOT v_existe;
  END LOOP;

  RETURN v_selo;
END;
$$;

-- 5. RPC para gerar código de verificação curto (6 dígitos alfanuméricos)
CREATE OR REPLACE FUNCTION public.hunter_gerar_codigo_verificacao()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo TEXT;
  v_existe BOOLEAN;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem I, O, 0, 1 para evitar confusão
BEGIN
  LOOP
    v_codigo := '';
    FOR i IN 1..6 LOOP
      v_codigo := v_codigo || SUBSTR(v_chars, FLOOR(RANDOM() * LENGTH(v_chars) + 1)::INT, 1);
    END LOOP;

    SELECT EXISTS(
      SELECT 1 FROM public.contratos_clientes WHERE codigo_verificacao = v_codigo
    ) INTO v_existe;

    EXIT WHEN NOT v_existe;
  END LOOP;

  RETURN v_codigo;
END;
$$;

-- 6. RPC para registrar contrato assinado com hash de integridade
CREATE OR REPLACE FUNCTION public.hunter_registrar_contrato_assinado(
  p_contrato_id UUID,
  p_pdf_assinado BYTEA,
  p_hash_pdf_assinado TEXT,
  p_assinado_por_nome TEXT DEFAULT NULL,
  p_assinatura_ip TEXT DEFAULT NULL,
  p_assinatura_user_agent TEXT DEFAULT NULL,
  p_assinatura_metodo TEXT DEFAULT 'digital'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato RECORD;
  v_resultado JSONB;
BEGIN
  -- Busca o contrato existente
  SELECT * INTO v_contrato
  FROM public.contratos_clientes
  WHERE id = p_contrato_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Contrato não encontrado.'
    );
  END IF;

  IF v_contrato.status = 'assinado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Este contrato já foi assinado anteriormente.'
    );
  END IF;

  IF v_contrato.status = 'cancelado' THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'Este contrato foi cancelado e não pode ser assinado.'
    );
  END IF;

  -- Atualiza o contrato com o PDF assinado e gera hash
  UPDATE public.contratos_clientes
  SET
    pdf_assinado = p_pdf_assinado,
    hash_pdf_assinado = LOWER(TRIM(p_hash_pdf_assinado)),
    status = 'assinado',
    data_assinatura = NOW(),
    assinado_por_nome = COALESCE(p_assinado_por_nome, v_contrato.assinado_por_nome),
    assinatura_ip = p_assinatura_ip,
    assinatura_user_agent = p_assinatura_user_agent,
    assinatura_metodo = COALESCE(p_assinatura_metodo, 'digital')
  WHERE id = p_contrato_id;

  -- Atualiza flag no cliente
  UPDATE public.clientes
  SET contrato_emitido_em = NOW()
  WHERE id = v_contrato.cliente_id;

  v_resultado := jsonb_build_object(
    'sucesso', true,
    'mensagem', 'Contrato assinado registrado com sucesso.',
    'contrato_id', p_contrato_id,
    'selo_autenticidade', v_contrato.selo_autenticidade,
    'codigo_verificacao', v_contrato.codigo_verificacao,
    'hash_pdf_assinado', LOWER(TRIM(p_hash_pdf_assinado)),
    'data_assinatura', NOW()
  );

  RETURN v_resultado;
END;
$$;

-- 7. RPC para verificar autenticidade de contrato por selo ou código
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
  v_identificador_limpo TEXT;
BEGIN
  v_identificador_limpo := UPPER(TRIM(p_identificador));

  -- Busca por selo de autenticidade, código de verificação ou hash
  SELECT * INTO v_contrato
  FROM public.contratos_clientes
  WHERE selo_autenticidade = v_identificador_limpo
     OR codigo_verificacao = v_identificador_limpo
     OR hash_pdf_assinado = LOWER(v_identificador_limpo)
     OR hash_pdf_original = LOWER(v_identificador_limpo)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'autentico', false,
      'mensagem', 'Nenhum contrato localizado com este identificador de autenticidade.'
    );
  END IF;

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
END;
$$;

-- 8. Permissões (Supabase October 30 Compliance)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contratos_clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contratos_clientes TO service_role;
GRANT SELECT ON TABLE public.contratos_clientes TO anon;

GRANT EXECUTE ON FUNCTION public.hunter_gerar_selo_autenticidade() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hunter_gerar_codigo_verificacao() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hunter_registrar_contrato_assinado(UUID, BYTEA, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hunter_verificar_autenticidade_contrato(TEXT) TO authenticated, service_role, anon;

-- 9. RLS Estrito
ALTER TABLE public.contratos_clientes ENABLE ROW LEVEL SECURITY;

-- Operadores e Admins podem ver todos os contratos
DROP POLICY IF EXISTS "contratos_clientes_select_operador" ON public.contratos_clientes;
CREATE POLICY "contratos_clientes_select_operador"
ON public.contratos_clientes
FOR SELECT TO authenticated
USING (
  public.is_operador() OR public.is_adm()
  OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- Clientes podem ver seus próprios contratos
DROP POLICY IF EXISTS "contratos_clientes_select_cliente" ON public.contratos_clientes;
CREATE POLICY "contratos_clientes_select_cliente"
ON public.contratos_clientes
FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- Inserção por operadores/admins
DROP POLICY IF EXISTS "contratos_clientes_insert" ON public.contratos_clientes;
CREATE POLICY "contratos_clientes_insert"
ON public.contratos_clientes
FOR INSERT TO authenticated
WITH CHECK (
  public.is_operador() OR public.is_adm()
);

-- Atualização por operadores/admins (ou o próprio cliente para aceitar contrato)
DROP POLICY IF EXISTS "contratos_clientes_update" ON public.contratos_clientes;
CREATE POLICY "contratos_clientes_update"
ON public.contratos_clientes
FOR UPDATE TO authenticated
USING (
  public.is_operador() OR public.is_adm()
  OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- Verificação anônima (para conferência pública de autenticidade)
DROP POLICY IF EXISTS "contratos_clientes_select_anon_verificacao" ON public.contratos_clientes;
CREATE POLICY "contratos_clientes_select_anon_verificacao"
ON public.contratos_clientes
FOR SELECT TO anon
USING (
  -- Anônimos podem consultar apenas contratos assinados (verificação de autenticidade)
  status = 'assinado'
);

-- 10. Notifica PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
