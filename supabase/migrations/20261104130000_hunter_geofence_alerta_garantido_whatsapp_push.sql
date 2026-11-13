-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261104130000_hunter_geofence_alerta_garantido_whatsapp_push.sql
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- Descrição: Blindagem de entrega garantida de alertas de geofence, Push VAPID
--            e WhatsApp no servidor com headers compatíveis e permissões pg_net.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante permissões de execução no schema net do Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA net TO postgres, authenticated, service_role, anon';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres, authenticated, service_role, anon';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Atualiza a função de trigger para incluir headers canônicos de segurança
CREATE OR REPLACE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
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
    'tipo', NEW.tipo,
    'placa', NEW.placa
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Hunter-Guardian-PgNet/1.0',
      'X-Hunter-Token', 'hunter-guardiao-whatsapp-secret-key-2026'
    ),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_vapid_notificacao_nova ON public.notificacoes_sistema;
CREATE TRIGGER trg_push_vapid_notificacao_nova
AFTER INSERT ON public.notificacoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao();

-- 3. Notificação PostgREST
NOTIFY pgrst, 'reload schema';
