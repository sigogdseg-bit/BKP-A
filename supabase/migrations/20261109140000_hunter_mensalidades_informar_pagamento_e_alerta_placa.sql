-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261109140000_hunter_mensalidades_informar_pagamento_e_alerta_placa.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. Inclusão dos campos 'tipo' e 'placa' no payload do trigger disparar_push_vapid_ao_inserir_notificacao
--    Garante que alertas de excesso de velocidade, cerca e telemetria cheguem com placa identificada
-- 2. Colunas de auditoria de pagamento informado pelo cliente em public.mensalidades
-- 3. RLS autorizando clientes a informarem pagamento em suas próprias mensalidades pendentes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona colunas complementares para controle de confirmação de pagamento
ALTER TABLE public.mensalidades 
ADD COLUMN IF NOT EXISTS pagamento_informado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pagamento_informado_obs TEXT;

-- 2. Atualiza a função de trigger com tipo e placa no payload para despacho WhatsApp e Push
CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://sigoguardiao.oficial.tec.br/api/push/disparar';
  v_payload jsonb;
  v_titulo text;
BEGIN
  -- Não dispara push de sistema para mensagens de chat interno
  IF NEW.tipo = 'chat' THEN
    RETURN NEW;
  END IF;

  v_titulo := NEW.titulo;
  IF NEW.placa IS NOT NULL AND NEW.placa <> '' THEN
    v_titulo := NEW.titulo || ' — ' || NEW.placa;
  END IF;

  v_payload := jsonb_build_object(
    'destinatarioUserId', NEW.destinatario_user_id,
    'destinatarioClienteId', NEW.destinatario_cliente_id,
    'titulo', v_titulo,
    'mensagem', NEW.mensagem,
    'url', COALESCE(NEW.url, '/monitor-gps'),
    'tag', 'sigo-notif-' || NEW.id::text,
    'tipo', COALESCE(NEW.tipo, 'alerta'),
    'placa', NEW.placa
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. RLS para permitir que o cliente informe o pagamento de sua fatura
DROP POLICY IF EXISTS "Clientes informam pagamento de suas proprias mensalidades" ON public.mensalidades;
CREATE POLICY "Clientes informam pagamento de suas proprias mensalidades"
ON public.mensalidades
FOR UPDATE
TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
  AND status != 'pago'
)
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
  AND status != 'pago'
);
