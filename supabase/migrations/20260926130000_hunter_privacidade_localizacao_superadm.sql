-- ==============================================================================
-- MIGRATION: 20260926130000_hunter_privacidade_localizacao_superadm.sql
-- DESCRIÇÃO: Modo de Privacidade Canônica do Hunter
-- 1. Cria coluna privacidade_localizacao (padrão TRUE) em clientes e veiculos.
-- 2. Blindagem de segurança: Somente SuperADM (novaes@adm.28bpm.local) pode
--    alterar a privacidade de TRUE para FALSE.
-- 3. Propagação automática de privacidade entre clientes e seus veículos.
-- ==============================================================================

-- 1. Adicionar colunas se não existirem
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'privacidade_localizacao'
    ) THEN
        ALTER TABLE public.clientes ADD COLUMN privacidade_localizacao BOOLEAN NOT NULL DEFAULT true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'veiculos' AND column_name = 'privacidade_localizacao'
    ) THEN
        ALTER TABLE public.veiculos ADD COLUMN privacidade_localizacao BOOLEAN NOT NULL DEFAULT true;
    END IF;
END $$;

-- Garantir valor padrão true nos registros existentes
UPDATE public.clientes SET privacidade_localizacao = true WHERE privacidade_localizacao IS NULL;
UPDATE public.veiculos SET privacidade_localizacao = true WHERE privacidade_localizacao IS NULL;

-- 2. Função e Trigger para blindagem: Somente SuperADM ou o Cliente titular podem desativar a privacidade
CREATE OR REPLACE FUNCTION public.fn_blindar_privacidade_superadm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_is_superadm BOOLEAN := FALSE;
    v_is_cliente_titular BOOLEAN := FALSE;
    v_cliente_user_id UUID;
BEGIN
    -- Se a privacidade não está sendo desativada (permanece true, ou mudou de false para true), permite
    IF NOT (OLD.privacidade_localizacao = TRUE AND NEW.privacidade_localizacao = FALSE) THEN
        RETURN NEW;
    END IF;

    v_user_id := auth.uid();
    v_user_email := auth.jwt() ->> 'email';

    -- 1. SuperADM imutável
    IF v_user_email = 'novaes@adm.28bpm.local' THEN
        v_is_superadm := TRUE;
    ELSE
        SELECT (role = 'superadmin') INTO v_is_superadm
        FROM public.profiles
        WHERE id = v_user_id;
    END IF;

    IF COALESCE(v_is_superadm, FALSE) THEN
        RETURN NEW;
    END IF;

    -- 2. Cliente titular do registro
    IF TG_TABLE_NAME = 'clientes' THEN
        IF OLD.user_id IS NOT NULL AND OLD.user_id = v_user_id THEN
            v_is_cliente_titular := TRUE;
        END IF;
    ELSIF TG_TABLE_NAME = 'veiculos' THEN
        IF OLD.cliente_id IS NOT NULL THEN
            SELECT user_id INTO v_cliente_user_id
            FROM public.clientes
            WHERE id = OLD.cliente_id;

            IF v_cliente_user_id IS NOT NULL AND v_cliente_user_id = v_user_id THEN
                v_is_cliente_titular := TRUE;
            END IF;
        END IF;
    END IF;

    IF COALESCE(v_is_cliente_titular, FALSE) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Acesso Negado: Apenas o SuperADM ou o Cliente titular possuem autorização para desmarcar a privacidade de localização do veículo.'
        USING ERRCODE = '42501';

    RETURN NEW;
END;
$$;

-- Triggers de blindagem em clientes e veiculos
DROP TRIGGER IF EXISTS trg_blindar_privacidade_clientes ON public.clientes;
CREATE TRIGGER trg_blindar_privacidade_clientes
    BEFORE UPDATE OF privacidade_localizacao ON public.clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_blindar_privacidade_superadm();

DROP TRIGGER IF EXISTS trg_blindar_privacidade_veiculos ON public.veiculos;
CREATE TRIGGER trg_blindar_privacidade_veiculos
    BEFORE UPDATE OF privacidade_localizacao ON public.veiculos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_blindar_privacidade_superadm();

-- 3. Sincronizar privacidade do cliente para seus veículos automaticamente
CREATE OR REPLACE FUNCTION public.fn_sync_privacidade_cliente_veiculos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.privacidade_localizacao IS DISTINCT FROM OLD.privacidade_localizacao THEN
        UPDATE public.veiculos
        SET privacidade_localizacao = NEW.privacidade_localizacao
        WHERE cliente_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_privacidade_cliente_veiculos ON public.clientes;
CREATE TRIGGER trg_sync_privacidade_cliente_veiculos
    AFTER UPDATE OF privacidade_localizacao ON public.clientes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_privacidade_cliente_veiculos();

-- 4. Ao cadastrar novo veículo, herdar privacidade do cliente
CREATE OR REPLACE FUNCTION public.fn_herdar_privacidade_cliente_novo_veiculo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_privacidade_cliente BOOLEAN;
BEGIN
    IF NEW.cliente_id IS NOT NULL THEN
        SELECT privacidade_localizacao INTO v_privacidade_cliente
        FROM public.clientes
        WHERE id = NEW.cliente_id;

        IF v_privacidade_cliente IS NOT NULL THEN
            NEW.privacidade_localizacao := v_privacidade_cliente;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_herdar_privacidade_cliente_novo_veiculo ON public.veiculos;
CREATE TRIGGER trg_herdar_privacidade_cliente_novo_veiculo
    BEFORE INSERT ON public.veiculos
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_herdar_privacidade_cliente_novo_veiculo();

-- Recarregar o cache de schema do PostgREST imediatamente
NOTIFY pgrst, 'reload schema';

