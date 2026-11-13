-- ==============================================================================
-- HUNTER — CORREÇÃO DE LINTER: RLS EM COOLDOWN E SECURITY INVOKER EM VIEW CNH
-- Data: 01/10/2026
-- Objetivo:
-- 1. Habilitar RLS estrito em public.alertas_telemetria_cooldown com policy por cliente
-- 2. Recriar public.alertas_cnh_motoristas com security_invoker = true para respeitar RLS
-- Zero downtime e zero interrupção operacional
-- ==============================================================================

-- 1. Habilitar RLS em public.alertas_telemetria_cooldown
ALTER TABLE public.alertas_telemetria_cooldown ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes acessam cooldown de seus proprios veiculos" ON public.alertas_telemetria_cooldown;
CREATE POLICY "Clientes acessam cooldown de seus proprios veiculos"
  ON public.alertas_telemetria_cooldown FOR ALL TO authenticated
  USING (
    veiculo_id IN (
      SELECT id FROM public.veiculos
      WHERE cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('adm', 'superadmin')
    )
  )
  WITH CHECK (
    veiculo_id IN (
      SELECT id FROM public.veiculos
      WHERE cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid())
         OR (SELECT role::text FROM public.profiles WHERE id = auth.uid()) IN ('adm', 'superadmin')
    )
  );

-- 2. Atualizar View public.alertas_cnh_motoristas com WITH (security_invoker = true)
CREATE OR REPLACE VIEW public.alertas_cnh_motoristas
WITH (security_invoker = true) AS
SELECT
  m.id              AS motorista_id,
  m.cliente_id,
  m.nome,
  m.email,
  m.cnh_numero,
  m.cnh_categoria,
  m.cnh_validade,
  CASE
    WHEN m.cnh_validade IS NULL       THEN 'sem_data'
    WHEN m.cnh_validade < CURRENT_DATE THEN 'vencida'
    WHEN m.cnh_validade <= CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
    ELSE 'ok'
  END AS status_cnh,
  (m.cnh_validade - CURRENT_DATE) AS dias_para_vencer
FROM public.motoristas m
WHERE m.ativo = TRUE;

GRANT SELECT ON public.alertas_cnh_motoristas TO authenticated;

-- Notificar PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
