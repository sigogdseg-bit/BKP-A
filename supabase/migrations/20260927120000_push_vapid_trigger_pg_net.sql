-- Migration: Disparo automático de Web Push VAPID via pg_net ao inserir notificação
-- Objetivo: Garantir que notificações sejam entregues mesmo com app fechado, tela bloqueada
-- ou outro app em uso, acionando o endpoint /api/push/disparar do Cloudflare Worker
-- diretamente a partir do banco de dados (sem depender de nenhum cliente ativo).

-- 1. Habilita a extensão pg_net para chamadas HTTP assíncronas a partir do PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Função que dispara push VAPID nativo ao inserir notificação no banco
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
  -- Monta título com placa se disponível
  v_titulo := NEW.titulo;
  IF NEW.placa IS NOT NULL AND NEW.placa <> '' THEN
    v_titulo := NEW.titulo || ' — ' || NEW.placa;
  END IF;

  -- Monta payload compatível com o endpoint /api/push/disparar do Cloudflare Worker
  v_payload := jsonb_build_object(
    'destinatarioUserId', NEW.destinatario_user_id,
    'destinatarioClienteId', NEW.destinatario_cliente_id,
    'titulo', v_titulo,
    'mensagem', NEW.mensagem,
    'url', COALESCE(NEW.url, '/monitor-gps'),
    'tag', 'sigo-notif-' || NEW.id::text
  );

  -- Disparo assíncrono via pg_net (NÃO bloqueia a transação de INSERT)
  -- O pg_net envia o HTTP POST em background sem travar a resposta ao cliente
  PERFORM net.http_post(
    url := v_url,
    body := v_payload::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a inserção de notificação por falha no disparo push
  -- (resiliência: o push é best-effort, a notificação já foi gravada no BD)
  RAISE WARNING '[PUSH-VAPID] Falha ao disparar push via pg_net: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. Remove trigger anterior se existir (idempotente)
DROP TRIGGER IF EXISTS trg_push_vapid_notificacao_nova ON public.notificacoes_sistema;

-- 4. Cria o trigger AFTER INSERT que dispara o push automaticamente
CREATE TRIGGER trg_push_vapid_notificacao_nova
AFTER INSERT ON public.notificacoes_sistema
FOR EACH ROW
EXECUTE FUNCTION public.disparar_push_vapid_ao_inserir_notificacao();

-- 5. Comentário explicativo para auditoria
COMMENT ON FUNCTION public.disparar_push_vapid_ao_inserir_notificacao() IS
  'Dispara Web Push VAPID nativo para dispositivos móveis e desktops registrados '
  'via pg_net HTTP POST assíncrono ao Cloudflare Worker. Garante recebimento de '
  'notificações com app fechado, tela bloqueada ou outro app em uso.';
