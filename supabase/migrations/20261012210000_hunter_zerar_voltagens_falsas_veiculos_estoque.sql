-- ==============================================================================
-- HUNTER / SIGO GUARDIÃO - MIGRATION DE AUDITORIA E LIMPEZA DE VOLTAGENS
-- Regra Pétrea: NADA NO SISTEMA PODE SER FALSO!
-- Garante que veículos sem comunicação ativa ou em estoque não possuam
-- voltagem residual de 12.6V gravada artificialmente.
-- ==============================================================================

UPDATE public.veiculos
SET 
  voltagem = NULL,
  bateria_veiculo_v = NULL
WHERE ultima_atualizacao IS NULL;

-- Garante que o valor padrão da coluna voltagem e bateria_veiculo_v seja estritamente NULL
ALTER TABLE public.veiculos ALTER COLUMN voltagem SET DEFAULT NULL;
ALTER TABLE public.veiculos ALTER COLUMN bateria_veiculo_v SET DEFAULT NULL;

COMMENT ON COLUMN public.veiculos.voltagem IS 'Voltagem real transmitida pela telemetria do rastreador (NULL se não houver leitura real)';
COMMENT ON COLUMN public.veiculos.bateria_veiculo_v IS 'Voltagem real da bateria principal do veículo (NULL se não houver leitura real)';

-- Invalidação Canônica de Cache PostgREST
NOTIFY pgrst, 'reload schema';
