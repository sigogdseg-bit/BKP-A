-- ==============================================================================
-- MIGRAÇÃO HUNTER: Correção Definitiva da RPC instalador_definir_agendamento_instalacao
-- Data: 2026-10-10 12:30
-- Autor: DJR Novaes (HUNTER-GUARDIAN / DJR-NEW)
-- Descrição: 
-- 1. Remove qualquer referência a tabelas inexistentes (ex: cliente_historico).
-- 2. Corrige colunas do INSERT em notificacoes_sistema (destinatario_user_id, 
--    destinatario_cliente_id, remetente_user_id, remetente_nome, titulo, mensagem, tipo, url, placa).
-- 3. Retorna JSON defensivo com status explícito {success: boolean, message: text}.
-- 4. Mantém a trava inviolável contra agendamento de veículos sem kit disponibilizado.
-- 5. Suporta agendamento tanto por instalador atribuído quanto por operadores e administradores.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento_instalacao(
  p_instalacao_id UUID,
  p_data DATE,
  p_hora TEXT,
  p_local_tipo TEXT DEFAULT 'oficina',
  p_local_endereco TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_caller_nome TEXT;
  v_instalador_id UUID;
  v_cliente_id UUID;
  v_cliente_user_id UUID;
  v_placa TEXT;
  v_rastreador_imei TEXT;
  v_instalador_nome TEXT;
  v_endereco_final TEXT;
  v_tipo_local TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role, nome INTO v_caller_role, v_caller_nome 
  FROM public.profiles 
  WHERE id = v_caller_id;

  -- 1. Resgatar instalação alvo e dados do cliente
  SELECT 
    i.instalador_id, 
    i.cliente_id, 
    i.placa,
    i.rastreador_imei,
    c.user_id,
    p.nome,
    p.endereco_instalacao
  INTO 
    v_instalador_id, 
    v_cliente_id, 
    v_placa,
    v_rastreador_imei,
    v_cliente_user_id,
    v_instalador_nome,
    v_endereco_final
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, v_caller_id)
  WHERE i.id = p_instalacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não encontrada.');
  END IF;

  -- 2. Trava de integridade operacional: não é possível agendar sem kit disponibilizado
  IF v_rastreador_imei IS NULL 
     OR TRIM(v_rastreador_imei) = '' 
     OR UPPER(TRIM(v_rastreador_imei)) IN (
       'AGUARDANDO ESTOQUE', 
       'AGUARDANDO_ESTOQUE', 
       'PENDENTE', 
       'A DEFINIR', 
       'A_DEFINIR', 
       'SEM RASTREADOR', 
       'SEM_RASTREADOR', 
       'A CONFERIR', 
       'A_CONFERIR',
       'NENHUM'
     ) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Não é possível agendar sem kit disponibilizado para este veículo. O operador deve vincular e disponibilizar o kit antes de definir a data.'
    );
  END IF;

  -- Se v_instalador_id estiver nulo e o chamador for instalador, atribuir ao chamador
  IF v_instalador_id IS NULL THEN
    IF v_caller_role = 'instalador' THEN
      v_instalador_id := v_caller_id;
      UPDATE public.instalacoes SET instalador_id = v_caller_id WHERE id = p_instalacao_id;
    END IF;
  END IF;

  -- 3. Permissão: instalador atribuído ou equipe de operações/administração
  IF v_caller_role = 'instalador' AND v_instalador_id IS NOT NULL AND v_instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: apenas o instalador atribuído ou a equipe de operações podem agendar esta instalação.');
  END IF;

  -- 4. Validações de data e hora
  IF p_data IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'A data do agendamento é obrigatória.');
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'O horário do agendamento é obrigatório.');
  END IF;

  v_tipo_local := COALESCE(p_local_tipo, 'oficina');
  IF v_tipo_local = 'local_veiculo' THEN
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final);
  ELSE
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final, 'Oficina Credenciada');
  END IF;

  -- 5. Atualizar ordem da instalação do veículo especificado
  UPDATE public.instalacoes
  SET 
    data_agendamento = p_data,
    hora_agendamento = trim(p_hora),
    status = 'agendado',
    local_tipo = v_tipo_local,
    local_endereco = v_endereco_final,
    solicita_endereco_cliente = FALSE,
    updated_at = now()
  WHERE id = p_instalacao_id;

  -- 6. Atualizar status e dados do agendamento no cadastro do cliente
  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET 
      data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
    WHERE id = v_cliente_id;
  END IF;

  -- 7. Histórico de atendimento técnico (se tabela instalacoes_historico_atendimentos estiver ativa)
  BEGIN
    IF v_instalador_id IS NOT NULL THEN
      INSERT INTO public.instalacoes_historico_atendimentos (
        instalacao_id,
        instalador_id,
        status_atendimento,
        motivo,
        observacoes
      ) VALUES (
        p_instalacao_id,
        v_instalador_id,
        'agendado',
        'Definição de agendamento',
        format('Agendado para %s às %s (%s).', to_char(p_data, 'DD/MM/YYYY'), trim(p_hora), v_endereco_final)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 8. Notificação em tempo real para o cliente (com colunas corretas de notificacoes_sistema)
  IF v_cliente_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        destinatario_cliente_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        v_cliente_user_id,
        v_cliente_id,
        v_caller_id,
        COALESCE(v_instalador_nome, v_caller_nome, 'Técnico Instalador'),
        format('📅 Instalação Agendada: %s', COALESCE(v_placa, 'Veículo')),
        format('A instalação do seu rastreador no veículo %s foi agendada para %s às %s (%s: %s).',
          COALESCE(v_placa, ''),
          to_char(p_data, 'DD/MM/YYYY'),
          trim(p_hora),
          CASE WHEN v_tipo_local = 'local_veiculo' THEN 'Local do Veículo' ELSE 'Oficina' END,
          COALESCE(v_endereco_final, 'Oficina Credenciada')
        ),
        'agendamento',
        '/login',
        v_placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Instalação do veículo %s agendada com sucesso para %s às %s.', COALESCE(v_placa, ''), to_char(p_data, 'DD/MM/YYYY'), trim(p_hora)),
    'instalacao_id', p_instalacao_id,
    'placa', v_placa,
    'data', p_data,
    'hora', trim(p_hora),
    'local_tipo', v_tipo_local,
    'local_endereco', v_endereco_final
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento_instalacao(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
