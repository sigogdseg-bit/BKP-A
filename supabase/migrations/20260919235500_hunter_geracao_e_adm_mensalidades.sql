-- Migration: 20260919235500_hunter_geracao_e_adm_mensalidades.sql
-- Objetivo: Funcoes RPC para geracao em lote de mensalidades por competencia e atualizacao de vencidos

-- 1. Funcao para atualizacao de mensalidades vencidas automaticamente
CREATE OR REPLACE FUNCTION public.admin_atualizar_status_mensalidades_vencidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetados INT := 0;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar status de mensalidades.';
  END IF;

  UPDATE public.mensalidades
  SET status = 'vencido',
      updated_at = NOW()
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  RETURN v_afetados;
END;
$$;

-- 2. Funcao para geracao em lote de mensalidades por competencia (mes e ano)
CREATE OR REPLACE FUNCTION public.admin_gerar_mensalidades_mes(
  p_mes INT,
  p_ano INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente RECORD;
  v_dia_max INT;
  v_dia_final INT;
  v_data_venc DATE;
  v_status_inicial public.status_mensalidade;
  v_total_clientes INT := 0;
  v_geradas INT := 0;
  v_ja_existentes INT := 0;
  v_inserido BOOLEAN;
BEGIN
  -- Validacao de seguranca SuperAdmin e Adm
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar mensalidades em lote.';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Mes de referencia invalido: deve estar entre 1 e 12.';
  END IF;

  IF p_ano < 2024 OR p_ano > 2099 THEN
    RAISE EXCEPTION 'Ano de referencia invalido.';
  END IF;

  -- Calcular o ultimo dia valido do mes (ex: 28, 29, 30 ou 31)
  v_dia_max := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day'))::INT;

  FOR v_cliente IN
    SELECT id, dia_vencimento, valor_mensalidade, nome_razao_social
    FROM public.clientes
    WHERE status <> 'bloqueado'
      AND valor_mensalidade > 0
  LOOP
    v_total_clientes := v_total_clientes + 1;

    -- Ajustar o dia de vencimento para nao ultrapassar o ultimo dia do mes
    v_dia_final := LEAST(COALESCE(v_cliente.dia_vencimento, 10), v_dia_max);
    v_data_venc := make_date(p_ano, p_mes, v_dia_final);

    -- Determinar se ja esta vencido em relacao a data atual
    IF v_data_venc < CURRENT_DATE THEN
      v_status_inicial := 'vencido';
    ELSE
      v_status_inicial := 'pendente';
    END IF;

    -- Inserir ignorando duplicidade pela constraint uq_cliente_mensalidade
    INSERT INTO public.mensalidades (
      cliente_id,
      mes_referencia,
      ano_referencia,
      valor,
      data_vencimento,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_cliente.id,
      p_mes,
      p_ano,
      v_cliente.valor_mensalidade,
      v_data_venc,
      v_status_inicial,
      NOW(),
      NOW()
    )
    ON CONFLICT (cliente_id, mes_referencia, ano_referencia) DO NOTHING;

    IF FOUND THEN
      v_geradas := v_geradas + 1;
    ELSE
      v_ja_existentes := v_ja_existentes + 1;
    END IF;
  END LOOP;

  -- Registrar log de atividade do sistema
  INSERT INTO public.system_activity_logs (
    user_id,
    acao,
    detalhe,
    created_at
  ) VALUES (
    auth.uid(),
    'GERACAO_MENSALIDADES_LOTE',
    'Competencia: ' || LPAD(p_mes::TEXT, 2, '0') || '/' || p_ano::TEXT ||
    ' | Geradas: ' || v_geradas::TEXT ||
    ' | Ja existentes: ' || v_ja_existentes::TEXT ||
    ' | Total clientes aptos: ' || v_total_clientes::TEXT,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'mes_referencia', p_mes,
    'ano_referencia', p_ano,
    'geradas', v_geradas,
    'ja_existentes', v_ja_existentes,
    'total_clientes', v_total_clientes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atualizar_status_mensalidades_vencidas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_gerar_mensalidades_mes(INT, INT) TO authenticated;

COMMENT ON FUNCTION public.admin_gerar_mensalidades_mes(INT, INT) IS 'Gera em lote as mensalidades de todos os clientes aptos para uma competencia especifica (mes e ano) sem duplicidades.';
