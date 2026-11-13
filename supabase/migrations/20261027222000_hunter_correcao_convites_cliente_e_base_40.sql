-- Hunter — Correção e Garantia da Tabela convites_cliente com Grants Data API e Atualização da Base do Sistema para R$ 40,00
-- Migration: 20261027222000_hunter_correcao_convites_cliente_e_base_40.sql

-- 1. Criação integral e idempotente da tabela convites_cliente se não existir
CREATE TABLE IF NOT EXISTS public.convites_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tipo_convite TEXT NOT NULL DEFAULT 'cliente',
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL,
  vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
  valor_mensalidade_proposta NUMERIC(10,2),
  taxa_instalacao_proposta NUMERIC(10,2),
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  usado_em TIMESTAMPTZ,
  usado_por_cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days'),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Garantir adição de todas as colunas necessárias caso a tabela já existisse
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS tipo_convite TEXT NOT NULL DEFAULT 'cliente';
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS revendedor_id UUID REFERENCES public.revendedores(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS valor_mensalidade_proposta NUMERIC(10,2);
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS taxa_instalacao_proposta NUMERIC(10,2);
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS usado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS usado_em TIMESTAMPTZ;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS usado_por_cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days');
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.convites_cliente ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Índices de alta performance para busca e validação de tokens
CREATE INDEX IF NOT EXISTS idx_convites_token_tipo ON public.convites_cliente(token, tipo_convite);
CREATE INDEX IF NOT EXISTS idx_convites_revendedor ON public.convites_cliente(revendedor_id);
CREATE INDEX IF NOT EXISTS idx_convites_vendedor ON public.convites_cliente(vendedor_id);

-- 4. Habilitar RLS estrito
ALTER TABLE public.convites_cliente ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
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

DROP POLICY IF EXISTS "Revendedores e vendedores gerenciam seus proprios convites" ON public.convites_cliente;
CREATE POLICY "Revendedores e vendedores gerenciam seus proprios convites"
  ON public.convites_cliente
  FOR ALL
  TO authenticated
  USING (
    criado_por = auth.uid()
    OR revendedor_id IN (SELECT id FROM public.revendedores WHERE user_id = auth.uid())
    OR vendedor_id IN (SELECT id FROM public.vendedores WHERE user_id = auth.uid())
  )
  WITH CHECK (
    criado_por = auth.uid()
    OR revendedor_id IN (SELECT id FROM public.revendedores WHERE user_id = auth.uid())
    OR vendedor_id IN (SELECT id FROM public.vendedores WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Leitura publica de token de convite de cliente valido" ON public.convites_cliente;
CREATE POLICY "Leitura publica de token de convite de cliente valido"
  ON public.convites_cliente
  FOR SELECT
  TO anon, authenticated
  USING (usado = FALSE AND expira_em > NOW());

-- 6. Grants explícitos de Data API (Supabase October 30 Compliance)
GRANT ALL ON TABLE public.convites_cliente TO authenticated, service_role;
GRANT SELECT ON TABLE public.convites_cliente TO anon;

-- 7. Atualização do Valor Base Padrão do Sistema para R$ 40,00 (mas editável)
ALTER TABLE public.revendedores ALTER COLUMN valor_base_sistema SET DEFAULT 40.00;
UPDATE public.revendedores SET valor_base_sistema = 40.00 WHERE valor_base_sistema = 25.00;

-- 8. Atualizar Trigger de Split para refletir a nova base padrão de R$ 40,00
CREATE OR REPLACE FUNCTION public.fn_sync_mensalidade_transacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_veiculo_placa TEXT;
  v_revendedor_id UUID;
  v_vendedor_id UUID;
  v_base_sistema NUMERIC(10,2) := 40.00;
  v_base_vendedor NUMERIC(10,2) := 40.00;
  v_mensalidade_valor NUMERIC(10,2);
  v_repasse_revendedor NUMERIC(10,2) := 0;
  v_repasse_vendedor NUMERIC(10,2) := 0;
  v_revendedor_nome TEXT;
  v_vendedor_nome TEXT;
BEGIN
  v_mensalidade_valor := NEW.valor;

  SELECT c.nome, c.revendedor_id, c.vendedor_id
  INTO v_cliente_nome, v_revendedor_id, v_vendedor_id
  FROM public.clientes c
  WHERE c.id = NEW.cliente_id;

  SELECT v.placa INTO v_veiculo_placa
  FROM public.veiculos v
  WHERE v.id = NEW.veiculo_id;

  -- Se houver revendedor atrelado, buscar o valor base do sistema (padrão 40.00, customizável)
  IF v_revendedor_id IS NOT NULL THEN
    SELECT nome, COALESCE(valor_base_sistema, 40.00)
    INTO v_revendedor_nome, v_base_sistema
    FROM public.revendedores
    WHERE id = v_revendedor_id;
  END IF;

  -- Se houver vendedor atrelado, buscar o valor base do vendedor
  IF v_vendedor_id IS NOT NULL THEN
    SELECT nome, COALESCE(valor_base_revendedor, 40.00)
    INTO v_vendedor_nome, v_base_vendedor
    FROM public.vendedores
    WHERE id = v_vendedor_id;
  END IF;

  IF NEW.status = 'pago' THEN
    -- Inserir ou atualizar Entrada da mensalidade bruta
    INSERT INTO public.transacoes_financeiras (
      tipo,
      categoria,
      descricao,
      valor,
      data_transacao,
      data_vencimento,
      status,
      mensalidade_id,
      cliente_id,
      revendedor_id,
      vendedor_id
    ) VALUES (
      'entrada',
      'mensalidade',
      'Mensalidade - ' || COALESCE(v_cliente_nome, 'Cliente') ||
        CASE WHEN v_veiculo_placa IS NOT NULL THEN ' (' || v_veiculo_placa || ')' ELSE '' END,
      v_mensalidade_valor,
      COALESCE(NEW.data_pagamento, CURRENT_DATE),
      NEW.data_vencimento,
      'pago',
      NEW.id,
      NEW.cliente_id,
      v_revendedor_id,
      v_vendedor_id
    )
    ON CONFLICT (mensalidade_id, tipo, categoria)
    DO UPDATE SET
      valor = EXCLUDED.valor,
      status = 'pago',
      data_transacao = EXCLUDED.data_transacao,
      revendedor_id = EXCLUDED.revendedor_id,
      vendedor_id = EXCLUDED.vendedor_id;

    -- Cálculo de Repasses em Cascata:
    IF v_revendedor_id IS NOT NULL AND v_vendedor_id IS NOT NULL THEN
      -- Cenário 1: Venda feita pelo Vendedor
      v_repasse_vendedor := GREATEST(0, v_mensalidade_valor - v_base_vendedor);
      v_repasse_revendedor := GREATEST(0, v_base_vendedor - v_base_sistema);

      IF v_repasse_revendedor > 0 THEN
        INSERT INTO public.transacoes_financeiras (
          tipo,
          categoria,
          descricao,
          valor,
          data_transacao,
          data_vencimento,
          status,
          mensalidade_id,
          cliente_id,
          revendedor_id
        ) VALUES (
          'saida',
          'repasse_revendedor',
          'Repasse Franquia (' || COALESCE(v_revendedor_nome, 'Revendedor') || ') - Ref. ' || COALESCE(v_cliente_nome, 'Cliente'),
          v_repasse_revendedor,
          COALESCE(NEW.data_pagamento, CURRENT_DATE),
          NEW.data_vencimento,
          'pendente',
          NEW.id,
          NEW.cliente_id,
          v_revendedor_id
        )
        ON CONFLICT (mensalidade_id, tipo, categoria)
        DO UPDATE SET valor = EXCLUDED.valor, revendedor_id = EXCLUDED.revendedor_id;
      END IF;

      IF v_repasse_vendedor > 0 THEN
        INSERT INTO public.transacoes_financeiras (
          tipo,
          categoria,
          descricao,
          valor,
          data_transacao,
          data_vencimento,
          status,
          mensalidade_id,
          cliente_id,
          vendedor_id
        ) VALUES (
          'saida',
          'repasse_vendedor',
          'Comissão Vendedor (' || COALESCE(v_vendedor_nome, 'Vendedor') || ') - Ref. ' || COALESCE(v_cliente_nome, 'Cliente'),
          v_repasse_vendedor,
          COALESCE(NEW.data_pagamento, CURRENT_DATE),
          NEW.data_vencimento,
          'pendente',
          NEW.id,
          NEW.cliente_id,
          v_vendedor_id
        )
        ON CONFLICT (mensalidade_id, tipo, categoria)
        DO UPDATE SET valor = EXCLUDED.valor, vendedor_id = EXCLUDED.vendedor_id;
      END IF;

    ELSIF v_revendedor_id IS NOT NULL AND v_vendedor_id IS NULL THEN
      -- Cenário 2: Venda direta feita pelo Revendedor
      v_repasse_revendedor := GREATEST(0, v_mensalidade_valor - v_base_sistema);

      IF v_repasse_revendedor > 0 THEN
        INSERT INTO public.transacoes_financeiras (
          tipo,
          categoria,
          descricao,
          valor,
          data_transacao,
          data_vencimento,
          status,
          mensalidade_id,
          cliente_id,
          revendedor_id
        ) VALUES (
          'saida',
          'repasse_revendedor',
          'Repasse Franquia Direta (' || COALESCE(v_revendedor_nome, 'Revendedor') || ') - Ref. ' || COALESCE(v_cliente_nome, 'Cliente'),
          v_repasse_revendedor,
          COALESCE(NEW.data_pagamento, CURRENT_DATE),
          NEW.data_vencimento,
          'pendente',
          NEW.id,
          NEW.cliente_id,
          v_revendedor_id
        )
        ON CONFLICT (mensalidade_id, tipo, categoria)
        DO UPDATE SET valor = EXCLUDED.valor, revendedor_id = EXCLUDED.revendedor_id;
      END IF;

    ELSIF v_revendedor_id IS NULL AND v_vendedor_id IS NOT NULL THEN
      -- Cenário 3: Venda direta da Central por Vendedor interno
      v_repasse_vendedor := GREATEST(0, v_mensalidade_valor - v_base_vendedor);

      IF v_repasse_vendedor > 0 THEN
        INSERT INTO public.transacoes_financeiras (
          tipo,
          categoria,
          descricao,
          valor,
          data_transacao,
          data_vencimento,
          status,
          mensalidade_id,
          cliente_id,
          vendedor_id
        ) VALUES (
          'saida',
          'repasse_vendedor',
          'Comissão Vendedor Matriz (' || COALESCE(v_vendedor_nome, 'Vendedor') || ') - Ref. ' || COALESCE(v_cliente_nome, 'Cliente'),
          v_repasse_vendedor,
          COALESCE(NEW.data_pagamento, CURRENT_DATE),
          NEW.data_vencimento,
          'pendente',
          NEW.id,
          NEW.cliente_id,
          v_vendedor_id
        )
        ON CONFLICT (mensalidade_id, tipo, categoria)
        DO UPDATE SET valor = EXCLUDED.valor, vendedor_id = EXCLUDED.vendedor_id;
      END IF;
    END IF;

  ELSIF NEW.status = 'pendente' THEN
    INSERT INTO public.transacoes_financeiras (
      tipo,
      categoria,
      descricao,
      valor,
      data_transacao,
      data_vencimento,
      status,
      mensalidade_id,
      cliente_id,
      revendedor_id,
      vendedor_id
    ) VALUES (
      'entrada',
      'mensalidade',
      'Mensalidade Prevista - ' || COALESCE(v_cliente_nome, 'Cliente') ||
        CASE WHEN v_veiculo_placa IS NOT NULL THEN ' (' || v_veiculo_placa || ')' ELSE '' END,
      v_mensalidade_valor,
      NEW.data_vencimento,
      NEW.data_vencimento,
      'pendente',
      NEW.id,
      NEW.cliente_id,
      v_revendedor_id,
      v_vendedor_id
    )
    ON CONFLICT (mensalidade_id, tipo, categoria)
    DO UPDATE SET
      valor = EXCLUDED.valor,
      status = 'pendente',
      data_vencimento = EXCLUDED.data_vencimento,
      revendedor_id = EXCLUDED.revendedor_id,
      vendedor_id = EXCLUDED.vendedor_id;

    -- Se a mensalidade voltou para pendente, remover ou marcar pendente os repasses
    UPDATE public.transacoes_financeiras
    SET status = 'pendente'
    WHERE mensalidade_id = NEW.id AND tipo = 'saida';

  ELSIF NEW.status = 'cancelado' THEN
    UPDATE public.transacoes_financeiras
    SET status = 'cancelado'
    WHERE mensalidade_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- 9. Invalidação obrigatória de cache PostgREST (Zero Schema Cache Error)
NOTIFY pgrst, 'reload schema';
