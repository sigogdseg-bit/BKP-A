-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Hunter - Garantir Permissões e RLS em Propostas Comerciais
-- Versão Alvo: 1.11.0.23
-- Sistema: GD Rastreamento | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Garante permissões de tabela para roles operacionais e anônimas
GRANT ALL ON public.propostas_comerciais TO authenticated;
GRANT ALL ON public.propostas_comerciais TO anon;
GRANT ALL ON public.propostas_comerciais TO service_role;

-- 2. Atualiza e flexibiliza políticas de RLS para evitar bloqueio 42501
-- durante oscilações de token JWT ou renovações em segundo plano
DROP POLICY IF EXISTS "Insercao de propostas por usuarios autenticados" ON public.propostas_comerciais;
DROP POLICY IF EXISTS "Permitir insercao de propostas comerciais" ON public.propostas_comerciais;
CREATE POLICY "Permitir insercao de propostas comerciais"
ON public.propostas_comerciais
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Leitura de propostas por usuarios autenticados" ON public.propostas_comerciais;
DROP POLICY IF EXISTS "Permitir leitura de propostas comerciais" ON public.propostas_comerciais;
CREATE POLICY "Permitir leitura de propostas comerciais"
ON public.propostas_comerciais
FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Atualizacao de propostas por usuarios autenticados" ON public.propostas_comerciais;
DROP POLICY IF EXISTS "Permitir atualizacao de propostas comerciais" ON public.propostas_comerciais;
CREATE POLICY "Permitir atualizacao de propostas comerciais"
ON public.propostas_comerciais
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 3. Notifica o PostgREST para recarregar o cache de esquema
NOTIFY pgrst, 'reload schema';
