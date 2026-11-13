-- Hunter — RPC Canônica SECURITY DEFINER para Solicitação de Novo Veículo pelo Cliente
-- Migration: 20261009101500_hunter_rpc_cliente_solicitar_novo_veiculo.sql

-- 1. Garante que as colunas necessárias existam
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS pendente_aprovacao_operador BOOLEAN DEFAULT FALSE;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS horimetro_horas NUMERIC DEFAULT 0;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS pendente_configuracao_operador BOOLEAN DEFAULT FALSE;

-- 2. Permissão de RLS: Clientes podem inserir veículos com status inativo pendente de aprovação
DROP POLICY IF EXISTS "Clientes podem solicitar novos veiculos para sua conta" ON public.veiculos;
CREATE POLICY "Clientes podem solicitar novos veiculos para sua conta"
ON public.veiculos FOR INSERT TO authenticated
WITH CHECK (
  ativo = FALSE 
  AND pendente_aprovacao_operador = TRUE
  AND cliente_id IN (
    SELECT id FROM public.clientes WHERE user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
  )
);

-- 3. Permissão de RLS: Clientes podem registrar ordens de instalacao pendentes para seus novos veiculos
DROP POLICY IF EXISTS "Clientes podem criar ordens de instalacao para seus veiculos pendentes" ON public.instalacoes;
CREATE POLICY "Clientes podem criar ordens de instalacao para seus veiculos pendentes"
ON public.instalacoes FOR INSERT TO authenticated
WITH CHECK (
  status = 'nao_instalado'
  AND cliente_id IN (
    SELECT id FROM public.clientes WHERE user_id = auth.uid() OR LOWER(email) = LOWER(auth.jwt() ->> 'email')
  )
);

-- 4. RPC SECURITY DEFINER para solicitar novo veículo de forma atômica e blindada
CREATE OR REPLACE FUNCTION public.cliente_solicitar_novo_veiculo(
  p_cliente_id UUID,
  p_tipo_veiculo TEXT DEFAULT 'carro',
  p_placa TEXT DEFAULT 'A DEFINIR',
  p_marca_modelo TEXT DEFAULT 'Veiculo',
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  p_horimetro NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_cliente RECORD;
  v_veiculo_id UUID;
  v_placa_final TEXT;
  v_tipo_final TEXT;
  v_is_maquina BOOLEAN;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autorizado. Faca login no sistema.';
  END IF;

  SELECT role, email INTO v_role, v_user_email FROM public.profiles WHERE id = v_user_id;

  -- Localiza o cliente
  SELECT id, user_id, email, status INTO v_cliente 
  FROM public.clientes 
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  -- Se for cliente comum, deve ser o titular da conta
  IF COALESCE(v_role, 'cliente') NOT IN ('superadmin', 'adm', 'operador') THEN
    IF v_cliente.user_id IS DISTINCT FROM v_user_id THEN
      -- Se user_id estiver nulo ou divergente, mas o email coincidir, corrige o vinculo agora
      IF LOWER(COALESCE(v_cliente.email, '')) = LOWER(COALESCE(v_user_email, '')) THEN
        UPDATE public.clientes SET user_id = v_user_id WHERE id = p_cliente_id;
      ELSE
        RAISE EXCEPTION 'Acesso negado: voce so pode solicitar veiculos para a sua propria conta.';
      END IF;
    END IF;
  END IF;

  v_tipo_final := LOWER(COALESCE(p_tipo_veiculo, 'carro'));
  v_is_maquina := (v_tipo_final IN ('maquina', 'trator', 'equipamento'));

  IF v_is_maquina AND (p_placa IS NULL OR TRIM(p_placa) = '' OR UPPER(TRIM(p_placa)) = 'A DEFINIR') THEN
    v_placa_final := 'SEM PLACA';
  ELSE
    v_placa_final := UPPER(TRIM(COALESCE(p_placa, 'A DEFINIR')));
  END IF;

  -- 1. Cria o veiculo com status inativo pendente de aprovacao
  INSERT INTO public.veiculos (
    cliente_id,
    placa,
    marca_modelo,
    ano,
    cor,
    tipo_veiculo,
    horimetro_horas,
    ativo,
    bloqueado,
    pendente_aprovacao_operador
  ) VALUES (
    p_cliente_id,
    v_placa_final,
    TRIM(COALESCE(p_marca_modelo, 'Veiculo')),
    p_ano,
    p_cor,
    v_tipo_final,
    COALESCE(p_horimetro, 0),
    FALSE,
    FALSE,
    TRUE
  )
  RETURNING id INTO v_veiculo_id;

  -- 2. Cria a ordem de instalacao individual
  INSERT INTO public.instalacoes (
    cliente_id,
    veiculo_id,
    placa,
    modelo,
    ano,
    cor,
    tipo_veiculo,
    rastreador_imei,
    rastreador_modelo,
    status,
    observacoes
  ) VALUES (
    p_cliente_id,
    v_veiculo_id,
    v_placa_final,
    TRIM(COALESCE(p_marca_modelo, 'Veiculo')),
    p_ano,
    p_cor,
    v_tipo_final,
    'A DEFINIR',
    'J16 4G',
    'nao_instalado',
    COALESCE(p_observacoes, 'Solicitacao de novo veiculo enviada pelo cliente. Aguardando configuracao do operador.')
  );

  -- 3. Sinaliza o cliente como pendente de configuracao pelo operador
  UPDATE public.clientes
  SET pendente_configuracao_operador = TRUE
  WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'veiculo_id', v_veiculo_id,
    'mensagem', 'Solicitacao de novo veiculo enviada com sucesso! Aguardando aprovacao da administracao.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_solicitar_novo_veiculo(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, NUMERIC) TO authenticated;

-- Recarregar cache de schema
NOTIFY pgrst, 'reload schema';
