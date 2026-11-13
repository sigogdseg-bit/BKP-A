-- ==============================================================================
-- MIGRAÇÃO HUNTER: Bloqueio Rigoroso de Agendamento Sem Kit Disponibilizado
-- Data: 2026-10-10 11:30
-- Autor: DJR Novaes (HUNTER-GUARDIAN / DJR-NEW)
-- Descrição: Atualiza a RPC instalador_definir_agendamento_instalacao impedindo
--            que qualquer instalação seja agendada sem kit (rastreador/chip)
--            previamente vinculado e disponibilizado pelo operador/almoxarifado.
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
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

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
    RAISE EXCEPTION 'Instalação não encontrada.';
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
    RAISE EXCEPTION 'Não é possível agendar sem kit disponibilizado para este veículo. O operador deve vincular e disponibilizar o kit antes de definir a data.';
  END IF;

  -- Se v_instalador_id estiver nulo, atribuir ao chamador
  IF v_instalador_id IS NULL THEN
    v_instalador_id := v_caller_id;
    UPDATE public.instalacoes SET instalador_id = v_caller_id WHERE id = p_instalacao_id;
  END IF;

  -- 3. Permissão: apenas instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuído ou administrador podem agendar esta instalação.';
  END IF;

  -- 4. Validações de data e hora
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento é obrigatória.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horário do agendamento é obrigatório.';
  END IF;

  v_tipo_local := COALESCE(p_local_tipo, 'oficina');
  IF v_tipo_local = 'local_veiculo' THEN
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final);
  ELSE
    v_endereco_final := COALESCE(TRIM(p_local_endereco), v_endereco_final, 'Oficina Credenciada');
  END IF;

  -- 5. Atualizar ESTRITAMENTE a ordem da instalação do veículo especificado
  UPDATE public.instalacoes
  SET 
    data_agendamento = p_data,
    hora_agendamento = trim(p_hora),
    local_tipo = v_tipo_local,
    local_endereco = v_endereco_final,
    solicita_endereco_cliente = FALSE,
    updated_at = now()
  WHERE id = p_instalacao_id;

  -- 6. Atualizar status e dados do agendamento no cadastro do cliente
  UPDATE public.clientes
  SET 
    data_agendamento = p_data,
    hora_agendamento = trim(p_hora),
    status_agendamento = 'agendado',
    updated_at = now()
  WHERE id = v_cliente_id;

  -- 7. Registrar no histórico com identificador individual do veículo/placa
  INSERT INTO public.cliente_historico (
    cliente_id,
    tipo,
    descricao,
    metadata
  ) VALUES (
    v_cliente_id,
    'agendamento_definido',
    format('Instalação do veículo %s agendada para %s às %s (%s - %s) pelo técnico %s.', 
      COALESCE(v_placa, 'Veículo'),
      to_char(p_data, 'DD/MM/YYYY'), 
      trim(p_hora),
      CASE WHEN v_tipo_local = 'local_veiculo' THEN 'No Local do Veículo' ELSE 'Na Oficina do Instalador' END,
      COALESCE(v_endereco_final, 'Endereço a definir'),
      COALESCE(v_instalador_nome, 'Oficina Credenciada')
    ),
    jsonb_build_object(
      'instalacao_id', p_instalacao_id,
      'placa', v_placa,
      'data', p_data,
      'hora', trim(p_hora),
      'local_tipo', v_tipo_local,
      'local_endereco', v_endereco_final,
      'instalador_id', v_instalador_id,
      'instalador_nome', v_instalador_nome,
      'agendado_por', v_caller_id
    )
  );

  -- 8. Notificação em tempo real para o cliente
  IF v_cliente_user_id IS NOT NULL THEN
    INSERT INTO public.notificacoes_sistema (
      user_id,
      cliente_id,
      titulo,
      mensagem,
      tipo,
      link,
      metadata
    ) VALUES (
      v_cliente_user_id,
      v_cliente_id,
      format('📅 Agendamento Confirmado: %s', COALESCE(v_placa, 'Veículo')),
      format('A instalação do seu rastreador no veículo %s foi agendada para %s às %s (%s: %s).',
        COALESCE(v_placa, ''),
        to_char(p_data, 'DD/MM/YYYY'),
        trim(p_hora),
        CASE WHEN v_tipo_local = 'local_veiculo' THEN 'Local do Veículo' ELSE 'Oficina' END,
        COALESCE(v_endereco_final, 'Oficina Credenciada')
      ),
      'agendamento',
      '/instalacoes',
      jsonb_build_object(
        'instalacao_id', p_instalacao_id,
        'placa', v_placa,
        'data', p_data,
        'hora', trim(p_hora),
        'endereco', v_endereco_final
      )
    );
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
