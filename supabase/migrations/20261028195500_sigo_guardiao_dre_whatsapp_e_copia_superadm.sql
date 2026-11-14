-- ==============================================================================
-- GD RASTREAMENTO — DRE Diária WhatsApp para Parceiros e Cópia SuperADM
-- Migration: 20261028195500_sigo_guardiao_dre_whatsapp_e_copia_superadm.sql
-- ==============================================================================

-- 1. Colunas de agendamento de DRE na tabela revendedores
ALTER TABLE public.revendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.revendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_horario TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE public.revendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_telefone TEXT;
ALTER TABLE public.revendedores ADD COLUMN IF NOT EXISTS dre_ultimo_envio_em TIMESTAMPTZ;

-- 2. Colunas de agendamento de DRE na tabela vendedores
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_ativo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_horario TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS dre_whatsapp_telefone TEXT;
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS dre_ultimo_envio_em TIMESTAMPTZ;

-- 3. Configuração de cópia de mensagens dos parceiros para o SuperADM
ALTER TABLE public.relatorio_gerencial_config ADD COLUMN IF NOT EXISTS copia_whatsapp_parceiros BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. RPCs seguras para Revendedor e Vendedor configurarem o envio de DRE
CREATE OR REPLACE FUNCTION public.configurar_dre_whatsapp_revendedor(
  p_ativo BOOLEAN,
  p_horario TEXT,
  p_telefone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rev_id UUID;
BEGIN
  SELECT id INTO v_rev_id FROM public.revendedores WHERE user_id = auth.uid() LIMIT 1;
  IF v_rev_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Revendedor não identificado para o usuário autenticado.');
  END IF;

  UPDATE public.revendedores
  SET
    dre_whatsapp_ativo = COALESCE(p_ativo, false),
    dre_whatsapp_horario = COALESCE(NULLIF(TRIM(p_horario), ''), '09:00'),
    dre_whatsapp_telefone = TRIM(p_telefone),
    updated_at = NOW()
  WHERE id = v_rev_id;

  RETURN jsonb_build_object('sucesso', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.configurar_dre_whatsapp_vendedor(
  p_ativo BOOLEAN,
  p_horario TEXT,
  p_telefone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vend_id UUID;
BEGIN
  SELECT id INTO v_vend_id FROM public.vendedores WHERE user_id = auth.uid() LIMIT 1;
  IF v_vend_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'erro', 'Vendedor não identificado para o usuário autenticado.');
  END IF;

  UPDATE public.vendedores
  SET
    dre_whatsapp_ativo = COALESCE(p_ativo, false),
    dre_whatsapp_horario = COALESCE(NULLIF(TRIM(p_horario), ''), '09:00'),
    dre_whatsapp_telefone = TRIM(p_telefone),
    updated_at = NOW()
  WHERE id = v_vend_id;

  RETURN jsonb_build_object('sucesso', true);
END;
$$;

-- Permissões explícitas para a Data API
GRANT EXECUTE ON FUNCTION public.configurar_dre_whatsapp_revendedor(BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configurar_dre_whatsapp_vendedor(BOOLEAN, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
