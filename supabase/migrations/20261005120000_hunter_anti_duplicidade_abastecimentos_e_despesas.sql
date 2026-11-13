-- =============================================================================
-- HUNTER — BLINDAGEM ANTI-DUPLICIDADE DE ABASTECIMENTOS E DESPESAS (DJR-NEW)
-- Versão da Migração: 20261005120000_hunter_anti_duplicidade_abastecimentos_e_despesas.sql
-- =============================================================================
-- 1. Saneamento preventivo: remove duplicidades legadas em motorista_abastecimentos
--    mantendo sempre o registro que contém anexo de NF ou o mais recente.
-- 2. Saneamento preventivo em motorista_despesas.
-- 3. Índices Únicos Parciais no PostgreSQL:
--    - idx_abast_unico_nf: (veiculo_id, UPPER(TRIM(nf_numero))) onde nf_numero não é nulo/vazio.
--    - idx_abast_unico_sem_nf: (veiculo_id, data_abastecimento, km_atual, valor_total, litros) onde nf_numero é nulo/vazio.
--    - idx_despesas_unico_nf: (veiculo_id, UPPER(TRIM(nf_numero))) onde nf_numero não é nulo/vazio.
--    - idx_despesas_unico_sem_nf: (veiculo_id, data_despesa, valor, UPPER(TRIM(descricao))) onde nf_numero é nulo/vazio.
-- 4. Notificação de reload de schema ao PostgREST.
-- =============================================================================

-- 1. Saneamento em motorista_abastecimentos (mantém a linha com anexo ou mais recente)
DELETE FROM public.motorista_abastecimentos a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY veiculo_id, UPPER(TRIM(nf_numero))
             ORDER BY (nf_foto_url IS NOT NULL) DESC, created_at DESC
           ) as rn
    FROM public.motorista_abastecimentos
    WHERE nf_numero IS NOT NULL AND TRIM(nf_numero) <> ''
  ) dupes
  WHERE dupes.rn > 1
);

DELETE FROM public.motorista_abastecimentos a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY veiculo_id, data_abastecimento, km_atual, valor_total, litros
             ORDER BY (nf_foto_url IS NOT NULL) DESC, created_at DESC
           ) as rn
    FROM public.motorista_abastecimentos
    WHERE nf_numero IS NULL OR TRIM(nf_numero) = ''
  ) dupes
  WHERE dupes.rn > 1
);

-- 2. Saneamento em motorista_despesas
DELETE FROM public.motorista_despesas d
WHERE d.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY veiculo_id, UPPER(TRIM(nf_numero))
             ORDER BY (nf_foto_url IS NOT NULL) DESC, created_at DESC
           ) as rn
    FROM public.motorista_despesas
    WHERE nf_numero IS NOT NULL AND TRIM(nf_numero) <> ''
  ) dupes
  WHERE dupes.rn > 1
);

DELETE FROM public.motorista_despesas d
WHERE d.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY veiculo_id, data_despesa, valor, UPPER(TRIM(descricao))
             ORDER BY (nf_foto_url IS NOT NULL) DESC, created_at DESC
           ) as rn
    FROM public.motorista_despesas
    WHERE nf_numero IS NULL OR TRIM(nf_numero) = ''
  ) dupes
  WHERE dupes.rn > 1
);

-- 3. Índices Únicos Parciais no PostgreSQL

-- Abastecimentos com NF informada: apenas 1 por veículo e NF
DROP INDEX IF EXISTS public.idx_abast_unico_nf;
CREATE UNIQUE INDEX IF NOT EXISTS idx_abast_unico_nf
ON public.motorista_abastecimentos (veiculo_id, UPPER(TRIM(nf_numero)))
WHERE nf_numero IS NOT NULL AND TRIM(nf_numero) <> '';

-- Abastecimentos sem NF informada: impede inserção duplicada idêntica (duplo clique / replay)
DROP INDEX IF EXISTS public.idx_abast_unico_sem_nf;
CREATE UNIQUE INDEX IF NOT EXISTS idx_abast_unico_sem_nf
ON public.motorista_abastecimentos (veiculo_id, data_abastecimento, km_atual, valor_total, litros)
WHERE (nf_numero IS NULL OR TRIM(nf_numero) = '') AND km_atual IS NOT NULL;

-- Despesas com NF informada: apenas 1 por veículo e NF
DROP INDEX IF EXISTS public.idx_despesas_unico_nf;
CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_unico_nf
ON public.motorista_despesas (veiculo_id, UPPER(TRIM(nf_numero)))
WHERE nf_numero IS NOT NULL AND TRIM(nf_numero) <> '';

-- Despesas sem NF informada: impede lançamento duplo com mesmos atributos
DROP INDEX IF EXISTS public.idx_despesas_unico_sem_nf;
CREATE UNIQUE INDEX IF NOT EXISTS idx_despesas_unico_sem_nf
ON public.motorista_despesas (veiculo_id, data_despesa, valor, UPPER(TRIM(descricao)))
WHERE nf_numero IS NULL OR TRIM(nf_numero) = '';

-- 4. Notificar PostgREST
NOTIFY pgrst, 'reload schema';
