-- ==============================================================================
-- HUNTER-GUARDIAN: Correção Definitiva de Recursão Infinita em RLS de 'instalacoes' e 'clientes'
-- Execute este script no SQL Editor do Supabase (pflzopmxxawyqkgrlapq)
-- ==============================================================================

-- 1. Helper Function SECURITY DEFINER para verificar vínculo do cliente sem acionar RLS recursivo
CREATE OR REPLACE FUNCTION public.check_instalacao_pertence_cliente(p_cliente_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = p_user_id
  );
$$;

-- 2. Helper Function SECURITY DEFINER para verificar vínculo de ordens do instalador sem acionar RLS recursivo
CREATE OR REPLACE FUNCTION public.check_instalador_possui_ordem_cliente(p_cliente_id UUID, p_instalador_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instalacoes WHERE cliente_id = p_cliente_id AND instalador_id = p_instalador_id
  );
$$;

-- 3. Atualizar política em public.instalacoes para eliminar ciclo
DROP POLICY IF EXISTS "Clientes visualizam suas proprias ordens de instalacao" ON public.instalacoes;
DROP POLICY IF EXISTS "Clientes visualizam ordens de instalacao de seus veiculos" ON public.instalacoes;

CREATE POLICY "Clientes visualizam suas proprias ordens de instalacao"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  cliente_user_id = auth.uid()
  OR cliente_id = auth.uid()
  OR public.check_instalacao_pertence_cliente(cliente_id, auth.uid())
);

-- 4. Atualizar política em public.clientes para eliminar ciclo
DROP POLICY IF EXISTS "Instaladores consultam clientes para instalacao" ON public.clientes;

CREATE POLICY "Instaladores consultam clientes para instalacao"
ON public.clientes FOR SELECT TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid())
  OR instalador_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('operador', 'instalador'))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'instalador')
  OR public.check_instalador_possui_ordem_cliente(public.clientes.id, auth.uid())
);

-- 5. RPC SECURITY DEFINER para cadastro seguro de Chip M2M Avulso no Estoque
CREATE OR REPLACE FUNCTION public.cadastrar_chip_avulso_estoque(
  p_iccid TEXT,
  p_operadora TEXT DEFAULT 'Vivo',
  p_linha TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_iccid_limpo TEXT;
  v_chip_id UUID;
  v_novo_chip RECORD;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id LIMIT 1;
    IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas administradores e operadores podem cadastrar chips.');
    END IF;
  END IF;

  v_iccid_limpo := REGEXP_REPLACE(p_iccid, '\D', '', 'g');
  IF v_iccid_limpo IS NULL OR LENGTH(v_iccid_limpo) < 10 THEN
    RETURN jsonb_build_object('success', false, 'message', 'ICCID inválido. Informe o número serial do chip.');
  END IF;

  SELECT id INTO v_chip_id FROM public.chips WHERE iccid = v_iccid_limpo LIMIT 1;
  IF v_chip_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este ICCID já está cadastrado no estoque.');
  END IF;

  INSERT INTO public.chips (iccid, operadora, linha, status)
  VALUES (v_iccid_limpo, COALESCE(NULLIF(TRIM(p_operadora), ''), 'Vivo'), NULLIF(TRIM(p_linha), ''), 'ativo')
  RETURNING id, iccid, operadora, linha, status, created_at INTO v_novo_chip;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Chip M2M cadastrado com sucesso no estoque!',
    'chip', row_to_json(v_novo_chip)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_chip_avulso_estoque TO authenticated;
NOTIFY pgrst, 'reload schema';
