-- ============================================================================
-- HUNTER — AMPLIAÇÃO CANÔNICA DE chk_tipo_veiculo + PLACA FLEXÍVEL (uq_veiculos_placa_real)
-- Migration: 20261112190000_hunter_tipo_veiculo_moto_eletrica_e_placa_flexivel.sql
-- ============================================================================

-- 1. Atualiza constraint chk_tipo_veiculo em public.veiculos para aceitar todos
--    os tipos oficiais da UI/mapa (incluindo moto_eletrica, quadriciculo/quadriciclo,
--    van, ambulancia, maquina, trator, equipamento e outro)
ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS chk_tipo_veiculo;
ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS veiculos_tipo_veiculo_check;

ALTER TABLE public.veiculos
  ADD CONSTRAINT chk_tipo_veiculo
  CHECK (
    tipo_veiculo IN (
      'carro',
      'moto',
      'moto_eletrica',
      'caminhao',
      'van',
      'ambulancia',
      'onibus',
      'suv',
      'camionete',
      'quadriciculo',
      'quadriciclo',
      'triciclo',
      'jetski',
      'maquina',
      'trator',
      'equipamento',
      'outro'
    )
  );

-- 2. Substitui a constraint/índice rígido veiculos_placa_key pelo índice único parcial
--    uq_veiculos_placa_real, permitindo múltiplos veículos com placeholders
--    ('SEMPLACA', 'SEM PLACA', 'A DEFINIR', 'S/PLACA') enquanto o instalador não preenche
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.veiculos'::regclass AND conname = 'veiculos_placa_key'
  ) THEN
    ALTER TABLE public.veiculos DROP CONSTRAINT veiculos_placa_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'veiculos' AND indexname = 'veiculos_placa_key'
  ) THEN
    DROP INDEX public.veiculos_placa_key;
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_veiculos_placa_real;
CREATE UNIQUE INDEX uq_veiculos_placa_real
  ON public.veiculos (UPPER(TRIM(placa)))
  WHERE placa IS NOT NULL
    AND UPPER(TRIM(placa)) NOT IN ('SEMPLACA', 'SEM PLACA', 'A DEFINIR', 'S/PLACA');

-- 3. Atualiza a RPC public.admin_editar_veiculo (assinatura com p_tipo_veiculo)
CREATE OR REPLACE FUNCTION public.admin_editar_veiculo(
  p_veiculo_id UUID,
  p_placa TEXT,
  p_marca_modelo TEXT,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_tipo_veiculo TEXT DEFAULT 'carro'
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
  v_tipo_sanitizado TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF COALESCE(v_role, '') NOT IN ('superadmin', 'adm', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem editar veículos.';
    END IF;
  END IF;

  IF UPPER(TRIM(COALESCE(p_placa, ''))) IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA', 'S/PLACA') THEN
    v_placa_limpa := CASE
      WHEN UPPER(TRIM(p_placa)) = 'A DEFINIR' THEN 'A DEFINIR'
      ELSE 'SEMPLACA'
    END;
  ELSE
    v_placa_limpa := UPPER(REGEXP_REPLACE(COALESCE(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  END IF;

  IF v_placa_limpa IS NULL OR LENGTH(v_placa_limpa) < 3 THEN
    RAISE EXCEPTION 'Placa inválida para o veículo.';
  END IF;

  v_tipo_sanitizado := LOWER(TRIM(COALESCE(p_tipo_veiculo, 'carro')));
  IF v_tipo_sanitizado = 'quadriciclo' THEN
    v_tipo_sanitizado := 'quadriciculo';
  END IF;

  IF v_tipo_sanitizado NOT IN (
    'carro', 'moto', 'moto_eletrica', 'caminhao', 'van', 'ambulancia',
    'onibus', 'suv', 'camionete', 'quadriciculo', 'triciclo', 'jetski',
    'maquina', 'trator', 'equipamento', 'outro'
  ) THEN
    v_tipo_sanitizado := 'carro';
  END IF;

  UPDATE public.veiculos
  SET
    placa = v_placa_limpa,
    marca_modelo = TRIM(p_marca_modelo),
    ano = p_ano,
    cor = NULLIF(TRIM(p_cor), ''),
    tipo_veiculo = v_tipo_sanitizado,
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa_limpa,
    'tipo_veiculo', v_tipo_sanitizado,
    'mensagem', 'Dados do veículo atualizados com sucesso.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_editar_veiculo(UUID, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_editar_veiculo(UUID, TEXT, TEXT, INT, TEXT, TEXT) TO authenticated, service_role;

-- 4. Atualiza a RPC public.cliente_solicitar_novo_veiculo para suportar moto_eletrica
--    e padronizar placa 'SEMPLACA' + normalização de quadriciclo -> quadriciculo
CREATE OR REPLACE FUNCTION public.cliente_solicitar_novo_veiculo(
  p_cliente_id UUID,
  p_tipo_veiculo TEXT DEFAULT 'carro'::TEXT,
  p_placa TEXT DEFAULT 'A DEFINIR'::TEXT,
  p_marca_modelo TEXT DEFAULT 'Veiculo'::TEXT,
  p_ano INTEGER DEFAULT NULL::INTEGER,
  p_cor TEXT DEFAULT NULL::TEXT,
  p_observacoes TEXT DEFAULT NULL::TEXT,
  p_horimetro NUMERIC DEFAULT 0
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

  SELECT role::TEXT, email INTO v_role, v_user_email FROM public.profiles WHERE id = v_user_id;

  SELECT id, user_id, email, status INTO v_cliente
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  IF COALESCE(v_role, 'cliente') NOT IN ('superadmin', 'adm', 'operador') THEN
    IF v_cliente.user_id IS DISTINCT FROM v_user_id THEN
      IF LOWER(COALESCE(v_cliente.email, '')) = LOWER(COALESCE(v_user_email, '')) THEN
        UPDATE public.clientes SET user_id = v_user_id WHERE id = p_cliente_id;
      ELSE
        RAISE EXCEPTION 'Acesso negado: voce so pode solicitar veiculos para a sua propria conta.';
      END IF;
    END IF;
  END IF;

  v_tipo_final := LOWER(TRIM(COALESCE(p_tipo_veiculo, 'carro')));
  IF v_tipo_final = 'quadriciclo' THEN
    v_tipo_final := 'quadriciculo';
  END IF;

  IF v_tipo_final NOT IN (
    'carro', 'moto', 'moto_eletrica', 'caminhao', 'van', 'ambulancia',
    'onibus', 'suv', 'camionete', 'quadriciculo', 'triciclo', 'jetski',
    'maquina', 'trator', 'equipamento', 'outro'
  ) THEN
    v_tipo_final := 'carro';
  END IF;

  v_is_maquina := (v_tipo_final IN ('maquina', 'trator', 'equipamento', 'moto_eletrica'));

  IF v_is_maquina AND (
    p_placa IS NULL OR TRIM(p_placa) = '' OR UPPER(TRIM(p_placa)) IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA', 'S/PLACA')
  ) THEN
    v_placa_final := 'SEMPLACA';
  ELSE
    v_placa_final := UPPER(TRIM(COALESCE(NULLIF(TRIM(p_placa), ''), 'A DEFINIR')));
  END IF;

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
    TRIM(COALESCE(NULLIF(TRIM(p_marca_modelo), ''), 'Veiculo')),
    p_ano,
    NULLIF(TRIM(p_cor), ''),
    v_tipo_final,
    COALESCE(p_horimetro, 0),
    FALSE,
    FALSE,
    TRUE
  )
  RETURNING id INTO v_veiculo_id;

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
    TRIM(COALESCE(NULLIF(TRIM(p_marca_modelo), ''), 'Veiculo')),
    p_ano,
    NULLIF(TRIM(p_cor), ''),
    v_tipo_final,
    'A DEFINIR',
    'J16 4G',
    'nao_instalado',
    COALESCE(p_observacoes, 'Solicitacao de novo veiculo enviada pelo cliente. Aguardando configuracao do operador.')
  );

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

REVOKE ALL ON FUNCTION public.cliente_solicitar_novo_veiculo(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_solicitar_novo_veiculo(UUID, TEXT, TEXT, TEXT, INT, TEXT, TEXT, NUMERIC) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
