-- 20261010134500_hunter_realtime_instantaneo_agendamento_cliente.sql
-- Sincronização Instantânea em Tempo Real de Agendamento, Notificações e Veículos para Clientes

-- 1. Coluna cliente_user_id em instalacoes com sincronizacao automatica
ALTER TABLE public.instalacoes ADD COLUMN IF NOT EXISTS cliente_user_id UUID;

UPDATE public.instalacoes i
SET cliente_user_id = c.user_id
FROM public.clientes c
WHERE c.id = i.cliente_id AND i.cliente_user_id IS NULL;

CREATE OR REPLACE FUNCTION public.trg_sync_instalacao_cliente_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL AND (NEW.cliente_user_id IS NULL OR TG_OP = 'INSERT') THEN
    SELECT user_id INTO NEW.cliente_user_id FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_instalacoes_sync_cliente_user_id ON public.instalacoes;
CREATE TRIGGER trg_instalacoes_sync_cliente_user_id
BEFORE INSERT OR UPDATE OF cliente_id ON public.instalacoes
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_instalacao_cliente_user_id();

-- 2. Politicas RLS com verificacao direta de igualdade para Walrus/Supabase Realtime
DROP POLICY IF EXISTS "Clientes visualizam suas proprias ordens de instalacao" ON public.instalacoes;
CREATE POLICY "Clientes visualizam suas proprias ordens de instalacao"
ON public.instalacoes FOR SELECT TO authenticated
USING (
  cliente_user_id = auth.uid()
  OR cliente_id = auth.uid()
  OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- 3. Replica Identity FULL para propagacao completa de eventos via Realtime
ALTER TABLE public.instalacoes REPLICA IDENTITY FULL;
ALTER TABLE public.clientes REPLICA IDENTITY FULL;
ALTER TABLE public.notificacoes_sistema REPLICA IDENTITY FULL;

-- 4. Garantia da RPC de listagem de veiculos com SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.cliente_obter_meus_veiculos_instalacao(p_cliente_user_id UUID DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := COALESCE(p_cliente_user_id, auth.uid());
  v_cliente_id UUID;
  v_lista JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado.', 'veiculos', '[]'::jsonb);
  END IF;

  SELECT id INTO v_cliente_id FROM public.clientes WHERE user_id = v_uid LIMIT 1;
  IF v_cliente_id IS NULL THEN
    SELECT id INTO v_cliente_id FROM public.clientes WHERE id = v_uid LIMIT 1;
  END IF;

  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'veiculos', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'instalacao_id', i.id,
      'veiculo_id', i.veiculo_id,
      'placa', COALESCE(i.placa, 'SEM PLACA'),
      'marca', COALESCE(i.marca, ''),
      'modelo', COALESCE(i.modelo, ''),
      'ano', i.ano,
      'cor', i.cor,
      'tipo_veiculo', COALESCE(i.tipo_veiculo, 'carro'),
      'status_instalacao', COALESCE(i.status, 'nao_instalado'),
      'data_agendamento', i.data_agendamento,
      'hora_agendamento', i.hora_agendamento,
      'local_tipo', COALESCE(i.local_tipo, 'oficina'),
      'local_endereco', i.local_endereco,
      'solicita_endereco_cliente', COALESCE(i.solicita_endereco_cliente, false),
      'endereco_cliente_informado', i.endereco_cliente_informado,
      'rastreador_imei', i.rastreador_imei,
      'instalador_id', i.instalador_id,
      'instalador_nome', p.nome,
      'instalador_telefone', p.telefone,
      'instalador_endereco', p.endereco_instalacao
    ) ORDER BY i.created_at ASC
  ), '[]'::jsonb) INTO v_lista
  FROM public.instalacoes i
  LEFT JOIN public.profiles p ON p.id = i.instalador_id
  WHERE (i.cliente_id = v_cliente_id OR i.cliente_user_id = v_uid);

  RETURN jsonb_build_object(
    'success', true,
    'veiculos', v_lista
  );
END;
$$;

-- 5. Garantia da RPC cliente_informar_endereco_instalacao
CREATE OR REPLACE FUNCTION public.cliente_informar_endereco_instalacao(
  p_instalacao_id UUID,
  p_endereco TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cliente_id UUID;
  v_instalador_id UUID;
  v_placa TEXT;
  v_cliente_nome TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado.');
  END IF;

  SELECT i.cliente_id, i.instalador_id, i.placa, c.nome_razao_social
  INTO v_cliente_id, v_instalador_id, v_placa, v_cliente_nome
  FROM public.instalacoes i
  LEFT JOIN public.clientes c ON c.id = i.cliente_id
  WHERE i.id = p_instalacao_id
    AND (i.cliente_user_id = v_uid OR i.cliente_id = v_uid OR i.cliente_id IN (SELECT id FROM public.clientes WHERE user_id = v_uid));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ordem de instalação não localizada para este cliente.');
  END IF;

  UPDATE public.instalacoes
  SET 
    endereco_cliente_informado = TRIM(p_endereco),
    endereco_cliente_informado_em = now(),
    solicita_endereco_cliente = FALSE,
    local_endereco = TRIM(p_endereco),
    updated_at = now()
  WHERE id = p_instalacao_id;

  IF v_instalador_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id,
        remetente_user_id,
        remetente_nome,
        titulo,
        mensagem,
        tipo,
        url,
        placa
      ) VALUES (
        v_instalador_id,
        v_uid,
        COALESCE(v_cliente_nome, 'Cliente'),
        format('📍 Endereço de Instalação: %s', COALESCE(v_placa, 'Veículo')),
        format('O cliente informou o local para instalação do veículo %s: %s.', COALESCE(v_placa, ''), TRIM(p_endereco)),
        'instalacao',
        '/instalacoes',
        v_placa
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Endereço registrado com sucesso. O instalador foi notificado.'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
