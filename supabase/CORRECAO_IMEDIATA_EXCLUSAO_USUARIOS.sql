-- =============================================================================
-- GD RASTREAMENTO — CORREÇÃO DO TRIGGER, IS_ADM E RPC DE EXCLUSÃO DE USUÁRIOS
-- Execução definitiva via Management API do Supabase
-- =============================================================================

-- 1. Atualiza a função is_adm para reconhecer chamadas administrativas de service_role e postgres
CREATE OR REPLACE FUNCTION public.is_adm()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_is_adm BOOLEAN := FALSE;
BEGIN
  -- Permite service_role e superuser do banco
  IF (auth.jwt() ->> 'role') = 'service_role' OR current_user IN ('service_role', 'postgres') THEN
    RETURN TRUE;
  END IF;

  -- Permite SuperADM imutável
  IF (auth.jwt() ->> 'email') = 'novaes@adm.28bpm.local' THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'adm') AND ativo = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('superadmin', 'adm')
  ) INTO v_is_adm;

  RETURN COALESCE(v_is_adm, FALSE);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.is_adm() TO authenticated, service_role, anon;

-- 2. Corrige o trigger do SuperADM para retornar OLD no DELETE (evita abortar silenciosamente)
CREATE OR REPLACE FUNCTION public.bloquear_mutacao_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.email = 'novaes@adm.28bpm.local' THEN
    IF (TG_OP = 'DELETE') THEN
      RAISE EXCEPTION 'A conta SuperADM e imutavel e nao pode ser excluida.';
    ELSIF (TG_OP = 'UPDATE') THEN
      IF NEW.email <> OLD.email OR NEW.role <> 'superadmin' OR NEW.ativo = FALSE THEN
        RAISE EXCEPTION 'A conta SuperADM nao pode ter seu email, role ou status alterados.';
      END IF;
    END IF;
  END IF;

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

-- 3. Atualiza a RPC de exclusão com cascata completa em todas as tabelas com integridade estrita
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
  v_superadm_id UUID := '51b59d60-5b08-47a2-b3d5-805f32f56ffc';
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

  -- Blindagem inegociável da conta SuperADM
  IF LOWER(v_user_email) = 'novaes@adm.28bpm.local' THEN
    RAISE EXCEPTION 'A conta SuperADM e imutavel e blindada contra exclusao.';
  END IF;

  -- 1. Se o usuário for um Cliente (possui registro na tabela clientes)
  SELECT id INTO v_cliente_id FROM public.clientes WHERE user_id = p_user_id;
  IF v_cliente_id IS NOT NULL THEN
    -- 1.1 Desvincula transações financeiras e movimentações de estoque vinculadas aos veículos ou cliente
    UPDATE public.transacoes_financeiras SET cliente_id = NULL WHERE cliente_id = v_cliente_id;
    UPDATE public.estoque_movimentacoes SET veiculo_id = NULL WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    -- 1.2 Remove atendimentos e instalações técnicas do cliente
    DELETE FROM public.instalacoes_historico_atendimentos WHERE instalacao_id IN (SELECT id FROM public.instalacoes WHERE cliente_id = v_cliente_id);
    DELETE FROM public.instalacoes WHERE cliente_id = v_cliente_id;

    -- 1.3 Remove dados operacionais dos veículos do cliente
    DELETE FROM public.notificacoes_configuracoes WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);
    DELETE FROM public.eventos_veiculo WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.telemetria_posicoes WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);
    DELETE FROM public.viagens_trajetos WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);
    DELETE FROM public.alertas_seguranca WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.planos_manutencao_preventiva WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);
    DELETE FROM public.agendamentos_manutencao WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.areas_seguras WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.horarios_utilizacao WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.trajetos_salvos WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.regras_veiculo WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.rotas_monitoradas WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.compartilhamentos_temporarios WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;
    DELETE FROM public.veiculo_convidados WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id) OR cliente_id = v_cliente_id;

    -- 1.4 Remove atendimentos de SAC e mensalidades
    DELETE FROM public.atendimentos WHERE cliente_id = v_cliente_id;
    DELETE FROM public.mensalidades WHERE cliente_id = v_cliente_id;

    -- 1.5 Remove os veículos vinculados
    DELETE FROM public.veiculos WHERE cliente_id = v_cliente_id;

    -- 1.6 Remove o cadastro do cliente
    DELETE FROM public.clientes WHERE id = v_cliente_id;
  END IF;

  -- 2. Se for instalador em instalações técnicas, transfere para a governança do SuperADM
  UPDATE public.instalacoes
  SET instalador_id = v_superadm_id
  WHERE instalador_id = p_user_id;

  UPDATE public.instalacoes_historico_atendimentos
  SET instalador_id = v_superadm_id
  WHERE instalador_id = p_user_id;

  -- 2.1 Desvincula de clientes, movimentações de estoque e financeiro onde foi instalador ou criador
  UPDATE public.clientes SET instalador_id = NULL WHERE instalador_id = p_user_id;
  UPDATE public.transacoes_financeiras SET instalador_id = NULL WHERE instalador_id = p_user_id;
  UPDATE public.estoque_movimentacoes SET instalador_id = NULL WHERE instalador_id = p_user_id;
  UPDATE public.estoque_movimentacoes SET created_by = NULL WHERE created_by = p_user_id;

  -- 2.2 Desvincula de atendimentos e alertas onde o usuário atuou
  UPDATE public.atendimentos SET aberto_por = NULL WHERE aberto_por = p_user_id;
  UPDATE public.atendimentos SET finalizado_por = NULL WHERE finalizado_por = p_user_id;
  UPDATE public.alertas_seguranca SET reconhecido_por = NULL WHERE reconhecido_por = p_user_id;
  DELETE FROM public.compartilhamentos_temporarios WHERE criado_por = p_user_id;
  DELETE FROM public.veiculo_convidados WHERE convidado_user_id = p_user_id;
  DELETE FROM public.trajetos_salvos WHERE user_id = p_user_id;

  -- 3. Remove acessos a módulos, papéis, configurações de notificação e dispositivos autorizados
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.notificacoes_configuracoes WHERE user_id = p_user_id;
  DELETE FROM public.dispositivos_autorizados WHERE user_id = p_user_id;

  -- 4. Anula referências em logs de sistema para permitir deleção limpa
  UPDATE public.system_login_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.system_activity_logs SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.system_activity_logs SET usuario_id = NULL WHERE usuario_id = p_user_id;

  -- 5. Remove o perfil
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 6. Remove do auth.users
  DELETE FROM auth.users WHERE id = p_user_id;

  -- 7. Log de auditoria da ação
  INSERT INTO public.system_activity_logs (user_id, usuario_id, acao, detalhe)
  VALUES (
    COALESCE(v_caller_id, v_superadm_id),
    COALESCE(v_caller_id, v_superadm_id),
    'EXCLUSAO_USUARIO',
    'Usuario excluido com sucesso: ' || COALESCE(v_nome, '') || ' (' || v_user_email || ')'
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Usuario ' || v_user_email || ' excluido com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_excluir_usuario(UUID) TO authenticated, service_role;

-- 4. Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
