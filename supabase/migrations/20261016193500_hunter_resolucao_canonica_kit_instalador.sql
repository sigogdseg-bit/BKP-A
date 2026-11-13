-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Resolução Canônica de Kit Atribuído para o Instalador (DJR-NEW)
-- ─────────────────────────────────────────────────────────────────────────────
-- Garante que quando o operador atribuir o kit (seja em instalacoes, veiculos ou clientes),
-- a RPC instalador_obter_minhas_demandas resolva o IMEI real do estoque, eliminando
-- a permanência indevida do estado "Aguardando Kit" e liberando "Conferir Kit" e "Instalar".
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_total_a_receber NUMERIC(10,2);
  v_total_recebido NUMERIC(10,2);
  v_total_agendados_qtd INT;
  v_total_a_agendar_qtd INT;
  v_valor_previsto_agendados NUMERIC(10,2);
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

  -- 1. Coletar Ordens de Instalação Atribuídas com Join em Rastreadores e Chips
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'cliente_id', i.cliente_id,
      'veiculo_id', i.veiculo_id,
      'instalador_id', COALESCE(i.instalador_id, c.instalador_id),
      'placa', COALESCE(i.placa, v.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, split_part(v.marca_modelo, ' ', 1), 'Geral'),
      'modelo', COALESCE(i.modelo, v.marca_modelo, 'Veículo'),
      'ano', COALESCE(i.ano, v.ano),
      'cor', COALESCE(i.cor, v.cor),
      'tipo_veiculo', COALESCE(i.tipo_veiculo, v.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'tipo_servico', COALESCE(i.tipo_servico, 'instalacao'),
      'valor_instalacao', i.valor_instalacao,
      'status_pagamento', i.status_pagamento,
      'bloqueador_instalado', COALESCE(i.bloqueador_instalado, false),
      'com_bloqueador', COALESCE(i.bloqueador_instalado, false),
      'status', i.status,
      'posicao_instalacao', i.posicao_instalacao,
      'posicaoInstalacao', i.posicao_instalacao,
      'rastreador_id', COALESCE(i.rastreador_id, v.rastreador_id, c.kit_determinado_id, r.id),
      'rastreador_imei', COALESCE(
        CASE WHEN UPPER(TRIM(i.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE i.rastreador_imei END,
        r.imei,
        CASE WHEN UPPER(TRIM(v.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE v.rastreador_imei END,
        i.rastreador_imei,
        'PENDENTE'
      ),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, r.modelo, 'J16 4G'),
      'chip_iccid', COALESCE(i.chip_iccid, ch.iccid),
      'chip_operadora', COALESCE(i.chip_operadora, ch.operadora),
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', i.local_endereco,
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, false),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'endereco_cliente_informado_em', i.endereco_cliente_informado_em,
      'solicitado_endereco_em', i.solicitado_endereco_em,
      'kit_determinado_em', COALESCE(i.kit_determinado_em, CASE WHEN r.id IS NOT NULL THEN NOW() ELSE NULL END),
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, false),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'instalador_nome', COALESCE(p.nome, 'Instalador Técnico'),
      'instalador_chave_pix', p.chave_pix,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_telefone', c.telefone,
      'cliente_documento', c.documento,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.veiculos v ON v.id = i.veiculo_id
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, c.instalador_id)
  LEFT JOIN public.rastreadores r ON r.id = COALESCE(i.rastreador_id, v.rastreador_id, c.kit_determinado_id)
  LEFT JOIN public.chips ch ON ch.id = r.chip_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id
     OR (i.instalador_id IS NULL AND c.instalador_id = v_alvo_id);

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
      'kit_determinado_id', c.kit_determinado_id,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', COALESCE(c.instalador_id, v_alvo_id),
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
          'horimetro_horas', v.horimetro_horas,
          'rastreador_id', COALESCE(v.rastreador_id, c.kit_determinado_id),
          'rastreador_imei', COALESCE(
            CASE WHEN UPPER(TRIM(v.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE v.rastreador_imei END,
            rk.imei,
            v.rastreador_imei
          )
        ))
        FROM public.veiculos v
        LEFT JOIN public.rastreadores rk ON rk.id = COALESCE(v.rastreador_id, c.kit_determinado_id)
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = COALESCE(c.instalador_id, v_alvo_id)
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
    OR EXISTS (SELECT 1 FROM public.instalacoes inst WHERE inst.cliente_id = c.id AND (inst.instalador_id = v_alvo_id OR (inst.instalador_id IS NULL AND c.instalador_id = v_alvo_id)))
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Métricas Financeiras ESTRITAS
  SELECT 
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pendente' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pago' THEN valor_instalacao ELSE 0 END), 0.00),
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
    'a_receber', v_total_a_receber,
    'recebido', v_total_recebido,
    'agendados_qtd', v_total_agendados_qtd,
    'a_agendar_qtd', v_total_a_agendar_qtd,
    'valor_previsto_agendados', v_valor_previsto_agendados
  );

  RETURN jsonb_build_object(
    'success', true,
    'ordens', v_ordens,
    'agendamentos', v_agendamentos,
    'resumo', v_resumo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_obter_minhas_demandas(UUID) TO authenticated;

-- Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
