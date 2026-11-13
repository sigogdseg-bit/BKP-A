-- Migration: 20260926185000_notificacoes_push_realtime_bd.sql
-- Hunter / SIGO Guardião — Notificações Nativas e Push Sincronizadas via Banco de Dados (Supabase Realtime)

-- 1. Tabela de Inscrições Web Push (VAPID Push Subscriptions)
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_push_subs_user ON public.user_push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_subs_cliente ON public.user_push_subscriptions(cliente_id);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios gerenciam suas proprias inscricoes push" ON public.user_push_subscriptions;
CREATE POLICY "Usuarios gerenciam suas proprias inscricoes push"
  ON public.user_push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Tabela de Notificações do Sistema em Tempo Real entre Dispositivos
CREATE TABLE IF NOT EXISTS public.notificacoes_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  destinatario_cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  remetente_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  remetente_nome TEXT,
  dispositivo_origem TEXT,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'alerta', -- 'teste', 'acidente', 'socorro', 'jammer', 'cobranca', 'geral'
  url TEXT DEFAULT '/monitor-gps',
  placa TEXT,
  lida BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_dest_user ON public.notificacoes_sistema(destinatario_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_dest_cliente ON public.notificacoes_sistema(destinatario_cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_created_at ON public.notificacoes_sistema(created_at DESC);

ALTER TABLE public.notificacoes_sistema ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para notificações_sistema
DROP POLICY IF EXISTS "Usuarios autenticados podem inserir notificacoes" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios autenticados podem inserir notificacoes"
  ON public.notificacoes_sistema FOR INSERT TO authenticated
  WITH CHECK (
    -- Permite inserir se for o remetente
    remetente_user_id = auth.uid() OR remetente_user_id IS NULL
  );

DROP POLICY IF EXISTS "Usuarios podem ler suas proprias notificacoes ou administradores leem todas" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios podem ler suas proprias notificacoes ou administradores leem todas"
  ON public.notificacoes_sistema FOR SELECT TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR remetente_user_id = auth.uid()
    OR public.is_admin_or_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Usuarios podem marcar como lida suas notificacoes" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios podem marcar como lida suas notificacoes"
  ON public.notificacoes_sistema FOR UPDATE TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR public.is_admin_or_superadmin(auth.uid())
  )
  WITH CHECK (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR public.is_admin_or_superadmin(auth.uid())
  );

-- 3. Habilita Realtime do Supabase nas tabelas
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_sistema;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_push_subscriptions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 4. Função RPC Segura para Disparar Notificação Via Banco de Dados
CREATE OR REPLACE FUNCTION public.enviar_notificacao_sistema(
  p_destinatario_user_id UUID DEFAULT NULL,
  p_destinatario_cliente_id UUID DEFAULT NULL,
  p_titulo TEXT DEFAULT '🚨 Alerta do Sistema',
  p_mensagem TEXT DEFAULT 'Notificação do SIGO Guardião',
  p_tipo TEXT DEFAULT 'alerta',
  p_url TEXT DEFAULT '/monitor-gps',
  p_placa TEXT DEFAULT NULL,
  p_dispositivo_origem TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remetente_id UUID := auth.uid();
  v_remetente_nome TEXT := 'SIGO Guardião';
  v_dest_user UUID := p_destinatario_user_id;
  v_dest_cli UUID := p_destinatario_cliente_id;
  v_notif_id UUID;
BEGIN
  -- Se destinatário não foi especificado, direciona para o próprio usuário emitente (teste multi-dispositivo)
  IF v_dest_user IS NULL AND v_dest_cli IS NULL THEN
    v_dest_user := v_remetente_id;
  END IF;

  -- Obtém nome do remetente a partir dos perfis
  SELECT nome INTO v_remetente_nome
  FROM public.profiles
  WHERE id = v_remetente_id;

  INSERT INTO public.notificacoes_sistema (
    destinatario_user_id,
    destinatario_cliente_id,
    remetente_user_id,
    remetente_nome,
    dispositivo_origem,
    titulo,
    mensagem,
    tipo,
    url,
    placa
  ) VALUES (
    v_dest_user,
    v_dest_cli,
    v_remetente_id,
    COALESCE(v_remetente_nome, 'Dispositivo Autorizado'),
    p_dispositivo_origem,
    p_titulo,
    p_mensagem,
    p_tipo,
    p_url,
    p_placa
  ) RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'success', true,
    'notificacao_id', v_notif_id,
    'mensagem', 'Notificação enviada com sucesso via banco de dados em tempo real.'
  );
END;
$$;
