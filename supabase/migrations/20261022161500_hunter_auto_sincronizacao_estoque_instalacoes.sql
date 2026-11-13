-- Migration: Sincronização Automática e Canônica do Estoque na Conclusão de Instalações
-- Data: 2026-10-22
-- Objetivo:
-- 1. Garantir que toda instalação concluída dê baixa automática e precisa dos materiais utilizados:
--    - 1 Rastreador (MAT-0001 ou categoria rastreador)
--    - 1 Chip m2m (MAT-0002 ou categoria chip)
--    - Relé (MAT-0003) e Porta Relé/Chicote (MAT-0004) SOMENTE se rele_chicote_do_estoque for TRUE
--      (se o instalador forneceu o relé/chicote, não há baixa no estoque)
-- 2. Garantir reconciliação automática e restauração imediata do estoque caso a instalação seja cancelada ou desmarcada.
-- 3. Blindar a integridade contra esquecimento manual ou concorrência.

-- 1. Coluna para informar se relé e chicote foram retirados do estoque da Hunter
ALTER TABLE public.instalacoes 
  ADD COLUMN IF NOT EXISTS rele_chicote_do_estoque BOOLEAN NOT NULL DEFAULT false;

-- 2. Função da trigger de auto-sincronização
CREATE OR REPLACE FUNCTION public.trg_fn_auto_sincronizar_estoque_instalacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tem_movimentacoes BOOLEAN;
  v_itens JSONB := '[]'::jsonb;
  v_item_rastreador_id UUID;
  v_item_chip_id UUID;
  v_item_rele_id UUID;
  v_item_porta_rele_id UUID;
  v_com_bloqueador BOOLEAN;
  v_rele_estoque BOOLEAN;
  v_placa_ref TEXT;
BEGIN
  -- 1. Caso a instalação seja concluída
  IF NEW.status = 'concluida' THEN
    -- Verifica se já existem movimentações registradas para esta instalação
    SELECT EXISTS (
      SELECT 1 FROM public.estoque_movimentacoes WHERE instalacao_id = NEW.id
    ) INTO v_tem_movimentacoes;

    -- Se já possui movimentações (ex: operador escolheu manualmente no NovaInstalacaoModal), não sobrescreve
    IF NOT v_tem_movimentacoes THEN
      v_placa_ref := COALESCE(NULLIF(TRIM(NEW.placa), ''), 'VEICULO');
      v_com_bloqueador := COALESCE(NEW.com_bloqueador, false) OR COALESCE(NEW.bloqueador_instalado, false);
      v_rele_estoque := COALESCE(NEW.rele_chicote_do_estoque, false);

      -- Localiza Rastreador
      SELECT id INTO v_item_rastreador_id
      FROM public.estoque_itens
      WHERE codigo_sku = 'MAT-0001' OR categoria ILIKE '%rastreador%'
      ORDER BY CASE WHEN codigo_sku = 'MAT-0001' THEN 0 ELSE 1 END
      LIMIT 1;

      -- Localiza Chip
      SELECT id INTO v_item_chip_id
      FROM public.estoque_itens
      WHERE codigo_sku = 'MAT-0002' OR categoria ILIKE '%chip%'
      ORDER BY CASE WHEN codigo_sku = 'MAT-0002' THEN 0 ELSE 1 END
      LIMIT 1;

      IF v_item_rastreador_id IS NOT NULL THEN
        v_itens := v_itens || jsonb_build_object(
          'item_id', v_item_rastreador_id,
          'quantidade', 1,
          'observacao', 'Baixa de material por instalação do veículo placa ' || v_placa_ref || ' (Rastreador)'
        );
      END IF;

      IF v_item_chip_id IS NOT NULL THEN
        v_itens := v_itens || jsonb_build_object(
          'item_id', v_item_chip_id,
          'quantidade', 1,
          'observacao', 'Baixa de material por instalação do veículo placa ' || v_placa_ref || ' (Chip)'
        );
      END IF;

      -- Relé e Chicote/Porta Relé: SOMENTE se com_bloqueador E rele_chicote_do_estoque = true
      IF v_com_bloqueador AND v_rele_estoque THEN
        -- Localiza Relé
        SELECT id INTO v_item_rele_id
        FROM public.estoque_itens
        WHERE codigo_sku = 'MAT-0003' OR categoria ILIKE '%rele%'
        ORDER BY CASE WHEN codigo_sku = 'MAT-0003' THEN 0 ELSE 1 END
        LIMIT 1;

        -- Localiza Porta Relé
        SELECT id INTO v_item_porta_rele_id
        FROM public.estoque_itens
        WHERE codigo_sku = 'MAT-0004' OR codigo_sku ILIKE '%porta%' OR nome ILIKE '%porta rele%'
        ORDER BY CASE WHEN codigo_sku = 'MAT-0004' THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_item_rele_id IS NOT NULL THEN
          v_itens := v_itens || jsonb_build_object(
            'item_id', v_item_rele_id,
            'quantidade', 1,
            'observacao', 'Baixa de material por instalação do veículo placa ' || v_placa_ref || ' (Relé de Bloqueio)'
          );
        END IF;

        IF v_item_porta_rele_id IS NOT NULL THEN
          v_itens := v_itens || jsonb_build_object(
            'item_id', v_item_porta_rele_id,
            'quantidade', 1,
            'observacao', 'Baixa de material por instalação do veículo placa ' || v_placa_ref || ' (Porta Relé)'
          );
        END IF;
      END IF;

      IF jsonb_array_length(v_itens) > 0 THEN
        PERFORM public.sincronizar_estoque_instalacao(NEW.id, v_itens, NEW.instalador_id);
      END IF;
    END IF;

  -- 2. Caso a instalação seja cancelada ou desmarcada (não instalada)
  ELSIF NEW.status IN ('nao_instalado', 'cancelada') AND (OLD.status = 'concluida' OR OLD.status = 'concluida_com_pendencia') THEN
    PERFORM public.sincronizar_estoque_instalacao(NEW.id, '[]'::jsonb, NEW.instalador_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_sincronizar_estoque_instalacao ON public.instalacoes;
CREATE TRIGGER trg_auto_sincronizar_estoque_instalacao
AFTER INSERT OR UPDATE OF status, com_bloqueador, bloqueador_instalado, rele_chicote_do_estoque ON public.instalacoes
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_auto_sincronizar_estoque_instalacao();

-- Invalida o cache do PostgREST
NOTIFY pgrst, 'reload schema';
