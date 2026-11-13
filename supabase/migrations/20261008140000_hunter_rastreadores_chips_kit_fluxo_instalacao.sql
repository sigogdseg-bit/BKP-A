-- ============================================================================
-- HUNTER — FLUXO CANÔNICO DE ESTOQUE DE RASTREADORES, CHIPS E KITS DE INSTALAÇÃO
-- ============================================================================
-- Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- 1. No cadastro em estoque, cada rastreador físico possui IMEI e pode receber
--    um ICCID (chip) vinculado.
-- 2. Equipamentos só ficam no status 'Liberado para Instalação' se tiverem
--    TANTO o IMEI QUANTO o ICCID cadastrados e vinculados.
-- 3. A quantidade de ICCIDs disponíveis respeita a quantidade de chips em estoque.
-- 4. O operador determina o kit para a instalação escolhendo dentre os habilitados.
-- 5. O instalador confirma o kit recebido lendo o código de barras ou digitando
--    o IMEI do dispositivo em sua posse, confirmando os dados do veículo e gerando
--    a pendência de pagamento no sistema.
-- ============================================================================

-- 1. Aprimorar tabela public.rastreadores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rastreadores' AND column_name = 'item_estoque_id'
  ) THEN
    ALTER TABLE public.rastreadores ADD COLUMN item_estoque_id UUID REFERENCES public.estoque_itens(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rastreadores' AND column_name = 'observacoes'
  ) THEN
    ALTER TABLE public.rastreadores ADD COLUMN observacoes TEXT;
  END IF;
END $$;

-- 2. Aprimorar tabela public.chips
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'chips' AND column_name = 'item_estoque_id'
  ) THEN
    ALTER TABLE public.chips ADD COLUMN item_estoque_id UUID REFERENCES public.estoque_itens(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Aprimorar tabela public.instalacoes para custódia e confirmação do kit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'rastreador_id'
  ) THEN
    ALTER TABLE public.instalacoes ADD COLUMN rastreador_id UUID REFERENCES public.rastreadores(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'kit_determinado_em'
  ) THEN
    ALTER TABLE public.instalacoes ADD COLUMN kit_determinado_em TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'kit_confirmado_instalador'
  ) THEN
    ALTER TABLE public.instalacoes ADD COLUMN kit_confirmado_instalador BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'kit_confirmado_em'
  ) THEN
    ALTER TABLE public.instalacoes ADD COLUMN kit_confirmado_em TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'imei_confirmado'
  ) THEN
    ALTER TABLE public.instalacoes ADD COLUMN imei_confirmado TEXT;
  END IF;
END $$;

-- 4. Aprimorar tabela public.clientes para vincular o kit determinado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'kit_determinado_id'
  ) THEN
    ALTER TABLE public.clientes ADD COLUMN kit_determinado_id UUID REFERENCES public.rastreadores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_rastreadores_chip_status ON public.rastreadores(status, chip_id);
CREATE INDEX IF NOT EXISTS idx_rastreadores_imei_clean ON public.rastreadores(imei);
CREATE INDEX IF NOT EXISTS idx_chips_iccid_clean ON public.chips(iccid);
CREATE INDEX IF NOT EXISTS idx_instalacoes_rastreador ON public.instalacoes(rastreador_id);
CREATE INDEX IF NOT EXISTS idx_clientes_kit_determinado ON public.clientes(kit_determinado_id);

-- 6. RPC: Listar equipamentos habilitados para instalação (IMEI + ICCID)
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
  WHERE r.status = 'estoque'
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipamentos_habilitados_instalacao() TO authenticated;

-- 7. RPC: Listar todos os dispositivos e chips em estoque (habilitados e pendentes)
CREATE OR REPLACE FUNCTION public.listar_todos_dispositivos_estoque()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rastreadores JSONB;
  v_chips_disponiveis JSONB;
  v_totais JSONB;
BEGIN
  -- 1. Rastreadores com chip vinculado (se houver)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'imei', r.imei,
    'modelo', r.modelo,
    'status', r.status,
    'chip_id', r.chip_id,
    'iccid', c.iccid,
    'operadora', c.operadora,
    'linha', c.linha,
    'liberado_instalacao', (r.chip_id IS NOT NULL AND r.status = 'estoque'),
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rastreadores
  FROM public.rastreadores r
  LEFT JOIN public.chips c ON c.id = r.chip_id;

  -- 2. Chips avulsos disponíveis em estoque (sem rastreador vinculado)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'iccid', c.iccid,
    'operadora', c.operadora,
    'linha', c.linha,
    'status', c.status,
    'created_at', c.created_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_chips_disponiveis
  FROM public.chips c
  WHERE c.id NOT IN (
    SELECT DISTINCT r.chip_id 
    FROM public.rastreadores r 
    WHERE r.chip_id IS NOT NULL
  );

  -- 3. Métricas consolidadas
  SELECT jsonb_build_object(
    'total_rastreadores', (SELECT COUNT(*) FROM public.rastreadores),
    'rastreadores_em_estoque', (SELECT COUNT(*) FROM public.rastreadores WHERE status = 'estoque'),
    'total_chips', (SELECT COUNT(*) FROM public.chips),
    'chips_disponiveis', (SELECT jsonb_array_length(v_chips_disponiveis)),
    'liberados_para_instalacao', (SELECT COUNT(*) FROM public.rastreadores WHERE status = 'estoque' AND chip_id IS NOT NULL),
    'pendentes_vinculo', (SELECT COUNT(*) FROM public.rastreadores WHERE status = 'estoque' AND chip_id IS NULL)
  ) INTO v_totais;

  RETURN jsonb_build_object(
    'success', true,
    'rastreadores', v_rastreadores,
    'chips_disponiveis', v_chips_disponiveis,
    'totais', v_totais
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_todos_dispositivos_estoque() TO authenticated;

-- 8. RPC: Salvar rastreador com chip (Criar ou Vincular)
CREATE OR REPLACE FUNCTION public.salvar_rastreador_com_chip(
  p_imei TEXT,
  p_modelo TEXT DEFAULT 'J16 4G',
  p_iccid TEXT DEFAULT NULL,
  p_operadora TEXT DEFAULT 'Vivo',
  p_linha TEXT DEFAULT NULL,
  p_rastreador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_imei_limpo TEXT;
  v_iccid_limpo TEXT;
  v_chip_id UUID := NULL;
  v_rastreador_id UUID := p_rastreador_id;
  v_rastreador_existente RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id LIMIT 1;
    IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas a administração pode gerenciar seriais em estoque.');
    END IF;
  END IF;

  v_imei_limpo := REGEXP_REPLACE(p_imei, '\D', '', 'g');
  IF v_imei_limpo IS NULL OR LENGTH(v_imei_limpo) < 8 THEN
    RETURN jsonb_build_object('success', false, 'message', 'IMEI inválido. Informe um serial numérico válido.');
  END IF;

  IF p_iccid IS NOT NULL AND TRIM(p_iccid) <> '' THEN
    v_iccid_limpo := REGEXP_REPLACE(p_iccid, '\D', '', 'g');
  ELSE
    v_iccid_limpo := NULL;
  END IF;

  -- 1. Se informou ICCID, localizar ou cadastrar o chip
  IF v_iccid_limpo IS NOT NULL THEN
    SELECT id INTO v_chip_id FROM public.chips WHERE iccid = v_iccid_limpo LIMIT 1;
    IF v_chip_id IS NULL THEN
      INSERT INTO public.chips (iccid, operadora, linha, status)
      VALUES (v_iccid_limpo, COALESCE(NULLIF(TRIM(p_operadora), ''), 'Vivo'), NULLIF(TRIM(p_linha), ''), 'vinculado')
      RETURNING id INTO v_chip_id;
    ELSE
      UPDATE public.chips
      SET 
        operadora = COALESCE(NULLIF(TRIM(p_operadora), ''), operadora),
        linha = COALESCE(NULLIF(TRIM(p_linha), ''), linha),
        status = 'vinculado',
        updated_at = NOW()
      WHERE id = v_chip_id;
    END IF;
  END IF;

  -- 2. Localizar ou cadastrar o rastreador
  IF v_rastreador_id IS NOT NULL THEN
    UPDATE public.rastreadores
    SET 
      imei = v_imei_limpo,
      modelo = COALESCE(NULLIF(TRIM(p_modelo), ''), modelo),
      chip_id = v_chip_id,
      updated_at = NOW()
    WHERE id = v_rastreador_id;
  ELSE
    SELECT id INTO v_rastreador_id FROM public.rastreadores WHERE imei = v_imei_limpo LIMIT 1;
    IF v_rastreador_id IS NOT NULL THEN
      UPDATE public.rastreadores
      SET 
        modelo = COALESCE(NULLIF(TRIM(p_modelo), ''), modelo),
        chip_id = COALESCE(v_chip_id, chip_id),
        updated_at = NOW()
      WHERE id = v_rastreador_id;
    ELSE
      INSERT INTO public.rastreadores (imei, modelo, chip_id, status)
      VALUES (v_imei_limpo, COALESCE(NULLIF(TRIM(p_modelo), ''), 'J16 4G'), v_chip_id, 'estoque')
      RETURNING id INTO v_rastreador_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Equipamento e chip salvos com sucesso no estoque.',
    'rastreador_id', v_rastreador_id,
    'chip_id', v_chip_id,
    'liberado_instalacao', (v_chip_id IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_rastreador_com_chip(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- 9. RPC: Desvincular chip de rastreador
CREATE OR REPLACE FUNCTION public.desvincular_chip_rastreador(p_rastreador_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chip_id UUID;
BEGIN
  SELECT chip_id INTO v_chip_id FROM public.rastreadores WHERE id = p_rastreador_id;
  
  UPDATE public.rastreadores
  SET chip_id = NULL, updated_at = NOW()
  WHERE id = p_rastreador_id;

  IF v_chip_id IS NOT NULL THEN
    UPDATE public.chips
    SET status = 'disponivel', updated_at = NOW()
    WHERE id = v_chip_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Chip desvinculado do rastreador com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.desvincular_chip_rastreador(UUID) TO authenticated;

-- 10. RPC: Operador determinar kit para cliente / instalação
CREATE OR REPLACE FUNCTION public.operador_determinar_kit_cliente(
  p_cliente_id UUID,
  p_rastreador_id UUID,
  p_instalacao_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_rastreador RECORD;
  v_instalador_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id LIMIT 1;
    IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Apenas a administração pode determinar kits de instalação.');
    END IF;
  END IF;

  -- 1. Validar se o rastreador está liberado (tem chip e está em estoque ou em instalacao para este cliente)
  SELECT r.id, r.imei, r.modelo, r.chip_id, r.status, c.iccid, c.operadora
  INTO v_rastreador
  FROM public.rastreadores r
  INNER JOIN public.chips c ON c.id = r.chip_id
  WHERE r.id = p_rastreador_id;

  IF v_rastreador.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Equipamento selecionado não está habilitado para instalação. Certifique-se de que possui IMEI e ICCID vinculados no estoque.');
  END IF;

  -- 2. Atualizar o cliente com o kit determinado
  SELECT instalador_id INTO v_instalador_id FROM public.clientes WHERE id = p_cliente_id;

  UPDATE public.clientes
  SET 
    kit_determinado_id = p_rastreador_id,
    status_agendamento = COALESCE(status_agendamento, 'aguardando_agendamento'),
    updated_at = NOW()
  WHERE id = p_cliente_id;

  -- 3. Marcar status do rastreador como em_instalacao
  UPDATE public.rastreadores
  SET status = 'em_instalacao', updated_at = NOW()
  WHERE id = p_rastreador_id;

  -- 4. Se houver ordem de instalacao vinculada, atualizar ou sincronizar
  IF p_instalacao_id IS NOT NULL THEN
    UPDATE public.instalacoes
    SET 
      rastreador_id = p_rastreador_id,
      rastreador_imei = v_rastreador.imei,
      rastreador_modelo = v_rastreador.modelo,
      chip_iccid = v_rastreador.iccid,
      chip_operadora = v_rastreador.operadora,
      kit_determinado_em = NOW(),
      updated_at = NOW()
    WHERE id = p_instalacao_id;
  ELSE
    -- Procura se ja existe instalacao aberta para este cliente
    UPDATE public.instalacoes
    SET 
      rastreador_id = p_rastreador_id,
      rastreador_imei = v_rastreador.imei,
      rastreador_modelo = v_rastreador.modelo,
      chip_iccid = v_rastreador.iccid,
      chip_operadora = v_rastreador.operadora,
      kit_determinado_em = NOW(),
      updated_at = NOW()
    WHERE cliente_id = p_cliente_id AND status != 'concluida';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kit determinado com sucesso para o cliente.',
    'imei', v_rastreador.imei,
    'iccid', v_rastreador.iccid,
    'modelo', v_rastreador.modelo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.operador_determinar_kit_cliente(UUID, UUID, UUID) TO authenticated;

-- 11. RPC: Instalador confirmar kit recebido (por código de barras ou digitação)
CREATE OR REPLACE FUNCTION public.instalador_confirmar_kit(
  p_instalacao_id UUID,
  p_imei_conferido TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_inst RECORD;
  v_imei_limpo TEXT;
  v_imei_esperado_limpo TEXT;
BEGIN
  v_user_id := auth.uid();
  v_imei_limpo := REGEXP_REPLACE(p_imei_conferido, '\D', '', 'g');

  IF v_imei_limpo IS NULL OR LENGTH(v_imei_limpo) < 8 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Código IMEI inválido. Aponte a câmera para o código de barras ou digite o número correto.');
  END IF;

  SELECT 
    i.id, i.cliente_id, i.instalador_id, i.status, i.rastreador_id, i.rastreador_imei,
    r.imei AS imei_rastreador_real
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.rastreadores r ON r.id = i.rastreador_id
  WHERE i.id = p_instalacao_id;

  IF v_inst.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada.');
  END IF;

  v_imei_esperado_limpo := REGEXP_REPLACE(COALESCE(v_inst.imei_rastreador_real, v_inst.rastreador_imei, ''), '\D', '', 'g');

  IF v_imei_esperado_limpo = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta demanda ainda não possui um kit determinado pela administração.');
  END IF;

  IF v_imei_limpo <> v_imei_esperado_limpo THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Divergência de equipamento: o IMEI lido (' || v_imei_limpo || ') não corresponde ao kit determinado pela administração (' || v_imei_esperado_limpo || '). Verifique o aparelho em sua posse.'
    );
  END IF;

  -- Marcação canônica de confirmação física do kit
  UPDATE public.instalacoes
  SET 
    kit_confirmado_instalador = TRUE,
    kit_confirmado_em = NOW(),
    imei_confirmado = v_imei_limpo,
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kit físico confirmado com sucesso pelo instalador!',
    'imei', v_imei_limpo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_confirmar_kit(UUID, TEXT) TO authenticated;

-- 12. Políticas RLS para public.rastreadores e public.chips
ALTER TABLE public.rastreadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe visualiza rastreadores estoque" ON public.rastreadores;
CREATE POLICY "Equipe visualiza rastreadores estoque"
ON public.rastreadores FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  -- Instalador pode consultar rastreadores liberados ou de suas ordens
  status = 'estoque'
  OR
  EXISTS (
    SELECT 1 FROM public.instalacoes i
    WHERE i.rastreador_id = rastreadores.id 
    AND i.instalador_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins gerenciam rastreadores estoque" ON public.rastreadores;
CREATE POLICY "Admins gerenciam rastreadores estoque"
ON public.rastreadores FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('superadmin', 'adm', 'operador')
  )
);

DROP POLICY IF EXISTS "Equipe visualiza chips estoque" ON public.chips;
CREATE POLICY "Equipe visualiza chips estoque"
ON public.chips FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  -- Instalador pode consultar chips dos rastreadores autorizados
  EXISTS (
    SELECT 1 FROM public.rastreadores r
    WHERE r.chip_id = chips.id
  )
);

DROP POLICY IF EXISTS "Admins gerenciam chips estoque" ON public.chips;
CREATE POLICY "Admins gerenciam chips estoque"
ON public.chips FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() 
    AND p.role IN ('superadmin', 'adm', 'operador')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('superadmin', 'adm', 'operador')
  )
);

-- Recarregar cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
