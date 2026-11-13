-- =============================================================================
-- HUNTER — CORREÇÃO CANÔNICA DE EXCLUSÃO DE USUÁRIO EM CASCATA COMPLETA
-- PROTOCOLO: HUNTER-GUARDIAN / DJR-NEW
-- =============================================================================
-- Causa Raiz: Ao excluir um usuário vinculado como cliente ou instalador,
-- restrições de Foreign Key (RESTRICT em veiculos e NOT NULL em instalador_id)
-- abortavam a transação com código 23503 / 23502.
-- Esta migration garante a limpeza atômica em ordem canônica estrita.
-- =============================================================================

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
    -- 1.1 Remove atendimentos e instalações do cliente
    DELETE FROM public.instalacoes_historico_atendimentos
    WHERE instalacao_id IN (SELECT id FROM public.instalacoes WHERE cliente_id = v_cliente_id);

    DELETE FROM public.instalacoes WHERE cliente_id = v_cliente_id;

    -- 1.2 Remove rotas, histórico e telemetria de todos os veículos do cliente
    DELETE FROM public.rotas_monitoradas
    WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    DELETE FROM public.posicoes_historico
    WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    DELETE FROM public.alertas
    WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    DELETE FROM public.manutencoes
    WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    DELETE FROM public.geofence_veiculos
    WHERE veiculo_id IN (SELECT id FROM public.veiculos WHERE cliente_id = v_cliente_id);

    -- 1.3 Remove os veículos vinculados
    DELETE FROM public.veiculos WHERE cliente_id = v_cliente_id;

    -- 1.4 Remove mensalidades, termos, contratos e trajetos do cliente
    DELETE FROM public.mensalidades WHERE cliente_id = v_cliente_id;
    DELETE FROM public.termos_adesao WHERE cliente_id = v_cliente_id;
    DELETE FROM public.contratos_adesao WHERE cliente_id = v_cliente_id;
    DELETE FROM public.trajetos_salvos WHERE cliente_id = v_cliente_id;

    -- 1.5 Remove o cadastro do cliente
    DELETE FROM public.clientes WHERE id = v_cliente_id;
  END IF;

  -- 2. Se for instalador em instalações técnicas, transfere para a governança do SuperADM
  UPDATE public.instalacoes
  SET instalador_id = v_superadm_id
  WHERE instalador_id = p_user_id;

  UPDATE public.instalacoes_historico_atendimentos
  SET instalador_id = v_superadm_id
  WHERE instalador_id = p_user_id;

  -- 3. Remove acessos a módulos, papéis, notificações push e perímetros
  DELETE FROM public.user_module_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.user_push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.perimetros_seguranca WHERE user_id = p_user_id;

  -- 4. Remove o perfil
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 5. Remove do auth.users
  DELETE FROM auth.users WHERE id = p_user_id;

  -- 6. Log de auditoria
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

GRANT EXECUTE ON FUNCTION public.admin_excluir_usuario(UUID) TO authenticated;
