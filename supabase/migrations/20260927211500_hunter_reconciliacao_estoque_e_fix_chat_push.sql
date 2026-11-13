-- Migration: Reconciliação Canônica do Estoque e Ajuste de Push VAPID para Mensagens de Chat
-- Data: 2026-09-27
-- Objetivo:
-- 1. Blindar a tabela de estoque (quantidade_atual) para que seja SEMPRE estritamente igual à soma das movimentações.
-- 2. Corrigir saldos dos itens MAT-0003 (Rele carro) e MAT-0004 (Porta rele) para 1 unidade real.
-- 3. Evitar duplo envio e disparo prematuro de Web Push para mensagens de chat, aguardando confirmação de leitura (1 traço vs 2 traços).

-- ============================================================================
-- PARTE 1: RECONCILIAÇÃO CANÔNICA DE ESTOQUE
-- ============================================================================

-- 1.1. Função canônica que recalcula o saldo real a partir do extrato de movimentações
CREATE OR REPLACE FUNCTION public.reconciliar_saldo_item_estoque(p_item_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_calculado NUMERIC;
BEGIN
  -- Calcula o somatório exato: entradas somam, saídas subtraem
  SELECT COALESCE(SUM(
    CASE 
      WHEN tipo IN ('entrada_compra', 'entrada_devolucao', 'estorno_instalacao') THEN quantidade
      WHEN tipo IN ('saida_instalacao', 'saida_perda', 'saida_descarte', 'estorno_compra') THEN -quantidade
      ELSE 0
    END
  ), 0)
  INTO v_saldo_calculado
  FROM public.estoque_movimentacoes
  WHERE item_id = p_item_id;

  -- Atualiza o estoque_itens garantindo que o saldo nunca fique negativo
  UPDATE public.estoque_itens
  SET quantidade_atual = GREATEST(0, v_saldo_calculado),
      updated_at = NOW()
  WHERE id = p_item_id;

  RETURN GREATEST(0, v_saldo_calculado);
END;
$$;

-- 1.2. Trigger automático em estoque_movimentacoes para recalcular o saldo a cada alteração
CREATE OR REPLACE FUNCTION public.trg_fn_reconciliar_estoque()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconciliar_saldo_item_estoque(OLD.item_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.reconciliar_saldo_item_estoque(NEW.item_id);
    IF OLD.item_id <> NEW.item_id THEN
      PERFORM public.reconciliar_saldo_item_estoque(OLD.item_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.reconciliar_saldo_item_estoque(NEW.item_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconciliar_estoque_ao_movimentar ON public.estoque_movimentacoes;
CREATE TRIGGER trg_reconciliar_estoque_ao_movimentar
AFTER INSERT OR UPDATE OR DELETE ON public.estoque_movimentacoes
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_reconciliar_estoque();

-- 1.3. Reconciliação imediata de todos os itens cadastrados no estoque
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.estoque_itens LOOP
    PERFORM public.reconciliar_saldo_item_estoque(r.id);
  END LOOP;
END;
$$;

-- ============================================================================
-- PARTE 2: AJUSTE DO TRIGGER DE PUSH VAPID (EVITA DUPLICIDADE E DISPARO PREMATURO NO CHAT)
-- ============================================================================

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
  -- REGRA DE CHAT: Mensagens de chat NÃO devem disparar push imediato pelo trigger do banco!
  -- No chat, a entrega em tempo real ocorre via Supabase Realtime (WebSocket).
  -- Se o destinatário estiver com o chat aberto, ele lê a mensagem imediatamente (marca 2 traços).
  -- O disparo de push para chat é gerenciado com tolerância de 2.5s caso a mensagem permaneça com 1 traço (não lida).
  IF NEW.tipo = 'chat' THEN
    RETURN NEW;
  END IF;

  -- Monta título com placa se disponível (alertas de segurança, socorro, ignição, pânico, etc.)
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

  -- Disparo assíncrono via pg_net para alertas críticos
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
