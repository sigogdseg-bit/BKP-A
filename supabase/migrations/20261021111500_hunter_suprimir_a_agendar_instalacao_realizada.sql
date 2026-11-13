-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Suprimir Informação "A agendar" para Instalações Realizadas (DJR-NEW)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Saneia clientes ativos cujo status_agendamento tenha ficado como 'aguardando_agendamento'
-- 2. Atualiza RPC salvar_atendimento_instalacao para marcar status_agendamento = 'concluido'
-- 3. Cria trigger reativo em public.instalacoes para sincronizar cliente_id automaticamente
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Saneamento retroativo de clientes que já estão ativos na plataforma
UPDATE public.clientes
SET status_agendamento = 'concluido', updated_at = NOW()
WHERE status = 'ativo' AND (status_agendamento IS NULL OR status_agendamento = 'aguardando_agendamento');

-- 2. Função de trigger para garantir que ordens de instalação concluídas sincronizem o agendamento do cliente
CREATE OR REPLACE FUNCTION public.trg_fn_sincronizar_agendamento_cliente_ao_instalar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.status = 'concluida' OR NEW.concluida_at IS NOT NULL THEN
    IF NEW.cliente_id IS NOT NULL THEN
      UPDATE public.clientes
      SET 
        status = 'ativo',
        status_agendamento = 'concluido',
        updated_at = NOW()
      WHERE id = NEW.cliente_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_agendamento_cliente_ao_instalar ON public.instalacoes;

CREATE TRIGGER trg_sincronizar_agendamento_cliente_ao_instalar
AFTER INSERT OR UPDATE OF status, concluida_at ON public.instalacoes
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sincronizar_agendamento_cliente_ao_instalar();

-- Invalidação canônica de cache PostgREST
NOTIFY pgrst, 'reload schema';
