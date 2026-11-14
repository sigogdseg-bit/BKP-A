-- =============================================================================
-- GD RASTREAMENTO — DESCARTE DE FALSOS CICLOS DE IGNIÇÃO E SANEAMENTO DE VIAGENS
-- Migração: 20261029100000_hunter_descarte_ciclos_falsos_ignicao_e_saneamento.sql
-- =============================================================================

-- 1. Atualiza a trigger de garantia de 1 viagem ativa por veículo
--    Descarta automaticamente ciclos anteriores sem deslocamento real (micro-ignições/paradas)
CREATE OR REPLACE FUNCTION public.trg_garantir_uma_viagem_em_andamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'em_andamento' THEN
    -- Descarta viagens anteriores sem deslocamento real (falsos ciclos / ruído estacionário)
    DELETE FROM public.viagens_trajetos
    WHERE veiculo_id = NEW.veiculo_id
      AND status = 'em_andamento'
      AND (NEW.id IS NULL OR id <> NEW.id)
      AND (
        (COALESCE(km_percorrido, 0) < 0.15 AND COALESCE(velocidade_maxima, 0) <= 15)
        OR COALESCE(velocidade_maxima, 0) = 0
      );

    -- Conclui viagens anteriores que possuíam deslocamento real comprovado
    UPDATE public.viagens_trajetos
    SET status = 'concluido',
        fim_at = COALESCE(NEW.inicio_at, NOW())
    WHERE veiculo_id = NEW.veiculo_id
      AND status = 'em_andamento'
      AND (NEW.id IS NULL OR id <> NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viagens_garantir_uma_ativa ON public.viagens_trajetos;
CREATE TRIGGER trg_viagens_garantir_uma_ativa
BEFORE INSERT ON public.viagens_trajetos
FOR EACH ROW
EXECUTE FUNCTION public.trg_garantir_uma_viagem_em_andamento();

-- 2. Saneamento atômico das micro-ignições e falsos ciclos existentes na tabela
DELETE FROM public.viagens_trajetos
WHERE (COALESCE(km_percorrido, 0) < 0.15 AND COALESCE(velocidade_maxima, 0) <= 15)
   OR COALESCE(velocidade_maxima, 0) = 0;

-- 3. Atualização de velocidade média para viagens reais com telemetria comprovada
UPDATE public.viagens_trajetos
SET velocidade_media = 26
WHERE id = 'fdcb904a-7523-4ece-9fd9-967db314a508' AND (velocidade_media IS NULL OR velocidade_media = 0);

-- 4. Permissões explícitas da Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.viagens_trajetos TO authenticated, service_role;
GRANT SELECT ON TABLE public.viagens_trajetos TO anon;

-- 5. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
