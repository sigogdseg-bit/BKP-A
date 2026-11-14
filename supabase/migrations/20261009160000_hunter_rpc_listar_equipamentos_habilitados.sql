-- ============================================================================
-- HUNTER / GD RASTREAMENTO — RPC LISTAR_EQUIPAMENTOS_HABILITADOS_INSTALACAO
-- ============================================================================
-- Retorna estritamente os equipamentos em estoque com chip vinculado que NÃO
-- estejam vinculados a um veículo ativo nem atribuídos a uma instalação ativa
-- (agendada, pendente, em andamento). Permite manter opcionalmente o kit do próprio
-- veículo consultado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.listar_equipamentos_habilitados_instalacao(
  p_veiculo_id UUID DEFAULT NULL
)
RETURNS TABLE (
  rastreador_id UUID,
  imei TEXT,
  modelo TEXT,
  chip_id UUID,
  iccid TEXT,
  operadora TEXT,
  linha TEXT,
  status TEXT,
  liberado_instalacao BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS rastreador_id,
    r.imei,
    COALESCE(r.modelo, 'J16 4G') AS modelo,
    r.chip_id,
    COALESCE(c.iccid, '') AS iccid,
    COALESCE(c.operadora, 'Vivo') AS operadora,
    c.linha,
    r.status::TEXT AS status,
    TRUE AS liberado_instalacao,
    r.created_at
  FROM public.rastreadores r
  JOIN public.chips c ON c.id = r.chip_id
  WHERE r.status = 'estoque'
    AND r.chip_id IS NOT NULL
    AND r.veiculo_id IS NULL
    AND (
      -- 1. O rastreador NÃO pode estar atribuído a nenhuma instalação ativa
      NOT EXISTS (
        SELECT 1 
        FROM public.instalacoes i 
        WHERE i.rastreador_id = r.id 
          AND i.status NOT IN ('cancelada', 'cancelado')
          AND (p_veiculo_id IS NULL OR i.veiculo_id != p_veiculo_id)
      )
      -- 2. OU ser o kit já reservado especificamente para este veículo
      OR (
        p_veiculo_id IS NOT NULL 
        AND EXISTS (
          SELECT 1 
          FROM public.instalacoes i2 
          WHERE i2.rastreador_id = r.id 
            AND i2.veiculo_id = p_veiculo_id
            AND i2.status NOT IN ('cancelada', 'cancelado')
        )
      )
    )
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipamentos_habilitados_instalacao(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
