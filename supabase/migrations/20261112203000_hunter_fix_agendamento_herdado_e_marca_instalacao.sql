-- ============================================================================
-- HUNTER — CORREÇÃO DE AGENDAMENTO HERDADO EM NOVOS VEÍCULOS E MARCA/ANO DE INSTALAÇÕES
-- Migration: 20261112203000_hunter_fix_agendamento_herdado_e_marca_instalacao.sql
-- ============================================================================
-- 1. Impede que trg_sync_cliente_instalador_instalacao copie agendamento legado
--    de clientes que já possuem instalação concluída (ou status_agendamento='concluido')
--    para ordens recém-criadas de novos veículos, nem grave 'A DEFINIR' em marca.
-- 2. Atualiza instalador_obter_minhas_demandas para não fazer fallback cego para
--    clientes.data_agendamento quando o cliente já teve instalação concluída e
--    sanitizar marca placeholder ('A DEFINIR', 'GERAL') na listagem.
-- 3. Higieniza registros existentes afetados (sem apagar agendamentos novos reais).
-- ============================================================================

-- 1. Atualizar Trigger trg_sync_cliente_instalador_instalacao
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
  v_cliente_ja_possui_concluida BOOLEAN := FALSE;
  v_pode_herdar_agendamento BOOLEAN := FALSE;
  v_marca_calc TEXT;
  v_modelo_calc TEXT;
BEGIN
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
          WHERE (i.veiculo_id = v.id OR (v.placa IS NOT NULL AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA', '') AND i.placa = v.placa))
            AND i.status IN ('concluida', 'concluida_com_pendencia')
        )
    ) THEN
      v_todos_veiculos_concluidos := TRUE;
    END IF;

    IF v_todos_veiculos_concluidos THEN
      UPDATE public.instalacoes
      SET instalador_id = NEW.instalador_id,
          updated_at = NOW()
      WHERE cliente_id = NEW.id AND status NOT IN ('concluida', 'concluida_com_pendencia');

      RETURN NEW;
    END IF;

    v_cliente_ja_possui_concluida := (NEW.status_agendamento = 'concluido') OR EXISTS (
      SELECT 1 FROM public.instalacoes
      WHERE cliente_id = NEW.id
        AND status IN ('concluida', 'concluida_com_pendencia')
    );

    v_pode_herdar_agendamento := (
      NOT v_cliente_ja_possui_concluida
      AND NEW.data_agendamento IS NOT NULL
    );

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
      UPDATE public.instalacoes
      SET
        instalador_id = NEW.instalador_id,
        valor_instalacao = CASE WHEN valor_instalacao <= 0 THEN COALESCE(v_valor_unitario, 50.00) ELSE valor_instalacao END,
        data_agendamento = CASE
          WHEN v_pode_herdar_agendamento AND (OLD.data_agendamento IS DISTINCT FROM NEW.data_agendamento)
          THEN COALESCE(data_agendamento, NEW.data_agendamento)
          ELSE data_agendamento
        END,
        hora_agendamento = CASE
          WHEN v_pode_herdar_agendamento AND (OLD.hora_agendamento IS DISTINCT FROM NEW.hora_agendamento)
          THEN COALESCE(hora_agendamento, NEW.hora_agendamento)
          ELSE hora_agendamento
        END,
        updated_at = NOW()
      WHERE id = v_instalacao_id;
    ELSE
      FOR v_veiculo IN
        SELECT v.id, v.placa, v.marca_modelo, v.tipo_veiculo
        FROM public.veiculos v
        WHERE v.cliente_id = NEW.id
          AND v.ativo = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM public.instalacoes i
            WHERE (i.veiculo_id = v.id OR (v.placa IS NOT NULL AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA', '') AND i.placa = v.placa))
              AND i.status IN ('concluida', 'concluida_com_pendencia', 'agendada', 'aberta', 'nao_instalado')
          )
      LOOP
        v_tem_veiculo_pendente := TRUE;

        IF UPPER(TRIM(COALESCE(v_veiculo.marca_modelo, ''))) IN ('', 'VEÍCULO PADRÃO', 'VEICULO PADRAO', 'VEÍCULO', 'VEICULO', 'A DEFINIR', 'GERAL') THEN
          v_marca_calc := '';
          v_modelo_calc := COALESCE(NULLIF(TRIM(v_veiculo.marca_modelo), ''), 'Veículo Padrão');
        ELSE
          v_marca_calc := split_part(TRIM(v_veiculo.marca_modelo), ' ', 1);
          v_modelo_calc := COALESCE(NULLIF(TRIM(SUBSTRING(TRIM(v_veiculo.marca_modelo) FROM LENGTH(v_marca_calc) + 2)), ''), v_marca_calc);
        END IF;

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
          v_marca_calc,
          v_modelo_calc,
          COALESCE(v_veiculo.tipo_veiculo, 'carro'),
          CASE WHEN v_pode_herdar_agendamento THEN 'agendada' ELSE 'nao_instalado' END,
          'pendente',
          COALESCE(v_valor_unitario, 50.00),
          CASE WHEN v_pode_herdar_agendamento THEN NEW.data_agendamento ELSE NULL END,
          CASE WHEN v_pode_herdar_agendamento THEN NEW.hora_agendamento ELSE NULL END,
          'Ordem gerada automaticamente para veículo pendente de instalação.',
          NOW(),
          NOW()
        );
      END LOOP;
    END IF;

  ELSIF NEW.instalador_id IS NULL AND OLD.instalador_id IS NOT NULL THEN
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

-- 2. Atualizar RPC instalador_obter_minhas_demandas sem fallback de data antiga em clientes já instalados
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
  v_total_a_receber NUMERIC(10,2);
  v_total_recebido NUMERIC(10,2);
  v_total_agendados_qtd INT;
  v_total_a_agendar_qtd INT;
  v_valor_previsto_agendados NUMERIC(10,2);
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado.');
  END IF;

  SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_caller_id;

  IF v_role IN ('superadmin', 'adm', 'operador') THEN
    v_alvo_id := COALESCE(p_instalador_id, v_caller_id);
  ELSE
    v_alvo_id := v_caller_id;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'cliente_id', i.cliente_id,
      'veiculo_id', COALESCE(i.veiculo_id, v.id),
      'instalador_id', COALESCE(i.instalador_id, c.instalador_id),
      'placa', COALESCE(i.placa, v.placa, 'A DEFINIR'),
      'marca', CASE
        WHEN UPPER(TRIM(COALESCE(i.marca, ''))) IN ('A DEFINIR', 'GERAL', 'VEICULO', 'VEÍCULO', '') THEN
          CASE
            WHEN UPPER(TRIM(COALESCE(v.marca_modelo, ''))) IN ('', 'VEÍCULO PADRÃO', 'VEICULO PADRAO', 'VEÍCULO', 'VEICULO', 'A DEFINIR') THEN ''
            ELSE COALESCE(split_part(TRIM(v.marca_modelo), ' ', 1), '')
          END
        ELSE i.marca
      END,
      'modelo', COALESCE(i.modelo, v.marca_modelo, 'Veículo'),
      'ano', COALESCE(i.ano, v.ano),
      'cor', COALESCE(i.cor, v.cor),
      'tipo_veiculo', COALESCE(i.tipo_veiculo, v.tipo_veiculo, 'carro'),
      'km_instalacao', COALESCE(i.km_instalacao, 0),
      'tipo_servico', COALESCE(i.tipo_servico, 'instalacao'),
      'valor_instalacao', i.valor_instalacao,
      'status_pagamento', i.status_pagamento,
      'bloqueador_instalado', COALESCE(i.bloqueador_instalado, false),
      'com_bloqueador', COALESCE(i.bloqueador_instalado, false),
      'status', i.status,
      'posicao_instalacao', i.posicao_instalacao,
      'posicaoInstalacao', i.posicao_instalacao,
      'rastreador_id', COALESCE(i.rastreador_id, v.rastreador_id, c.kit_determinado_id, r.id),
      'rastreador_imei', COALESCE(
        CASE WHEN UPPER(TRIM(i.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE i.rastreador_imei END,
        r.imei,
        CASE WHEN UPPER(TRIM(v.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE v.rastreador_imei END,
        i.rastreador_imei,
        'PENDENTE'
      ),
      'rastreador_modelo', COALESCE(i.rastreador_modelo, r.modelo, 'J16 4G'),
      'chip_iccid', COALESCE(i.chip_iccid, ch.iccid),
      'chip_operadora', COALESCE(i.chip_operadora, ch.operadora),
      'data_agendamento', CASE
        WHEN i.data_agendamento IS NOT NULL THEN i.data_agendamento
        WHEN c.status_agendamento IS DISTINCT FROM 'concluido'
          AND NOT EXISTS (
            SELECT 1 FROM public.instalacoes ic
            WHERE ic.cliente_id = i.cliente_id
              AND ic.id <> i.id
              AND ic.status IN ('concluida', 'concluida_com_pendencia')
          )
        THEN c.data_agendamento
        ELSE NULL
      END,
      'hora_agendamento', CASE
        WHEN i.data_agendamento IS NOT NULL THEN i.hora_agendamento
        WHEN c.status_agendamento IS DISTINCT FROM 'concluido'
          AND NOT EXISTS (
            SELECT 1 FROM public.instalacoes ic
            WHERE ic.cliente_id = i.cliente_id
              AND ic.id <> i.id
              AND ic.status IN ('concluida', 'concluida_com_pendencia')
          )
        THEN c.hora_agendamento
        ELSE NULL
      END,
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', i.local_endereco,
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, false),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'endereco_cliente_informado_em', i.endereco_cliente_informado_em,
      'solicitado_endereco_em', i.solicitado_endereco_em,
      'kit_determinado_em', COALESCE(i.kit_determinado_em, CASE WHEN COALESCE(i.rastreador_id, v.rastreador_id, c.kit_determinado_id, r.id) IS NOT NULL THEN NOW() ELSE NULL END),
      'kit_confirmado_instalador', COALESCE(i.kit_confirmado_instalador, false),
      'kit_confirmado_em', i.kit_confirmado_em,
      'imei_confirmado', i.imei_confirmado,
      'instalador_nome', COALESCE(p.nome, 'Instalador Técnico'),
      'instalador_chave_pix', p.chave_pix,
      'cliente_nome', COALESCE(c.nome_razao_social, 'Cliente'),
      'cliente_telefone', c.telefone,
      'cliente_documento', c.documento,
      'motivo_pendencia_recusa', i.motivo_pendencia_recusa,
      'observacoes', i.observacoes,
      'created_at', i.created_at,
      'updated_at', i.updated_at,
      'concluida_at', i.concluida_at
    ) ORDER BY i.created_at DESC
  ), '[]'::JSONB)
  INTO v_ordens
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  LEFT JOIN public.veiculos v ON v.id = i.veiculo_id
    OR (i.veiculo_id IS NULL AND v.cliente_id = i.cliente_id AND UPPER(TRIM(v.placa)) = UPPER(TRIM(i.placa)) AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA'))
  LEFT JOIN public.profiles p ON p.id = COALESCE(i.instalador_id, c.instalador_id)
  LEFT JOIN public.rastreadores r ON r.id = COALESCE(i.rastreador_id, v.rastreador_id, c.kit_determinado_id)
  LEFT JOIN public.chips ch ON ch.id = r.chip_id
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR i.instalador_id = v_alvo_id
     OR (i.instalador_id IS NULL AND c.instalador_id = v_alvo_id);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome_razao_social', c.nome_razao_social,
      'documento', c.documento,
      'telefone', c.telefone,
      'email', c.email,
      'status', c.status,
      'plano', c.plano,
      'tem_fidelidade', c.tem_fidelidade,
      'regra_horimetro', c.regra_horimetro,
      'kit_determinado_id', c.kit_determinado_id,
      'status_agendamento', COALESCE(c.status_agendamento, 'aguardando_agendamento'),
      'data_agendamento', c.data_agendamento,
      'hora_agendamento', c.hora_agendamento,
      'instalador_id', COALESCE(c.instalador_id, v_alvo_id),
      'instalador', jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'endereco_instalacao', p.endereco_instalacao,
        'valor_com_bloqueador', p.valor_instalacao_com_bloqueador,
        'valor_sem_bloqueador', p.valor_instalacao_sem_bloqueador
      ),
      'veiculos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', v.id,
          'placa', v.placa,
          'modelo', v.marca_modelo,
          'tipo_veiculo', v.tipo_veiculo,
          'horimetro_horas', v.horimetro_horas,
          'rastreador_id', COALESCE(v.rastreador_id, inst_v.rastreador_id, c.kit_determinado_id),
          'rastreador_imei', COALESCE(
            CASE WHEN UPPER(TRIM(v.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE v.rastreador_imei END,
            rk.imei,
            CASE WHEN UPPER(TRIM(inst_v.rastreador_imei)) IN ('PENDENTE', 'A DEFINIR', 'AGUARDANDO ESTOQUE', 'A CONFERIR', 'SEM RASTREADOR', '') THEN NULL ELSE inst_v.rastreador_imei END,
            v.rastreador_imei
          )
        ))
        FROM public.veiculos v
        LEFT JOIN public.instalacoes inst_v ON (inst_v.veiculo_id = v.id OR (inst_v.cliente_id = v.cliente_id AND UPPER(TRIM(inst_v.placa)) = UPPER(TRIM(v.placa)) AND v.placa NOT IN ('A DEFINIR', 'SEM PLACA', 'SEMPLACA')))
        LEFT JOIN public.rastreadores rk ON rk.id = COALESCE(v.rastreador_id, inst_v.rastreador_id, c.kit_determinado_id)
        WHERE v.cliente_id = c.id
      ), '[]'::JSONB)
    ) ORDER BY c.created_at DESC
  ), '[]'::JSONB)
  INTO v_agendamentos
  FROM public.clientes c
  LEFT JOIN public.profiles p ON p.id = COALESCE(c.instalador_id, v_alvo_id)
  WHERE (
    (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
    OR c.instalador_id = v_alvo_id
    OR EXISTS (SELECT 1 FROM public.instalacoes inst WHERE inst.cliente_id = c.id AND (inst.instalador_id = v_alvo_id OR (inst.instalador_id IS NULL AND c.instalador_id = v_alvo_id)))
  )
  AND (c.status_agendamento IS DISTINCT FROM 'concluido' OR c.status = 'aguardando_instalacao');

  SELECT
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pendente' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN (status = 'concluida' OR status = 'concluida_com_pendencia') AND status_pagamento = 'pago' THEN valor_instalacao ELSE 0 END), 0.00),
    COALESCE(SUM(CASE WHEN status NOT IN ('concluida', 'concluida_com_pendencia') AND data_agendamento IS NOT NULL THEN valor_instalacao ELSE 0 END), 0.00),
    COUNT(CASE WHEN status NOT IN ('concluida', 'concluida_com_pendencia') AND data_agendamento IS NOT NULL THEN 1 END),
    COUNT(CASE WHEN status NOT IN ('concluida', 'concluida_com_pendencia') AND data_agendamento IS NULL THEN 1 END)
  INTO
    v_total_a_receber,
    v_total_recebido,
    v_valor_previsto_agendados,
    v_total_agendados_qtd,
    v_total_a_agendar_qtd
  FROM public.instalacoes
  WHERE (v_role IN ('superadmin', 'adm', 'operador') AND p_instalador_id IS NULL)
     OR instalador_id = v_alvo_id;

  v_resumo := jsonb_build_object(
    'a_receber', v_total_a_receber,
    'recebido', v_total_recebido,
    'agendados_qtd', v_total_agendados_qtd,
    'a_agendar_qtd', v_total_a_agendar_qtd,
    'valor_previsto_agendados', v_valor_previsto_agendados
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

-- 3. Higienização idempotente dos registros com marca/modelo/ano sujos
--    Preserva o agendamento real (ex: 2026-11-13) já definido pelo instalador.
UPDATE public.instalacoes i
SET
  marca = 'GM',
  modelo = 'MONTANA SPORT',
  ano = COALESCE(i.ano, v.ano),
  updated_at = NOW()
FROM public.veiculos v
WHERE i.id = '6577b629-2557-4a22-99ba-4e0467ef30e7'
  AND v.id = i.veiculo_id
  AND UPPER(TRIM(COALESCE(i.marca, ''))) IN ('A DEFINIR', 'GERAL', '');

UPDATE public.instalacoes
SET
  marca = '',
  updated_at = NOW()
WHERE UPPER(TRIM(COALESCE(marca, ''))) = 'A DEFINIR';

NOTIFY pgrst, 'reload schema';
