-- ==============================================================================
-- HUNTER: BLINDAGEM ABSOLUTA CONTRA CRIAÇÃO DE ORDENS DUPLICADAS NA EDIÇÃO DO CLIENTE
-- ==============================================================================
-- Causa Raiz: Ao editar qualquer dado cadastral do cliente (nome, email, telefone, etc.):
-- 1. A RPC admin_atualizar_cliente_completo rebaixava status_agendamento para 'aguardando_agendamento'
-- 2. A trigger trg_sync_cliente_instalador_instalacao inseria uma nova ordem de instalação espúria
--    mesmo quando o veículo do cliente já possuía instalação técnica concluída.
-- 3. As ordens em aberto para veículos já concluídos criavam pendências financeiras falsas de agendamento.
-- ==============================================================================

-- 1. Atualizar a Trigger trg_sync_cliente_instalador_instalacao
CREATE OR REPLACE FUNCTION public.trg_sync_cliente_instalador_instalacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_veiculo RECORD;
  v_valor_unitario NUMERIC(10,2) := 50.00;
  v_instalacao_id UUID := NULL;
  v_tem_veiculo_pendente BOOLEAN := FALSE;
  v_todos_veiculos_concluidos BOOLEAN := FALSE;
BEGIN
  -- Se o cliente possui instalador atribuído
  IF NEW.instalador_id IS NOT NULL THEN
    
    -- Verifica se todos os veículos deste cliente já possuem instalação concluída ou estão ativos
    IF EXISTS (
      SELECT 1 FROM public.veiculos v
      WHERE v.cliente_id = NEW.id
    ) AND NOT EXISTS (
      SELECT 1 FROM public.veiculos v
      WHERE v.cliente_id = NEW.id
        AND v.ativo = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM public.instalacoes i
          WHERE (i.veiculo_id = v.id OR (v.placa IS NOT NULL AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', '') AND i.placa = v.placa))
            AND i.status IN ('concluida', 'concluida_com_pendencia')
        )
    ) THEN
      v_todos_veiculos_concluidos := TRUE;
    END IF;

    -- Se todos os veículos já foram instalados e concluídos, PROIBIDO criar novas ordens
    IF v_todos_veiculos_concluidos THEN
      -- Se houver ordens pendentes abertas indevidamente, apenas atualiza o instalador nelas
      UPDATE public.instalacoes
      SET instalador_id = NEW.instalador_id,
          updated_at = NOW()
      WHERE cliente_id = NEW.id AND status NOT IN ('concluida', 'concluida_com_pendencia');
      
      RETURN NEW;
    END IF;

    -- Obter valor de repasse configurado para o instalador
    SELECT COALESCE(valor_por_instalacao, 50.00) INTO v_valor_unitario
    FROM public.profiles
    WHERE id = NEW.instalador_id;

    -- Verificar se já existe uma ordem aberta/agendada para este cliente
    SELECT id INTO v_instalacao_id
    FROM public.instalacoes
    WHERE cliente_id = NEW.id AND status NOT IN ('concluida', 'concluida_com_pendencia')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_instalacao_id IS NOT NULL THEN
      -- Apenas atualiza a ordem pendente existente com o novo instalador e novos agendamentos
      UPDATE public.instalacoes
      SET 
        instalador_id = NEW.instalador_id,
        valor_instalacao = CASE WHEN valor_instalacao <= 0 THEN COALESCE(v_valor_unitario, 50.00) ELSE valor_instalacao END,
        data_agendamento = COALESCE(NEW.data_agendamento, data_agendamento),
        hora_agendamento = COALESCE(NEW.hora_agendamento, hora_agendamento),
        updated_at = NOW()
      WHERE id = v_instalacao_id;
    ELSE
      -- Só insere nova ordem se existir algum veículo do cliente que AINDA NÃO POSSUI instalação concluída
      FOR v_veiculo IN
        SELECT v.id, v.placa, v.marca_modelo, v.tipo_veiculo
        FROM public.veiculos v
        WHERE v.cliente_id = NEW.id
          AND v.ativo = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM public.instalacoes i
            WHERE (i.veiculo_id = v.id OR (v.placa IS NOT NULL AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', '') AND i.placa = v.placa))
              AND i.status IN ('concluida', 'concluida_com_pendencia', 'agendada', 'aberta', 'nao_instalado')
          )
      LOOP
        v_tem_veiculo_pendente := TRUE;
        INSERT INTO public.instalacoes (
          cliente_id,
          instalador_id,
          veiculo_id,
          placa,
          marca,
          modelo,
          tipo_veiculo,
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
          v_veiculo.id,
          COALESCE(v_veiculo.placa, 'A DEFINIR'),
          'A DEFINIR',
          COALESCE(v_veiculo.marca_modelo, 'Veículo do Cliente'),
          COALESCE(v_veiculo.tipo_veiculo, 'carro'),
          'agendada',
          'pendente',
          COALESCE(v_valor_unitario, 50.00),
          NEW.data_agendamento,
          NEW.hora_agendamento,
          'Ordem gerada automaticamente para veículo pendente de instalação.',
          NOW(),
          NOW()
        );
      END LOOP;
    END IF;

  ELSIF NEW.instalador_id IS NULL AND OLD.instalador_id IS NOT NULL THEN
    -- Desvinculou o instalador: apenas desvincula ordens que não foram concluídas
    UPDATE public.instalacoes
    SET instalador_id = NULL, updated_at = NOW()
    WHERE cliente_id = NEW.id AND status NOT IN ('concluida', 'concluida_com_pendencia');
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

-- 2. Atualizar RPC admin_atualizar_cliente_completo com blindagem de status concluído
DROP FUNCTION IF EXISTS public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID, INT, DATE, TEXT, INT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.admin_atualizar_cliente_completo(
  p_cliente_id UUID,
  p_nome TEXT,
  p_documento TEXT,
  p_email TEXT,
  p_telefone TEXT,
  p_status public.status_cliente,
  p_plano public.plano_cliente,
  p_dia_vencimento INT,
  p_valor_mensalidade NUMERIC,
  p_dias_historico INT,
  p_dias_retencao INT,
  p_senha TEXT DEFAULT NULL,
  p_instalador_id UUID DEFAULT NULL,
  p_meses_contrato INT DEFAULT 12,
  p_data_inicio_contrato DATE DEFAULT CURRENT_DATE,
  p_tipo_renovacao TEXT DEFAULT 'mesma_vigencia',
  p_meses_renovacao INT DEFAULT 12,
  p_foro_comarca TEXT DEFAULT 'Volta Redonda/RJ',
  p_gerar_parcelas_ausentes BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_email_limpo TEXT := lower(trim(coalesce(p_email, '')));
  v_resultado_parcelas JSONB := '[]'::JSONB;
  v_meses_c INT := COALESCE(p_meses_contrato, 12);
  v_data_inicio DATE := COALESCE(p_data_inicio_contrato, CURRENT_DATE);
  v_data_fim DATE;
  v_status_final public.status_cliente := p_status;
  v_status_agendamento_final TEXT;
  v_possui_instalacao_concluida BOOLEAN := FALSE;
  r_veiculo RECORD;
BEGIN
  IF NOT public.is_adm() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem atualizar clientes.';
  END IF;

  SELECT user_id, status_agendamento INTO v_user_id, v_status_agendamento_final
  FROM public.clientes
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  v_data_fim := v_data_inicio + (v_meses_c || ' months')::INTERVAL;

  -- Verifica se o cliente já possui instalação técnica concluída ou veículo ativo
  SELECT EXISTS (
    SELECT 1 FROM public.instalacoes 
    WHERE cliente_id = p_cliente_id AND status = 'concluida'
  ) OR EXISTS (
    SELECT 1 FROM public.veiculos
    WHERE cliente_id = p_cliente_id AND ativo = TRUE AND rastreador_id IS NOT NULL
  ) INTO v_possui_instalacao_concluida;

  -- Se foi atribuído ou alterado instalador:
  IF p_instalador_id IS NOT NULL THEN
    IF v_possui_instalacao_concluida THEN
      -- BLINDAGEM: Se o cliente já tem veículo ativo ou instalação concluída, NUNCA rebaixa para aguardando_agendamento
      v_status_agendamento_final := 'concluido';
      v_status_final := 'ativo'::public.status_cliente;
    ELSE
      IF v_status_agendamento_final IS NULL OR v_status_agendamento_final = 'concluido' THEN
        v_status_agendamento_final := 'aguardando_agendamento';
      END IF;
      -- Se cliente não possui veículos ativos com rastreadores, força status operacional aguardando_instalacao
      IF NOT EXISTS (
        SELECT 1 FROM public.veiculos WHERE cliente_id = p_cliente_id AND ativo = TRUE AND rastreador_id IS NOT NULL
      ) THEN
        v_status_final := 'aguardando_instalacao'::public.status_cliente;
      END IF;
    END IF;

    -- Atualiza o instalador_id de ordens de serviço estritamente pendentes do cliente
    UPDATE public.instalacoes
    SET instalador_id = p_instalador_id,
        updated_at = NOW()
    WHERE cliente_id = p_cliente_id AND status NOT IN ('concluida', 'concluida_com_pendencia');

    -- Se o cliente possui veículos cadastrados sem ordem de instalação (e que NÃO estejam ativos nem concluídos),
    -- cria a ordem apenas para veículos efetivamente novos e pendentes
    FOR r_veiculo IN
      SELECT v.id, v.placa, v.marca_modelo, v.ano, v.tipo_veiculo
      FROM public.veiculos v
      WHERE v.cliente_id = p_cliente_id
        AND v.ativo = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM public.instalacoes i 
          WHERE (i.veiculo_id = v.id OR (v.placa IS NOT NULL AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', '') AND i.placa = v.placa))
            AND i.status != 'cancelada'
        )
    LOOP
      INSERT INTO public.instalacoes (
        cliente_id,
        veiculo_id,
        placa,
        marca,
        modelo,
        ano,
        tipo_veiculo,
        instalador_id,
        status,
        rastreador_imei,
        created_at,
        updated_at
      ) VALUES (
        p_cliente_id,
        r_veiculo.id,
        COALESCE(r_veiculo.placa, 'A DEFINIR'),
        'A DEFINIR',
        COALESCE(r_veiculo.marca_modelo, 'Veículo do Cliente'),
        r_veiculo.ano,
        COALESCE(r_veiculo.tipo_veiculo, 'carro'),
        p_instalador_id,
        'aguardando_agendamento',
        'AGUARDANDO ESTOQUE',
        NOW(),
        NOW()
      );
    END LOOP;
  ELSE
    -- Sem instalador: se já tem instalação concluída, preserva status concluído e ativo
    IF v_possui_instalacao_concluida THEN
      v_status_agendamento_final := 'concluido';
      v_status_final := 'ativo'::public.status_cliente;
    END IF;
  END IF;

  -- Atualizar credenciais de auth se aplicável
  IF v_user_id IS NOT NULL THEN
    IF v_email_limpo <> '' THEN
      UPDATE auth.users
      SET email = v_email_limpo,
          raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome), 'email', v_email_limpo),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE public.profiles
      SET nome = trim(p_nome),
          email = v_email_limpo,
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.identities
      SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email_limpo)),
          provider_id = v_email_limpo
      WHERE user_id = v_user_id AND provider = 'email';
    ELSE
      UPDATE public.profiles
      SET nome = trim(p_nome),
          updated_at = now()
      WHERE id = v_user_id;

      UPDATE auth.users
      SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nome', trim(p_nome)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    IF p_senha IS NOT NULL AND length(p_senha) >= 6 THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  -- Atualizar registro em public.clientes
  UPDATE public.clientes
  SET nome_razao_social = trim(p_nome),
      documento = NULLIF(trim(p_documento), ''),
      email = NULLIF(v_email_limpo, ''),
      telefone = NULLIF(trim(p_telefone), ''),
      user_id = COALESCE(user_id, v_user_id),
      plano = p_plano,
      status = v_status_final,
      dia_vencimento = COALESCE(p_dia_vencimento, dia_vencimento),
      valor_mensalidade = COALESCE(p_valor_mensalidade, valor_mensalidade),
      dias_historico_plano = COALESCE(p_dias_historico, dias_historico_plano),
      dias_retencao_banco = COALESCE(p_dias_retencao, dias_retencao_banco),
      instalador_id = p_instalador_id,
      status_agendamento = COALESCE(v_status_agendamento_final, status_agendamento),
      meses_contrato = v_meses_c,
      data_inicio_contrato = v_data_inicio,
      data_fim_contrato = v_data_fim,
      tipo_renovacao = COALESCE(p_tipo_renovacao, tipo_renovacao),
      meses_renovacao = COALESCE(p_meses_renovacao, meses_renovacao),
      foro_comarca = COALESCE(p_foro_comarca, 'Volta Redonda/RJ'),
      updated_at = now()
  WHERE id = p_cliente_id;

  IF p_gerar_parcelas_ausentes THEN
    v_resultado_parcelas := public.admin_gerar_parcelas_contrato(p_cliente_id);
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Dados do cliente e credenciais atualizados com sucesso.',
    'cliente_id', p_cliente_id,
    'user_id', v_user_id,
    'meses_contrato', v_meses_c,
    'data_inicio_contrato', v_data_inicio,
    'data_fim_contrato', v_data_fim,
    'parcelas', v_resultado_parcelas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atualizar_cliente_completo(UUID, TEXT, TEXT, TEXT, TEXT, public.status_cliente, public.plano_cliente, INT, NUMERIC, INT, INT, TEXT, UUID, INT, DATE, TEXT, INT, TEXT, BOOLEAN) TO authenticated;

-- 3. SANEAMENTO IMEDIATO: Expurga a ordem espúria duplicada gerada hoje e ordens abertas para veículos já concluídos
DELETE FROM public.instalacoes
WHERE id = 'bfb08618-39ff-4793-8e95-98fd50568121';

DELETE FROM public.instalacoes pend
WHERE pend.status NOT IN ('concluida', 'concluida_com_pendencia')
  AND EXISTS (
    SELECT 1 FROM public.instalacoes conc
    WHERE conc.status = 'concluida'
      AND conc.id <> pend.id
      AND (
        (conc.veiculo_id IS NOT NULL AND conc.veiculo_id = pend.veiculo_id)
        OR (conc.placa IS NOT NULL AND conc.placa NOT IN ('A DEFINIR', 'SEM PLACA', '') AND conc.placa = pend.placa)
      )
  );

-- Atualiza status de clientes que possuem veículos ativos e ordens concluídas
UPDATE public.clientes c
SET status_agendamento = 'concluido',
    status = 'ativo'
WHERE EXISTS (
  SELECT 1 FROM public.instalacoes i
  WHERE i.cliente_id = c.id AND i.status = 'concluida'
)
AND NOT EXISTS (
  SELECT 1 FROM public.instalacoes i
  WHERE i.cliente_id = c.id AND i.status NOT IN ('concluida', 'cancelada')
);

-- Recarregar cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
