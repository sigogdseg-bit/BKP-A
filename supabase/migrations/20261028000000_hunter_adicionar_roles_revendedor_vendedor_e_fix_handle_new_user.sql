-- Hunter — Adicionar roles 'revendedor' e 'vendedor' ao enum hunter_role e Blindagem de handle_new_user
-- Migration: 20261028000000_hunter_adicionar_roles_revendedor_vendedor_e_fix_handle_new_user.sql

-- 1. ADICIONAR NOVOS VALORES AO ENUM hunter_role (fora de bloco transacional DO)
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'revendedor';
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'vendedor';

-- 2. BLINDAGEM RESILIENTE DO TRIGGER HANDLE_NEW_USER CONTRA ERROS DE CAST DE ENUM
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_role_str TEXT;
  v_role public.hunter_role;
  v_nome TEXT;
BEGIN
  IF LOWER(NEW.email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN
    v_role := 'superadmin'::public.hunter_role;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', 'SuperADM');
  ELSE
    v_role_str := COALESCE(NEW.raw_user_meta_data->>'role', 'cliente');
    -- Conversão segura e resiliente para o enum hunter_role
    BEGIN
      v_role := v_role_str::public.hunter_role;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'cliente'::public.hunter_role;
    END;
    v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));
  END IF;

  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (NEW.id, v_nome, LOWER(NEW.email), v_role, TRUE)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = CASE 
        WHEN LOWER(EXCLUDED.email) IN ('novaes@adm.28bpm.local', 'novaes@oficial.tec.br') THEN 'superadmin'::public.hunter_role 
        ELSE EXCLUDED.role 
      END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- GoTrue auth.identities
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = NEW.id::text)
       OR user_id = NEW.id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        NEW.id::text, NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'email', LOWER(NEW.email)),
        'email', NEW.id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSE
    BEGIN
      UPDATE auth.identities
      SET identity_data = jsonb_build_object('sub', NEW.id::text, 'email', LOWER(NEW.email)),
          updated_at = now()
      WHERE user_id = NEW.id AND provider = 'email';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Grants de Data API e recarregamento de schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
