-- ============================================================================
-- HUNTER — TABELA DE TRAJETOS SALVOS (BANCO DE DADOS SUPABASE COM RLS)
-- ============================================================================
-- Permite que clientes e operadores salvem até 5 trajetos inteligentes favoritos
-- diretamente no Banco de Dados com isolamento total por RLS.

CREATE TABLE IF NOT EXISTS public.trajetos_salvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  retornar_ao_ponto_saida BOOLEAN NOT NULL DEFAULT false,
  saida JSONB NOT NULL,
  paradas JSONB NOT NULL DEFAULT '[]'::jsonb,
  chegada JSONB NOT NULL,
  distancia_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  duracao_minutos INTEGER NOT NULL DEFAULT 0,
  trechos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativação de RLS
ALTER TABLE public.trajetos_salvos ENABLE ROW LEVEL SECURITY;

-- Política de RLS: O usuário acessa e gerencia estritamente os seus próprios trajetos salvos
DROP POLICY IF EXISTS "Usuarios gerenciam seus proprios trajetos salvos" ON public.trajetos_salvos;
CREATE POLICY "Usuarios gerenciam seus proprios trajetos salvos"
ON public.trajetos_salvos FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger no PostgreSQL para garantir limite máximo de 5 trajetos salvos por usuário
CREATE OR REPLACE FUNCTION public.check_limite_trajetos_salvos()
RETURNS TRIGGER AS $$
DECLARE
  qtd INTEGER;
BEGIN
  SELECT COUNT(*) INTO qtd
  FROM public.trajetos_salvos
  WHERE user_id = NEW.user_id;

  IF qtd >= 5 AND (TG_OP = 'INSERT') THEN
    RAISE EXCEPTION 'Limite maximo de 5 trajetos salvos atingido. Exclua um trajeto antes de salvar um novo.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_limite_trajetos_salvos ON public.trajetos_salvos;
CREATE TRIGGER trg_check_limite_trajetos_salvos
BEFORE INSERT ON public.trajetos_salvos
FOR EACH ROW
EXECUTE FUNCTION public.check_limite_trajetos_salvos();

-- Habilita Realtime na tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.trajetos_salvos;

NOTIFY pgrst, 'reload schema';
