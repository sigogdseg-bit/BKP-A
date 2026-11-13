-- ==============================================================================
-- SIGO GUARDIÃO — BLINDAGEM ANTI-REPETIÇÃO E DEDUPLICAÇÃO DE DESVIO DE ROTA
-- Diretrizes: HUNTER-GUARDIAN / DJR-NEW
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_anti_duplicacao_notificacoes_sistema()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1.1. Regra Canônica para Relatórios Gerenciais e Notificações Matinais Agendadas:
  -- Disparo estritamente único por dia civil (janela de 20 horas)
  IF (NEW.tipo IN ('gerencial', 'relatorio') OR NEW.titulo ILIKE '%Relatório%') THEN
    IF EXISTS (
      SELECT 1 FROM public.notificacoes_sistema
      WHERE (tipo IN ('gerencial', 'relatorio') OR titulo ILIKE '%Relatório%')
        AND created_at > NOW() - INTERVAL '20 hours'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- 1.2. Regra para Notificações Globais do Sistema (destinatário nulo)
  IF (NEW.destinatario_user_id IS NULL AND NEW.destinatario_cliente_id IS NULL) THEN
    IF EXISTS (
      SELECT 1 FROM public.notificacoes_sistema
      WHERE destinatario_user_id IS NULL
        AND destinatario_cliente_id IS NULL
        AND tipo = NEW.tipo
        AND COALESCE(titulo, '') = COALESCE(NEW.titulo, '')
        AND created_at > NOW() - INTERVAL '5 minutes'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- 1.3. Regra Canônica para Desvio de Rota Monitorada (Janela de 15 minutos e Unificação de Tipos):
  -- Impede repetições simultâneas ou tempestades de alerta para o mesmo veículo
  IF NEW.tipo IN ('desvio_rota', 'rota_monitorada') THEN
    IF EXISTS (
      SELECT 1 FROM public.notificacoes_sistema
      WHERE (
        (NEW.destinatario_user_id IS NOT NULL AND destinatario_user_id = NEW.destinatario_user_id)
        OR
        (NEW.destinatario_cliente_id IS NOT NULL AND destinatario_cliente_id = NEW.destinatario_cliente_id)
      )
      AND tipo IN ('desvio_rota', 'rota_monitorada')
      AND (
        (NEW.placa IS NOT NULL AND NEW.placa <> '' AND COALESCE(placa, '') = NEW.placa)
        OR
        (COALESCE(titulo, '') ILIKE '%Desvio de Rota%')
      )
      AND created_at > NOW() - INTERVAL '15 minutes'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- 1.4. Regra Geral para Notificações Direcionadas por Destinatário (Usuário ou Cliente)
  IF EXISTS (
    SELECT 1 FROM public.notificacoes_sistema
    WHERE (
      (NEW.destinatario_user_id IS NOT NULL AND destinatario_user_id = NEW.destinatario_user_id)
      OR
      (NEW.destinatario_cliente_id IS NOT NULL AND destinatario_cliente_id = NEW.destinatario_cliente_id)
    )
    AND tipo = NEW.tipo
    AND (
      (NEW.placa IS NOT NULL AND NEW.placa <> '' AND COALESCE(placa, '') = NEW.placa)
      OR
      (COALESCE(titulo, '') = COALESCE(NEW.titulo, ''))
    )
    AND created_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    -- Descarta silenciosamente o insert duplicado na raiz do banco
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anti_duplicacao_notificacoes_sistema ON public.notificacoes_sistema;
CREATE TRIGGER trg_anti_duplicacao_notificacoes_sistema
  BEFORE INSERT ON public.notificacoes_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_anti_duplicacao_notificacoes_sistema();

NOTIFY pgrst, 'reload schema';
