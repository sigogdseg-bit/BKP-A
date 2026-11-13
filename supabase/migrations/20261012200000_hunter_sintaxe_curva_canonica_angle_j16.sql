-- ==============================================================================
-- MIGRAÇÃO: hunter_sintaxe_curva_canonica_angle_j16
-- Atualiza a sintaxe padrão de compensação de curva do Concox GT06 / J16 4G
-- para o padrão universal homologado: ANGLE,3,15# (substituindo SZCS que é rejeitado por firmwares GT06)
-- ==============================================================================

-- 1. Atualizar o DEFAULT da coluna configuracao_j16 na tabela de calibrações
ALTER TABLE public.veiculo_calibracoes_odometro
  ALTER COLUMN configuracao_j16 SET DEFAULT 'TIMER,15,3600# | ANGLE,3,15#';

-- 2. Atualizar a assinatura da RPC de calibração
CREATE OR REPLACE FUNCTION public.registrar_calibracao_odometro_veiculo(
  p_veiculo_id                  UUID,
  p_hodometro_inicial_painel    NUMERIC,
  p_hodometro_final_painel      NUMERIC,
  p_odometro_inicial_sigo       NUMERIC,
  p_odometro_final_sigo         NUMERIC,
  p_aplicar_fator               BOOLEAN DEFAULT FALSE,
  p_configuracao_j16            TEXT DEFAULT 'TIMER,15,3600# | ANGLE,3,15#',
  p_condicoes_percurso          TEXT DEFAULT NULL,
  p_observacoes                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo             RECORD;
  v_dist_painel         NUMERIC(12, 3);
  v_dist_sigo           NUMERIC(12, 3);
  v_diferenca_km        NUMERIC(12, 3);
  v_erro_pct            NUMERIC(8, 4);
  v_fator_calculado     NUMERIC(8, 6);
  v_fator_aplicar       NUMERIC(8, 6);
  v_tendencia           TEXT;
  v_calibracao_id       UUID;
BEGIN
  -- Validar permissão de escrita
  IF NOT (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('admin', 'superadmin', 'operador') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas operadores e administradores podem registrar calibrações de odômetro.';
  END IF;

  -- Obter veículo
  SELECT id, placa, cliente_id, odometro_km, fator_correcao_odometro
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo com ID % não encontrado.', p_veiculo_id;
  END IF;

  -- Validações de consistência numérica
  IF p_hodometro_final_painel <= p_hodometro_inicial_painel THEN
    RAISE EXCEPTION 'Hodômetro final do painel (%) deve ser estritamente superior ao inicial (%).',
      p_hodometro_final_painel, p_hodometro_inicial_painel;
  END IF;

  IF p_odometro_final_sigo <= p_odometro_inicial_sigo THEN
    RAISE EXCEPTION 'Odômetro final do SIGO (%) deve ser estritamente superior ao inicial (%).',
      p_odometro_final_sigo, p_odometro_inicial_sigo;
  END IF;

  -- Cálculos métricos
  v_dist_painel := ROUND(p_hodometro_final_painel - p_hodometro_inicial_painel, 3);
  v_dist_sigo   := ROUND(p_odometro_final_sigo - p_odometro_inicial_sigo, 3);

  IF v_dist_painel <= 0.05 THEN
    RAISE EXCEPTION 'Percurso de calibração muito curto (% km). Mínimo recomendado: 1 km.', v_dist_painel;
  END IF;

  v_diferenca_km := ROUND(v_dist_sigo - v_dist_painel, 3);
  v_erro_pct     := ROUND(((v_dist_sigo - v_dist_painel) / v_dist_painel) * 100.0, 4);

  -- Fator de correção k = Distância Painel / Distância SIGO
  v_fator_calculado := ROUND(v_dist_painel / v_dist_sigo, 6);

  -- Sanidade do fator de correção (entre 0.80 e 1.25)
  IF v_fator_calculado < 0.800000 OR v_fator_calculado > 1.250000 THEN
    RAISE EXCEPTION 'Fator de calibração anômalo detectado (%): divergência excessiva acima de 25%%. Verifique as anotações do hodômetro.', v_fator_calculado;
  END IF;

  -- Classificação da tendência
  IF ABS(v_erro_pct) < 0.20 THEN
    v_tendencia := 'EXATO';
  ELSIF v_diferenca_km > 0 THEN
    v_tendencia := 'SUPERESTIMADO';
  ELSE
    v_tendencia := 'SUBESTIMADO';
  END IF;

  IF p_aplicar_fator THEN
    v_fator_aplicar := v_fator_calculado;

    -- Atualiza veículo com o novo fator e marca calibração
    UPDATE public.veiculos
    SET
      fator_correcao_odometro = v_fator_aplicar,
      odometro_calibrado_em = NOW(),
      odometro_calibrado_por = auth.uid(),
      odometro_calibrado_fator = v_fator_aplicar,
      ultima_atualizacao = NOW()
    WHERE id = p_veiculo_id;
  ELSE
    v_fator_aplicar := COALESCE(v_veiculo.fator_correcao_odometro, 1.000000);
  END IF;

  -- Registrar histórico de calibração
  INSERT INTO public.veiculo_calibracoes_odometro (
    veiculo_id,
    cliente_id,
    hodometro_inicial_painel,
    hodometro_final_painel,
    distancia_painel_km,
    odometro_inicial_sigo,
    odometro_final_sigo,
    distancia_sigo_km,
    diferenca_km,
    erro_percentual,
    fator_correcao_calculado,
    fator_correcao_aplicado,
    tendencia,
    versao_algoritmo,
    configuracao_j16,
    condicoes_percurso,
    observacoes,
    criado_por
  ) VALUES (
    p_veiculo_id,
    v_veiculo.cliente_id,
    p_hodometro_inicial_painel,
    p_hodometro_final_painel,
    v_dist_painel,
    p_odometro_inicial_sigo,
    p_odometro_final_sigo,
    v_dist_sigo,
    v_diferenca_km,
    v_erro_pct,
    v_fator_calculado,
    v_fator_aplicar,
    v_tendencia,
    'v2.1-geodesica-fusao-inercial',
    COALESCE(p_configuracao_j16, 'TIMER,15,3600# | ANGLE,3,15#'),
    p_condicoes_percurso,
    p_observacoes,
    auth.uid()
  )
  RETURNING id INTO v_calibracao_id;

  RETURN jsonb_build_object(
    'sucesso',                  true,
    'calibracao_id',            v_calibracao_id,
    'veiculo_id',               p_veiculo_id,
    'placa',                    v_veiculo.placa,
    'distancia_painel_km',      v_dist_painel,
    'distancia_sigo_km',        v_dist_sigo,
    'diferenca_km',             v_diferenca_km,
    'erro_percentual',          v_erro_pct,
    'fator_calculado',          v_fator_calculado,
    'fator_aplicado',           v_fator_aplicar,
    'fator_atualizado_veiculo', p_aplicar_fator,
    'tendencia',                v_tendencia,
    'configuracao_j16',         COALESCE(p_configuracao_j16, 'TIMER,15,3600# | ANGLE,3,15#')
  );
END;
$$;

-- 3. Invalidação obrigatória de cache PostgREST (Regra Pétrea)
NOTIFY pgrst, 'reload schema';
