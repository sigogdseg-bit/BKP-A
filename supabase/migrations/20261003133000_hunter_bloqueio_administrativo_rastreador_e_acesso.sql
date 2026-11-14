-- ==============================================================================
-- MIGRATION: 20261003133000_hunter_bloqueio_administrativo_rastreador_e_acesso.sql
-- GD RASTREAMENTO — Bloqueio Administrativo em 3 Estágios de Inadimplência
-- 1. Dias 1 a 4: Avisos diários automáticos para o cliente titular.
-- 2. Dia 5+: Bloqueio da visualização da localização dos rastreadores.
-- 3. Dia 7+: Bloqueio total de login para o cliente e seus motoristas.
-- 4. Controles manuais para Operador e ADM (Automático, Bloqueado, Liberado).
-- ==============================================================================

DO $$
BEGIN
    -- 1. Adiciona coluna status_bloqueio_localizacao em clientes se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'status_bloqueio_localizacao'
    ) THEN
        ALTER TABLE public.clientes 
        ADD COLUMN status_bloqueio_localizacao TEXT NOT NULL DEFAULT 'automatico'
        CHECK (status_bloqueio_localizacao IN ('automatico', 'bloqueado', 'liberado'));
    END IF;

    -- 2. Adiciona coluna status_bloqueio_acesso em clientes se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'status_bloqueio_acesso'
    ) THEN
        ALTER TABLE public.clientes 
        ADD COLUMN status_bloqueio_acesso TEXT NOT NULL DEFAULT 'automatico'
        CHECK (status_bloqueio_acesso IN ('automatico', 'bloqueado', 'liberado'));
    END IF;

    -- 3. Adiciona coluna motivo_bloqueio_manual
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'motivo_bloqueio_manual'
    ) THEN
        ALTER TABLE public.clientes ADD COLUMN motivo_bloqueio_manual TEXT;
    END IF;

    -- 4. Adiciona coluna bloqueio_atualizado_em
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'bloqueio_atualizado_em'
    ) THEN
        ALTER TABLE public.clientes ADD COLUMN bloqueio_atualizado_em TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
    END IF;

    -- 5. Adiciona coluna bloqueio_atualizado_por
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'bloqueio_atualizado_por'
    ) THEN
        ALTER TABLE public.clientes ADD COLUMN bloqueio_atualizado_por UUID;
    END IF;
END $$;

-- 6. Trigger para atualizar bloqueio_atualizado_em quando os status de bloqueio mudarem
CREATE OR REPLACE FUNCTION public.fn_atualizar_timestamp_bloqueio_cliente()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status_bloqueio_localizacao IS DISTINCT FROM NEW.status_bloqueio_localizacao) OR
       (OLD.status_bloqueio_acesso IS DISTINCT FROM NEW.status_bloqueio_acesso) THEN
        NEW.bloqueio_atualizado_em := timezone('utc'::text, now());
        IF auth.uid() IS NOT NULL THEN
            NEW.bloqueio_atualizado_por := auth.uid();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_atualizar_timestamp_bloqueio_cliente ON public.clientes;
CREATE TRIGGER trg_atualizar_timestamp_bloqueio_cliente
    BEFORE UPDATE ON public.clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atualizar_timestamp_bloqueio_cliente();

-- 7. Função RPC para Operadores, ADMs e SuperADM atualizarem os bloqueios com permissões estritas
CREATE OR REPLACE FUNCTION public.atualizar_bloqueio_administrativo_cliente(
    p_cliente_id UUID,
    p_status_localizacao TEXT,
    p_status_acesso TEXT,
    p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role TEXT;
    v_is_superadmin BOOLEAN;
    v_resp JSONB;
BEGIN
    -- Validação de parâmetros
    IF p_status_localizacao NOT IN ('automatico', 'bloqueado', 'liberado') THEN
        RAISE EXCEPTION 'status_localizacao inválido: %', p_status_localizacao;
    END IF;

    IF p_status_acesso NOT IN ('automatico', 'bloqueado', 'liberado') THEN
        RAISE EXCEPTION 'status_acesso inválido: %', p_status_acesso;
    END IF;

    -- Checa permissão do usuário atual: deve ser operador, adm ou superadmin
    SELECT role::TEXT INTO v_user_role FROM public.profiles WHERE id = auth.uid();
    v_is_superadmin := (auth.jwt() ->> 'email' IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br')) 
                       OR (v_user_role = 'superadmin');

    IF NOT (v_is_superadmin OR v_user_role IN ('adm', 'operador')) THEN
        RAISE EXCEPTION 'Acesso negado: apenas Operador, Administrador ou SuperADM podem alterar o bloqueio administrativo.';
    END IF;

    UPDATE public.clientes
    SET status_bloqueio_localizacao = p_status_localizacao,
        status_bloqueio_acesso = p_status_acesso,
        motivo_bloqueio_manual = p_motivo,
        bloqueio_atualizado_em = timezone('utc'::text, now()),
        bloqueio_atualizado_por = auth.uid(),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_cliente_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente não encontrado com ID: %', p_cliente_id;
    END IF;

    -- Auditoria na tabela de atividades
    INSERT INTO public.system_activity_logs (
        usuario_id,
        acao,
        detalhes,
        created_at
    ) VALUES (
        auth.uid(),
        'ALTERAR_BLOQUEIO_ADMINISTRATIVO',
        jsonb_build_object(
            'cliente_id', p_cliente_id,
            'status_localizacao', p_status_localizacao,
            'status_acesso', p_status_acesso,
            'motivo', p_motivo
        ),
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'cliente_id', p_cliente_id,
        'status_localizacao', p_status_localizacao,
        'status_acesso', p_status_acesso,
        'motivo', p_motivo
    );
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.atualizar_bloqueio_administrativo_cliente(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Recarrega o cache do PostgREST
NOTIFY pgrst, 'reload schema';
