-- Hunter — Sistema de Convites para Auto-Cadastro de Cliente com Multi-Veículos e Aprovação Operacional
-- Migration: 20261008201500_hunter_convites_cliente_e_auto_cadastro_multi_veiculo.sql

-- 1. Tabela de convites para auto-cadastro de cliente
CREATE TABLE IF NOT EXISTS public.convites_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  usado_em TIMESTAMPTZ,
  usado_por_cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.convites_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operadores e administradores podem gerenciar convites de cliente" ON public.convites_cliente;
CREATE POLICY "Operadores e administradores podem gerenciar convites de cliente"
  ON public.convites_cliente
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'adm', 'operador')
    )
  );

DROP POLICY IF EXISTS "Leitura publica de token de convite de cliente valido" ON public.convites_cliente;
CREATE POLICY "Leitura publica de token de convite de cliente valido"
  ON public.convites_cliente
  FOR SELECT
  TO public
  USING (usado = FALSE AND expira_em > NOW());

-- 2. Permitir que instalador_id seja opcional na tabela instalacoes (para ordens aguardando atribuicao do operador)
ALTER TABLE public.instalacoes ALTER COLUMN instalador_id DROP NOT NULL;

-- 3. Atualizar restrição de status em instalacoes
ALTER TABLE public.instalacoes DROP CONSTRAINT IF EXISTS instalacoes_status_check;
DO $$
BEGIN
  ALTER TABLE public.instalacoes ADD CONSTRAINT instalacoes_status_check 
    CHECK (status IN ('aguardando_atribuicao', 'nao_instalado', 'agendada', 'concluida_com_pendencia', 'concluida', 'cancelada'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Adicionar colunas de pendência de configuração operacional
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS pendente_configuracao_operador BOOLEAN DEFAULT FALSE;
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS pendente_aprovacao_operador BOOLEAN DEFAULT FALSE;

-- 5. RPC para gerar convite de cliente
CREATE OR REPLACE FUNCTION public.gerar_convite_cliente(p_observacoes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_novo_token UUID;
  v_convite_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso nao autorizado. Faca login no sistema.';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('superadmin', 'adm', 'operador') THEN
    RAISE EXCEPTION 'Apenas operadores e administradores podem gerar links de convite para cliente.';
  END IF;

  INSERT INTO public.convites_cliente (
    criado_por,
    observacoes
  ) VALUES (
    v_user_id,
    p_observacoes
  )
  RETURNING id, token INTO v_convite_id, v_novo_token;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'id', v_convite_id,
    'token', v_novo_token,
    'mensagem', 'Link de convite de cliente gerado com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_convite_cliente(TEXT) TO authenticated;

-- 6. RPC para validar convite de cliente
CREATE OR REPLACE FUNCTION public.validar_convite_cliente(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_convite RECORD;
BEGIN
  SELECT * INTO v_convite
  FROM public.convites_cliente
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', FALSE, 'motivo', 'Convite inexistente ou codigo invalido.');
  END IF;

  IF v_convite.usado THEN
    RETURN jsonb_build_object('valido', FALSE, 'motivo', 'Este link de convite ja foi utilizado.');
  END IF;

  IF v_convite.expira_em < NOW() THEN
    RETURN jsonb_build_object('valido', FALSE, 'motivo', 'Este link de convite expirou.');
  END IF;

  RETURN jsonb_build_object(
    'valido', TRUE,
    'token', v_convite.token,
    'expira_em', v_convite.expira_em
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_convite_cliente(UUID) TO public, anon, authenticated;

NOTIFY pgrst, 'reload schema';
