-- ============================================================================
-- MIGRATION: Motorista Analytics Diário (Data Aggregation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.motorista_analytics_diario (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    motorista_id uuid NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
    data_referencia date NOT NULL,
    
    -- Métricas de Condução
    score_conducao integer DEFAULT 100,
    tempo_ocioso_minutos integer DEFAULT 0,
    vel_maxima_atingida integer DEFAULT 0,
    vel_media integer DEFAULT 0,
    
    -- Métricas Operacionais
    km_rodado numeric(10,2) DEFAULT 0.00,
    consumo_kml numeric(10,2) DEFAULT 0.00,
    custo_operacional_km numeric(10,2) DEFAULT 0.00,
    
    -- Métricas de Conformidade e Alertas
    desvios_rota_qtd integer DEFAULT 0,
    agendamentos_cumpridos_qtd integer DEFAULT 0,
    alertas_criticos_qtd integer DEFAULT 0,
    
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    
    CONSTRAINT motorista_analytics_diario_unico UNIQUE(motorista_id, data_referencia)
);

-- Índices de Alta Performance (B-Tree Composto)
CREATE INDEX IF NOT EXISTS idx_motorista_analytics_data ON public.motorista_analytics_diario (motorista_id, data_referencia DESC);

-- Trigger de Atualizado Em
CREATE TRIGGER trg_motorista_analytics_diario_atualizado_em
    BEFORE UPDATE ON public.motorista_analytics_diario
    FOR EACH ROW
    EXECUTE FUNCTION public.update_atualizado_em();

-- ============================================================================
-- SEGURANÇA (RLS Estrito)
-- ============================================================================
ALTER TABLE public.motorista_analytics_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Motorista analytics visível para adms do cliente"
    ON public.motorista_analytics_diario
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.motoristas m
            JOIN public.user_roles ur ON ur.cliente_id = m.cliente_id
            WHERE m.id = motorista_analytics_diario.motorista_id
              AND ur.user_id = auth.uid()
        )
    );

-- Somente triggers e funções do sistema podem inserir/atualizar
CREATE POLICY "Bloquear mutações externas no analytics"
    ON public.motorista_analytics_diario
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- ============================================================================
-- RPC: Gerar Analytics Diário (Simulador/Agregador Inicial)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.gerar_analytics_motorista_dia(
    p_motorista_id uuid,
    p_data date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Neste MVP, usamos uma inserção agregada simulada enquanto o pipeline pesado de telemetria é acoplado.
    -- O objetivo é testar e fornecer os dados para a UI D-1.
    INSERT INTO public.motorista_analytics_diario (
        motorista_id, 
        data_referencia,
        score_conducao,
        tempo_ocioso_minutos,
        vel_maxima_atingida,
        vel_media,
        km_rodado,
        consumo_kml,
        custo_operacional_km,
        alertas_criticos_qtd
    )
    VALUES (
        p_motorista_id,
        p_data,
        floor(random() * 20 + 80)::int, -- Score 80 a 100
        floor(random() * 45)::int, -- Idling até 45 min
        floor(random() * 40 + 80)::int, -- Vel max 80 a 120
        floor(random() * 20 + 50)::int, -- Vel media 50 a 70
        floor(random() * 200 + 50)::numeric, -- Km rodado 50 a 250
        (random() * 4 + 8)::numeric(10,2), -- Consumo 8 a 12 km/l
        (random() * 2 + 1)::numeric(10,2), -- Custo R$ 1.00 a 3.00/km
        floor(random() * 3)::int -- Alertas 0 a 2
    )
    ON CONFLICT (motorista_id, data_referencia) 
    DO UPDATE SET 
        atualizado_em = now(),
        score_conducao = EXCLUDED.score_conducao,
        km_rodado = EXCLUDED.km_rodado,
        vel_media = EXCLUDED.vel_media;
END;
$$;
