-- Hunter — Suporte a chip_linha na ordem de instalacao e compatibilidade com enum status_rastreador
-- Migration: 20261008200000_hunter_instalacoes_chip_linha_e_status_rastreador.sql

-- 1. Adiciona chip_linha à tabela instalacoes
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS chip_linha TEXT;

-- 2. Adiciona o valor 'em_instalacao' ao enum status_rastreador caso ainda nao exista
DO $$
BEGIN
  ALTER TYPE public.status_rastreador ADD VALUE IF NOT EXISTS 'em_instalacao';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Atualiza RPC listar_equipamentos_habilitados_instalacao para incluir chips e permitir kit_atual
CREATE OR REPLACE FUNCTION public.listar_equipamentos_habilitados_instalacao()
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
    r.modelo,
    c.id AS chip_id,
    c.iccid,
    c.operadora,
    c.linha,
    r.status::TEXT,
    TRUE AS liberado_instalacao,
    r.created_at
  FROM public.rastreadores r
  INNER JOIN public.chips c ON c.id = r.chip_id
  WHERE r.status IN ('estoque', 'em_instalacao')
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipamentos_habilitados_instalacao() TO authenticated;
