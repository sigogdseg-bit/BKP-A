-- ============================================================================
-- HUNTER — MIGRAÇÃO INICIAL DE ALTA SEGURANÇA, TELEMETRIA E ATENDIMENTO
-- ============================================================================
-- Diretrizes: DJR-NEW & DJR-APP
-- SuperAdmin Mestre: novaes@adm.28bpm.local
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TIPOS ENUM CANÔNICOS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.hunter_role AS ENUM ('superadmin', 'adm', 'operador', 'cliente');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.plano_cliente AS ENUM ('basico', 'pro', 'master', 'personalizado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_cliente AS ENUM ('ativo', 'bloqueado', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_mensalidade AS ENUM ('pago', 'pendente', 'vencido');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_rastreador AS ENUM ('estoque', 'instalado', 'manutencao', 'desativado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.status_atendimento AS ENUM ('aberto', 'em_andamento', 'resolvido', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.prioridade_atendimento AS ENUM ('baixa', 'media', 'alta', 'urgente');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABELA DE PERFIS E ROLES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role public.hunter_role NOT NULL DEFAULT 'cliente',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.hunter_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_roles UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_module UNIQUE (user_id, module)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CLIENTES, PLANOS E MENSALIDADES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome_razao_social TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  status public.status_cliente NOT NULL DEFAULT 'ativo',
  plano public.plano_cliente NOT NULL DEFAULT 'basico',
  dias_historico_plano INT NOT NULL DEFAULT 7,
  dias_retencao_banco INT NOT NULL DEFAULT 10,
  dia_vencimento INT NOT NULL DEFAULT 10,
  valor_mensalidade NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mensalidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  mes_referencia INT NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia INT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL,
  data_vencimento DATE NOT NULL,
  status public.status_mensalidade NOT NULL DEFAULT 'pendente',
  data_pagamento TIMESTAMPTZ,
  comprovante_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cliente_mensalidade UNIQUE (cliente_id, mes_referencia, ano_referencia)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHIPS M2M E RASTREADORES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iccid TEXT NOT NULL UNIQUE,
  operadora TEXT NOT NULL,
  linha TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rastreadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL,
  chip_id UUID REFERENCES public.chips(id) ON DELETE SET NULL,
  status public.status_rastreador NOT NULL DEFAULT 'estoque',
  ultima_comunicacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. VEÍCULOS RASTREADOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  rastreador_id UUID REFERENCES public.rastreadores(id) ON DELETE SET NULL,
  placa TEXT NOT NULL UNIQUE,
  marca_modelo TEXT NOT NULL,
  cor TEXT,
  ano INT,
  chassi TEXT,
  ignicao_status BOOLEAN NOT NULL DEFAULT FALSE,
  bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
  velocidade_atual INT NOT NULL DEFAULT 0,
  odometro_km INT NOT NULL DEFAULT 0,
  ultima_latitude DOUBLE PRECISION,
  ultima_longitude DOUBLE PRECISION,
  ultima_atualizacao TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TELEMETRIA E POSIÇÕES (FIFO COM EXPURGO AUTOMÁTICO)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telemetria_posicoes (
  id BIGSERIAL PRIMARY KEY,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  rastreador_id UUID REFERENCES public.rastreadores(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  velocidade INT NOT NULL DEFAULT 0,
  ignicao BOOLEAN NOT NULL DEFAULT FALSE,
  odometro INT,
  tensao_bateria NUMERIC(5, 2),
  satelites INT,
  rumo INT,
  data_hora_gps TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetria_veiculo_data ON public.telemetria_posicoes(veiculo_id, data_hora_gps DESC);
CREATE INDEX IF NOT EXISTS idx_telemetria_rastreador ON public.telemetria_posicoes(rastreador_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VIAGENS E TRAJETOS (ENTRE CICLOS DE IGNIÇÃO LIGADA E DESLIGADA)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.viagens_trajetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  inicio_at TIMESTAMPTZ NOT NULL,
  fim_at TIMESTAMPTZ,
  km_percorrido NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
  velocidade_media INT NOT NULL DEFAULT 0,
  velocidade_maxima INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viagens_veiculo ON public.viagens_trajetos(veiculo_id, inicio_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ATENDIMENTO AO CLIENTE E TRILHA DE PROVIDÊNCIAS (CARIMBO AUTOMÁTICO)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_protocolo BIGSERIAL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  prioridade public.prioridade_atendimento NOT NULL DEFAULT 'media',
  status public.status_atendimento NOT NULL DEFAULT 'aberto',
  titulo TEXT NOT NULL,
  descricao_inicial TEXT NOT NULL,
  solucao_conclusao TEXT,
  aberto_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalizado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalizado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON public.atendimentos(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON public.atendimentos(status);

CREATE TABLE IF NOT EXISTS public.atendimento_providencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES public.atendimentos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usuario_nome TEXT NOT NULL,
  usuario_role TEXT NOT NULL,
  providencia TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providencias_atendimento ON public.atendimento_providencias(atendimento_id, created_at ASC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. DEFESA CIBERNÉTICA E AUDITORIA (SIGOVTR / DJR-NEW)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'sucesso',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  detalhe TEXT,
  ip_address TEXT,
  hash_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dispositivos_autorizados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  nome_dispositivo TEXT,
  status TEXT NOT NULL DEFAULT 'autorizado',
  ultimo_acesso TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_device UNIQUE (user_id, fingerprint)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. FUNÇÕES DE SEGURANÇA E BLINDAGEM DO SUPERADMIN
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND email = 'novaes@adm.28bpm.local'
      AND role = 'superadmin'
      AND ativo = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_adm()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superadmin', 'adm')
      AND ativo = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_operador()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('superadmin', 'adm', 'operador')
      AND ativo = TRUE
  );
$$;

-- Trigger para blindagem atômica do SuperAdmin
CREATE OR REPLACE FUNCTION public.bloquear_mutacao_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.email = 'novaes@adm.28bpm.local' THEN
    IF (TG_OP = 'DELETE') THEN
      RAISE EXCEPTION 'A conta SuperAdmin mestre e imutavel e nao pode ser excluida.';
    ELSIF (TG_OP = 'UPDATE') THEN
      IF NEW.email <> OLD.email OR NEW.role <> 'superadmin' OR NEW.ativo = FALSE THEN
        RAISE EXCEPTION 'A conta SuperAdmin mestre nao pode ter seu email, role ou status alterados.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacao_superadmin ON public.profiles;
CREATE TRIGGER trg_bloquear_mutacao_superadmin
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bloquear_mutacao_superadmin();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ROTINA DE EXPURGO FIFO AUTOMÁTICO (MARGINAL TÉCNICA POR PLANO)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expurgar_telemetria_antiga()
RETURNS TABLE (
  posicoes_removidas BIGINT,
  viagens_removidas BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_posicoes BIGINT := 0;
  v_viagens BIGINT := 0;
  v_cliente RECORD;
  v_limite TIMESTAMPTZ;
BEGIN
  FOR v_cliente IN 
    SELECT c.id, COALESCE(c.dias_retencao_banco, 35) AS dias
    FROM public.clientes c
  LOOP
    v_limite := NOW() - (v_cliente.dias || ' days')::INTERVAL;
    
    WITH deleted_pos AS (
      DELETE FROM public.telemetria_posicoes tp
      USING public.veiculos v
      WHERE tp.veiculo_id = v.id
        AND v.cliente_id = v_cliente.id
        AND tp.data_hora_gps < v_limite
      RETURNING tp.id
    )
    SELECT v_posicoes + count(*) INTO v_posicoes FROM deleted_pos;

    WITH deleted_via AS (
      DELETE FROM public.viagens_trajetos vt
      USING public.veiculos v
      WHERE vt.veiculo_id = v.id
        AND v.cliente_id = v_cliente.id
        AND vt.inicio_at < v_limite
      RETURNING vt.id
    )
    SELECT v_viagens + count(*) INTO v_viagens FROM deleted_via;
  END LOOP;

  RETURN QUERY SELECT v_posicoes, v_viagens;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ROW LEVEL SECURITY (RLS) EM 100% DAS TABELAS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rastreadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetria_posicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagens_trajetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_providencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_autorizados ENABLE ROW LEVEL SECURITY;

-- POLICIES: PROFILES
CREATE POLICY "Admins e operadores visualizam perfis"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Admins gerenciam perfis"
ON public.profiles FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

CREATE POLICY "Usuarios leem seu proprio perfil"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

-- POLICIES: VEICULOS (ISOLAMENTO ESTRITO DO CLIENTE)
CREATE POLICY "Equipe visualiza e gerencia veiculos"
ON public.veiculos FOR ALL TO authenticated
USING (public.is_operador())
WITH CHECK (public.is_adm());

CREATE POLICY "Clientes visualizam estritamente seus proprios veiculos"
ON public.veiculos FOR SELECT TO authenticated
USING (
  cliente_id IN (
    SELECT id FROM public.clientes WHERE user_id = auth.uid()
  )
);

-- POLICIES: TELEMETRIA (ISOLAMENTO ESTRITO DO CLIENTE)
CREATE POLICY "Equipe visualiza toda a telemetria"
ON public.telemetria_posicoes FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Admins e sistema inserem telemetria"
ON public.telemetria_posicoes FOR INSERT TO authenticated
WITH CHECK (public.is_operador());

CREATE POLICY "Clientes visualizam telemetria apenas de seus veiculos"
ON public.telemetria_posicoes FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT v.id FROM public.veiculos v
    INNER JOIN public.clientes c ON v.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- POLICIES: VIAGENS / TRAJETOS (ISOLAMENTO ESTRITO DO CLIENTE)
CREATE POLICY "Equipe visualiza todas as viagens"
ON public.viagens_trajetos FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Equipe gerencia viagens"
ON public.viagens_trajetos FOR ALL TO authenticated
USING (public.is_operador())
WITH CHECK (public.is_operador());

CREATE POLICY "Clientes visualizam viagens apenas de seus veiculos"
ON public.viagens_trajetos FOR SELECT TO authenticated
USING (
  veiculo_id IN (
    SELECT v.id FROM public.veiculos v
    INNER JOIN public.clientes c ON v.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

-- POLICIES: CLIENTES E MENSALIDADES
CREATE POLICY "Equipe visualiza clientes"
ON public.clientes FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Admins gerenciam clientes"
ON public.clientes FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

CREATE POLICY "Admins gerenciam mensalidades"
ON public.mensalidades FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

CREATE POLICY "Clientes visualizam apenas seus dados cadastrais"
ON public.clientes FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Clientes visualizam suas proprias mensalidades"
ON public.mensalidades FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- POLICIES: CHIPS E RASTREADORES
CREATE POLICY "Equipe visualiza chips e rastreadores"
ON public.chips FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Admins gerenciam chips"
ON public.chips FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

CREATE POLICY "Equipe visualiza rastreadores"
ON public.rastreadores FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Admins gerenciam rastreadores"
ON public.rastreadores FOR ALL TO authenticated
USING (public.is_adm())
WITH CHECK (public.is_adm());

-- POLICIES: ATENDIMENTOS (SUPORTE COM CARIMBO)
CREATE POLICY "Equipe gerencia todos os atendimentos"
ON public.atendimentos FOR ALL TO authenticated
USING (public.is_operador())
WITH CHECK (public.is_operador());

CREATE POLICY "Clientes visualizam apenas seus atendimentos"
ON public.atendimentos FOR SELECT TO authenticated
USING (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

CREATE POLICY "Clientes podem abrir atendimentos para si mesmos"
ON public.atendimentos FOR INSERT TO authenticated
WITH CHECK (
  cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
);

-- POLICIES: ATENDIMENTO PROVIDENCIAS (HISTÓRICO ADITIVO COM CARIMBO)
CREATE POLICY "Equipe visualiza todas as providencias"
ON public.atendimento_providencias FOR SELECT TO authenticated
USING (public.is_operador());

CREATE POLICY "Clientes visualizam providencias de seus atendimentos"
ON public.atendimento_providencias FOR SELECT TO authenticated
USING (
  atendimento_id IN (
    SELECT a.id FROM public.atendimentos a
    INNER JOIN public.clientes c ON a.cliente_id = c.id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Usuarios inserem providencias com seu proprio carimbo"
ON public.atendimento_providencias FOR INSERT TO authenticated
WITH CHECK (usuario_id = auth.uid());

-- POLICIES: LOGS E AUDITORIA (EXCLUSIVO ADMINS)
CREATE POLICY "Admins acessam logs de login"
ON public.system_login_logs FOR SELECT TO authenticated
USING (public.is_adm());

CREATE POLICY "Sistema insere logs de login"
ON public.system_login_logs FOR INSERT TO authenticated
WITH CHECK (TRUE);

CREATE POLICY "Admins acessam logs de atividade"
ON public.system_activity_logs FOR SELECT TO authenticated
USING (public.is_adm());

CREATE POLICY "Sistema insere logs de atividade"
ON public.system_activity_logs FOR INSERT TO authenticated
WITH CHECK (TRUE);

CREATE POLICY "Usuarios gerenciam seus dispositivos autorizados"
ON public.dispositivos_autorizados FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
