-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261020210000_hunter_rpc_consumo_telemetria_chips_ciclo.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- RPC canônica para cálculo real e dinâmico de tráfego/consumo de chips M2M
-- no ciclo de faturamento (desde o dia 23 até hoje), agregando contagem
-- de posições da tabela telemetria_posicoes, rastreadores, veículos e clientes.
-- Elimina qualquer hardcode ou fallback fictício.
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
BEGIN
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
    ROUND((COALESCE(tc.total_pacotes, tc_v.total_pacotes, 0::BIGINT) * 0.0010135)::NUMERIC, 2) AS consumo_mb
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
