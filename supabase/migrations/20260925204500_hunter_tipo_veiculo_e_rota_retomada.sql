-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Tipo de Veículo e Suporte a Retomada de Rota
-- Versão Canônica: 1.8.9.0
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona coluna tipo_veiculo na tabela de veiculos
ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT NOT NULL DEFAULT 'carro';

-- Garante constraint dos 9 tipos canônicos
ALTER TABLE public.veiculos DROP CONSTRAINT IF EXISTS chk_tipo_veiculo;
ALTER TABLE public.veiculos ADD CONSTRAINT chk_tipo_veiculo 
CHECK (tipo_veiculo IN ('jetski', 'carro', 'suv', 'camionete', 'caminhao', 'onibus', 'moto', 'quadriciculo', 'triciclo'));

-- 2. Adiciona coluna tipo_veiculo na tabela de instalacoes (para ordem de serviço do instalador)
ALTER TABLE public.instalacoes 
ADD COLUMN IF NOT EXISTS tipo_veiculo TEXT DEFAULT 'carro';

-- 3. Atualiza a RPC admin_editar_veiculo para suportar p_tipo_veiculo
CREATE OR REPLACE FUNCTION public.admin_editar_veiculo(
  p_veiculo_id UUID,
  p_placa TEXT,
  p_marca_modelo TEXT,
  p_ano INT DEFAULT NULL,
  p_cor TEXT DEFAULT NULL,
  p_tipo_veiculo TEXT DEFAULT 'carro'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_placa_limpa TEXT;
  v_tipo_sanitizado TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role NOT IN ('superadmin', 'operador') THEN
      RAISE EXCEPTION 'Apenas administradores e operadores podem editar veículos.';
    END IF;
  END IF;

  v_placa_limpa := UPPER(REGEXP_REPLACE(p_placa, '[^A-Za-z0-9]', '', 'g'));
  IF v_placa_limpa IS NULL OR LENGTH(v_placa_limpa) < 3 THEN
    RAISE EXCEPTION 'Placa inválida para o veículo.';
  END IF;

  v_tipo_sanitizado := LOWER(COALESCE(p_tipo_veiculo, 'carro'));
  IF v_tipo_sanitizado NOT IN ('jetski', 'carro', 'suv', 'camionete', 'caminhao', 'onibus', 'moto', 'quadriciculo', 'triciclo') THEN
    v_tipo_sanitizado := 'carro';
  END IF;

  UPDATE public.veiculos
  SET
    placa = v_placa_limpa,
    marca_modelo = TRIM(p_marca_modelo),
    ano = p_ano,
    cor = TRIM(p_cor),
    tipo_veiculo = v_tipo_sanitizado,
    updated_at = NOW()
  WHERE id = p_veiculo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa_limpa,
    'tipo_veiculo', v_tipo_sanitizado,
    'mensagem', 'Dados do veículo atualizados com sucesso.'
  );
END;
$$;
