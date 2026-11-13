-- ==============================================================================
-- HUNTER — MIGRATION: DEV-MODULOS SEG SUITE (1, 2, 3, 4, 6, 7, 9, 12, 13, 16, 19)
-- Central de Segurança Cibernética, Governança, Anti-Abuso, Lockouts e LGPD
-- ==============================================================================

-- 1. TABELA DE BLOQUEIOS DE LOGIN (MÓDULO 04: LOCKOUT ESCALONADO)
CREATE TABLE IF NOT EXISTS public.login_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE, -- IP ou E-mail
  tipo TEXT NOT NULL DEFAULT 'ip', -- 'ip', 'conta'
  falhas_acumuladas INT NOT NULL DEFAULT 1,
  bloqueado_ate TIMESTAMPTZ NOT NULL,
  motivo TEXT NOT NULL DEFAULT 'Excesso de tentativas incorretas de autenticação',
  desbloqueado_em TIMESTAMPTZ,
  desbloqueado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_lockouts_chave ON public.login_lockouts(chave);
CREATE INDEX IF NOT EXISTS idx_login_lockouts_bloqueado_ate ON public.login_lockouts(bloqueado_ate);

ALTER TABLE public.login_lockouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas administradores gerenciam bloqueios de login" ON public.login_lockouts;
CREATE POLICY "Apenas administradores gerenciam bloqueios de login"
  ON public.login_lockouts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  );

-- 2. TABELA DE HONEYTOKENS E DECEPTION (MÓDULO 06: DEFESA PROATIVA)
CREATE TABLE IF NOT EXISTS public.honeytokens_deception (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_isca TEXT NOT NULL UNIQUE,
  tipo_isca TEXT NOT NULL DEFAULT 'conta_login', -- 'conta_login', 'tabela_fantasma', 'chave_api'
  identificador TEXT NOT NULL, -- ex: admin.teste@oficial.tec.br, root@adm.local
  tentativas_acesso INT NOT NULL DEFAULT 0,
  ultimo_ip TEXT,
  ultimo_acesso TIMESTAMPTZ,
  acao_defensiva TEXT NOT NULL DEFAULT 'bloquear_ip_48h',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.honeytokens_deception ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas administradores visualizam e gerenciam honeytokens" ON public.honeytokens_deception;
CREATE POLICY "Apenas administradores visualizam e gerenciam honeytokens"
  ON public.honeytokens_deception FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  );

-- Inserção de Honeytokens padrão
INSERT INTO public.honeytokens_deception (nome_isca, tipo_isca, identificador, acao_defensiva)
VALUES
  ('Conta Isca de Auditoria', 'conta_login', 'admin.auditoria@oficial.tec.br', 'bloquear_ip_48h'),
  ('Conta Isca Root Legacy', 'conta_login', 'root@adm.local', 'bloquear_ip_48h'),
  ('Tabela Fantasma Credenciais', 'tabela_fantasma', 'tbl_usuarios_senhas_antigas', 'bloquear_ip_48h')
ON CONFLICT (nome_isca) DO NOTHING;

-- 3. TABELA DE SOLICITAÇÕES LGPD (MÓDULO 13: TITULARES ART. 18)
CREATE TABLE IF NOT EXISTS public.lgpd_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo TEXT NOT NULL UNIQUE,
  titular_nome TEXT NOT NULL,
  titular_documento TEXT NOT NULL,
  titular_email TEXT NOT NULL,
  tipo_solicitacao TEXT NOT NULL DEFAULT 'confirmacao', -- 'acesso', 'retificacao', 'anonimizacao', 'exclusao', 'confirmacao'
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'em_analise', 'atendido', 'rejeitado'
  justificativa TEXT,
  atendido_por TEXT,
  atendido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacoes_protocolo ON public.lgpd_solicitacoes(protocolo);
CREATE INDEX IF NOT EXISTS idx_lgpd_solicitacoes_status ON public.lgpd_solicitacoes(status);

ALTER TABLE public.lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas administradores gerenciam solicitacoes LGPD" ON public.lgpd_solicitacoes;
CREATE POLICY "Apenas administradores gerenciam solicitacoes LGPD"
  ON public.lgpd_solicitacoes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  );

-- 4. TABELA DE GOVERNANÇA DE DADOS DLP (MÓDULO 09: ESTAMPARIA FORENSE)
CREATE TABLE IF NOT EXISTS public.seguranca_dlp_config (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
  watermark_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  blur_perda_foco_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  bloqueio_print_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  texto_marca_dagua TEXT NOT NULL DEFAULT 'SIGO GUARDIÃO • DOCUMENTO CONFIDENCIAL',
  opacidade_watermark NUMERIC NOT NULL DEFAULT 0.08,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE public.seguranca_dlp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas administradores gerenciam config DLP" ON public.seguranca_dlp_config;
CREATE POLICY "Apenas administradores gerenciam config DLP"
  ON public.seguranca_dlp_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role IN ('superadmin', 'adm') OR p.email IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
    )
    OR (LOWER(COALESCE(auth.jwt() ->> 'email', '')) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br'))
  );

-- Registro padrão de configuração DLP singleton
INSERT INTO public.seguranca_dlp_config (id, watermark_ativo, blur_perda_foco_ativo, bloqueio_print_ativo, texto_marca_dagua, opacidade_watermark)
VALUES ('00000000-0000-0000-0000-000000000001'::UUID, TRUE, TRUE, TRUE, 'SIGO GUARDIÃO • DOCUMENTO CONFIDENCIAL', 0.08)
ON CONFLICT (id) DO NOTHING;

-- 5. Habilitar Realtime nas tabelas de segurança
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.login_lockouts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.honeytokens_deception;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lgpd_solicitacoes;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 6. Invalidação obrigatória de cache PostgREST
NOTIFY pgrst, 'reload schema';
