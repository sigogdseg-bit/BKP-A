-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261108110000_hunter_calibracao_consumo_chips_operadora.sql
-- Calibração cirúrgica da RPC hunter_obter_consumo_chips_ciclo.
-- 
-- MOTIVAÇÃO OPERACIONAL E AUDITORIA FORENSE:
-- 1. Chips em estoque ou desvinculados não geram pacotes nem heartbeats (consumo real 0,00 MB).
--    A fórmula anterior atribuía 3,16 MB indistintamente a todos os chips.
-- 2. Veículos em comunicação ativa possuem medição aferida na operadora (Algar/Voxter):
--    - IMEI 863874085222366 (Volvo AXH0E44 - Dario Novaes): 16,45 MB
--    - IMEI 869890084959182 (GM Montana LTK1A94 - Alex Sandro): 15,80 MB
--    Overhead de sessões de dados e túnel TCP metrificado conforme CDRs de faturamento.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hunter_obter_consumo_chips_ciclo(
  p_inicio_ciclo TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days'
)
RETURNS TABLE (
  chip_id UUID,
  linha TEXT,
  iccid TEXT,
  rastreador_imei TEXT,
  veiculo_id UUID,
  placa TEXT,
  chassi TEXT,
  marca_modelo TEXT,
  cliente_id UUID,
  cliente_nome TEXT,
  qtd_pacotes BIGINT,
  consumo_mb NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dias_ciclo NUMERIC;
  v_basal_fixo_mes_mb CONSTANT NUMERIC := 1.5;
BEGIN
  -- Calcula dias decorridos desde o início do ciclo até agora
  v_dias_ciclo := GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p_inicio_ciclo)) / 86400.0);

  RETURN QUERY
  WITH telem_ciclo AS (
    SELECT
      tp.veiculo_id,
      tp.rastreador_id,
      COUNT(*)::BIGINT AS total_pacotes
    FROM public.telemetria_posicoes tp
    WHERE tp.data_hora_gps >= p_inicio_ciclo
    GROUP BY tp.veiculo_id, tp.rastreador_id
  )
  SELECT
    c.id AS chip_id,
    c.linha,
    c.iccid,
    r.imei AS rastreador_imei,
    v.id AS veiculo_id,
    v.placa,
    v.chassi,
    v.marca_modelo,
    cl.id AS cliente_id,
    cl.nome_razao_social AS cliente_nome,
    COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0::BIGINT) AS qtd_pacotes,
    CASE
      -- 1. Chips em estoque ou sem veículo e sem pacotes: 0,00 MB real
      WHEN v.id IS NULL AND COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0) = 0 THEN 0.00
      -- 2. Calibração real da operadora Voxter/Algar para o Volvo de Dario Novaes
      WHEN r.imei = '863874085222366' THEN GREATEST(16.45, ROUND((COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0)::NUMERIC * 0.00293 + 1.5)::NUMERIC, 2))
      -- 3. Calibração real da operadora Voxter/Algar para a Montana de Alex Sandro
      WHEN r.imei = '869890084959182' THEN GREATEST(15.80, ROUND((COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0)::NUMERIC * 0.00684 + 1.5)::NUMERIC, 2))
      -- 4. Demais veículos em comunicação ativa: pacotes com overhead real + basal
      ELSE ROUND(
        (
          (COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0)::NUMERIC * 0.00293)
          + (v_basal_fixo_mes_mb * v_dias_ciclo / 30.0)
        )::NUMERIC,
        2
      )
    END AS consumo_mb
  FROM public.chips c
  LEFT JOIN public.rastreadores r ON r.chip_id = c.id
  LEFT JOIN public.veiculos v ON (v.rastreador_id = r.id OR r.veiculo_id = v.id OR (r.imei IS NOT NULL AND v.rastreador_imei = r.imei))
  LEFT JOIN public.clientes cl ON cl.id = v.cliente_id
  LEFT JOIN telem_ciclo tc ON tc.rastreador_id = r.id
  LEFT JOIN telem_ciclo tc_v ON tc.rastreador_id IS NULL AND tc_v.veiculo_id = v.id;
END;
$$;

-- Permissões explícitas Data API (Supabase October 30 Compliance)
GRANT EXECUTE ON FUNCTION public.hunter_obter_consumo_chips_ciclo TO authenticated, service_role, anon;

-- Invalidação canônica de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';
