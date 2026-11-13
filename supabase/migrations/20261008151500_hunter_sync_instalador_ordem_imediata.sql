-- ============================================================================
-- HUNTER — SINCRONIZAÇÃO IMEDIATA E ATÔMICA CLIENTE <-> INSTALADOR <-> INSTALAÇÕES
-- ============================================================================
-- 1. Garante constraint ampla de status em public.instalacoes (aceita agendada, aberta, nao_instalado, etc.)
-- 2. Trigger automático em public.clientes: ao vincular instalador_id, cria/atualiza imediatamente
--    a ordem de serviço em public.instalacoes e sincroniza o agendamento
-- 3. Trigger automático em public.veiculos: ao cadastrar/atualizar veículo do cliente, atualiza a ordem pendente
-- 4. RPC CANÔNICA com SECURITY DEFINER: public.instalador_obter_minhas_demandas()
--    Retorna instantaneamente ordens e agendamentos do instalador sem risco de restrições de RLS
-- 5. Sincronização retrô imediata para clientes com instalador já atribuído (ex: cliente Weidisson)
-- 6. Ativação no publication supabase_realtime e recarga do cache PostgREST
-- ============================================================================

-- 1. Ampliar status e garantir colunas da tabela public.instalacoes e public.clientes
DO $$
BEGIN
  ALTER TABLE public.chips ADD COLUMN IF NOT EXISTS operadora TEXT;
  ALTER TABLE public.chips ADD COLUMN IF NOT EXISTS iccid TEXT;
  ALTER TABLE public.rastreadores ADD COLUMN IF NOT EXISTS chip_id UUID;
  ALTER TABLE public.rastreadores ADD COLUMN IF NOT EXISTS imei TEXT;
  ALTER TABLE public.rastreadores ADD COLUMN IF NOT EXISTS modelo TEXT;

  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS kit_determinado_id UUID;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS rastreador_id UUID;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS kit_determinado_em TIMESTAMPTZ;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS kit_confirmado_instalador BOOLEAN DEFAULT FALSE;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS kit_confirmado_em TIMESTAMPTZ;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS imei_confirmado TEXT;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS data_agendamento DATE;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS hora_agendamento TEXT;
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT DEFAULT 'carro';
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS tipo_servico TEXT DEFAULT 'instalacao';
  ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS ordem_vinculada_id UUID;
  
  ALTER TABLE public.instalacoes DROP CONSTRAINT IF EXISTS instalacoes_status_check;
  ALTER TABLE public.instalacoes ADD CONSTRAINT instalacoes_status_check 
    CHECK (status IN ('nao_instalado', 'agendada', 'aberta', 'concluida_com_pendencia', 'concluida'));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Garantir coluna valor_instalacao com default seguro
DO $$
BEGIN
  ALTER TABLE public.instalacoes ALTER COLUMN valor_instalacao SET DEFAULT 50.00;
  ALTER TABLE public.instalacoes ALTER COLUMN km_instalacao SET DEFAULT 0;
  ALTER TABLE public.instalacoes ALTER COLUMN rastreador_imei DROP NOT NULL;
  ALTER TABLE public.instalacoes ALTER COLUMN placa DROP NOT NULL;
  ALTER TABLE public.instalacoes ALTER COLUMN marca DROP NOT NULL;
  ALTER TABLE public.instalacoes ALTER COLUMN modelo DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Função Trigger: Sincronizar criação/atualização de ordem ao associar instalador no cliente
CREATE OR REPLACE FUNCTION public.trg_sync_cliente_instalador_instalacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo_id UUID := NULL;
  v_veiculo_placa TEXT := NULL;
  v_veiculo_modelo TEXT := NULL;
  v_veiculo_tipo TEXT := NULL;
  v_rastreador_id UUID := NULL;
  v_rastreador_imei TEXT := NULL;
  v_rastreador_modelo TEXT := NULL;
  v_chip_iccid TEXT := NULL;
  v_chip_operadora TEXT := NULL;
  v_valor_unitario NUMERIC(10,2) := 50.00;
  v_instalacao_id UUID := NULL;
BEGIN
  -- Se o cliente possui instalador atribuído e ainda não está concluído
  IF NEW.instalador_id IS NOT NULL AND (NEW.status_agendamento IS DISTINCT FROM 'concluido' OR NEW.status = 'aguardando_instalacao') THEN
    
    -- Obter valor de repasse configurado para o instalador
    SELECT COALESCE(valor_por_instalacao, 50.00) INTO v_valor_unitario
    FROM public.profiles
    WHERE id = NEW.instalador_id;

    -- Verificar se já existe uma ordem aberta/agendada para este cliente
    SELECT id INTO v_instalacao_id
    FROM public.instalacoes
    WHERE cliente_id = NEW.id AND status NOT IN ('concluida')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Obter o veículo do cliente (se já cadastrado)
    SELECT id, placa, marca_modelo, tipo_veiculo
    INTO v_veiculo_id, v_veiculo_placa, v_veiculo_modelo, v_veiculo_tipo
    FROM public.veiculos
    WHERE cliente_id = NEW.id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Obter kit pré-determinado (se houver)
    IF NEW.kit_determinado_id IS NOT NULL THEN
      SELECT r.id, r.imei, r.modelo, c.iccid, c.operadora
      INTO v_rastreador_id, v_rastreador_imei, v_rastreador_modelo, v_chip_iccid, v_chip_operadora
      FROM public.rastreadores r
      LEFT JOIN public.chips c ON c.id = r.chip_id
      WHERE r.id = NEW.kit_determinado_id;
    END IF;

    IF v_instalacao_id IS NOT NULL THEN
      -- Atualiza a ordem existente com o novo instalador e novos horários
      UPDATE public.instalacoes
      SET 
        instalador_id = NEW.instalador_id,
        valor_instalacao = CASE WHEN valor_instalacao <= 0 THEN COALESCE(v_valor_unitario, 50.00) ELSE valor_instalacao END,
        veiculo_id = COALESCE(veiculo_id, v_veiculo_id),
        placa = CASE WHEN placa = 'A DEFINIR' OR placa IS NULL THEN COALESCE(v_veiculo_placa, 'A DEFINIR') ELSE placa END,
        marca = CASE WHEN marca = 'A DEFINIR' OR marca IS NULL THEN 'A DEFINIR' ELSE marca END,
        modelo = CASE WHEN modelo = 'Veículo do Cliente' OR modelo IS NULL THEN COALESCE(v_veiculo_modelo, 'Veículo do Cliente') ELSE modelo END,
        tipo_veiculo = COALESCE(tipo_veiculo, v_veiculo_tipo, 'carro'),
        rastreador_id = COALESCE(rastreador_id, v_rastreador_id),
        rastreador_imei = COALESCE(rastreador_imei, v_rastreador_imei, 'PENDENTE'),
        rastreador_modelo = COALESCE(rastreador_modelo, v_rastreador_modelo, 'J16 4G'),
        chip_iccid = COALESCE(chip_iccid, v_chip_iccid),
        chip_operadora = COALESCE(chip_operadora, v_chip_operadora),
        data_agendamento = COALESCE(NEW.data_agendamento, data_agendamento),
        hora_agendamento = COALESCE(NEW.hora_agendamento, hora_agendamento),
        updated_at = NOW()
      WHERE id = v_instalacao_id;
    ELSE
      -- Insere nova ordem de instalação vinculada imediatamente ao instalador
      INSERT INTO public.instalacoes (
        cliente_id,
        instalador_id,
        veiculo_id,
        placa,
        marca,
        modelo,
        tipo_veiculo,
        rastreador_id,
        rastreador_imei,
        rastreador_modelo,
        chip_iccid,
        chip_operadora,
        status,
        status_pagamento,
        valor_instalacao,
        data_agendamento,
        hora_agendamento,
        observacoes,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        NEW.instalador_id,
        v_veiculo_id,
        COALESCE(v_veiculo_placa, 'A DEFINIR'),
        'A DEFINIR',
        COALESCE(v_veiculo_modelo, 'Veículo do Cliente'),
        COALESCE(v_veiculo_tipo, 'carro'),
        v_rastreador_id,
        COALESCE(v_rastreador_imei, 'PENDENTE'),
        COALESCE(v_rastreador_modelo, 'J16 4G'),
        v_chip_iccid,
        v_chip_operadora,
        'agendada',
        'pendente',
        COALESCE(v_valor_unitario, 50.00),
        NEW.data_agendamento,
        NEW.hora_agendamento,
        'Ordem gerada automaticamente pela associação do instalador.',
        NOW(),
        NOW()
      );
    END IF;

  ELSIF NEW.instalador_id IS NULL AND OLD.instalador_id IS NOT NULL THEN
    -- Desvinculou o instalador: desvincula ordens que não foram concluídas
    UPDATE public.instalacoes
    SET instalador_id = NULL, updated_at = NOW()
    WHERE cliente_id = NEW.id AND status NOT IN ('concluida');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cliente_instalador_instalacao ON public.clientes;
CREATE TRIGGER trg_sync_cliente_instalador_instalacao
  AFTER INSERT OR UPDATE OF instalador_id, data_agendamento, hora_agendamento, status, status_agendamento, kit_determinado_id
  ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_cliente_instalador_instalacao();

-- 3. Trigger: Sincronizar veículo adicionado ao cliente na ordem de instalação pendente
CREATE OR REPLACE FUNCTION public.trg_sync_veiculo_instalacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    UPDATE public.instalacoes
    SET 
      veiculo_id = NEW.id,
      placa = NEW.placa,
      marca = COALESCE(marca, 'A DEFINIR'),
      modelo = COALESCE(NEW.marca_modelo, modelo, 'Veículo do Cliente'),
      tipo_veiculo = COALESCE(NEW.tipo_veiculo, tipo_veiculo, 'carro'),
      updated_at = NOW()
    WHERE cliente_id = NEW.cliente_id 
      AND status NOT IN ('concluida')
      AND (placa = 'A DEFINIR' OR placa IS NULL OR veiculo_id IS NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_veiculo_instalacao ON public.veiculos;
CREATE TRIGGER trg_sync_veiculo_instalacao
  AFTER INSERT OR UPDATE OF placa, marca_modelo, tipo_veiculo, cliente_id
  ON public.veiculos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_veiculo_instalacao();

-- 4. RPC CANÔNICA COM SECURITY DEFINER: Obter Demandas do Instalador Instantaneamente
CREATE OR REPLACE FUNCTION public.instalador_obter_minhas_demandas(
  p_instalador_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_role TEXT;
  v_alvo_id UUID;
  v_ordens JSONB;
  v_agendamentos JSONB;
  v_resumo JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  -- Se for adm/super/operador, pode consultar por um instalador específico ou ver geral
  IF v_role IN ('superadmin', 'adm', 'operador') THEN
    v_alvo_id := COALESCE(p_instalador_id, v_caller_id);
  ELSE
    -- Técnico instalador acessa estritamente suas demandas
    v_alvo_id := v_caller_id;
  END IF;

  -- 1. Coletar Ordens da tabela public.instalacoes
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'instalador_id', i.instalador_id,
      'instalador_nome', COALESCE(p.nome, 'Instalador'),
      'instalador_chave_pix', p.chave_pix,
      'cliente_id', i.cliente_id,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_documento', c.documento,
      'cliente_telefone', c.telefone,
      'veiculo_id', i.veiculo_id,
      'placa', COALESCE(i.placa, 'A DEFINIR'),
      'marca', COALESCE(i.marca, 'A DEFINIR'),
      'modelo', COALESCE(i.modelo, 'Veículo do Cliente'),
      'ano', i.ano,
      'cor', i.cor,
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'rastreador_id', i.rastreador_id,
      'rastreador_imei', COALESCE(i.rastreador_imei, 'PENDENTE'),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, 'J16 4G'),
      'chip_iccid', i.chip_iccid,
      'chip_operadora', i.chip_operadora,
      'posicao_instalacao', i.posicao_instalacao,
      'status', i.status,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'valor_instalacao', COALESCE(i.valor_instalacao, 50.00),
      'status_pagamento', COALESCE(i.status_pagamento, 'pendente'),
      'pago_em', i.pago_em,
      'pago_por', i.pago_por,
      'comprovante_pagamento', i.comprovante_pagamento,
      'kit_determinado_em', i.kit_determinado_em,
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, FALSE),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'data_agendamento', COALESCE(i.data_agendamento, c.data_agendamento),
      'hora_agendamento', COALESCE(i.hora_agendamento, c.hora_agendamento),
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id;

  -- 2. Coletar Clientes Agendados ou Aguardando Agendamento
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome_razao_social', c.nome_razao_social,
      'documento', c.documento,
      'telefone', c.telefone,
      'email', c.email,
      'status', c.status,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', c.instalador_id,
      'instalador', jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'endereco_instalacao', p.endereco_instalacao
      ),
      'veiculos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'modelo', v.modelo))
        FROM public.veiculos v
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = c.instalador_id
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  -- 3. Montar Resumo Financeiro e Operacional
  v_resumo := jsonb_build_object(
    'total_ordens', jsonb_array_length(v_ordens),
    'total_agendamentos', jsonb_array_length(v_agendamentos)
  );

  RETURN jsonb_build_object(
    'success', true,
    'ordens', v_ordens,
    'agendamentos', v_agendamentos,
    'resumo', v_resumo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.instalador_obter_minhas_demandas(UUID) TO authenticated;

-- 5. Sincronização Retrô Imediata: Provisionar ordens pendentes para clientes já associados
DO $$
DECLARE
  r RECORD;
  v_veiculo_id UUID;
  v_veiculo_placa TEXT;
  v_veiculo_modelo TEXT;
  v_veiculo_tipo TEXT;
  v_valor NUMERIC(10,2);
  v_rastreador_id UUID;
  v_rastreador_imei TEXT;
  v_rastreador_modelo TEXT;
  v_chip_iccid TEXT;
  v_chip_operadora TEXT;
BEGIN
  FOR r IN (
    SELECT c.id, c.instalador_id, c.data_agendamento, c.hora_agendamento, c.kit_determinado_id
    FROM public.clientes c
    WHERE c.instalador_id IS NOT NULL
      AND (c.status_agendamento IS NULL OR c.status_agendamento <> 'concluido' OR c.status = 'aguardando_instalacao')
      AND NOT EXISTS (
        SELECT 1 FROM public.instalacoes i 
        WHERE i.cliente_id = c.id AND i.status <> 'concluida'
      )
  ) LOOP
    v_veiculo_id := NULL;
    v_veiculo_placa := NULL;
    v_veiculo_modelo := NULL;
    v_veiculo_tipo := NULL;
    v_rastreador_id := NULL;
    v_rastreador_imei := NULL;
    v_rastreador_modelo := NULL;
    v_chip_iccid := NULL;
    v_chip_operadora := NULL;

    SELECT id, placa, marca_modelo, tipo_veiculo
    INTO v_veiculo_id, v_veiculo_placa, v_veiculo_modelo, v_veiculo_tipo
    FROM public.veiculos
    WHERE cliente_id = r.id
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT COALESCE(valor_por_instalacao, 50.00) INTO v_valor
    FROM public.profiles
    WHERE id = r.instalador_id;

    IF r.kit_determinado_id IS NOT NULL THEN
      SELECT rst.id, rst.imei, rst.modelo, cp.iccid, cp.operadora
      INTO v_rastreador_id, v_rastreador_imei, v_rastreador_modelo, v_chip_iccid, v_chip_operadora
      FROM public.rastreadores rst
      LEFT JOIN public.chips cp ON cp.id = rst.chip_id
      WHERE rst.id = r.kit_determinado_id;
    END IF;

    INSERT INTO public.instalacoes (
      cliente_id,
      instalador_id,
      veiculo_id,
      placa,
      marca,
      modelo,
      tipo_veiculo,
      rastreador_id,
      rastreador_imei,
      rastreador_modelo,
      chip_iccid,
      chip_operadora,
      status,
      status_pagamento,
      valor_instalacao,
      data_agendamento,
      hora_agendamento,
      observacoes,
      created_at,
      updated_at
    ) VALUES (
      r.id,
      r.instalador_id,
      v_veiculo_id,
      COALESCE(v_veiculo_placa, 'A DEFINIR'),
      'A DEFINIR',
      COALESCE(v_veiculo_modelo, 'Veículo do Cliente'),
      COALESCE(v_veiculo_tipo, 'carro'),
      v_rastreador_id,
      COALESCE(v_rastreador_imei, 'PENDENTE'),
      COALESCE(v_rastreador_modelo, 'J16 4G'),
      v_chip_iccid,
      v_chip_operadora,
      'agendada',
      'pendente',
      COALESCE(v_valor, 50.00),
      r.data_agendamento,
      r.hora_agendamento,
      'Sincronizado retroativamente da associação existente de instalador no cliente.',
      NOW(),
      NOW()
    );
  END LOOP;
END;
$$;

-- 6. Garantir publicação Supabase Realtime para tabelas envolvidas
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.instalacoes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.clientes REPLICA IDENTITY FULL;
ALTER TABLE public.instalacoes REPLICA IDENTITY FULL;
ALTER TABLE public.veiculos REPLICA IDENTITY FULL;

-- Recarregar cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
