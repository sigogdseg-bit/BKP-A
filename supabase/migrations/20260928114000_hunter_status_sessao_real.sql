-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Rastreamento Canônico e Determinístico de Sessão Ativa vs Logout
-- Migration: 20260928114000_hunter_status_sessao_real.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sessao_ativa BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ultimo_logout TIMESTAMPTZ;

-- Índices para otimização de consultas de segurança e presença
CREATE INDEX IF NOT EXISTS idx_profiles_sessao_ativa ON public.profiles(sessao_ativa);
CREATE INDEX IF NOT EXISTS idx_profiles_ultimo_logout ON public.profiles(ultimo_logout);
CREATE INDEX IF NOT EXISTS idx_system_login_logs_user_status ON public.system_login_logs(user_id, status, created_at DESC);
