-- =============================================================================
-- HUNTER — CORREÇÃO CRÍTICA DO TRIGGER DE BLINDAGEM E EXCLUSÃO DE USUÁRIOS
-- PROTOCOLO: HUNTER-GUARDIAN / DJR-NEW
-- =============================================================================
-- Causa Raiz: Em PostgreSQL, funções de trigger BEFORE DELETE que retornam NULL 
-- (ou RETURN NEW, já que NEW é NULL em operações DELETE) abortam silenciosamente
-- a exclusão da linha sem emitir erro. A correção exige retornar OLD no evento DELETE.
-- =============================================================================

-- 1. Correção do Trigger de Blindagem do SuperADM
CREATE OR REPLACE FUNCTION public.bloquear_mutacao_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.email = 'novaes@adm.28bpm.local' THEN
    IF (TG_OP = 'DELETE') THEN
      RAISE EXCEPTION 'A conta SuperADM mestre e imutavel e nao pode ser excluida.';
    ELSIF (TG_OP = 'UPDATE') THEN
      IF NEW.email <> OLD.email OR NEW.role <> 'superadmin' OR NEW.ativo = FALSE THEN
        RAISE EXCEPTION 'A conta SuperADM mestre nao pode ter seu email, role ou status alterados.';
      END IF;
    END IF;
  END IF;

  -- Em BEFORE DELETE no Postgres, DEVE-SE retornar OLD para permitir a exclusão da linha.
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacao_superadmin ON public.profiles;
CREATE TRIGGER trg_bloquear_mutacao_superadmin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_superadmin();

-- 2. Atualização Atômica da RPC de Exclusão de Usuários (admin_excluir_usuario)
CREATE OR REPLACE FUNCTION public.admin_excluir_usuario(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_email TEXT;
  v_nome TEXT;
  v_cliente_id UUID;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuarios.';
  END IF;

  SELECT email, nome INTO v_user_email, v_nome FROM public.profiles WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  END IF;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Usuario nao encontrado para exclusao.'
    );
  END IF;

  -- Blindagem inegociável do SuperADM
  IF LOWER(v_user_email) = 'novaes@adm.28bpm.local' THEN
    RAISE EXCEPTION 'A conta SuperADM e imutavel e blindada contra exclusao.';
  END IF;

  -- Desvincula como instalador em instalações para preservar o histórico sem travar FK
  UPDATE public.instalacoes SET instalador_id = NULL WHERE instalador_id = p_user_id;

  -- Remove de clientes se existir, preservando histórico veicular
  SELECT id INTO v_cliente_id FROM public.clientes WHERE user_id = p_user_id;
  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.instalacoes SET cliente_id = NULL WHERE cliente_id = v_cliente_id;
    UPDATE public.veiculos SET cliente_id = NULL WHERE cliente_id = v_cliente_id;
    DELETE FROM public.clientes WHERE id = v_cliente_id;
  END IF;

  -- Remove acessos a módulos e papéis
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  -- Remove o perfil e a conta de autenticação
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  -- Log de auditoria
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    v_caller_id,
    v_caller_id,
    'EXCLUSAO_USUARIO',
    'Usuario excluido com sucesso: ' || COALESCE(v_nome, '') || ' (' || v_user_email || ')'
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario ' || v_user_email || ' excluido com sucesso.'
  );
END;
$$;
