-- ============================================================================
-- HUNTER — SINCRONIZAÇÃO AUTOMÁTICA DE SESSÃO ATIVA E LOGOUT NO PERFIL
-- ============================================================================
-- Migration: 20260929130000_hunter_sync_sessao_ativa_trigger.sql
-- Objetivo: Garantir que profiles.sessao_ativa, ultimo_login e ultimo_logout
-- estejam sempre sincronizados com os eventos de login/logout em tempo real,
-- prevenindo que usuários logados e offline apareçam indevidamente como deslogados.
-- ============================================================================

-- 1. Função Trigger para atualizar profiles automaticamente a partir de system_login_logs
CREATE OR REPLACE FUNCTION public.sincronizar_sessao_perfil_ao_logar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.status = 'sucesso' THEN
    UPDATE public.profiles
    SET
      sessao_ativa = true,
      ultimo_login = COALESCE(NEW.created_at, now())
    WHERE id = NEW.user_id OR (NEW.user_id IS NULL AND LOWER(email) = LOWER(trim(NEW.email)));
  ELSIF NEW.status = 'logout' THEN
    UPDATE public.profiles
    SET
      sessao_ativa = false,
      ultimo_logout = COALESCE(NEW.created_at, now())
    WHERE id = NEW.user_id OR (NEW.user_id IS NULL AND LOWER(email) = LOWER(trim(NEW.email)));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Resiliente: falha no trigger de sincronização de perfil não deve impedir o registro do log
  RAISE WARNING '[SESSAO-SYNC] Erro ao sincronizar perfil a partir de login_logs: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 2. Criação do Trigger AFTER INSERT em system_login_logs
DROP TRIGGER IF EXISTS trg_sync_profile_sessao ON public.system_login_logs;
CREATE TRIGGER trg_sync_profile_sessao
AFTER INSERT ON public.system_login_logs
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_sessao_perfil_ao_logar();

-- 3. Reconciliação imediata do estado atual de todos os perfis com base no histórico real
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      p.id,
      p.email,
      (SELECT MAX(created_at) FROM public.system_login_logs l WHERE (l.user_id = p.id OR LOWER(l.email) = LOWER(p.email)) AND l.status = 'sucesso') AS ult_login,
      (SELECT MAX(created_at) FROM public.system_login_logs lo WHERE (lo.user_id = p.id OR LOWER(lo.email) = LOWER(p.email)) AND lo.status = 'logout') AS ult_logout
    FROM public.profiles p
  LOOP
    IF r.ult_login IS NOT NULL THEN
      IF r.ult_logout IS NULL OR r.ult_login > r.ult_logout THEN
        -- Tem login posterior ao logout -> Sessão ativa mantida (Standby / Offline)
        UPDATE public.profiles
        SET
          sessao_ativa = true,
          ultimo_login = COALESCE(ultimo_login, r.ult_login),
          ultimo_logout = r.ult_logout
        WHERE id = r.id;
      ELSE
        -- Tem logout igual ou posterior ao login -> Deslogado
        UPDATE public.profiles
        SET
          sessao_ativa = false,
          ultimo_login = COALESCE(ultimo_login, r.ult_login),
          ultimo_logout = r.ult_logout
        WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;
END $$;
