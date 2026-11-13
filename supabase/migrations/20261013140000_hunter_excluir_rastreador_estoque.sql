-- ==============================================================================
-- HUNTER / SIGO GUARDIÃO - EXCLUSÃO SEGURA DE RASTREADOR EM ESTOQUE
-- Data: 2026-10-13
-- Permite que operadores e administradores excluam dispositivos / rastreadores
-- que estejam em estoque ou cadastrados erroneamente (ex: testes), preservando
-- a integridade de veículos ativos e chips vinculados.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.excluir_rastreador_estoque(
  p_rastreador_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rast RECORD;
  v_veiculo RECORD;
  v_inst RECORD;
BEGIN
  -- 1. Localiza o rastreador
  SELECT * INTO v_rast FROM public.rastreadores WHERE id = p_rastreador_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Equipamento não localizado no banco de dados.'
    );
  END IF;

  -- 2. Salvaguarda: Verifica se há veículo atrelado
  SELECT placa, marca_modelo INTO v_veiculo 
  FROM public.veiculos 
  WHERE rastreador_id = p_rastreador_id 
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Não é possível excluir: o rastreador está atrelado ao veículo ' || COALESCE(v_veiculo.placa, '') || ' (' || COALESCE(v_veiculo.marca_modelo, '') || '). Desvincule o equipamento do veículo antes de excluir.'
    );
  END IF;

  -- 3. Salvaguarda: Verifica se há instalação em andamento
  SELECT id, status INTO v_inst 
  FROM public.instalacoes 
  WHERE rastreador_id = p_rastreador_id 
    AND status NOT IN ('concluida', 'concluido', 'cancelada', 'cancelado')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Não é possível excluir: o equipamento está associado a uma ordem de serviço de instalação ativa (' || v_inst.status || ').'
    );
  END IF;

  -- 4. Se o rastreador tiver chip_id vinculado, desvincula o chip antes de apagar
  IF v_rast.chip_id IS NOT NULL THEN
    UPDATE public.chips 
    SET status = 'ativo', 
        updated_at = NOW() 
    WHERE id = v_rast.chip_id;
  END IF;

  -- 5. Limpa referências históricas de instalações concluídas/canceladas
  UPDATE public.instalacoes 
  SET rastreador_id = NULL 
  WHERE rastreador_id = p_rastreador_id;

  -- 6. Remove telemetrias residuais se existirem
  BEGIN
    DELETE FROM public.posicoes_gps WHERE rastreador_id = p_rastreador_id;
  EXCEPTION WHEN OTHERS THEN
    -- Silencioso se a coluna não existir ou tabela não referenciar
  END;

  -- 7. Executa a exclusão do rastreador
  DELETE FROM public.rastreadores WHERE id = p_rastreador_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Rastreador IMEI ' || v_rast.imei || ' excluído com sucesso do estoque.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_rastreador_estoque(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_rastreador_estoque(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
