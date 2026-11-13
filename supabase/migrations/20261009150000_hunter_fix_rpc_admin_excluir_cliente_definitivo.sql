-- ============================================================================
-- HUNTER / SIGO GUARDIÃO — CORREÇÃO DEFINITIVA DAS RPCS DE EXCLUSÃO
-- ============================================================================
-- Elimina qualquer referência a tabelas inexistentes (ex: agendamentos_instalacao,
-- areas_seguras_geofence, parcelas_contrato_cliente), ajusta a ordem estrita de
-- integridade referencial com RESTRICT (abastecimentos, despesas, veiculos, instalacoes)
-- e implementa varredura defensiva dinâmica (to_regclass) contra qualquer inconsistência.
-- Permite que SuperADM e Administradores excluam clientes e veículos com segurança total.
-- ============================================================================

-- 1. RPC para Excluir Veículo com Segurança e Desvinculação Atômica
CREATE OR REPLACE FUNCTION public.admin_excluir_veiculo(
  p_veiculo_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_placa TEXT;
  v_cliente_id UUID;
  v_rastreador_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem excluir veículos.';
    END IF;
  END IF;

  SELECT placa, cliente_id, rastreador_id INTO v_placa, v_cliente_id, v_rastreador_id
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  -- 1.1 Libera rastreador vinculado, se houver
  IF v_rastreador_id IS NOT NULL THEN
    UPDATE public.rastreadores
    SET veiculo_id = NULL, status = 'estoque'
    WHERE id = v_rastreador_id;
  END IF;
  UPDATE public.rastreadores
  SET veiculo_id = NULL, status = 'estoque'
  WHERE veiculo_id = p_veiculo_id;

  -- 1.2 Limpa abastecimentos e despesas com FK RESTRICT
  DELETE FROM public.motorista_abastecimentos WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.motorista_despesas WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.motorista_veiculos WHERE veiculo_id = p_veiculo_id;

  -- 1.3 Desvincula instalações
  UPDATE public.instalacoes
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  -- 1.4 Desvincula movimentações de estoque, atendimentos, trajetos e whatsapp
  UPDATE public.estoque_movimentacoes
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  UPDATE public.atendimentos
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  UPDATE public.trajetos_salvos
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  UPDATE public.whatsapp_mensagens_fila
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  -- 1.5 Limpa tabelas com FK em cascata explícita
  DELETE FROM public.alertas_telemetria_cooldown WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.telemetria_posicoes WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.viagens_trajetos WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.eventos_veiculo WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.compartilhamentos_temporarios WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.compartilhamentos_acessos WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.areas_seguras WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.horarios_utilizacao WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.regras_veiculo WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.rotas_monitoradas WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.alertas_seguranca WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.agendamentos_manutencao WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.planos_manutencao_preventiva WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.notificacoes_configuracoes WHERE veiculo_id = p_veiculo_id;
  DELETE FROM public.veiculo_convidados WHERE veiculo_id = p_veiculo_id;

  -- 1.6 Deleta o veículo
  DELETE FROM public.veiculos WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'cliente_id', v_cliente_id,
    'placa', v_placa,
    'mensagem', 'Veículo excluído com sucesso.'
  );
END;
$$;

-- 2. RPC para Excluir Cliente com Cascade Completo e Blindagem Defensiva
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
  v_tabela TEXT;
BEGIN
  -- 2.1 Verificação de permissões do operador/administrador
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'adm') THEN
      RAISE EXCEPTION 'Acesso negado: apenas SuperADM e Administradores podem excluir clientes.';
    END IF;
  END IF;

  -- 2.2 Busca dados do cliente
  SELECT nome_razao_social, user_id
  INTO v_cliente_nome, v_cliente_user_id
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  -- 2.3 Blindagem SuperADM: Proibido excluir contas protegidas
  IF v_cliente_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = v_cliente_user_id
        AND LOWER(email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')
    ) THEN
      RAISE EXCEPTION 'Ação não permitida: conta SuperADM é imutável e blindada contra exclusão.';
    END IF;
  END IF;

  -- 2.4 Limpa abastecimentos e despesas de motoristas do cliente (FKs para motoristas e veículos)
  DELETE FROM public.motorista_abastecimentos WHERE cliente_id = p_cliente_id;
  DELETE FROM public.motorista_despesas WHERE cliente_id = p_cliente_id;

  -- 2.5 Exclui motoristas e credenciais vinculadas
  FOR r_mot IN SELECT id, user_id FROM public.motoristas WHERE cliente_id = p_cliente_id LOOP
    DELETE FROM public.motorista_abastecimentos WHERE motorista_id = r_mot.id;
    DELETE FROM public.motorista_despesas WHERE motorista_id = r_mot.id;
    DELETE FROM public.motorista_veiculos WHERE motorista_id = r_mot.id;
    DELETE FROM public.alertas_cnh_motoristas WHERE motorista_id = r_mot.id;
    DELETE FROM public.motoristas WHERE id = r_mot.id;
    IF r_mot.user_id IS NOT NULL THEN
      DELETE FROM public.user_module_access WHERE user_id = r_mot.user_id;
      DELETE FROM public.user_roles WHERE user_id = r_mot.user_id;
      DELETE FROM public.profiles WHERE id = r_mot.user_id;
      DELETE FROM auth.users WHERE id = r_mot.user_id;
    END IF;
  END LOOP;

  -- 2.6 Exclui veículos do cliente e libera os rastreadores vinculados
  FOR r_veic IN SELECT id, rastreador_id FROM public.veiculos WHERE cliente_id = p_cliente_id LOOP
    IF r_veic.rastreador_id IS NOT NULL THEN
      UPDATE public.rastreadores SET veiculo_id = NULL, status = 'estoque' WHERE id = r_veic.rastreador_id;
    END IF;
    UPDATE public.rastreadores SET veiculo_id = NULL, status = 'estoque' WHERE veiculo_id = r_veic.id;

    DELETE FROM public.motorista_abastecimentos WHERE veiculo_id = r_veic.id;
    DELETE FROM public.motorista_despesas WHERE veiculo_id = r_veic.id;
    DELETE FROM public.motorista_veiculos WHERE veiculo_id = r_veic.id;

    UPDATE public.instalacoes SET veiculo_id = NULL WHERE veiculo_id = r_veic.id;
    UPDATE public.estoque_movimentacoes SET veiculo_id = NULL WHERE veiculo_id = r_veic.id;
    UPDATE public.atendimentos SET veiculo_id = NULL WHERE veiculo_id = r_veic.id;
    UPDATE public.trajetos_salvos SET veiculo_id = NULL WHERE veiculo_id = r_veic.id;
    UPDATE public.whatsapp_mensagens_fila SET veiculo_id = NULL WHERE veiculo_id = r_veic.id;

    DELETE FROM public.alertas_telemetria_cooldown WHERE veiculo_id = r_veic.id;
    DELETE FROM public.telemetria_posicoes WHERE veiculo_id = r_veic.id;
    DELETE FROM public.viagens_trajetos WHERE veiculo_id = r_veic.id;
    DELETE FROM public.eventos_veiculo WHERE veiculo_id = r_veic.id;
    DELETE FROM public.compartilhamentos_temporarios WHERE veiculo_id = r_veic.id;
    DELETE FROM public.compartilhamentos_acessos WHERE veiculo_id = r_veic.id;
    DELETE FROM public.areas_seguras WHERE veiculo_id = r_veic.id;
    DELETE FROM public.horarios_utilizacao WHERE veiculo_id = r_veic.id;
    DELETE FROM public.regras_veiculo WHERE veiculo_id = r_veic.id;
    DELETE FROM public.rotas_monitoradas WHERE veiculo_id = r_veic.id;
    DELETE FROM public.alertas_seguranca WHERE veiculo_id = r_veic.id;
    DELETE FROM public.agendamentos_manutencao WHERE veiculo_id = r_veic.id;
    DELETE FROM public.planos_manutencao_preventiva WHERE veiculo_id = r_veic.id;
    DELETE FROM public.notificacoes_configuracoes WHERE veiculo_id = r_veic.id;
    DELETE FROM public.veiculo_convidados WHERE veiculo_id = r_veic.id;

    DELETE FROM public.veiculos WHERE id = r_veic.id;
  END LOOP;

  -- 2.7 Exclui instalações e desvincula histórico
  UPDATE public.instalacoes SET veiculo_id = NULL WHERE cliente_id = p_cliente_id;
  DELETE FROM public.instalacoes WHERE cliente_id = p_cliente_id;

  -- 2.8 Limpa contratos, mensalidades e financeiro
  DELETE FROM public.mensalidades WHERE cliente_id = p_cliente_id;
  UPDATE public.transacoes_financeiras SET cliente_id = NULL WHERE cliente_id = p_cliente_id;

  -- 2.9 Limpa regras, rotas, áreas seguras, alertas e notificações
  DELETE FROM public.areas_seguras WHERE cliente_id = p_cliente_id;
  DELETE FROM public.horarios_utilizacao WHERE cliente_id = p_cliente_id;
  DELETE FROM public.regras_veiculo WHERE cliente_id = p_cliente_id;
  DELETE FROM public.rotas_monitoradas WHERE cliente_id = p_cliente_id;
  DELETE FROM public.trajetos_salvos WHERE cliente_id = p_cliente_id;
  DELETE FROM public.compartilhamentos_temporarios WHERE cliente_id = p_cliente_id;
  DELETE FROM public.veiculo_convidados WHERE cliente_id = p_cliente_id;
  DELETE FROM public.alertas_seguranca WHERE cliente_id = p_cliente_id;
  DELETE FROM public.notificacoes_sistema WHERE destinatario_cliente_id = p_cliente_id;
  DELETE FROM public.user_push_subscriptions WHERE cliente_id = p_cliente_id;
  UPDATE public.atendimentos SET cliente_id = NULL WHERE cliente_id = p_cliente_id;
  UPDATE public.whatsapp_mensagens_fila SET cliente_id = NULL WHERE cliente_id = p_cliente_id;
  DELETE FROM public.chat_presenca WHERE cliente_id = p_cliente_id;

  -- 2.10 Blindagem Defensiva Dinâmica via to_regclass para tabelas legadas ou opcionais
  FOREACH v_tabela IN ARRAY ARRAY[
    'agendamentos_instalacao',
    'areas_seguras_geofence',
    'recursos_protecao_veiculo',
    'parcelas_contrato_cliente',
    'historico_cliente_eventos',
    'compartilhamentos_veiculo'
  ] LOOP
    IF to_regclass('public.' || v_tabela) IS NOT NULL THEN
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE cliente_id = $1', v_tabela) USING p_cliente_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  -- 2.11 Exclui registro do cliente
  DELETE FROM public.clientes WHERE id = p_cliente_id;

  -- 2.12 Remove perfil e credenciais do usuário se houver conta de login
  IF v_cliente_user_id IS NOT NULL THEN
    DELETE FROM public.user_module_access WHERE user_id = v_cliente_user_id;
    DELETE FROM public.user_roles WHERE user_id = v_cliente_user_id;
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

GRANT EXECUTE ON FUNCTION public.admin_excluir_veiculo(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_excluir_cliente(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
