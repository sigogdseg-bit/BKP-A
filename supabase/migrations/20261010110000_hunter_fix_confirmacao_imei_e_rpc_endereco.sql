-- ==============================================================================
-- HUNTER / GD RASTREAMENTO - CORREÇÃO DEFINITIVA DE CONFERÊNCIA DE IMEI E RPCs DE ENDEREÇO
-- 1. Permite validar qualquer IMEI conferido se bater com o kit esperado (sem bloqueio de tamanho mínimo)
-- 2. Assegura a existência e permissões de RPCs para solicitação e envio de endereço
-- 3. Invalida o cache do PostgREST (Zero Schema Cache Error)
-- ==============================================================================

-- 1. RPC: Instalador confirmar kit recebido (por código de barras ou digitação)
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
  v_conferido_limpo TEXT;
  v_esperado_limpo TEXT;
  v_conferido_digitos TEXT;
  v_esperado_digitos TEXT;
  v_conferido_alnum TEXT;
  v_esperado_alnum TEXT;
  v_confere BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  
  IF p_imei_conferido IS NULL OR TRIM(p_imei_conferido) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Informe o código IMEI ou aponte a câmera para o código de barras.');
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

  v_conferido_limpo := UPPER(TRIM(p_imei_conferido));
  v_esperado_limpo := UPPER(TRIM(COALESCE(v_inst.imei_rastreador_real, v_inst.rastreador_imei, '')));
  v_conferido_digitos := REGEXP_REPLACE(p_imei_conferido, '\D', '', 'g');
  v_esperado_digitos := REGEXP_REPLACE(COALESCE(v_inst.imei_rastreador_real, v_inst.rastreador_imei, ''), '\D', '', 'g');
  v_conferido_alnum := REGEXP_REPLACE(v_conferido_limpo, '[^0-9A-Z]', '', 'g');
  v_esperado_alnum := REGEXP_REPLACE(v_esperado_limpo, '[^0-9A-Z]', '', 'g');

  IF v_esperado_limpo = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta demanda ainda não possui um kit determinado pela administração.');
  END IF;

  -- REGRA DE OURO: Se o valor bater com o IMEI esperado, VALIDA SEMPRE!
  IF v_conferido_limpo = v_esperado_limpo THEN
    v_confere := TRUE;
  ELSIF v_conferido_alnum <> '' AND v_esperado_alnum <> '' AND v_conferido_alnum = v_esperado_alnum THEN
    v_confere := TRUE;
  ELSIF v_conferido_digitos <> '' AND v_esperado_digitos <> '' AND v_conferido_digitos = v_esperado_digitos THEN
    v_confere := TRUE;
  END IF;

  IF NOT v_confere THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Divergência de equipamento: o IMEI digitado/lido (' || p_imei_conferido || ') não corresponde ao kit esperado (' || v_esperado_limpo || '). Verifique o aparelho em sua posse.'
    );
  END IF;

  -- Marcação canônica de confirmação física do kit
  UPDATE public.instalacoes
  SET 
    kit_confirmado_instalador = TRUE,
    kit_confirmado_em = NOW(),
    imei_confirmado = v_conferido_limpo,
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Kit físico confirmado com sucesso pelo instalador!',
    'imei', v_conferido_limpo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_confirmar_kit(UUID, TEXT) TO authenticated;

-- 2. Garantir colunas em instalacoes se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'solicita_endereco_cliente') THEN
    ALTER TABLE public.instalacoes ADD COLUMN solicita_endereco_cliente BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'solicitado_endereco_em') THEN
    ALTER TABLE public.instalacoes ADD COLUMN solicitado_endereco_em TIMESTAMPTZ DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'endereco_cliente_informado') THEN
    ALTER TABLE public.instalacoes ADD COLUMN endereco_cliente_informado TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'endereco_cliente_informado_em') THEN
    ALTER TABLE public.instalacoes ADD COLUMN endereco_cliente_informado_em TIMESTAMPTZ DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'local_tipo') THEN
    ALTER TABLE public.instalacoes ADD COLUMN local_tipo TEXT DEFAULT 'oficina';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'instalacoes' AND column_name = 'local_endereco') THEN
    ALTER TABLE public.instalacoes ADD COLUMN local_endereco TEXT DEFAULT NULL;
  END IF;
END $$;

-- 3. RPC: Instalador solicita que o cliente informe o endereço
CREATE OR REPLACE FUNCTION public.instalador_solicitar_endereco_cliente(
  p_instalacao_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_inst RECORD;
  v_instalador_nome TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role, nome INTO v_role, v_instalador_nome FROM public.profiles WHERE id = v_caller_id;

  SELECT 
    i.id, i.cliente_id, i.placa, i.instalador_id, i.status,
    c.user_id AS cliente_user_id, c.nome_razao_social
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id;

  IF v_inst.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada.');
  END IF;

  IF v_role = 'instalador' AND v_inst.instalador_id <> v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada. Esta instalação pertence a outro profissional.');
  END IF;

  -- 1. Atualizar ordem de instalação
  UPDATE public.instalacoes
  SET 
    solicita_endereco_cliente = TRUE,
    solicitado_endereco_em = NOW(),
    local_tipo = 'local_veiculo',
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- 2. Notificação instantânea para o cliente
  IF v_inst.cliente_user_id IS NOT NULL THEN
    INSERT INTO public.notificacoes_sistema (
      destinatario_user_id,
      remetente_user_id,
      remetente_nome,
      titulo,
      mensagem,
      tipo,
      url,
      placa
    ) VALUES (
      v_inst.cliente_user_id,
      v_caller_id,
      COALESCE(v_instalador_nome, 'Técnico Instalador'),
      '📍 Endereço de Atendimento Necessário',
      'O instalador precisa do endereço onde o veículo ' || COALESCE(v_inst.placa, '') || ' estará para realizar o atendimento presencial.',
      'agendamento',
      '/login',
      v_inst.placa
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Solicitação de endereço enviada com sucesso ao cliente!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_solicitar_endereco_cliente(UUID) TO authenticated;

-- 4. RPC: Cliente informa o endereço
CREATE OR REPLACE FUNCTION public.cliente_informar_endereco_instalacao(
  p_instalacao_id UUID,
  p_endereco TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_inst RECORD;
  v_cliente_nome TEXT;
  v_endereco_limpo TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  v_endereco_limpo := TRIM(p_endereco);
  IF v_endereco_limpo IS NULL OR v_endereco_limpo = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Informe um endereço válido.');
  END IF;

  SELECT 
    i.id, i.cliente_id, i.placa, i.instalador_id, i.status,
    c.user_id AS cliente_user_id, c.nome_razao_social
  INTO v_inst
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id;

  IF v_inst.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada.');
  END IF;

  v_cliente_nome := COALESCE(v_inst.nome_razao_social, 'Cliente');

  -- 1. Atualizar ordem de instalação
  UPDATE public.instalacoes
  SET 
    endereco_cliente_informado = v_endereco_limpo,
    local_endereco = v_endereco_limpo,
    local_tipo = 'local_veiculo',
    solicita_endereco_cliente = FALSE,
    endereco_cliente_informado_em = NOW(),
    updated_at = NOW()
  WHERE id = p_instalacao_id;

  -- 2. Notificação instantânea para o instalador
  IF v_inst.instalador_id IS NOT NULL THEN
    INSERT INTO public.notificacoes_sistema (
      destinatario_user_id,
      remetente_user_id,
      remetente_nome,
      titulo,
      mensagem,
      tipo,
      url,
      placa
    ) VALUES (
      v_inst.instalador_id,
      v_caller_id,
      v_cliente_nome,
      '📍 Endereço Informado pelo Cliente: ' || COALESCE(v_inst.placa, ''),
      'Cliente informou o endereço: ' || v_endereco_limpo || ' para instalação no veículo ' || COALESCE(v_inst.placa, '') || '.',
      'agendamento',
      '/instalacao',
      v_inst.placa
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Endereço registrado com sucesso! O instalador foi notificado imediatamente.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_informar_endereco_instalacao(UUID, TEXT) TO authenticated;

-- 5. Invalidação obrigatória de cache do PostgREST
NOTIFY pgrst, 'reload schema';
