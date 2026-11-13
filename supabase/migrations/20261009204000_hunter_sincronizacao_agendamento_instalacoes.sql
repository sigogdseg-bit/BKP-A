-- Migration para sincronizar agendamentos de instalacoes e métricas canônicas
-- Garante que instalador_definir_agendamento atualize tanto clientes quanto instalacoes
-- Adiciona instalador_definir_agendamento_instalacao
-- Atualiza instalador_obter_minhas_demandas para incluir colunas de fotos e métricas por veículo/ordem

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
  v_qtd_instalacoes INT;
BEGIN
  -- 1. Obter dados do cliente
  SELECT instalador_id, nome_razao_social INTO v_instalador_id, v_cliente_nome
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- Se v_instalador_id estiver nulo no cliente, mas o chamador tiver ordem em instalacoes:
  IF v_instalador_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.instalacoes 
      WHERE cliente_id = p_cliente_id AND instalador_id = v_caller_id AND status != 'concluida'
    ) THEN
      v_instalador_id := v_caller_id;
      UPDATE public.clientes SET instalador_id = v_caller_id WHERE id = p_cliente_id;
    END IF;
  END IF;

  -- 2. Verificar se o chamador é o instalador atribuído ou administrador
  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuido ou administrador podem agendar este atendimento.';
  END IF;

  -- 3. Validar data e hora
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento e obrigatoria.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horario do agendamento e obrigatorio.';
  END IF;

  -- 4. Atualizar o agendamento no cliente
  UPDATE public.clientes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      status_agendamento = 'agendado',
      updated_at = now()
  WHERE id = p_cliente_id;

  -- 5. Sincronizar em todas as ordens de instalacoes ativas deste cliente
  UPDATE public.instalacoes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      updated_at = now()
  WHERE cliente_id = p_cliente_id AND status != 'concluida';

  GET DIAGNOSTICS v_qtd_instalacoes = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Agendamento confirmado para o cliente ' || v_cliente_nome || ' em ' || to_char(p_data, 'DD/MM/YYYY') || ' as ' || trim(p_hora) || '.',
    'cliente_id', p_cliente_id,
    'data', p_data,
    'hora', trim(p_hora),
    'ordens_atualizadas', v_qtd_instalacoes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento TO authenticated;

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
  SELECT instalador_id, cliente_id, placa INTO v_instalador_id, v_cliente_id, v_placa
  FROM public.instalacoes
  WHERE id = p_instalacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instalacao nao encontrada.';
  END IF;

  IF v_caller_id <> v_instalador_id AND NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o instalador atribuido ou administrador podem agendar esta instalacao.';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'A data do agendamento e obrigatoria.';
  END IF;

  IF p_hora IS NULL OR trim(p_hora) = '' THEN
    RAISE EXCEPTION 'O horario do agendamento e obrigatorio.';
  END IF;

  UPDATE public.instalacoes
  SET data_agendamento = p_data,
      hora_agendamento = trim(p_hora),
      updated_at = now()
  WHERE id = p_instalacao_id;

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
    'message', 'Agendamento da placa ' || v_placa || ' confirmado para ' || to_char(p_data, 'DD/MM/YYYY') || ' as ' || trim(p_hora) || '.',
    'instalacao_id', p_instalacao_id,
    'data', p_data,
    'hora', trim(p_hora)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_definir_agendamento_instalacao TO authenticated;

CREATE OR REPLACE FUNCTION public.instalador_obter_minhas_demandas(
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_alvo_id UUID;
  v_ordens JSONB;
  v_agendamentos JSONB;
  v_resumo JSONB;
  v_total_a_receber NUMERIC(10,2) := 0.00;
  v_total_recebido NUMERIC(10,2) := 0.00;
  v_total_agendados_qtd INT := 0;
  v_total_a_agendar_qtd INT := 0;
  v_valor_previsto_agendados NUMERIC(10,2) := 0.00;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  IF v_role IN ('superadmin', 'adm', 'operador') THEN
    v_alvo_id := COALESCE(p_instalador_id, v_caller_id);
  ELSE
    v_alvo_id := v_caller_id;
  END IF;

  -- 1. Coletar Ordens da tabela public.instalacoes
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'instalador_id', i.instalador_id,
      'instalador_nome', COALESCE(p.nome, 'Instalador'),
      'instalador_chave_pix', p.chave_pix,
      'instalador_valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
      'instalador_valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador,
      'cliente_id', i.cliente_id,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_documento', c.documento,
      'cliente_telefone', c.telefone,
      'cliente_plano', c.plano,
      'cliente_tem_fidelidade', c.tem_fidelidade,
      'cliente_regra_horimetro', c.regra_horimetro,
      'veiculo_id', i.veiculo_id,
      'placa', COALESCE(i.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, 'A DEFINIR'),
      'modelo', COALESCE(i.modelo, 'Veículo do Cliente'),
      'ano', i.ano,
      'cor', i.cor,
      'tipo_veiculo', COALESCE(i.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'horimetro_inicial', COALESCE(i.horimetro_inicial, 0.00),
      'rastreador_id', i.rastreador_id,
      'rastreador_imei', COALESCE(i.rastreador_imei, 'PENDENTE'),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, 'J16 4G'),
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'com_bloqueador', COALESCE(i.com_bloqueador, FALSE),
      'tipo_bloqueador', i.tipo_bloqueador,
      'posicao_instalacao', i.posicao_instalacao,
      'status', i.status,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'valor_instalacao', COALESCE(i.valor_instalacao, 50.00),
      'status_pagamento', COALESCE(i.status_pagamento, 'pendente'),
      'pago_em', i.pago_em,
      'pago_por', i.pago_por,
      'comprovante_pagamento', i.comprovante_pagamento,
      'kit_determinado_em', i.kit_determinado_em,
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, FALSE),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'foto_placa_url', i.foto_placa_url,
      'foto_rastreador_url', i.foto_rastreador_url,
      'foto_local_instalacao_url', i.foto_local_instalacao_url,
      'foto_bloqueador_url', i.foto_bloqueador_url,
      'fotos_instalacao', i.fotos_instalacao,
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id;

  -- 2. Coletar Clientes Agendados ou Aguardando Agendamento
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome_razao_social', c.nome_razao_social,
      'documento', c.documento,
      'telefone', c.telefone,
      'email', c.email,
      'status', c.status,
      'plano', c.plano,
      'tem_fidelidade', c.tem_fidelidade,
      'regra_horimetro', c.regra_horimetro,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', c.instalador_id,
      'instalador', jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'endereco_instalacao', p.endereco_instalacao,
        'valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
        'valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador
      ),
      'veiculos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id, 
          'placa', v.placa, 
          'modelo', v.marca_modelo, 
          'tipo_veiculo', v.tipo_veiculo,
          'horimetro_horas', v.horimetro_horas
        ))
        FROM public.veiculos v
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = c.instalador_id
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Métricas Financeiras e Operacionais Específicas do Instalador (POR VEÍCULO / ORDEM)
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'concluida' AND status_pagamento = 'pendente' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status = 'concluida' AND status_pagamento = 'pago' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status != 'concluida' AND data_agendamento IS NOT NULL THEN valor_instalacao ELSE 0 END), 0.00),
    COUNT(CASE WHEN status != 'concluida' AND data_agendamento IS NOT NULL THEN 1 END),
    COUNT(CASE WHEN status != 'concluida' AND data_agendamento IS NULL THEN 1 END)
  INTO 
    v_total_a_receber,
    v_total_recebido,
    v_valor_previsto_agendados,
    v_total_agendados_qtd,
    v_total_a_agendar_qtd
  FROM public.instalacoes
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR instalador_id = v_alvo_id;

  v_resumo := jsonb_build_object(
    'total_ordens', jsonb_array_length(v_ordens),
    'total_agendamentos', jsonb_array_length(v_agendamentos),
    'a_receber', v_total_a_receber,
    'recebido', v_total_recebido,
    'agendados_qtd', v_total_agendados_qtd,
    'a_agendar_qtd', v_total_a_agendar_qtd,
    'valor_previsto_agendados', v_valor_previsto_agendados
  );

  RETURN jsonb_build_object(
    'success', true,
    'instalador_id', v_alvo_id,
    'ordens', v_ordens,
    'agendamentos', v_agendamentos,
    'resumo', v_resumo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_obter_minhas_demandas(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
