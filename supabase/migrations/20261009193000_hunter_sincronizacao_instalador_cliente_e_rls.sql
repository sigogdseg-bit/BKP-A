-- ==============================================================================
-- HUNTER-GUARDIAN MIGRATION: Sincronização de Instalador no Cliente e RLS
-- ==============================================================================

-- 1. Política RLS para permitir que clientes autenticados visualizem as ordens de seus veículos
DO $$ BEGIN
  CREATE POLICY "Clientes visualizam ordens de instalacao de seus veiculos" ON public.instalacoes
    FOR SELECT TO authenticated
    USING (
      cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Sincronização atômica de clientes com ordens de instalação já atribuídas
UPDATE public.clientes c
SET instalador_id = i.instalador_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (cliente_id) cliente_id, instalador_id
  FROM public.instalacoes
  WHERE instalador_id IS NOT NULL AND status != 'concluida'
  ORDER BY cliente_id, created_at DESC
) i
WHERE c.id = i.cliente_id AND c.instalador_id IS NULL;

-- 3. Atualização dos valores das ordens pendentes com base nas taxas reais do perfil do instalador
UPDATE public.instalacoes i
SET valor_instalacao = CASE 
  WHEN i.com_bloqueador = true OR (i.bloqueador_instalado = true AND i.tipo_bloqueador != 'sem_bloqueador' AND i.com_bloqueador IS NOT FALSE)
    THEN COALESCE(p.valor_instalacao_com_bloqueador, 90.0)
  ELSE COALESCE(p.valor_instalacao_sem_bloqueador, 0.0)
END
FROM public.profiles p
WHERE i.instalador_id = p.id
  AND i.status = 'nao_instalado'
  AND i.cliente_id = '89421234-3069-43c5-924f-bff1d14e1dc6';

-- 4. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
