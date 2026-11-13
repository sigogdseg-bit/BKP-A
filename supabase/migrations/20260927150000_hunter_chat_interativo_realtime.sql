-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Chat Interativo em Tempo Real (v1.10.0.0)
-- Comunicação ponto a ponto entre clientes e operadores/ADMs
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tabela de Presença Online (rastreamento de status via Realtime)
CREATE TABLE IF NOT EXISTS public.chat_presenca (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cliente',
  cliente_id UUID,
  online BOOLEAN DEFAULT true,
  ultimo_heartbeat TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.chat_presenca IS 'Controle de presença online para o Chat Interativo em Tempo Real';

-- 2. Tabela de Mensagens do Chat
CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL CHECK (char_length(mensagem) > 0 AND char_length(mensagem) <= 4000),
  lida BOOLEAN DEFAULT false,
  lida_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.chat_mensagens IS 'Mensagens do Chat Interativo ponto a ponto entre usuarios';

-- 3. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_chat_msg_remetente ON public.chat_mensagens(remetente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_destinatario ON public.chat_mensagens(destinatario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conversa ON public.chat_mensagens(
  LEAST(remetente_id, destinatario_id),
  GREATEST(remetente_id, destinatario_id),
  created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_nao_lidas ON public.chat_mensagens(destinatario_id, lida) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_chat_presenca_online ON public.chat_presenca(online) WHERE online = true;

-- 4. RLS Estrito
ALTER TABLE public.chat_presenca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Presença
DROP POLICY IF EXISTS "Usuarios autenticados veem presenca" ON public.chat_presenca;
CREATE POLICY "Usuarios autenticados veem presenca" ON public.chat_presenca
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuario gerencia propria presenca" ON public.chat_presenca;
CREATE POLICY "Usuario gerencia propria presenca" ON public.chat_presenca
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. Políticas de Mensagens (ponto a ponto estrito)
DROP POLICY IF EXISTS "Usuario ve apenas suas mensagens" ON public.chat_mensagens;
CREATE POLICY "Usuario ve apenas suas mensagens" ON public.chat_mensagens
  FOR SELECT TO authenticated
  USING (remetente_id = auth.uid() OR destinatario_id = auth.uid());

DROP POLICY IF EXISTS "Usuario envia mensagem" ON public.chat_mensagens;
CREATE POLICY "Usuario envia mensagem" ON public.chat_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (remetente_id = auth.uid());

DROP POLICY IF EXISTS "Destinatario marca como lida" ON public.chat_mensagens;
CREATE POLICY "Destinatario marca como lida" ON public.chat_mensagens
  FOR UPDATE TO authenticated
  USING (destinatario_id = auth.uid())
  WITH CHECK (destinatario_id = auth.uid());

-- 7. Realtime ativo para as tabelas do chat
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_presenca'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_presenca;
  END IF;
END $$;
