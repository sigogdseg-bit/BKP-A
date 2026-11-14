-- ============================================================================
-- GD RASTREAMENTO — MÓDULO MOTORISTAS: VEÍCULOS DO CLIENTE E RLS COMPLETO
-- ============================================================================

-- 1. Função auxiliar VOLATILE para obter o cliente_id do motorista autenticado
CREATE OR REPLACE FUNCTION public.get_motorista_cliente_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT cliente_id FROM public.motoristas
  WHERE (user_id = auth.uid() OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())))
    AND ativo = TRUE
  LIMIT 1;
$$;

-- 2. Atualiza get_motorista_id com fallback por e-mail e auto-vínculo
CREATE OR REPLACE FUNCTION public.get_motorista_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT id FROM public.motoristas
  WHERE (user_id = auth.uid() OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())))
    AND ativo = TRUE
  LIMIT 1;
$$;

-- 3. Atualiza get_meu_perfil_motorista com auto-cura de user_id caso necessário
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

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Perfil de motorista nao encontrado.';
  END IF;

  RETURN v_result;
END;
$$;

-- 4. RPC para listar os veículos disponíveis do cliente do motorista autenticado
-- Se houver veículos especificamente vinculados em motorista_veiculos, retorna-os;
-- caso contrário, retorna todos os veículos ativos do cliente ao qual o motorista pertence.
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
  SELECT id, cliente_id INTO v_motorista_id, v_cliente_id
  FROM public.motoristas
  WHERE user_id = v_uid AND ativo = TRUE
  LIMIT 1;

  IF v_motorista_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

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
      AND v.ativo = TRUE
      AND v.placa NOT IN ('HTR4G16', 'HUN1T26');
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 5. Garantir primeiro_acesso = false para motoristas (senha já definida pelo cliente)
UPDATE public.profiles
SET primeiro_acesso = FALSE
WHERE role = 'motorista' AND primeiro_acesso IS DISTINCT FROM FALSE;

-- 6. Políticas RLS para Motorista acessar estritamente os veículos e manutenção do seu cliente

-- 6.1 Clientes (SELECT do próprio cliente vinculado ao motorista, necessário para joins de veículos)
DROP POLICY IF EXISTS "Motoristas visualizam seu cliente vinculado" ON public.clientes;
CREATE POLICY "Motoristas visualizam seu cliente vinculado"
ON public.clientes FOR SELECT TO authenticated
USING (id = public.get_motorista_cliente_id());

-- 6.2 Veículos (SELECT e UPDATE de odômetro restritos aos veículos do cliente do motorista)
DROP POLICY IF EXISTS "Motoristas visualizam veiculos do seu cliente" ON public.veiculos;
CREATE POLICY "Motoristas visualizam veiculos do seu cliente"
ON public.veiculos FOR SELECT TO authenticated
USING (cliente_id = public.get_motorista_cliente_id());

DROP POLICY IF EXISTS "Motoristas atualizam odometro de veiculos do seu cliente" ON public.veiculos;
CREATE POLICY "Motoristas atualizam odometro de veiculos do seu cliente"
ON public.veiculos FOR UPDATE TO authenticated
USING (cliente_id = public.get_motorista_cliente_id())
WITH CHECK (cliente_id = public.get_motorista_cliente_id());

-- 6.3 Telemetria (SELECT para motoristas do cliente)
DROP POLICY IF EXISTS "Motoristas visualizam telemetria de veiculos do seu cliente" ON public.telemetria_posicoes;
CREATE POLICY "Motoristas visualizam telemetria de veiculos do seu cliente"
ON public.telemetria_posicoes FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_motorista_cliente_id()
  )
);

-- 6.4 Manutenção Preventiva (SELECT, INSERT, UPDATE para alimentar troca de óleo e revisões)
DROP POLICY IF EXISTS "Motoristas gerenciam manutencao dos veiculos do seu cliente" ON public.planos_manutencao_preventiva;
CREATE POLICY "Motoristas gerenciam manutencao dos veiculos do seu cliente"
ON public.planos_manutencao_preventiva FOR ALL TO authenticated
USING (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_motorista_cliente_id()
  )
)
WITH CHECK (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_motorista_cliente_id()
  )
);

-- 6.5 Agendamentos de Manutenção
DROP POLICY IF EXISTS "Motoristas visualizam e criam agendamentos do seu cliente" ON public.agendamentos_manutencao;
CREATE POLICY "Motoristas visualizam e criam agendamentos do seu cliente"
ON public.agendamentos_manutencao FOR ALL TO authenticated
USING (cliente_id = public.get_motorista_cliente_id())
WITH CHECK (cliente_id = public.get_motorista_cliente_id());

-- 6.6 Alertas de Segurança (INSERT e SELECT para alertas de NF e manutenção)
DROP POLICY IF EXISTS "Motoristas registram alertas nos veiculos do seu cliente" ON public.alertas_seguranca;
CREATE POLICY "Motoristas registram alertas nos veiculos do seu cliente"
ON public.alertas_seguranca FOR ALL TO authenticated
USING (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_motorista_cliente_id()
  )
)
WITH CHECK (
  veiculo_id IN (
    SELECT id FROM public.veiculos WHERE cliente_id = public.get_motorista_cliente_id()
  )
);

NOTIFY pgrst, 'reload schema';
