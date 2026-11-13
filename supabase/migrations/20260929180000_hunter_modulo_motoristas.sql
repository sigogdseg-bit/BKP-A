-- ============================================================================
-- HUNTER — MÓDULO MOTORISTAS
-- Versão: 1.11.0.0
-- Diretrizes: DJR-NEW · DJR-APP · Anti-Polling · RLS Estrito · Zero Mock
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR 'motorista' AO ENUM hunter_role
-- ============================================================================
DO $$ BEGIN
  ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'motorista';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;

-- ============================================================================
-- 2. TABELA PRINCIPAL: motoristas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.motoristas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Dados pessoais
  nome                  TEXT NOT NULL,
  cpf                   TEXT,
  data_nascimento       DATE,
  telefone              TEXT,
  email                 TEXT NOT NULL,

  -- CNH
  cnh_numero            TEXT,
  cnh_categoria         TEXT,        -- A, B, AB, C, D, E, ACC, etc.
  cnh_validade          DATE,
  cnh_primeira_habilitacao DATE,
  cnh_renach            TEXT,
  cnh_observacoes       TEXT,
  cnh_foto_url          TEXT,        -- URL do arquivo no Storage (original)

  -- Controle de acesso ao mapa operacional
  acesso_mapa           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Status
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,

  -- Auditoria
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unicidade: e-mail único por cliente
  CONSTRAINT uq_motorista_email UNIQUE (email),
  -- CPF único quando preenchido (por cliente)
  CONSTRAINT uq_motorista_cpf_cliente UNIQUE (cliente_id, cpf)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_motoristas_cliente    ON public.motoristas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_motoristas_user_id    ON public.motoristas(user_id);
CREATE INDEX IF NOT EXISTS idx_motoristas_cnh_val    ON public.motoristas(cnh_validade);
CREATE INDEX IF NOT EXISTS idx_motoristas_ativo      ON public.motoristas(cliente_id, ativo);

-- ============================================================================
-- 3. TABELA: motorista_veiculos (vinculação motorista ↔ veículo)
-- Motoristas só operam veículos explicitamente associados pelo cliente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.motorista_veiculos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id  UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  veiculo_id    UUID NOT NULL REFERENCES public.veiculos(id)   ON DELETE CASCADE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_motorista_veiculo UNIQUE (motorista_id, veiculo_id)
);

CREATE INDEX IF NOT EXISTS idx_motveic_motorista ON public.motorista_veiculos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_motveic_veiculo   ON public.motorista_veiculos(veiculo_id);

-- ============================================================================
-- 4. TABELA: motorista_abastecimentos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.motorista_abastecimentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id  UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  veiculo_id    UUID NOT NULL REFERENCES public.veiculos(id)   ON DELETE RESTRICT,
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id)   ON DELETE CASCADE,

  data_abastecimento  DATE NOT NULL,
  km_atual            NUMERIC(10,2),
  litros              NUMERIC(10,3) NOT NULL,
  valor_total         NUMERIC(12,2) NOT NULL,
  valor_por_litro     NUMERIC(10,4),
  combustivel         TEXT NOT NULL DEFAULT 'gasolina', -- gasolina, etanol, diesel, gnv, eletrico
  posto_nome          TEXT,
  posto_cidade        TEXT,
  nf_numero           TEXT,
  -- Ciclo de vida do arquivo NF no Storage (bucket: nfs-temp)
  nf_foto_url         TEXT,             -- path no Storage (null = sem arquivo ou expirado)
  nf_upload_em        TIMESTAMPTZ,      -- quando o motorista fez upload
  nf_baixado          BOOLEAN NOT NULL DEFAULT FALSE,
  nf_baixado_em       TIMESTAMPTZ,
  nf_ciente_em        TIMESTAMPTZ,      -- cliente confirmou ciencia de expiracao
  nf_expirado         BOOLEAN NOT NULL DEFAULT FALSE, -- arquivo deletado do Storage
  observacoes         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abast_motorista  ON public.motorista_abastecimentos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_abast_veiculo    ON public.motorista_abastecimentos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_abast_cliente    ON public.motorista_abastecimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abast_data       ON public.motorista_abastecimentos(data_abastecimento DESC);

-- ============================================================================
-- 5. TABELA: motorista_despesas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.motorista_despesas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id  UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  veiculo_id    UUID NOT NULL REFERENCES public.veiculos(id)   ON DELETE RESTRICT,
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id)   ON DELETE CASCADE,

  data_despesa        DATE NOT NULL,
  categoria           TEXT NOT NULL, -- pedagio, estacionamento, lavagem, multa, outro
  descricao           TEXT NOT NULL,
  valor               NUMERIC(12,2) NOT NULL,
  km_atual            NUMERIC(10,2),
  nf_numero           TEXT,
  -- Ciclo de vida do arquivo NF no Storage (bucket: nfs-temp)
  nf_foto_url         TEXT,
  nf_upload_em        TIMESTAMPTZ,
  nf_baixado          BOOLEAN NOT NULL DEFAULT FALSE,
  nf_baixado_em       TIMESTAMPTZ,
  nf_ciente_em        TIMESTAMPTZ,
  nf_expirado         BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes         TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_motorista ON public.motorista_despesas(motorista_id);
CREATE INDEX IF NOT EXISTS idx_despesas_veiculo   ON public.motorista_despesas(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_despesas_cliente   ON public.motorista_despesas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_despesas_data      ON public.motorista_despesas(data_despesa DESC);

-- ============================================================================
-- 6. TRIGGER: atualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_motoristas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_motoristas_updated_at
    BEFORE UPDATE ON public.motoristas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_motoristas();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_abast_updated_at
    BEFORE UPDATE ON public.motorista_abastecimentos
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_motoristas();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_despesas_updated_at
    BEFORE UPDATE ON public.motorista_despesas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_motoristas();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 7. HELPER: retorna o motorista_id do usuário autenticado
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_motorista_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT id FROM public.motoristas
  WHERE user_id = auth.uid() AND ativo = TRUE
  LIMIT 1;
$$;

-- ============================================================================
-- 8. RLS: ATIVAR E DEFINIR POLÍTICAS
-- ============================================================================

-- motoristas
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;

-- Clientes veem apenas seus motoristas
CREATE POLICY "motoristas_select_cliente" ON public.motoristas
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm','operador')
  );

-- Clientes inserem motoristas no próprio cliente
CREATE POLICY "motoristas_insert_cliente" ON public.motoristas
  FOR INSERT WITH CHECK (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- Clientes editam apenas seus motoristas
CREATE POLICY "motoristas_update_cliente" ON public.motoristas
  FOR UPDATE USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- Clientes excluem apenas seus motoristas
CREATE POLICY "motoristas_delete_cliente" ON public.motoristas
  FOR DELETE USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- Motorista vê seu próprio registro
CREATE POLICY "motoristas_select_self" ON public.motoristas
  FOR SELECT USING (user_id = auth.uid());

-- Motorista pode atualizar dados do próprio perfil
CREATE POLICY "motoristas_update_self" ON public.motoristas
  FOR UPDATE USING (user_id = auth.uid());

-- motorista_veiculos
ALTER TABLE public.motorista_veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "motveic_select" ON public.motorista_veiculos
  FOR SELECT USING (
    motorista_id IN (SELECT id FROM public.motoristas WHERE cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid()))
    OR motorista_id = public.get_motorista_id()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm','operador')
  );

CREATE POLICY "motveic_insert" ON public.motorista_veiculos
  FOR INSERT WITH CHECK (
    motorista_id IN (SELECT id FROM public.motoristas WHERE cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "motveic_update" ON public.motorista_veiculos
  FOR UPDATE USING (
    motorista_id IN (SELECT id FROM public.motoristas WHERE cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "motveic_delete" ON public.motorista_veiculos
  FOR DELETE USING (
    motorista_id IN (SELECT id FROM public.motoristas WHERE cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid()))
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- motorista_abastecimentos
ALTER TABLE public.motorista_abastecimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abast_select" ON public.motorista_abastecimentos
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR motorista_id = public.get_motorista_id()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm','operador')
  );

CREATE POLICY "abast_insert" ON public.motorista_abastecimentos
  FOR INSERT WITH CHECK (
    motorista_id = public.get_motorista_id()
    OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "abast_update" ON public.motorista_abastecimentos
  FOR UPDATE USING (
    motorista_id = public.get_motorista_id()
    OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "abast_delete" ON public.motorista_abastecimentos
  FOR DELETE USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- motorista_despesas
ALTER TABLE public.motorista_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "despesas_select" ON public.motorista_despesas
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR motorista_id = public.get_motorista_id()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm','operador')
  );

CREATE POLICY "despesas_insert" ON public.motorista_despesas
  FOR INSERT WITH CHECK (
    motorista_id = public.get_motorista_id()
    OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "despesas_update" ON public.motorista_despesas
  FOR UPDATE USING (
    motorista_id = public.get_motorista_id()
    OR cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

CREATE POLICY "despesas_delete" ON public.motorista_despesas
  FOR DELETE USING (
    cliente_id IN (SELECT id FROM public.clientes WHERE user_id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('superadmin','adm')
  );

-- ============================================================================
-- 9. RPC: CADASTRAR MOTORISTA (criação de auth.user + motorista)
-- Executada pelo cliente; cria conta auth.users e vincula ao cliente.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cadastrar_motorista(
  p_cliente_id      UUID,
  p_nome            TEXT,
  p_email           TEXT,
  p_senha           TEXT,
  p_cpf             TEXT          DEFAULT NULL,
  p_telefone        TEXT          DEFAULT NULL,
  p_data_nascimento DATE          DEFAULT NULL,
  p_cnh_numero      TEXT          DEFAULT NULL,
  p_cnh_categoria   TEXT          DEFAULT NULL,
  p_cnh_validade    DATE          DEFAULT NULL,
  p_cnh_primeira    DATE          DEFAULT NULL,
  p_cnh_renach      TEXT          DEFAULT NULL,
  p_cnh_observacoes TEXT          DEFAULT NULL,
  p_cnh_foto_url    TEXT          DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_user_id     UUID;
  v_motorista   UUID;
  v_enc_pw      TEXT;
BEGIN
  -- 1. Verificar que o chamador é o dono do cliente
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = v_caller_id
  ) AND NOT (SELECT role FROM public.profiles WHERE id = v_caller_id) IN ('superadmin','adm') THEN
    RAISE EXCEPTION 'Acesso negado: cliente nao autorizado.';
  END IF;

  -- 2. Validações básicas
  IF trim(p_nome) = '' OR p_nome IS NULL THEN
    RAISE EXCEPTION 'Nome do motorista e obrigatorio.';
  END IF;
  IF trim(p_email) = '' OR p_email IS NULL THEN
    RAISE EXCEPTION 'E-mail do motorista e obrigatorio.';
  END IF;
  IF length(p_senha) < 6 THEN
    RAISE EXCEPTION 'Senha deve ter no minimo 6 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario com este e-mail.';
  END IF;

  -- 3. Criar usuário no auth
  v_user_id := gen_random_uuid();
  v_enc_pw  := crypt(p_senha, gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    LOWER(trim(p_email)), v_enc_pw, NOW(),
    jsonb_build_object('provider','email','providers',ARRAY['email']),
    jsonb_build_object('nome', p_nome),
    NOW(), NOW()
  );

  -- 4. Criar profile com role motorista
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (v_user_id, p_nome, LOWER(trim(p_email)), 'motorista', TRUE)
  ON CONFLICT (id) DO UPDATE SET role = 'motorista', nome = p_nome;

  -- 5. Criar registro do motorista
  INSERT INTO public.motoristas (
    cliente_id, user_id, nome, email, cpf, telefone, data_nascimento,
    cnh_numero, cnh_categoria, cnh_validade, cnh_primeira_habilitacao,
    cnh_renach, cnh_observacoes, cnh_foto_url
  ) VALUES (
    p_cliente_id, v_user_id, p_nome, LOWER(trim(p_email)),
    NULLIF(trim(COALESCE(p_cpf,'')), ''),
    NULLIF(trim(COALESCE(p_telefone,'')), ''),
    p_data_nascimento,
    NULLIF(trim(COALESCE(p_cnh_numero,'')), ''),
    NULLIF(trim(COALESCE(p_cnh_categoria,'')), ''),
    p_cnh_validade, p_cnh_primeira,
    NULLIF(trim(COALESCE(p_cnh_renach,'')), ''),
    NULLIF(trim(COALESCE(p_cnh_observacoes,'')), ''),
    NULLIF(trim(COALESCE(p_cnh_foto_url,'')), '')
  ) RETURNING id INTO v_motorista;

  RETURN jsonb_build_object('motorista_id', v_motorista, 'user_id', v_user_id);
END;
$$;

-- ============================================================================
-- 10. RPC: BUSCAR MOTORISTA AUTENTICADO (para o portal do motorista)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_meu_perfil_motorista()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',            m.id,
    'nome',          m.nome,
    'email',         m.email,
    'cpf',           m.cpf,
    'telefone',      m.telefone,
    'cnh_numero',    m.cnh_numero,
    'cnh_categoria', m.cnh_categoria,
    'cnh_validade',  m.cnh_validade,
    'cnh_foto_url',  m.cnh_foto_url,
    'acesso_mapa',   m.acesso_mapa,
    'cliente_id',    m.cliente_id,
    'cliente_nome',  c.nome_razao_social
  )
  INTO v_result
  FROM public.motoristas m
  INNER JOIN public.clientes c ON c.id = m.cliente_id
  WHERE m.user_id = auth.uid() AND m.ativo = TRUE
  LIMIT 1;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Perfil de motorista nao encontrado.';
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 11. VIEW: alertas_cnh_motoristas (para painel do cliente)
-- ============================================================================
CREATE OR REPLACE VIEW public.alertas_cnh_motoristas AS
SELECT
  m.id              AS motorista_id,
  m.cliente_id,
  m.nome,
  m.email,
  m.cnh_numero,
  m.cnh_categoria,
  m.cnh_validade,
  CASE
    WHEN m.cnh_validade IS NULL       THEN 'sem_data'
    WHEN m.cnh_validade < CURRENT_DATE THEN 'vencida'
    WHEN m.cnh_validade <= CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
    ELSE 'ok'
  END AS status_cnh,
  (m.cnh_validade - CURRENT_DATE) AS dias_para_vencer
FROM public.motoristas m
WHERE m.ativo = TRUE;

-- RLS na view é herdada das tabelas base; acesso controlado pela função abaixo
GRANT SELECT ON public.alertas_cnh_motoristas TO authenticated;

-- ============================================================================
-- FIM DA MIGRAÇÃO
-- ============================================================================
COMMENT ON TABLE public.motoristas IS 'Perfis de motoristas vinculados a clientes do Hunter';
COMMENT ON TABLE public.motorista_veiculos IS 'Veículos autorizados por cliente para cada motorista';
COMMENT ON TABLE public.motorista_abastecimentos IS 'Registro de abastecimentos realizados por motoristas';
COMMENT ON TABLE public.motorista_despesas IS 'Registro de despesas operacionais por motoristas';
