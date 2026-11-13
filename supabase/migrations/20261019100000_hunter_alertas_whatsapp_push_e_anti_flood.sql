-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261019100000_hunter_alertas_whatsapp_push_e_anti_flood.sql
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- Descrição: Atualiza a trigger function disparar_push_vapid_ao_inserir_notificacao
--            para repassar tipo e placa no payload HTTP do trigger pg_net, permitindo
--            despacho imediato de WhatsApp para números cadastrados no veículo / cliente.
-- ─────────────────────────────────────────────────────────────────────────────

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
    'tipo', NEW.tipo,
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

DROP TRIGGER IF EXISTS trg_push_vapid_notificacao_nova ON public.notificacoes_sistema;
CREATE TRIGGER trg_push_vapid_notificacao_nova
AFTER INSERT ON public.notificacoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao();

-- Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
