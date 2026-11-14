-- ==============================================================================
-- HUNTER / GD RASTREAMENTO — BLINDAGEM ANTI-REPETIÇÃO DE NOTIFICAÇÕES E RELATÓRIO
-- Protocolo Canônico: 1 Único Relatório Gerencial por Dia (Horário Agendado)
-- Resolução Definitiva de Deduplicação Global e Janela de Horário
-- ==============================================================================

-- 1. Aprimoramento da Função de Trigger trg_anti_duplicacao_notificacoes_sistema
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
      -- Descarta silenciosamente o insert duplicado do relatório
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

  -- 1.3. Regra para Notificações Direcionadas por Destinatário (Usuário ou Cliente)
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

-- 2. Garantia de Existência de Registro Canônico em relatorio_gerencial_config
INSERT INTO public.relatorio_gerencial_config (
  ativo,
  horario_envio,
  enviar_whatsapp,
  enviar_push,
  telefones,
  secoes_ativas
)
SELECT
  true,
  '10:00',
  true,
  true,
  '[{"nome": "SuperADM", "telefone": "5524992494030", "padrao": true}]'::jsonb,
  '{"frota": true, "alertas": true, "financeiro": true, "infraestrutura": true, "chips": true, "gateways": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.relatorio_gerencial_config);

-- 3. Invalidação Canônica de Cache PostgREST
NOTIFY pgrst, 'reload schema';
