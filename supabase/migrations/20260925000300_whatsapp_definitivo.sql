-- =============================================================================
-- SIGO GUARDIÃO — MIGRATION: WHATSAPP CLOUD DEFINITIVO & FILA ASSÍNCRONA
-- =============================================================================

-- 1. Tabela de Configurações do WhatsApp na Nuvem
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor TEXT NOT NULL DEFAULT 'universal', -- 'zapi', 'evolution', 'generic'
  api_url TEXT NOT NULL DEFAULT 'https://api.z-api.io',
  api_key TEXT,
  instance_id TEXT,
  token_autenticacao TEXT,
  client_token TEXT,
  telefone_central TEXT NOT NULL DEFAULT '24992494030',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para whatsapp_config
DROP POLICY IF EXISTS "whatsapp_config_select_authenticated" ON public.whatsapp_config;
CREATE POLICY "whatsapp_config_select_authenticated"
ON public.whatsapp_config FOR SELECT
TO authenticated, service_role
USING (true);

DROP POLICY IF EXISTS "whatsapp_config_admin_all" ON public.whatsapp_config;
CREATE POLICY "whatsapp_config_admin_all"
ON public.whatsapp_config FOR ALL
TO authenticated, service_role
USING (public.is_adm() = TRUE)
WITH CHECK (public.is_adm() = TRUE);

-- Insere configuração padrão inicial se a tabela estiver vazia
INSERT INTO public.whatsapp_config (provedor, api_url, telefone_central, ativo)
SELECT 'universal', 'https://api.z-api.io', '24992494030', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_config);

-- 2. Tabela de Fila de Mensagens Assíncronas
CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens_fila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_destino TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo_alerta TEXT, -- 'cobranca', 'agendamento', 'jammer', 'cerca', 'desvio_rota', 'geral'
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'enviado', 'falha'
  tentativas INT NOT NULL DEFAULT 0,
  resposta_api JSONB,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de performance para consumo rápido da fila
CREATE INDEX IF NOT EXISTS idx_whatsapp_fila_status ON public.whatsapp_mensagens_fila(status, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_fila_veiculo ON public.whatsapp_mensagens_fila(veiculo_id);

-- Habilita RLS
ALTER TABLE public.whatsapp_mensagens_fila ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para whatsapp_mensagens_fila
DROP POLICY IF EXISTS "whatsapp_fila_select" ON public.whatsapp_mensagens_fila;
CREATE POLICY "whatsapp_fila_select"
ON public.whatsapp_mensagens_fila FOR SELECT
TO authenticated, service_role
USING (true);

DROP POLICY IF EXISTS "whatsapp_fila_insert" ON public.whatsapp_mensagens_fila;
CREATE POLICY "whatsapp_fila_insert"
ON public.whatsapp_mensagens_fila FOR INSERT
TO authenticated, service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_fila_update" ON public.whatsapp_mensagens_fila;
CREATE POLICY "whatsapp_fila_update"
ON public.whatsapp_mensagens_fila FOR UPDATE
TO authenticated, service_role
USING (public.is_adm() = TRUE OR (auth.jwt() ->> 'role') = 'service_role')
WITH CHECK (public.is_adm() = TRUE OR (auth.jwt() ->> 'role') = 'service_role');

-- 3. RPC para Enfileirar Mensagem de Forma Transacional
CREATE OR REPLACE FUNCTION public.enfileirar_mensagem_whatsapp(
  p_numero TEXT,
  p_mensagem TEXT,
  p_tipo TEXT DEFAULT 'geral',
  p_veiculo_id UUID DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_numero IS NULL OR trim(p_numero) = '' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Número de destino inválido.');
  END IF;

  IF p_mensagem IS NULL OR trim(p_mensagem) = '' THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Conteúdo da mensagem vazio.');
  END IF;

  INSERT INTO public.whatsapp_mensagens_fila (
    numero_destino,
    mensagem,
    tipo_alerta,
    veiculo_id,
    cliente_id,
    status
  ) VALUES (
    trim(p_numero),
    trim(p_mensagem),
    p_tipo,
    p_veiculo_id,
    p_cliente_id,
    'pendente'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem_id', v_id,
    'mensagem', 'Mensagem enfileirada com sucesso para envio em segundo plano.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enfileirar_mensagem_whatsapp(TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role, anon;

-- 4. Notifica PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
