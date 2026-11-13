-- ============================================================================
-- HUNTER — DETECÇÃO DE JAMMER NO SERVIDOR (INDEPENDENTE DE CLIENTE ATIVO)
-- ============================================================================
-- Versão Alvo: 1.10.2.4+
-- Objetivo: Detectar veículos em trânsito que cessaram comunicação abruptamente
-- (suspeita de jammer ou sabotagem elétrica) e disparar Push VAPID via o
-- trigger trg_push_vapid_notificacao_nova já existente no banco.
-- Execução: Chamada via RPC pela rota /api/alertas/verificar-jammers do
-- Cloudflare Workers Cron (scheduled trigger a cada 5 minutos).
-- ============================================================================

-- 1. Função principal de detecção de jammer no servidor
CREATE OR REPLACE FUNCTION public.verificar_jammers_servidor(
  p_timeout_minutos INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_veiculo          RECORD;
  v_cliente_user_id  UUID;
  v_diff_minutos     NUMERIC;
  v_alertas_criados  INT := 0;
  v_ultima_notif_at  TIMESTAMPTZ;
  v_descricao        TEXT;
  v_notif_id         UUID;
BEGIN
  -- Itera sobre veículos que atendiam aos critérios de trânsito na última telemetria
  -- e estão silenciados há mais de p_timeout_minutos sem evento normal de desligamento.
  FOR v_veiculo IN
    SELECT
      v.id,
      v.cliente_id,
      v.placa,
      v.marca_modelo,
      v.ignicao_status,
      v.velocidade_atual,
      v.ultima_atualizacao,
      v.ultima_latitude,
      v.ultima_longitude,
      EXTRACT(EPOCH FROM (now() - v.ultima_atualizacao)) / 60.0 AS minutos_sem_sinal
    FROM public.veiculos v
    WHERE
      v.ativo = true
      AND v.ultima_atualizacao IS NOT NULL
      -- Estava em trânsito: ignição ligada OU velocidade > 10 km/h
      AND (v.ignicao_status = true OR v.velocidade_atual > 10)
      -- Silenciado há mais de p_timeout_minutos
      AND (now() - v.ultima_atualizacao) > (p_timeout_minutos * interval '1 minute')
      -- Confirma que o último pacote registrado em telemetria_posicoes indica trânsito
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT tp.ignicao, tp.velocidade
          FROM public.telemetria_posicoes tp
          WHERE tp.veiculo_id = v.id
          ORDER BY tp.data_hora_gps DESC
          LIMIT 1
        ) ult
        WHERE ult.ignicao = true OR ult.velocidade > 10
      )
  LOOP
    -- ── Deduplicação: não dispara se já existe alerta de jammer nos últimos 10 minutos ──
    SELECT created_at INTO v_ultima_notif_at
    FROM public.alertas_seguranca
    WHERE
      veiculo_id = v_veiculo.id
      AND tipo = 'suspeita_jammer'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Pula se já há alerta de jammer nos últimos 10 minutos
    IF v_ultima_notif_at IS NOT NULL AND
       (now() - v_ultima_notif_at) < interval '10 minutes' THEN
      CONTINUE;
    END IF;

    v_diff_minutos := ROUND(v_veiculo.minutos_sem_sinal::NUMERIC, 1);

    v_descricao := format(
      'Veículo %s (%s) perdeu contato abruptamente enquanto estava em trânsito (%s km/h, ignição %s). '
      'Ausência de pacotes há %s min sem evento de desligamento normal. '
      'Suspeita de bloqueador de sinal celular/GPS ou sabotagem elétrica.',
      v_veiculo.placa,
      v_veiculo.marca_modelo,
      COALESCE(v_veiculo.velocidade_atual, 0),
      CASE WHEN v_veiculo.ignicao_status THEN 'ligada' ELSE 'desligada' END,
      v_diff_minutos
    );

    -- ── Persiste na Central de Alertas (gravidade crítica) ──
    INSERT INTO public.alertas_seguranca (
      veiculo_id,
      cliente_id,
      tipo,
      gravidade,
      latitude,
      longitude,
      velocidade,
      detalhes,
      reconhecido,
      created_at
    ) VALUES (
      v_veiculo.id,
      v_veiculo.cliente_id,
      'suspeita_jammer',
      'critica',
      COALESCE(v_veiculo.ultima_latitude, 0.0),
      COALESCE(v_veiculo.ultima_longitude, 0.0),
      COALESCE(v_veiculo.velocidade_atual, 0),
      v_descricao,
      false,
      now()
    );

    -- ── Busca dados de contato do cliente para direcionar o push ──
    SELECT user_id INTO v_cliente_user_id
    FROM public.clientes
    WHERE id = v_veiculo.cliente_id
    LIMIT 1;

    -- ── Insere em notificacoes_sistema → dispara trg_push_vapid_notificacao_nova ──
    -- O trigger existente cuida do Push VAPID via pg_net automaticamente.
    INSERT INTO public.notificacoes_sistema (
      destinatario_user_id,
      destinatario_cliente_id,
      titulo,
      mensagem,
      tipo,
      url,
      placa,
      lida,
      created_at
    ) VALUES (
      v_cliente_user_id,          -- user_id do cliente para Push VAPID
      v_veiculo.cliente_id,       -- cliente_id para Realtime WebSocket
      '🚨 Suspeita de Jammer / Silenciamento Súbito',
      v_descricao,
      'suspeita_jammer',
      '/monitor-gps',
      v_veiculo.placa,
      false,
      now()
    )
    RETURNING id INTO v_notif_id;

    v_alertas_criados := v_alertas_criados + 1;

  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alertas_criados', v_alertas_criados,
    'verificado_em', now()
  );

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[JAMMER-CHECKER] Erro durante verificação de jammers: %', SQLERRM;
  RETURN jsonb_build_object(
    'sucesso', false,
    'erro', SQLERRM
  );
END;
$$;

-- 2. Permissão de execução apenas para service_role (chamada segura via RPC do servidor)
REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM anon;
REVOKE ALL ON FUNCTION public.verificar_jammers_servidor(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_jammers_servidor(INT) TO service_role;

-- 3. Comentário de auditoria
COMMENT ON FUNCTION public.verificar_jammers_servidor(INT) IS
  'Detecta veículos em trânsito silenciados (suspeita de jammer ou sabotagem) '
  'e dispara Push VAPID via inserção em notificacoes_sistema → trigger pg_net. '
  'Executada pelo Cloudflare Workers Cron via /api/alertas/verificar-jammers a cada 5 min. '
  'Deduplicação: não dispara se já existe alerta de jammer no mesmo veículo nos últimos 10 min.';
