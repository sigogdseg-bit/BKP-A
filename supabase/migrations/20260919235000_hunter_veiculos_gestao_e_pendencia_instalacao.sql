-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Gestão Individual de Veículos e Pendência de Instalação
-- Versão Canônica: 1.5.5.0
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. RPC para Bloquear ou Desbloquear Veículo Individualmente
CREATE OR REPLACE FUNCTION public.admin_bloquear_desbloquear_veiculo(
  p_veiculo_id UUID,
  p_bloquear BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_placa TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem alterar o bloqueio de veículos.';
    END IF;
  END IF;

  SELECT placa INTO v_placa FROM public.veiculos WHERE id = p_veiculo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  UPDATE public.veiculos
  SET
    bloqueado = p_bloquear,
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa,
    'bloqueado', p_bloquear,
    'mensagem', CASE WHEN p_bloquear THEN 'Veículo bloqueado com sucesso.' ELSE 'Veículo desbloqueado com sucesso.' END
  );
END;
$$;

-- 2. RPC para Editar Dados Cadastrais de Veículo Individualmente
CREATE OR REPLACE FUNCTION public.admin_editar_veiculo(
  p_veiculo_id UUID,
  p_placa TEXT,
  p_marca_modelo TEXT,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_placa_limpa TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem editar veículos.';
    END IF;
  END IF;

  v_placa_limpa := UPPER(trim(p_placa));
  IF v_placa_limpa IS NULL OR v_placa_limpa = '' THEN
    RAISE EXCEPTION 'A placa do veículo é obrigatória.';
  END IF;

  IF p_marca_modelo IS NULL OR trim(p_marca_modelo) = '' THEN
    RAISE EXCEPTION 'A marca e modelo do veículo são obrigatórios.';
  END IF;

  -- Verifica se a placa já pertence a outro veículo
  IF EXISTS (SELECT 1 FROM public.veiculos WHERE placa = v_placa_limpa AND id <> p_veiculo_id) THEN
    RAISE EXCEPTION 'Esta placa já está cadastrada em outro veículo.';
  END IF;

  UPDATE public.veiculos
  SET
    placa = v_placa_limpa,
    marca_modelo = trim(p_marca_modelo),
    ano = p_ano,
    cor = NULLIF(trim(p_cor), ''),
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa_limpa,
    'mensagem', 'Dados do veículo atualizados com sucesso.'
  );
END;
$$;

-- 3. RPC para Excluir Veículo com Segurança
CREATE OR REPLACE FUNCTION public.admin_excluir_veiculo(
  p_veiculo_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_placa TEXT;
  v_cliente_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem excluir veículos.';
    END IF;
  END IF;

  SELECT placa, cliente_id INTO v_placa, v_cliente_id
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  -- Desvincula da tabela de instalações se houver
  UPDATE public.instalacoes
  SET veiculo_id = NULL
  WHERE veiculo_id = p_veiculo_id;

  -- Deleta o veículo (telemetria e viagens têm ON DELETE CASCADE)
  DELETE FROM public.veiculos WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'cliente_id', v_cliente_id,
    'placa', v_placa,
    'mensagem', 'Veículo excluído com sucesso.'
  );
END;
$$;

-- 4. RPC para Gerar Pendência de Instalação / Agendamento para o Instalador
CREATE OR REPLACE FUNCTION public.admin_gerar_pendencia_instalacao_cliente(
  p_cliente_id UUID,
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_cliente RECORD;
  v_tem_veiculo_ativo BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem gerar pendência de instalação.';
    END IF;
  END IF;

  SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  -- Verifica se o cliente possui algum veículo ativo com rastreador
  SELECT EXISTS (
    SELECT 1 FROM public.veiculos
    WHERE cliente_id = p_cliente_id AND ativo = true AND rastreador_id IS NOT NULL
  ) INTO v_tem_veiculo_ativo;

  UPDATE public.clientes
  SET
    instalador_id = COALESCE(p_instalador_id, instalador_id),
    status_agendamento = 'aguardando_agendamento',
    data_agendamento = NULL,
    hora_agendamento = NULL,
    -- Se não tiver veículos ativos, status operacional fica aguardando instalação
    status = CASE WHEN v_tem_veiculo_ativo THEN status ELSE 'aguardando_instalacao' END,
    updated_at = NOW()
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'cliente_id', p_cliente_id,
    'status_agendamento', 'aguardando_agendamento',
    'mensagem', 'Pendência de instalação gerada com sucesso para o instalador.'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
