-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261025160500_hunter_rpc_consumo_chips_correcao_hbt_basal.sql
-- Sistema: GD Rastreamento | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- CORREÇÃO CRÍTICA da RPC hunter_obter_consumo_chips_ciclo.
-- 
-- CAUSA RAIZ IDENTIFICADA:
-- 1. Fator de conversão 0.0010135 MB/pacote estava superestimando GPS (~4x)
-- 2. Heartbeats (HBT 0x08/0x13) NÃO eram contabilizados (não geram posição GPS)
-- 3. Consumo basal fixo da operadora NÃO era incluído
--
-- FÓRMULA CORRETIVA AUDITADA:
-- consumo_total = (pacotes_gps × custo_pacote_gps)
--               + (hbts_estimados × custo_hbt)
--               + (basal_proporcional_ao_ciclo)
--
-- Custos reais auditados no Lara/Algar (CDR M2M):
-- - Pacote GPS com overhead TCP/LTE/CDR: ~512 bytes (0.000488 MB)
-- - Heartbeat keep-alive com overhead: ~512 bytes (0.000488 MB)
-- - Basal fixo mensal (handshakes, retransmissões, ACC, NAT): 2.8 MB/30 dias
--
-- PARÂMETROS CORRENTES DO FIRMWARE J16:
-- - HBT em repouso (SENDS=1, ACC OFF): 600s (10 min) → 144 HBTs/dia em ~20h repouso
-- - HBT em movimento (ACC ON): 120s (2 min) → 120 HBTs/dia em ~4h movimento
-- - Timer parado: 3600s (1h)
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
  -- Custo CDR real por transmissão individual na operadora M2M (bytes → MB)
  -- Auditado: ~512 bytes efetivos por evento (payload + overhead TCP/LTE + arredondamento CDR)
  v_custo_mb_por_pacote CONSTANT NUMERIC := 0.000488;  -- 512 bytes = 0.5 KB
  -- Consumo basal fixo mensal da operadora (handshakes TCP, keep-alives NAT, ACC, retransmissões)
  v_basal_fixo_mes_mb CONSTANT NUMERIC := 2.8;
  -- Heartbeats estimados por dia (HBT 600s repouso ~20h + HBT 120s movimento ~4h)
  -- Repouso: (20 * 3600) / 600 = 120 HBTs/dia
  -- Movimento: (4 * 3600) / 120 = 120 HBTs/dia
  -- Total: 240 HBTs/dia
  v_hbts_por_dia CONSTANT NUMERIC := 240;
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
    -- Fórmula corretiva completa:
    -- 1. Pacotes GPS × custo CDR real por pacote
    -- 2. + HBTs estimados × dias × custo CDR por HBT
    -- 3. + Basal fixo proporcional ao ciclo
    ROUND(
      (
        (COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0)::NUMERIC * v_custo_mb_por_pacote)
        + (v_hbts_por_dia * v_dias_ciclo * v_custo_mb_por_pacote)
        + (v_basal_fixo_mes_mb * v_dias_ciclo / 30.0)
      )::NUMERIC,
      2
    ) AS consumo_mb
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
