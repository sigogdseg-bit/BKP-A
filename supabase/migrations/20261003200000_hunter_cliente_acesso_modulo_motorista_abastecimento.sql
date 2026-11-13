-- ============================================================================
-- MIGRATION: Habilitação de Acesso ao Módulo de Abastecimento/Motorista para Clientes Titulares e Administradores
-- Diretrizes: DJR-NEW · RLS Estrito · Zero Mock · Anti-Polling
-- ============================================================================

-- 1. Atualiza get_meu_perfil_motorista para suportar:
--    a) Motorista cadastrado na tabela motoristas (prioridade operacional)
--    b) Cliente titular na tabela clientes (acesso direto do dono/gestor do veículo)
--    c) SuperADM/ADM/Operador (acesso administrativo ao portal)
CREATE OR REPLACE FUNCTION public.get_meu_perfil_motorista()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Faca login novamente.';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Auto-cura: se o motorista foi cadastrado com este e-mail mas user_id ficou divergente
  UPDATE public.motoristas
  SET user_id = v_uid
  WHERE user_id IS DISTINCT FROM v_uid
    AND LOWER(email) = LOWER(v_email)
    AND ativo = TRUE;

  -- 1. Tenta encontrar perfil de motorista direto
  SELECT jsonb_build_object(
    'id',            m.id,
    'nome',          m.nome,
    'email',         m.email,
    'cpf',           m.cpf,
    'telefone',      m.telefone,
    'cnh_numero',    m.cnh_numero,
    'cnh_categoria', m.cnh_categoria,
    'cnh_validade',  m.cnh_validade,
    'cnh_foto_url',  m.cnh_foto_url,
    'acesso_mapa',   m.acesso_mapa,
    'cliente_id',    m.cliente_id,
    'cliente_nome',  c.nome_razao_social
  )
  INTO v_result
  FROM public.motoristas m
  INNER JOIN public.clientes c ON c.id = m.cliente_id
  WHERE m.user_id = v_uid AND m.ativo = TRUE
  LIMIT 1;

  -- 2. Se não encontrou motorista, verifica se o usuário é o próprio CLIENTE titular
  IF v_result IS NULL THEN
    SELECT jsonb_build_object(
      'id',            c.id,
      'nome',          c.nome_razao_social,
      'email',         COALESCE(c.email, v_email),
      'cpf',           c.documento,
      'telefone',      c.telefone,
      'cnh_numero',    NULL,
      'cnh_categoria', NULL,
      'cnh_validade',  NULL,
      'cnh_foto_url',  NULL,
      'acesso_mapa',   TRUE,
      'cliente_id',    c.id,
      'cliente_nome',  c.nome_razao_social
    )
    INTO v_result
    FROM public.clientes c
    WHERE c.user_id = v_uid AND (c.status = 'ativo' OR c.status IS NULL)
    LIMIT 1;
  END IF;

  -- 3. Se for SuperADM / ADM / Operador, provê acesso administrativo
  IF v_result IS NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid AND role IN ('superadmin','adm','operador')
  ) THEN
    SELECT jsonb_build_object(
      'id',            c.id,
      'nome',          'Gestão (' || c.nome_razao_social || ')',
      'email',         v_email,
      'cpf',           c.documento,
      'telefone',      c.telefone,
      'cnh_numero',    NULL,
      'cnh_categoria', NULL,
      'cnh_validade',  NULL,
      'cnh_foto_url',  NULL,
      'acesso_mapa',   TRUE,
      'cliente_id',    c.id,
      'cliente_nome',  c.nome_razao_social
    )
    INTO v_result
    FROM public.clientes c
    WHERE (c.status = 'ativo' OR c.status IS NULL)
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Perfil de motorista ou cliente nao encontrado.';
  END IF;

  RETURN v_result;
END;
$$;

-- 2. Atualiza listar_veiculos_portal_motorista para suportar clientes titulares e administradores
CREATE OR REPLACE FUNCTION public.listar_veiculos_portal_motorista()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_motorista_id UUID;
  v_cliente_id UUID;
  v_tem_vinculo BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 1. Tenta identificar se o usuário é um motorista cadastrado
  SELECT id, cliente_id INTO v_motorista_id, v_cliente_id
  FROM public.motoristas
  WHERE user_id = v_uid AND ativo = TRUE
  LIMIT 1;

  -- 2. Se não for motorista, verifica se é o próprio CLIENTE titular
  IF v_motorista_id IS NULL THEN
    SELECT id INTO v_cliente_id
    FROM public.clientes
    WHERE user_id = v_uid AND (status = 'ativo' OR status IS NULL)
    LIMIT 1;

    -- Se for admin/superadmin e não for cliente direto, busca primeiro cliente ativo
    IF v_cliente_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_uid AND role IN ('superadmin','adm','operador')
    ) THEN
      SELECT id INTO v_cliente_id FROM public.clientes WHERE (status = 'ativo' OR status IS NULL) ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_cliente_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'motorista_id', NULL,
          'veiculo_id', v.id,
          'ativo', TRUE,
          'created_at', v.created_at,
          'veiculo_placa', v.placa,
          'veiculo_modelo', v.marca_modelo,
          'veiculo_cor', v.cor,
          'odometro_km', COALESCE(v.odometro_km, 0),
          'ultima_latitude', v.ultima_latitude,
          'ultima_longitude', v.ultima_longitude,
          'ignicao_status', COALESCE(v.ignicao_status, FALSE),
          'velocidade_atual', COALESCE(v.velocidade_atual, 0)
        ) ORDER BY v.placa ASC
      ), '[]'::jsonb)
      INTO v_result
      FROM public.veiculos v
      WHERE v.cliente_id = v_cliente_id
        AND v.ativo = TRUE;

      RETURN COALESCE(v_result, '[]'::jsonb);
    END IF;

    RETURN '[]'::jsonb;
  END IF;

  -- 3. Caso seja motorista com vínculos específicos na tabela motorista_veiculos
  SELECT EXISTS (
    SELECT 1 FROM public.motorista_veiculos
    WHERE motorista_id = v_motorista_id AND ativo = TRUE
  ) INTO v_tem_vinculo;

  IF v_tem_vinculo THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', mv.id,
        'motorista_id', mv.motorista_id,
        'veiculo_id', v.id,
        'ativo', mv.ativo,
        'created_at', mv.created_at,
        'veiculo_placa', v.placa,
        'veiculo_modelo', v.marca_modelo,
        'veiculo_cor', v.cor,
        'odometro_km', COALESCE(v.odometro_km, 0),
        'ultima_latitude', v.ultima_latitude,
        'ultima_longitude', v.ultima_longitude,
        'ignicao_status', COALESCE(v.ignicao_status, FALSE),
        'velocidade_atual', COALESCE(v.velocidade_atual, 0)
      ) ORDER BY v.placa ASC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.motorista_veiculos mv
    INNER JOIN public.veiculos v ON v.id = mv.veiculo_id
    WHERE mv.motorista_id = v_motorista_id
      AND mv.ativo = TRUE
      AND v.ativo = TRUE;
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'motorista_id', v_motorista_id,
        'veiculo_id', v.id,
        'ativo', TRUE,
        'created_at', v.created_at,
        'veiculo_placa', v.placa,
        'veiculo_modelo', v.marca_modelo,
        'veiculo_cor', v.cor,
        'odometro_km', COALESCE(v.odometro_km, 0),
        'ultima_latitude', v.ultima_latitude,
        'ultima_longitude', v.ultima_longitude,
        'ignicao_status', COALESCE(v.ignicao_status, FALSE),
        'velocidade_atual', COALESCE(v.velocidade_atual, 0)
      ) ORDER BY v.placa ASC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.veiculos v
    WHERE v.cliente_id = v_cliente_id
      AND v.ativo = TRUE;
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_meu_perfil_motorista TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_veiculos_portal_motorista TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
