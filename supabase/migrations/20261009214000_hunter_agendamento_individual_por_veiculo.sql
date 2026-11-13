-- Migration para garantir agendamento individual e isolado por veículo/ordem de instalação
-- Impede que o agendamento de 1 veículo sobrescreva outros veículos do mesmo cliente

CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento_instalacao(
  p_instalacao_id UUID,
  p_data DATE,
  p_hora TEXT
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
  v_placa TEXT;
BEGIN
  -- 1. Resgatar instalação alvo
  SELECT instalador_id, cliente_id, placa INTO v_instalador_id, v_cliente_id, v_placa
  FROM public.instalacoes
  WHERE id = p_instalacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalação não encontrada.';
  END IF;

  -- Se v_instalador_id estiver nulo, atribuir ao chamador
  IF v_instalador_id IS NULL THEN
    v_instalador_id := v_caller_id;
    UPDATE public.instalacoes SET instalador_id = v_caller_id WHERE id = p_instalacao_id;
  END IF;

  -- 2. Permissão: apenas instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuído ou administrador podem agendar esta instalação.';
  END IF;

  -- 3. Validações
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento é obrigatória.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horário do agendamento é obrigatório.';
  END IF;

  -- 4. Atualizar ESTRITAMENTE a ordem da instalação do veículo especificado
  UPDATE public.instalacoes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      updated_at = now()
  WHERE id = p_instalacao_id;

  -- 5. Atualizar agendamento do cliente como referência geral sem afetar outras instalações
  IF v_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET data_agendamento = p_data,
        hora_agendamento = trim(p_hora),
        status_agendamento = 'agendado',
        updated_at = now()
    WHERE id = v_cliente_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Agendamento do veículo ' || coalesce(v_placa, '') || ' confirmado para ' || to_char(p_data, 'DD/MM/YYYY') || ' às ' || trim(p_hora) || '.',
    'instalacao_id', p_instalacao_id,
    'data', p_data,
    'hora', trim(p_hora)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento_instalacao TO authenticated;

CREATE OR REPLACE FUNCTION public.instalador_definir_agendamento(
  p_cliente_id UUID,
  p_data DATE,
  p_hora TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_instalador_id UUID;
  v_cliente_nome TEXT;
  v_inst_alvo_id UUID;
BEGIN
  -- 1. Obter dados do cliente
  SELECT instalador_id, nome_razao_social INTO v_instalador_id, v_cliente_nome
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  IF v_instalador_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.instalacoes 
      WHERE cliente_id = p_cliente_id AND instalador_id = v_caller_id AND status != 'concluida'
    ) THEN
      v_instalador_id := v_caller_id;
      UPDATE public.clientes SET instalador_id = v_caller_id WHERE id = p_cliente_id;
    END IF;
  END IF;

  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuído ou administrador podem agendar este atendimento.';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento é obrigatória.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horário do agendamento é obrigatório.';
  END IF;

  -- Atualizar agendamento no cliente
  UPDATE public.clientes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
  WHERE id = p_cliente_id;

  -- Localizar a primeira instalação que ainda NÃO foi agendada para não sobrescrever em bloco
  SELECT id INTO v_inst_alvo_id
  FROM public.instalacoes
  WHERE cliente_id = p_cliente_id AND status != 'concluida' AND data_agendamento IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  -- Se não encontrou nenhuma sem agendamento, pega a primeira pendente
  IF v_inst_alvo_id IS NULL THEN
    SELECT id INTO v_inst_alvo_id
    FROM public.instalacoes
    WHERE cliente_id = p_cliente_id AND status != 'concluida'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_inst_alvo_id IS NOT NULL THEN
    UPDATE public.instalacoes
    SET data_agendamento = p_data,
        hora_agendamento = trim(p_hora),
        updated_at = now()
    WHERE id = v_inst_alvo_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Agendamento confirmado para o cliente ' || v_cliente_nome || ' em ' || to_char(p_data, 'DD/MM/YYYY') || ' às ' || trim(p_hora) || '.',
    'cliente_id', p_cliente_id,
    'data', p_data,
    'hora', trim(p_hora),
    'instalacao_id', v_inst_alvo_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento TO authenticated;

-- Invalidação canônica de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';
