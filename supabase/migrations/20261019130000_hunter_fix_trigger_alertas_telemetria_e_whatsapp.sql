-- ============================================================================
-- MIGRATION: 20261019130000_hunter_fix_trigger_alertas_telemetria_e_whatsapp.sql
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- 
-- CAUSA-RAIZ CORRIGIDA:
-- 1. O trigger trg_hunter_alertas_telemetria NUNCA foi vinculado à tabela
--    public.veiculos no script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql.
--    A função trigger_avaliar_alertas_telemetria() existia mas nunca era
--    chamada pelo Postgres quando o gateway atualizava ignicao_status.
--    Resultado: alertas de telemetria (ignição fora do horário, excesso
--    de velocidade, movimento fora do horário, guincho) só eram avaliados
--    no frontend quando o usuário abria o mapa — NUNCA no servidor.
--    Push VAPID e WhatsApp nunca disparavam porque nenhuma linha era
--    inserida em notificacoes_sistema pelo trigger.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VINCULAÇÃO DO TRIGGER NA TABELA veiculos
-- Dispara AFTER UPDATE de velocidade_atual, ignicao_status, ultima_atualizacao
-- somente quando há mudança real em velocidade ou ignição, o veículo tem
-- cliente associado e está ativo.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_hunter_alertas_telemetria ON public.veiculos;

CREATE TRIGGER trg_hunter_alertas_telemetria
AFTER UPDATE OF velocidade_atual, ignicao_status, ultima_atualizacao
ON public.veiculos
FOR EACH ROW
WHEN (
  (
    OLD.velocidade_atual IS DISTINCT FROM NEW.velocidade_atual
    OR OLD.ignicao_status IS DISTINCT FROM NEW.ignicao_status
  )
  AND NEW.cliente_id IS NOT NULL
  AND NEW.ativo = true
)
EXECUTE FUNCTION public.trigger_avaliar_alertas_telemetria();

-- Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
