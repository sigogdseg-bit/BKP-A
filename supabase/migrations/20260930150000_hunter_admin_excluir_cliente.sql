-- ============================================================================
-- HUNTER / GD RASTREAMENTO — RPC ADMIN_EXCLUIR_CLIENTE COM CASCADE COMPLETO
-- ============================================================================
-- Versão Alvo: 1.11.0.17
-- Permite que SuperADM e Administradores excluam clientes de forma segura e atômica,
-- removendo em cascata todos os vínculos dependentes (veículos, agendamentos, instalações,
-- motoristas, parcelas, proteções, histórico e usuário de autenticação correspondente),
-- respeitando a blindagem das contas SuperADM.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_excluir_cliente(
  p_cliente_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_cliente_user_id UUID;
  v_cliente_nome TEXT;
  r_veic RECORD;
  r_mot RECORD;
BEGIN
  -- 1. Verificação de permissões do operador/administrador
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'adm') THEN
      RAISE EXCEPTION 'Acesso negado: apenas SuperADM e Administradores podem excluir clientes.';
    END IF;
  END IF;

  -- 2. Busca dados do cliente
  SELECT nome_razao_social, user_id
  INTO v_cliente_nome, v_cliente_user_id
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  -- 3. Blindagem SuperADM: Proibido excluir contas protegidas
  IF v_cliente_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = v_cliente_user_id
        AND LOWER(email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
    ) THEN
      RAISE EXCEPTION 'Ação não permitida: conta SuperADM é imutável e blindada contra exclusão.';
    END IF;
  END IF;

  -- 4. Exclui veículos do cliente usando a RPC de exclusão de veículo (que desvincula instalações e limpa telemetria)
  FOR r_veic IN SELECT id FROM public.veiculos WHERE cliente_id = p_cliente_id LOOP
    -- Limpa cooldowns de telemetria do veículo
    DELETE FROM public.alertas_telemetria_cooldown WHERE veiculo_id = r_veic.id;
    -- Desvincula e exclui veículo
    PERFORM public.admin_excluir_veiculo(r_veic.id);
  END LOOP;

  -- 5. Exclui agendamentos e desvincula instalações do cliente
  DELETE FROM public.agendamentos_instalacao WHERE cliente_id = p_cliente_id;
  UPDATE public.instalacoes SET cliente_id = NULL WHERE cliente_id = p_cliente_id;
  DELETE FROM public.instalacoes WHERE cliente_id = p_cliente_id;

  -- 6. Exclui motoristas vinculados e suas credenciais de acesso
  FOR r_mot IN SELECT id, user_id FROM public.motoristas WHERE cliente_id = p_cliente_id LOOP
    DELETE FROM public.motorista_veiculos WHERE motorista_id = r_mot.id;
    DELETE FROM public.motoristas WHERE id = r_mot.id;
    IF r_mot.user_id IS NOT NULL THEN
      DELETE FROM public.user_module_access WHERE user_id = r_mot.user_id;
      DELETE FROM public.profiles WHERE id = r_mot.user_id;
      DELETE FROM auth.users WHERE id = r_mot.user_id;
    END IF;
  END LOOP;

  -- 7. Limpa lançamentos do portal do motorista do cliente
  DELETE FROM public.motorista_abastecimentos WHERE cliente_id = p_cliente_id;
  DELETE FROM public.motorista_despesas WHERE cliente_id = p_cliente_id;

  -- 8. Limpa proteções e geofences do cliente
  DELETE FROM public.areas_seguras_geofence WHERE cliente_id = p_cliente_id;
  DELETE FROM public.horarios_utilizacao WHERE cliente_id = p_cliente_id;
  DELETE FROM public.recursos_protecao_veiculo WHERE cliente_id = p_cliente_id;

  -- 9. Limpa contratos, parcelas, financeiro e histórico
  DELETE FROM public.parcelas_contrato_cliente WHERE cliente_id = p_cliente_id;
  UPDATE public.transacoes_financeiras SET cliente_id = NULL WHERE cliente_id = p_cliente_id;
  DELETE FROM public.historico_cliente_eventos WHERE cliente_id = p_cliente_id;
  DELETE FROM public.compartilhamentos_veiculo WHERE cliente_id = p_cliente_id;
  DELETE FROM public.user_push_subscriptions WHERE cliente_id = p_cliente_id;

  -- 10. Limpa alertas e notificações
  DELETE FROM public.alertas_seguranca WHERE cliente_id = p_cliente_id;
  DELETE FROM public.notificacoes_sistema WHERE destinatario_cliente_id = p_cliente_id;

  -- 11. Exclui o registro do cliente
  DELETE FROM public.clientes WHERE id = p_cliente_id;

  -- 12. Se o cliente possuía usuário de acesso em auth.users, remove o perfil e o login
  IF v_cliente_user_id IS NOT NULL THEN
    DELETE FROM public.user_module_access WHERE user_id = v_cliente_user_id;
    DELETE FROM public.profiles WHERE id = v_cliente_user_id;
    DELETE FROM auth.users WHERE id = v_cliente_user_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'cliente_id', p_cliente_id,
    'cliente_nome', v_cliente_nome,
    'mensagem', format('Cliente %s e todos os seus vínculos foram excluídos com sucesso.', v_cliente_nome)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_excluir_cliente(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
