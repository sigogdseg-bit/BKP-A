-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Módulo de Propostas Comerciais e Efetividade de Vendas
-- Sistema: SIGO Guardião | Diretrizes: DJR-NEW e HUNTER-GUARDIAN
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.propostas_comerciais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_proposta TEXT NOT NULL UNIQUE,
    cliente_nome TEXT NOT NULL,
    cliente_telefone TEXT NOT NULL,
    veiculo_marca TEXT NOT NULL,
    veiculo_modelo TEXT NOT NULL,
    veiculo_ano TEXT NOT NULL,
    com_fidelidade_meses INTEGER NOT NULL DEFAULT 12,
    com_fidelidade_instalacao NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    com_fidelidade_mensalidade NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sem_fidelidade_instalacao NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    sem_fidelidade_mensalidade NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita', 'recusada', 'expirada')),
    observacoes TEXT,
    hash_sha256 TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices B-Tree para buscas ágeis e ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_status ON public.propostas_comerciais(status);
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_created_at ON public.propostas_comerciais(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_propostas_comerciais_telefone ON public.propostas_comerciais(cliente_telefone);

-- Ativação estrita de Row Level Security (RLS)
ALTER TABLE public.propostas_comerciais ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS:
-- 1. Leitura por operadores autenticados (ADM, SuperADM e operadores autorizados)
DROP POLICY IF EXISTS "Leitura de propostas por usuarios autenticados" ON public.propostas_comerciais;
CREATE POLICY "Leitura de propostas por usuarios autenticados"
ON public.propostas_comerciais
FOR SELECT
TO authenticated
USING (true);

-- 2. Inserção por operadores autenticados
DROP POLICY IF EXISTS "Insercao de propostas por usuarios autenticados" ON public.propostas_comerciais;
CREATE POLICY "Insercao de propostas por usuarios autenticados"
ON public.propostas_comerciais
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Atualização por operadores autenticados
DROP POLICY IF EXISTS "Atualizacao de propostas por usuarios autenticados" ON public.propostas_comerciais;
CREATE POLICY "Atualizacao de propostas por usuarios autenticados"
ON public.propostas_comerciais
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Exclusão por administradores autenticados
DROP POLICY IF EXISTS "Exclusao de propostas por administradores" ON public.propostas_comerciais;
CREATE POLICY "Exclusao de propostas por administradores"
ON public.propostas_comerciais
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'adm')
    )
    OR auth.jwt()->>'email' = 'novaes@adm.28bpm.local'
);

-- Função geradora de número sequencial único para a proposta
CREATE OR REPLACE FUNCTION public.gerar_numero_proposta_comercial()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ano TEXT;
    v_seq BIGINT;
    v_numero TEXT;
BEGIN
    v_ano := TO_CHAR(now(), 'YYYY');
    SELECT COUNT(*) + 1 INTO v_seq
    FROM public.propostas_comerciais
    WHERE TO_CHAR(created_at, 'YYYY') = v_ano;
    
    v_numero := 'PROP-' || v_ano || '-' || LPAD(v_seq::TEXT, 4, '0');
    
    -- Trata colisão caso haja registros concorrentes
    WHILE EXISTS (SELECT 1 FROM public.propostas_comerciais WHERE numero_proposta = v_numero) LOOP
        v_seq := v_seq + 1;
        v_numero := 'PROP-' || v_ano || '-' || LPAD(v_seq::TEXT, 4, '0');
    END LOOP;

    RETURN v_numero;
END;
$$;
