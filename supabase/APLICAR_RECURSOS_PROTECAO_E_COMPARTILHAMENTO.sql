-- ============================================================================
-- HUNTER — SCRIPT DE ATIVAÇÃO RÁPIDA: PROTEÇÃO, COMPARTILHAMENTO E GEOFENCE
-- ============================================================================
-- Versão: 1.7.0.7
-- Executar no SQL Editor do Supabase para criar as tabelas e recarregar o schema cache:
-- 1. compartilhamentos_temporarios (Resolve o erro PGRST205 / schema cache)
-- 2. areas_seguras (Geofencing)
-- 3. horarios_utilizacao e regras_veiculo
-- 4. rotas_monitoradas (Corredor de rota 2-Opt)
-- 5. veiculo_convidados e notificacoes_configuracoes
-- 6. eventos_veiculo (Linha do Tempo)
-- 7. trajetos_salvos e map_theme_preference
-- 8. Políticas de RLS Estritas (Hunter-Guardian) e NOTIFY pgrst 'reload schema'
-- ============================================================================

-- 1. TABELA DE TRAJETOS SALVOS
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

ALTER TABLE public.trajetos_salvos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios gerenciam seus proprios trajetos salvos" ON public.trajetos_salvos;
CREATE POLICY "Usuarios gerenciam seus proprios trajetos salvos"
ON public.trajetos_salvos FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

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

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trajetos_salvos;
EXCEPTION WHEN others THEN NULL; END $$;

-- 2. TABELAS DO SISTEMA DE PROTEÇÃO E COMPARTILHAMENTO TEMPORÁRIO

-- 2.1 Áreas Seguras / Cercas Pessoais (Geofence)
CREATE TABLE IF NOT EXISTS public.areas_seguras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'outro',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio_metros INTEGER NOT NULL DEFAULT 100,
  poligono_geojson JSONB DEFAULT NULL,
  regra_entrada TEXT NOT NULL DEFAULT 'permitida',
  regra_saida TEXT NOT NULL DEFAULT 'permitida',
  hora_inicio TIME DEFAULT NULL,
  hora_fim TIME DEFAULT NULL,
  dias_semana INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
  tolerancia_metros INTEGER NOT NULL DEFAULT 50,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.areas_seguras ENABLE ROW LEVEL SECURITY;

-- 2.2 Horários de Utilização Esperados
CREATE TABLE IF NOT EXISTS public.horarios_utilizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  dias_semana INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  hora_inicio TIME NOT NULL DEFAULT '06:00:00',
  hora_fim TIME NOT NULL DEFAULT '22:00:00',
  permitir_fim_de_semana BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.horarios_utilizacao ENABLE ROW LEVEL SECURITY;

-- 2.3 Regras e Parâmetros de Proteção do Veículo
CREATE TABLE IF NOT EXISTS public.regras_veiculo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL UNIQUE REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  limite_velocidade_geral INTEGER NOT NULL DEFAULT 110,
  tolerancia_excesso_segundos INTEGER NOT NULL DEFAULT 15,
  alerta_movimento_nao_autorizado BOOLEAN NOT NULL DEFAULT true,
  alerta_ignicao_fora_horario BOOLEAN NOT NULL DEFAULT true,
  alerta_baixa_tensao_v NUMERIC(4,1) NOT NULL DEFAULT 11.5,
  minutos_limite_sem_comunicacao INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.regras_veiculo ENABLE ROW LEVEL SECURITY;

-- 2.4 Rotas Monitoradas (Corredor de Trajeto 2-Opt com Alerta de Desvio)
CREATE TABLE IF NOT EXISTS public.rotas_monitoradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  trajeto_salvo_id UUID REFERENCES public.trajetos_salvos(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  coordenadas_rota JSONB NOT NULL,
  tolerancia_desvio_metros INTEGER NOT NULL DEFAULT 250,
  status TEXT NOT NULL DEFAULT 'ativa',
  desvio_detectado BOOLEAN NOT NULL DEFAULT false,
  ultima_distancia_desvio_m NUMERIC(8,2) NOT NULL DEFAULT 0,
  iniciada_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotas_monitoradas ENABLE ROW LEVEL SECURITY;

-- 2.5 Compartilhamento Temporário de Localização (Resolve o erro do Schema Cache)
CREATE TABLE IF NOT EXISTS public.compartilhamentos_temporarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado BOOLEAN NOT NULL DEFAULT false,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.compartilhamentos_temporarios ENABLE ROW LEVEL SECURITY;

-- 2.6 Usuários Convidados
CREATE TABLE IF NOT EXISTS public.veiculo_convidados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  convidado_email TEXT NOT NULL,
  convidado_nome TEXT NOT NULL,
  convidado_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.veiculo_convidados ENABLE ROW LEVEL SECURITY;

-- 2.7 Configurações de Notificações do Usuário
CREATE TABLE IF NOT EXISTS public.notificacoes_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE CASCADE,
  alertas_ativos JSONB NOT NULL DEFAULT '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"saida_area":true,"entrada_area":false,"excesso_velocidade":true,"perda_comunicacao":true,"baixa_tensao":true,"anomalia":true,"desvio_rota":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes_configuracoes ENABLE ROW LEVEL SECURITY;

-- 2.8 Eventos do Veículo (Timeline Inteligente)
CREATE TABLE IF NOT EXISTS public.eventos_veiculo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'info',
  latitude DOUBLE PRECISION DEFAULT NULL,
  longitude DOUBLE PRECISION DEFAULT NULL,
  velocidade INTEGER DEFAULT NULL,
  detalhes JSONB DEFAULT NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos_veiculo ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE RLS ESTAPECÍFICAS E SEGREGADAS (HUNTER-GUARDIAN)

CREATE OR REPLACE FUNCTION public.check_acesso_cliente_veiculo(p_cliente_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = p_cliente_id
      AND (c.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('superadmin', 'adm', 'operador')
      ))
  );
$$;

-- RLS: areas_seguras
DROP POLICY IF EXISTS "Acesso seguro areas_seguras" ON public.areas_seguras;
CREATE POLICY "Acesso seguro areas_seguras"
ON public.areas_seguras FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: horarios_utilizacao
DROP POLICY IF EXISTS "Acesso seguro horarios_utilizacao" ON public.horarios_utilizacao;
CREATE POLICY "Acesso seguro horarios_utilizacao"
ON public.horarios_utilizacao FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: regras_veiculo
DROP POLICY IF EXISTS "Acesso seguro regras_veiculo" ON public.regras_veiculo;
CREATE POLICY "Acesso seguro regras_veiculo"
ON public.regras_veiculo FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: rotas_monitoradas
DROP POLICY IF EXISTS "Acesso seguro rotas_monitoradas" ON public.rotas_monitoradas;
CREATE POLICY "Acesso seguro rotas_monitoradas"
ON public.rotas_monitoradas FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: compartilhamentos_temporarios
DROP POLICY IF EXISTS "Acesso seguro compartilhamentos_temporarios" ON public.compartilhamentos_temporarios;
CREATE POLICY "Acesso seguro compartilhamentos_temporarios"
ON public.compartilhamentos_temporarios FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: veiculo_convidados
DROP POLICY IF EXISTS "Acesso seguro veiculo_convidados" ON public.veiculo_convidados;
CREATE POLICY "Acesso seguro veiculo_convidados"
ON public.veiculo_convidados FOR ALL TO authenticated
USING (
  public.check_acesso_cliente_veiculo(cliente_id) OR
  convidado_user_id = auth.uid()
)
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- RLS: notificacoes_configuracoes
DROP POLICY IF EXISTS "Acesso seguro notificacoes_configuracoes" ON public.notificacoes_configuracoes;
CREATE POLICY "Acesso seguro notificacoes_configuracoes"
ON public.notificacoes_configuracoes FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS: eventos_veiculo (Timeline)
DROP POLICY IF EXISTS "Acesso seguro eventos_veiculo" ON public.eventos_veiculo;
CREATE POLICY "Acesso seguro eventos_veiculo"
ON public.eventos_veiculo FOR ALL TO authenticated
USING (public.check_acesso_cliente_veiculo(cliente_id))
WITH CHECK (public.check_acesso_cliente_veiculo(cliente_id));

-- 4. HABILITAÇÃO REALTIME
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.areas_seguras;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rotas_monitoradas;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.eventos_veiculo;
EXCEPTION WHEN others THEN NULL; END $$;

-- 5. FUNÇÃO RPC PÚBLICA SEGURA PARA CONSULTAR VEÍCULO POR TOKEN DE COMPARTILHAMENTO
CREATE OR REPLACE FUNCTION public.consultar_veiculo_por_token_publico(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share RECORD;
  v_veiculo RECORD;
BEGIN
  SELECT id, veiculo_id, expira_em, revogado
  INTO v_share
  FROM public.compartilhamentos_temporarios
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Link de compartilhamento não encontrado.');
  END IF;

  IF v_share.revogado THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este compartilhamento foi revogado pelo proprietário.');
  END IF;

  IF v_share.expira_em < now() THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Este link de compartilhamento expirou.');
  END IF;

  SELECT
    id, placa, marca_modelo, cor, ignicao_status, velocidade_atual,
    ultima_latitude, ultima_longitude, ultima_atualizacao, status_operacional,
    rumo
  INTO v_veiculo
  FROM public.veiculos
  WHERE id = v_share.veiculo_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Veículo não localizado.');
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo', jsonb_build_object(
      'id', v_veiculo.id,
      'placa', v_veiculo.placa,
      'marca_modelo', v_veiculo.marca_modelo,
      'cor', v_veiculo.cor,
      'ignicao', v_veiculo.ignicao_status,
      'velocidade', v_veiculo.velocidade_atual,
      'latitude', v_veiculo.ultima_latitude,
      'longitude', v_veiculo.ultima_longitude,
      'ultima_atualizacao', v_veiculo.ultima_atualizacao,
      'status_operacional', v_veiculo.status_operacional,
      'rumo', v_veiculo.rumo
    ),
    'expira_em', v_share.expira_em
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consultar_veiculo_por_token_publico(TEXT) TO anon, authenticated;

-- 6. PERSISTÊNCIA UNIVERSAL DO TEMA DE MAPA NO PERFIL (PROFILES)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS map_theme_preference TEXT NOT NULL DEFAULT 'streets';

UPDATE public.profiles
SET map_theme_preference = 'streets'
WHERE map_theme_preference IS NULL OR map_theme_preference = '';

CREATE OR REPLACE FUNCTION public.salvar_preferencia_mapa(
  p_mapa TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_mapa IN ('streets', 'dark', 'satellite') THEN
      UPDATE public.profiles
      SET map_theme_preference = p_mapa,
          updated_at = now()
      WHERE id = auth.uid();
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_preferencia_mapa(TEXT) TO authenticated;

-- 7. RECARREGAR O CACHE DO POSTGREST IMEDIATAMENTE
NOTIFY pgrst, 'reload schema';
