-- Migration: 20260926090000_hunter_registrar_alertas_seguranca.sql
-- Descrição: Cria RPC atômica registrar_alerta_seguranca com anti-flood, atualiza RLS e integra ingestão no banco

-- 1. Políticas RLS permissivas para INSERT na tabela alertas_seguranca
DROP POLICY IF EXISTS "Clientes e usuarios autenticados podem inserir alertas" ON public.alertas_seguranca;
CREATE POLICY "Clientes e usuarios autenticados podem inserir alertas"
ON public.alertas_seguranca FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid()) OR
  veiculo_id IN (
    SELECT id FROM public.veiculos 
    WHERE cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
  )
);

-- Permissão para clientes e administradores atualizarem status de reconhecimento de seus alertas
DROP POLICY IF EXISTS "Clientes podem reconhecer alertas de seus veiculos" ON public.alertas_seguranca;
CREATE POLICY "Clientes podem reconhecer alertas de seus veiculos"
ON public.alertas_seguranca FOR UPDATE TO authenticated
USING (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
)
WITH CHECK (
  public.is_admin_or_superadmin(auth.uid()) OR
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'operador') OR
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- 2. RPC Atômica para Registrar Alertas de Segurança (Frontend, Gateway e Triggers)
CREATE OR REPLACE FUNCTION public.registrar_alerta_seguranca(
  p_veiculo_id UUID,
  p_tipo TEXT,
  p_detalhes TEXT,
  p_gravidade TEXT DEFAULT 'alta',
  p_latitude DOUBLE PRECISION DEFAULT 0.0,
  p_longitude DOUBLE PRECISION DEFAULT 0.0,
  p_velocidade INT DEFAULT 0,
  p_vibracao_g NUMERIC DEFAULT 0.0,
  p_inclinacao_graus INT DEFAULT 0,
  p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_cliente_id UUID;
  v_placa TEXT;
  v_alerta_existente_id UUID;
  v_novo_alerta_id UUID;
  v_titulo_evento TEXT;
  v_severidade_evento TEXT;
BEGIN
  -- 1. Determina cliente_id e placa caso não passados
  SELECT cliente_id, placa INTO v_cliente_id, v_placa
  FROM public.veiculos
  WHERE id = p_veiculo_id;

  IF v_cliente_id IS NULL AND p_cliente_id IS NOT NULL THEN
    v_cliente_id := p_cliente_id;
  END IF;

  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Veículo ou cliente não localizado no sistema.');
  END IF;

  -- 2. Debouncing / Anti-Flood: Evita poluir a central se houver alerta não reconhecido do mesmo tipo nos últimos 3 minutos
  SELECT id INTO v_alerta_existente_id
  FROM public.alertas_seguranca
  WHERE veiculo_id = p_veiculo_id
    AND tipo = p_tipo
    AND reconhecido = FALSE
    AND created_at >= NOW() - INTERVAL '3 minutes'
  LIMIT 1;

  IF v_alerta_existente_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'alerta_id', v_alerta_existente_id,
      'duplicado', true
    );
  END IF;

  -- 3. Insere na tabela oficial alertas_seguranca
  INSERT INTO public.alertas_seguranca (
    veiculo_id,
    cliente_id,
    tipo,
    gravidade,
    latitude,
    longitude,
    velocidade,
    vibracao_g,
    inclinacao_graus,
    detalhes,
    reconhecido,
    created_at
  ) VALUES (
    p_veiculo_id,
    v_cliente_id,
    p_tipo,
    COALESCE(p_gravidade, 'alta'),
    COALESCE(p_latitude, 0.0),
    COALESCE(p_longitude, 0.0),
    COALESCE(p_velocidade, 0),
    COALESCE(p_vibracao_g, 0.00),
    COALESCE(p_inclinacao_graus, 0),
    p_detalhes,
    FALSE,
    NOW()
  )
  RETURNING id INTO v_novo_alerta_id;

  -- 4. Título padronizado para a Timeline de eventos_veiculo
  v_titulo_evento := CASE
    WHEN p_tipo = 'suspeita_jammer' THEN 'Alerta: Suspeita de Jammer / Silenciamento'
    WHEN p_tipo = 'saida_area' THEN 'Alerta: Saída de Cerca Virtual'
    WHEN p_tipo = 'desvio_rota' THEN 'Alerta: Desvio de Rota Monitorada'
    WHEN p_tipo = 'bateria_desconectada' THEN 'Alerta: Alimentação Principal Desconectada'
    WHEN p_tipo = 'colisao_impacto' THEN 'Alerta: Impacto / Choque Violento'
    WHEN p_tipo = 'capotamento_inclinacao' THEN 'Alerta: Inclinação Excessiva / Capotamento'
    WHEN p_tipo = 'panico' THEN 'Alerta: Botão de Pânico Acionado'
    ELSE 'Alerta Operacional de Segurança'
  END;

  v_severidade_evento := CASE
    WHEN p_gravidade = 'critica' THEN 'critico'
    WHEN p_gravidade = 'alta' THEN 'aviso'
    ELSE 'info'
  END;

  -- 5. Grava também no histórico de eventos_veiculo (resiliente)
  BEGIN
    INSERT INTO public.eventos_veiculo (
      veiculo_id,
      cliente_id,
      tipo,
      titulo,
      descricao,
      severidade,
      latitude,
      longitude,
      velocidade,
      data_hora
    ) VALUES (
      p_veiculo_id,
      v_cliente_id,
      p_tipo,
      v_titulo_evento,
      p_detalhes,
      v_severidade_evento,
      p_latitude,
      p_longitude,
      p_velocidade,
      NOW()
    );
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'sucesso', true,
    'alerta_id', v_novo_alerta_id,
    'duplicado', false
  );
END;
$$;

-- 3. Concessão de permissões de execução da RPC
GRANT EXECUTE ON FUNCTION public.registrar_alerta_seguranca TO authenticated, service_role, anon;
