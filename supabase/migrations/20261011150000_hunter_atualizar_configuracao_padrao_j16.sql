-- ============================================================================
-- MIGRATION: 20261011150000_hunter_atualizar_configuracao_padrao_j16.sql
-- DESCRIÇÃO: Atualiza os parâmetros canônicos padrão do rastreador J16 4G
--            para o perfil recomendado SIGO Guardião (TIMER 15s/3600s, HBT 120s/300s e Ângulo 5s/15°):
--            'TIMER,15,3600# | SZCS#ANGLEVALUE=3-015'
-- ============================================================================

-- 1. Atualizar valor padrão na tabela veiculo_calibracoes_odometro
ALTER TABLE IF EXISTS public.veiculo_calibracoes_odometro
  ALTER COLUMN configuracao_j16 SET DEFAULT 'TIMER,15,3600# | SZCS#ANGLEVALUE=3-015';

-- 2. Atualizar a RPC registrar_calibracao_odometro_veiculo com o novo default canônico
CREATE OR REPLACE FUNCTION public.registrar_calibracao_odometro_veiculo(
  p_veiculo_id                  UUID,
  p_hodometro_inicial_painel    NUMERIC,
  p_hodometro_final_painel      NUMERIC,
  p_odometro_inicial_sigo       NUMERIC,
  p_odometro_final_sigo         NUMERIC,
  p_aplicar_fator               BOOLEAN DEFAULT FALSE,
  p_configuracao_j16            TEXT DEFAULT 'TIMER,15,3600# | SZCS#ANGLEVALUE=3-015',
  p_condicoes_percurso          TEXT DEFAULT 'Vias urbanas e rodovias em regime misto',
  p_observacoes                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id             UUID;
  v_role                TEXT;
  v_veiculo_cliente_id  UUID;
  v_dist_painel         NUMERIC;
  v_dist_sigo           NUMERIC;
  v_dif_km              NUMERIC;
  v_erro_pct            NUMERIC;
  v_fator_corr          NUMERIC;
  v_calibracao_id       UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: operador nao autenticado.';
  END IF;

  SELECT u.perfil INTO v_role
  FROM public.usuarios u
  WHERE u.id = v_user_id;

  SELECT v.cliente_id INTO v_veiculo_cliente_id
  FROM public.veiculos v
  WHERE v.id = p_veiculo_id;

  IF v_veiculo_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Veiculo com id % nao encontrado.', p_veiculo_id;
  END IF;

  IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
    IF v_veiculo_cliente_id != v_user_id THEN
      RAISE EXCEPTION 'Permissao insuficiente: este veiculo pertence a outro cliente.';
    END IF;
  END IF;

  IF p_hodometro_final_painel < p_hodometro_inicial_painel THEN
    RAISE EXCEPTION 'Hodometro final do painel (%) deve ser maior ou igual ao inicial (%).',
      p_hodometro_final_painel, p_hodometro_inicial_painel;
  END IF;

  IF p_odometro_final_sigo < p_odometro_inicial_sigo THEN
    RAISE EXCEPTION 'Odometro final SIGO (%) deve ser maior ou igual ao inicial (%).',
      p_odometro_final_sigo, p_odometro_inicial_sigo;
  END IF;

  v_dist_painel := ROUND(p_hodometro_final_painel - p_hodometro_inicial_painel, 3);
  v_dist_sigo   := ROUND(p_odometro_final_sigo - p_odometro_inicial_sigo, 3);

  IF v_dist_painel <= 0 THEN
    RAISE EXCEPTION 'Distancia percorrida no painel deve ser superior a zero para calibração.';
  END IF;

  v_dif_km := ROUND(v_dist_sigo - v_dist_painel, 3);
  v_erro_pct := ROUND((ABS(v_dif_km) / v_dist_painel) * 100.0, 4);

  IF v_dist_sigo > 0 THEN
    v_fator_corr := ROUND(v_dist_painel / v_dist_sigo, 6);
  ELSE
    v_fator_corr := 1.000000;
  END IF;

  IF v_fator_corr < 0.800000 OR v_fator_corr > 1.250000 THEN
    RAISE EXCEPTION 'Fator de calibração calculado (%) esta fora dos limites fisicos aceitaveis (0.80 a 1.25).', v_fator_corr;
  END IF;

  INSERT INTO public.veiculo_calibracoes_odometro (
    veiculo_id,
    operador_id,
    hodometro_inicial_painel_km,
    hodometro_final_painel_km,
    distancia_painel_km,
    odometro_inicial_sigo_km,
    odometro_final_sigo_km,
    distancia_sigo_km,
    diferenca_km,
    erro_percentual,
    fator_calculado,
    fator_aplicado,
    configuracao_j16,
    condicoes_percurso,
    observacoes
  ) VALUES (
    p_veiculo_id,
    v_user_id,
    p_hodometro_inicial_painel,
    p_hodometro_final_painel,
    v_dist_painel,
    p_odometro_inicial_sigo,
    p_odometro_final_sigo,
    v_dist_sigo,
    v_dif_km,
    v_erro_pct,
    v_fator_corr,
    p_aplicar_fator,
    COALESCE(p_configuracao_j16, 'TIMER,15,3600# | SZCS#ANGLEVALUE=3-015'),
    p_condicoes_percurso,
    p_observacoes
  )
  RETURNING id INTO v_calibracao_id;

  IF p_aplicar_fator IS TRUE THEN
    UPDATE public.veiculos
    SET
      fator_calibracao_odometro = v_fator_corr,
      hodometro_painel_km       = p_hodometro_final_painel,
      data_ultima_calibracao    = NOW(),
      atualizado_em             = NOW()
    WHERE id = p_veiculo_id;
  ELSE
    UPDATE public.veiculos
    SET
      hodometro_painel_km       = p_hodometro_final_painel,
      atualizado_em             = NOW()
    WHERE id = p_veiculo_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'calibracao_id', v_calibracao_id,
    'distancia_painel_km', v_dist_painel,
    'distancia_sigo_km', v_dist_sigo,
    'diferenca_km', v_dif_km,
    'erro_percentual', v_erro_pct,
    'fator_calculado', v_fator_corr,
    'fator_aplicado', p_aplicar_fator,
    'configuracao_j16', COALESCE(p_configuracao_j16, 'TIMER,15,3600# | SZCS#ANGLEVALUE=3-015')
  );
END;
$$;

-- 3. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
