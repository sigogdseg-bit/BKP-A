-- ============================================================================
-- HUNTER — AUTOPROVISIONAMENTO DE PROFILES VIA TRIGGER AUTH.USERS
-- ============================================================================
-- Cria automaticamente o registro em public.profiles e public.user_roles
-- quando um novo usuário é cadastrado no Supabase Auth.
-- Blindagem canônica: se o email for 'novaes@adm.28bpm.local', atribui 'superadmin'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.hunter_role;
  v_nome TEXT;
BEGIN
  -- Identifica se é o SuperAdmin mestre
  IF LOWER(NEW.email) = 'novaes@adm.28bpm.local' THEN
    v_role := 'superadmin'::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'SuperAdmin Hunter (Novaes)');
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cliente')::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  END IF;

  -- 1. Cria ou atualiza o perfil em public.profiles
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, LOWER(NEW.email), v_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email;

  -- 2. Vincula a role na tabela user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Registra o trigger após INSERT em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: Se algum usuário já foi criado em auth.users (ex: novaes), popula profiles
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_role public.hunter_role;
  v_nome TEXT;
BEGIN
  FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    IF LOWER(r.email) = 'novaes@adm.28bpm.local' THEN
      v_role := 'superadmin'::public.hunter_role;
      v_nome := COALESCE(r.raw_user_meta_data->>'nome', 'SuperAdmin Hunter (Novaes)');
    ELSE
      v_role := COALESCE(r.raw_user_meta_data->>'role', 'cliente')::public.hunter_role;
      v_nome := COALESCE(r.raw_user_meta_data->>'nome', split_part(r.email, '@', 1));
    END IF;

    INSERT INTO public.profiles (id, nome, email, role, ativo)
    VALUES (r.id, v_nome, LOWER(r.email), v_role, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET role = CASE WHEN LOWER(r.email) = 'novaes@adm.28bpm.local' THEN 'superadmin'::public.hunter_role ELSE public.profiles.role END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;
