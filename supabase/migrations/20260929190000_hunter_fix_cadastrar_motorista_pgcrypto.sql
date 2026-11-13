-- ============================================================================
-- HUNTER — FIX: CADASTRAR MOTORISTA — pgcrypto + ENUM hunter_role
-- ============================================================================
-- Root Cause: A função cadastrar_motorista usa crypt() e gen_salt() sem
--   qualificar o schema 'extensions.', causando erro
--   "function gen_salt(unknown, integer) does not exist".
--   Adicionalmente, o ENUM hunter_role não continha o valor 'motorista',
--   causando falha no INSERT INTO public.profiles com role = 'motorista'.
-- Fix:
--   1. ALTER TYPE hunter_role ADD VALUE IF NOT EXISTS 'motorista'
--   2. Recriar cadastrar_motorista com extensions.crypt / extensions.gen_salt
--      e search_path = public, extensions, auth, pg_temp
-- ============================================================================

-- ── 1. Adicionar 'motorista' ao ENUM hunter_role ─────────────────────────────
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'motorista';

-- ── 2. Recriar a função com schema correto para pgcrypto ─────────────────────
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
-- CRÍTICO: 'extensions' deve vir antes de 'public' para que crypt/gen_salt
--          do pgcrypto sejam encontrados sem qualificação de schema.
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_user_id     UUID;
  v_motorista   UUID;
  v_enc_pw      TEXT;
BEGIN
  -- 1. Verificar que o chamador é o dono do cliente ou é adm/superadm
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: cliente nao autorizado.';
  END IF;

  -- 2. Validações básicas
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do motorista e obrigatorio.';
  END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'E-mail do motorista e obrigatorio.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'Senha deve ter no minimo 6 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(trim(p_email))) THEN
    RAISE EXCEPTION 'Ja existe um usuario com este e-mail.';
  END IF;

  -- 3. Criar usuário no auth com senha criptografada via pgcrypto (schema extensions)
  v_user_id := gen_random_uuid();
  v_enc_pw  := extensions.crypt(p_senha, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    LOWER(trim(p_email)), v_enc_pw, NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('nome', p_nome),
    NOW(), NOW()
  );

  -- 4. Criar identity para login por e-mail
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id, LOWER(trim(p_email)),
    jsonb_build_object('sub', v_user_id::TEXT, 'email', LOWER(trim(p_email))),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT DO NOTHING;

  -- 5. Criar profile com role motorista (agora ENUM contém 'motorista')
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (
    v_user_id,
    trim(p_nome),
    LOWER(trim(p_email)),
    'motorista'::public.hunter_role,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
    SET role = 'motorista'::public.hunter_role,
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        ativo = TRUE;

  -- 6. Criar registro do motorista
  INSERT INTO public.motoristas (
    cliente_id, user_id, nome, email, cpf, telefone, data_nascimento,
    cnh_numero, cnh_categoria, cnh_validade, cnh_primeira_habilitacao,
    cnh_renach, cnh_observacoes, cnh_foto_url, acesso_mapa, ativo
  ) VALUES (
    p_cliente_id,
    v_user_id,
    trim(p_nome),
    LOWER(trim(p_email)),
    NULLIF(trim(COALESCE(p_cpf, '')), ''),
    NULLIF(trim(COALESCE(p_telefone, '')), ''),
    p_data_nascimento,
    NULLIF(trim(COALESCE(p_cnh_numero, '')), ''),
    NULLIF(trim(COALESCE(p_cnh_categoria, '')), ''),
    p_cnh_validade,
    p_cnh_primeira,
    NULLIF(trim(COALESCE(p_cnh_renach, '')), ''),
    NULLIF(trim(COALESCE(p_cnh_observacoes, '')), ''),
    NULLIF(trim(COALESCE(p_cnh_foto_url, '')), ''),
    FALSE,  -- acesso_mapa desativado por padrão
    TRUE    -- ativo
  ) RETURNING id INTO v_motorista;

  RETURN jsonb_build_object(
    'motorista_id', v_motorista,
    'user_id',      v_user_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-MOTORISTA] Erro ao cadastrar motorista: %', SQLERRM;
END;
$$;

-- Permissão de execução para usuários autenticados (cliente cadastra seu próprio motorista)
GRANT EXECUTE ON FUNCTION public.cadastrar_motorista(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.cadastrar_motorista IS
  'v1.11.0.7 — FIX: Usa extensions.crypt/extensions.gen_salt para compatibilidade '
  'com Supabase. ENUM hunter_role agora inclui ''motorista''. '
  'Cria auth.user + auth.identity + profile + motorista atomicamente. '
  'SECURITY DEFINER. search_path = extensions, public, auth, pg_temp.';
