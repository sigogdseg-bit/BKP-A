-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20261020183000_hunter_fix_login_motoristas_auth_users_e_alertas_ciclo_geofence.sql
-- Sistema: SIGO Guardião | Diretrizes: HUNTER-GUARDIAN e DJR-NEW
-- Descrição:
-- 1. FIX LOGIN MOTORISTAS & OUTRAS TABELAS (Erro "Database error querying schema"):
--    - Saneamento atômico de todas as contas em auth.users com colunas de token NULL
--    - Trigger global BEFORE INSERT OR UPDATE ON auth.users para garantir string vazia ''
--    - Recriação canônica de public.cadastrar_motorista() com suporte a GoTrue v2
--    - Recriação canônica de public.aceitar_convite_instalador() com colunas completas
-- 2. ALTERAÇÃO NA LÓGICA DE ALERTAS:
--    - Alerta de Deslocamento Fora do Horário: estritamente 1 alerta por ciclo de ignição
--      (chave ligou -> deslocou -> 1 alerta -> paradas no trânsito/semáforo NÃO repetem).
--      Chave desligou (ignicao_status = false) reseta o ciclo para o próximo deslocamento.
--    - Alerta de Saída e Entrada em Área Monitorada (Cerca Virtual / Geofence):
--      Local X monitorado: saiu -> avisa 1 única vez -> trava em 'fora'.
--      Não repete enquanto estiver fora. Só volta a alertar saída quando retornar ao local X
--      e posteriormente sair dele novamente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1: SANEAMENTO E BLINDAGEM DE AUTH.USERS (GOTRUE SCHEMA SCAN FIX)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1.1 Saneamento defensivo de contas já existentes em auth.users (quando permitido pelo provedor)
DO $$
BEGIN
  UPDATE auth.users 
  SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
  WHERE 
    confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL
    OR email_change_token_current IS NULL
    OR phone_change IS NULL
    OR phone_change_token IS NULL
    OR reauthentication_token IS NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 1.2 Trigger defensivo em auth.users para garantir consistência de tokens (quando permitido pelo provedor)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION auth.trg_sanitizar_auth_users_nulls()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    NEW.confirmation_token := COALESCE(NEW.confirmation_token, '');
    NEW.recovery_token := COALESCE(NEW.recovery_token, '');
    NEW.email_change_token_new := COALESCE(NEW.email_change_token_new, '');
    NEW.email_change := COALESCE(NEW.email_change, '');
    NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
    NEW.phone_change := COALESCE(NEW.phone_change, '');
    NEW.phone_change_token := COALESCE(NEW.phone_change_token, '');
    NEW.reauthentication_token := COALESCE(NEW.reauthentication_token, '');

    IF NEW.raw_app_meta_data IS NULL THEN
      NEW.raw_app_meta_data := '{"provider":"email","providers":["email"]}'::jsonb;
    END IF;

    IF NEW.aud IS NULL OR trim(NEW.aud) = '' THEN
      NEW.aud := 'authenticated';
    END IF;

    IF NEW.role IS NULL OR trim(NEW.role) = '' THEN
      NEW.role := 'authenticated';
    END IF;

    RETURN NEW;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS trg_auth_users_sanitizar_nulls ON auth.users;
  CREATE TRIGGER trg_auth_users_sanitizar_nulls
    BEFORE INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION auth.trg_sanitizar_auth_users_nulls();
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 1.3 Recriar a função canônica public.cadastrar_motorista com padrão estrito GoTrue
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
SET search_path = extensions, public, auth, pg_temp
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_user_id     UUID;
  v_motorista   UUID;
  v_enc_pw      TEXT;
  v_email_limpo TEXT;
  v_nome_limpo  TEXT;
BEGIN
  v_email_limpo := LOWER(TRIM(p_email));
  v_nome_limpo  := TRIM(p_nome);

  -- 1. Verificar autorização do chamador (dono do cliente ou adm/superadm)
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND user_id = v_caller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('superadmin','adm')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: cliente nao autorizado.';
  END IF;

  -- 2. Validações básicas
  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Nome do motorista e obrigatorio.';
  END IF;
  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'E-mail do motorista e obrigatorio.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'Senha deve ter no minimo 6 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Ja existe um usuario com este e-mail.';
  END IF;

  -- 3. Criar usuário no auth com senha criptografada via pgcrypto e todas as colunas do GoTrue preenchidas
  v_user_id := gen_random_uuid();
  v_enc_pw  := extensions.crypt(p_senha, extensions.gen_salt('bf', 10));

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email_limpo,
    v_enc_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', v_nome_limpo, 'role', 'motorista', 'cliente_id', p_cliente_id),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- 4. Criar identity canônica para login por e-mail no GoTrue
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_user_id::text)
       OR user_id = v_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email',
        v_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 5. Criar profile com role motorista
  INSERT INTO public.profiles (
    id, nome, email, role, ativo, primeiro_acesso, cliente_id, telefone
  ) VALUES (
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
    'motorista'::public.hunter_role,
    true,
    false,
    p_cliente_id,
    p_telefone
  )
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      role = 'motorista'::public.hunter_role,
      ativo = true,
      cliente_id = EXCLUDED.cliente_id,
      telefone = EXCLUDED.telefone;

  -- 6. Criar vínculo em user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'motorista'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 7. Criar registro do motorista
  INSERT INTO public.motoristas (
    cliente_id, user_id, nome, email, cpf, telefone, data_nascimento,
    cnh_numero, cnh_categoria, cnh_validade, cnh_primeira_habilitacao,
    cnh_renach, cnh_observacoes, cnh_foto_url, acesso_mapa, ativo
  ) VALUES (
    p_cliente_id,
    v_user_id,
    v_nome_limpo,
    v_email_limpo,
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
    false,
    true
  ) RETURNING id INTO v_motorista;

  RETURN jsonb_build_object(
    'motorista_id', v_motorista,
    'user_id',      v_user_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '[HUNTER-MOTORISTA] Erro ao cadastrar motorista: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cadastrar_motorista(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, DATE, DATE, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- 1.4 Sanear também aceitar_convite_instalador
CREATE OR REPLACE FUNCTION public.aceitar_convite_instalador(
  p_token TEXT,
  p_nome TEXT,
  p_email TEXT,
  p_senha TEXT,
  p_telefone TEXT DEFAULT NULL,
  p_chave_pix TEXT DEFAULT NULL,
  p_endereco_instalacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_convite RECORD;
  v_user_id UUID;
  v_encrypted_pw TEXT;
  v_nome_limpo TEXT;
  v_email_limpo TEXT;
BEGIN
  IF p_token IS NULL OR TRIM(p_token) = '' THEN
    RAISE EXCEPTION 'Token de convite invalido.';
  END IF;

  SELECT * INTO v_convite 
  FROM public.convites_instalador 
  WHERE token = p_token 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link de convite nao encontrado.';
  END IF;

  IF v_convite.usado THEN
    RAISE EXCEPTION 'Este link de convite ja foi utilizado. Solicite um novo link a administracao.';
  END IF;

  IF v_convite.expira_em <= NOW() THEN
    RAISE EXCEPTION 'Este link de convite expirou.';
  END IF;

  v_nome_limpo := TRIM(p_nome);
  v_email_limpo := LOWER(TRIM(p_email));

  IF v_nome_limpo IS NULL OR v_nome_limpo = '' THEN
    RAISE EXCEPTION 'Nome completo e obrigatorio.';
  END IF;

  IF v_email_limpo IS NULL OR v_email_limpo = '' THEN
    RAISE EXCEPTION 'E-mail e obrigatorio.';
  END IF;

  IF p_senha IS NULL OR LENGTH(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha deve conter no minimo 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_email_limpo) THEN
    RAISE EXCEPTION 'Este e-mail ja esta cadastrado no sistema.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_senha, extensions.gen_salt('bf', 10));
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email_limpo,
    v_encrypted_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nome', v_nome_limpo,
      'role', 'instalador',
      'telefone', p_telefone,
      'convite_token', p_token
    ),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities 
    WHERE (provider = 'email' AND provider_id = v_user_id::text)
       OR user_id = v_user_id
  ) THEN
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id::text,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email_limpo),
        'email',
        v_user_id::text,
        now(), now(), now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.profiles (
    id, nome, email, role, ativo,
    telefone, chave_pix, endereco_instalacao,
    primeiro_acesso
  ) VALUES (
    v_user_id, v_nome_limpo, v_email_limpo, 'instalador'::public.hunter_role, TRUE,
    p_telefone, p_chave_pix, p_endereco_instalacao,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    role = 'instalador'::public.hunter_role,
    ativo = TRUE,
    telefone = EXCLUDED.telefone,
    chave_pix = EXCLUDED.chave_pix,
    endereco_instalacao = EXCLUDED.endereco_instalacao;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'instalador'::public.hunter_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.convites_instalador
  SET usado = TRUE,
      usado_em = NOW(),
      instalador_id = v_user_id
  WHERE id = v_convite.id;

  RETURN jsonb_build_object(
    'sucesso', TRUE,
    'user_id', v_user_id,
    'mensagem', 'Conta de instalador ativada com sucesso.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aceitar_convite_instalador(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2: ATUALIZAÇÃO DA FUNÇÃO ATÔMICA TRIGGER_AVALIAR_ALERTAS_TELEMETRIA
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_avaliar_alertas_telemetria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cliente_user_id   UUID;
  v_velocidade_limite INT := 110;
  v_alerta_mov_regras BOOLEAN := true;
  v_alerta_ign_regras BOOLEAN := true;
  v_alertas_ativos    JSONB;
  v_dist_metros       FLOAT := 0;
  v_dlat              FLOAT;
  v_dlon              FLOAT;
  v_a                 FLOAT;
  v_cooldown_ok       BOOLEAN := false;
  v_horario_proibido  BOOLEAN := false;
  v_hora_inicio_str   TEXT;
  v_hora_fim_str      TEXT;
  v_hora_evento_str   TEXT;
  
  -- Variáveis de geofence / áreas seguras
  v_area              RECORD;
  v_dlat_area         FLOAT;
  v_dlon_area         FLOAT;
  v_dist_area_new     FLOAT;
  v_agora_brt         TIMESTAMP;
  v_hora_atual        TIME;
  v_dow_atual         INT;
  v_area_fora_horario BOOLEAN;
  v_estado_anterior   TEXT;
  v_tolerancia        FLOAT;
  v_raio_saida        FLOAT;
  v_raio_entrada      FLOAT;
  
  -- Variáveis de payload do alerta
  v_titulo            TEXT;
  v_mensagem          TEXT;
  v_tipo              TEXT;
  v_gravidade         TEXT;
  
  COOLDOWN_PADRAO     INTERVAL := INTERVAL '5 minutes';
BEGIN
  -- Data/hora canônica oficial no fuso horário de Brasília (UTC-3)
  v_agora_brt := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hora_atual := v_agora_brt::TIME;
  v_dow_atual := EXTRACT(DOW FROM v_agora_brt)::INT;
  v_hora_evento_str := to_char(v_agora_brt, 'DD/MM/YYYY às HH24:MI:SS');

  -- ─────────────────────────────────────────────────────────────────────────
  -- RESET DO CICLO DE IGNIÇÃO / DESLOCAMENTO NA CHAVE DESLIGADA
  -- Regra Pétrea Hunter: 1 alerta em cada deslocamento (ciclo = ligou a chave e desligou).
  -- Quando a ignição estiver desligada (ignicao_status = false), o ciclo é finalizado,
  -- permitindo que a próxima ligada com deslocamento fora do horário gere 1 novo alerta.
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false THEN
    DELETE FROM public.alertas_telemetria_cooldown
    WHERE veiculo_id = NEW.id
      AND tipo_alerta IN ('movimento_fora_horario', 'ignicao_fora_horario');
  END IF;

  -- 1. Busca user_id do cliente titular
  SELECT user_id INTO v_cliente_user_id
  FROM public.clientes
  WHERE id = NEW.cliente_id
  LIMIT 1;

  -- 2. Busca parâmetros de regras e preferências ativas do veículo
  SELECT 
    COALESCE(limite_velocidade_geral, 110),
    COALESCE(alerta_movimento_nao_autorizado, true),
    COALESCE(alerta_ignicao_fora_horario, true),
    alertas_ativos
  INTO 
    v_velocidade_limite,
    v_alerta_mov_regras,
    v_alerta_ign_regras,
    v_alertas_ativos
  FROM public.regras_veiculo
  WHERE veiculo_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    v_velocidade_limite := 110;
    v_alerta_mov_regras := true;
    v_alerta_ign_regras := true;
    v_alertas_ativos := '{"movimento_fora_horario":true,"ignicao_fora_horario":true,"ignicao_ligada":true,"saida_area":true,"entrada_area":true,"excesso_velocidade":true,"perda_comunicacao":true,"baixa_tensao":true,"desvio_rota":true,"guincho":true}'::jsonb;
  END IF;

  -- 3. Cálculo geodésico de deslocamento Haversine em metros entre OLD e NEW
  IF OLD.ultima_latitude IS NOT NULL 
     AND OLD.ultima_longitude IS NOT NULL 
     AND NEW.ultima_latitude IS NOT NULL 
     AND NEW.ultima_longitude IS NOT NULL
     AND (OLD.ultima_latitude <> 0 OR OLD.ultima_longitude <> 0)
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0)
     AND (OLD.ultima_latitude <> NEW.ultima_latitude OR OLD.ultima_longitude <> NEW.ultima_longitude) THEN
    
    v_dlat := radians(NEW.ultima_latitude - OLD.ultima_latitude);
    v_dlon := radians(NEW.ultima_longitude - OLD.ultima_longitude);
    v_a := sin(v_dlat / 2.0)^2 + cos(radians(OLD.ultima_latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon / 2.0)^2;
    v_dist_metros := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));
  ELSE
    v_dist_metros := 0;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA A: EXCESSO DE VELOCIDADE
  -- ─────────────────────────────────────────────────────────────────────────
  IF COALESCE(NEW.velocidade_atual, 0) > 0 
     AND COALESCE((v_alertas_ativos->>'excesso_velocidade')::BOOLEAN, true) = true THEN

    IF NEW.velocidade_atual > v_velocidade_limite THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'excesso_velocidade'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        v_titulo   := format('⚠️ Excesso de Velocidade — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s atingiu %s km/h (limite configurado: %s km/h) em %s.',
          COALESCE(NEW.placa, ''),
          ROUND(NEW.velocidade_atual),
          v_velocidade_limite,
          v_hora_evento_str
        );
        v_tipo      := 'excesso_velocidade';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA B: IGNIÇÃO LIGADA FORA DO HORÁRIO (TRANSIÇÃO OFF -> ON)
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true 
     AND COALESCE(OLD.ignicao_status, false) = false
     AND v_alerta_ign_regras = true
     AND COALESCE((v_alertas_ativos->>'ignicao_fora_horario')::BOOLEAN, true) = true THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'ignicao_fora_horario'
            AND ultimo_at > (now() - COOLDOWN_PADRAO)
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Ignição Acionada Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Motor do veículo %s acionado fora do horário permitido (%s às %s) em %s.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str
        );
        v_tipo      := 'ignicao_fora_horario';
        v_gravidade := 'alta';

        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA D: DESLOCAMENTO FORA DO HORÁRIO (ESTRITAMENTE 1x POR CICLO DE CHAVE)
  -- Regra Pétrea Hunter: 1 alerta em cada deslocamento (ciclo = ligou a chave e desligou).
  -- Somente receberá outro alerta se ligar novamente e se deslocar.
  -- Proibido alertar novamente quando parar no semáforo/trânsito e voltar a andar!
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = true 
     AND (COALESCE(NEW.velocidade_atual, 0) >= 3 OR v_dist_metros >= 15.0)
     AND v_alerta_mov_regras = true
     AND COALESCE((v_alertas_ativos->>'movimento_fora_horario')::BOOLEAN, true) = true THEN

    IF v_horario_proibido OR public.hunter_horario_proibido(NEW.id) THEN
      -- Checa se já existe alerta gravado para este ciclo ativo de ignição ligada
      -- SEM limite temporal de 5 minutos: enquanto ignicao_status = true, trava absolutamente
      SELECT (
        NOT EXISTS (
          SELECT 1 FROM public.alertas_telemetria_cooldown
          WHERE veiculo_id = NEW.id
            AND tipo_alerta = 'movimento_fora_horario'
        )
      ) INTO v_cooldown_ok;

      IF v_cooldown_ok THEN
        SELECT hora_inicio::TEXT, hora_fim::TEXT
        INTO v_hora_inicio_str, v_hora_fim_str
        FROM public.horarios_utilizacao
        WHERE veiculo_id = NEW.id AND ativo = true
        LIMIT 1;

        v_titulo   := format('🚨 Deslocamento Fora do Horário — %s', COALESCE(NEW.placa, ''));
        v_mensagem := format(
          'Veículo %s em movimento fora do horário permitido (%s às %s) em %s. Velocidade: %s km/h.',
          COALESCE(NEW.placa, ''),
          COALESCE(v_hora_inicio_str, ''), COALESCE(v_hora_fim_str, ''),
          v_hora_evento_str,
          ROUND(NEW.velocidade_atual)
        );
        v_tipo      := 'movimento_fora_horario';
        v_gravidade := 'critica';

        -- Trava para todo o ciclo de ignição atual
        INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
        VALUES (NEW.id, v_tipo, now())
        ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

        INSERT INTO public.alertas_seguranca (
          veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
          velocidade, detalhes, reconhecido, created_at
        ) VALUES (
          NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
          COALESCE(NEW.ultima_latitude, 0),
          COALESCE(NEW.ultima_longitude, 0),
          COALESCE(NEW.velocidade_atual::INT, 0),
          v_mensagem, false, now()
        );

        INSERT INTO public.notificacoes_sistema (
          destinatario_user_id, destinatario_cliente_id,
          titulo, mensagem, tipo, url, placa, lida, created_at
        ) VALUES (
          v_cliente_user_id, NEW.cliente_id,
          v_titulo, v_mensagem, v_tipo, '/monitor-gps',
          COALESCE(NEW.placa, ''), false, now()
        );
      END IF;
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA E: GUINCHO / ARRASTO COM MOTOR DESLIGADO
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ignicao_status = false
     AND COALESCE(OLD.ignicao_status, false) = false
     AND (
       COALESCE(NEW.velocidade_atual, 0) >= 15
       OR (COALESCE(NEW.velocidade_atual, 0) >= 10 AND v_dist_metros >= 35.0)
     )
     AND COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true THEN

    SELECT (
      NOT EXISTS (
        SELECT 1 FROM public.alertas_telemetria_cooldown
        WHERE veiculo_id = NEW.id
          AND tipo_alerta = 'guincho'
          AND ultimo_at > (now() - COOLDOWN_PADRAO)
      )
    ) INTO v_cooldown_ok;

    IF v_cooldown_ok THEN
      v_titulo   := format('🚨 Veículo em Movimento com Motor Desligado — %s', COALESCE(NEW.placa, ''));
      v_mensagem := format(
        'Veículo %s detectado a %s km/h com ignição desligada em %s. Possível reboque ou furto em andamento.',
        COALESCE(NEW.placa, ''),
        ROUND(NEW.velocidade_atual),
        v_hora_evento_str
      );
      v_tipo      := 'guincho';
      v_gravidade := 'critica';

      INSERT INTO public.alertas_telemetria_cooldown(veiculo_id, tipo_alerta, ultimo_at)
      VALUES (NEW.id, v_tipo, now())
      ON CONFLICT (veiculo_id, tipo_alerta) DO UPDATE SET ultimo_at = now();

      INSERT INTO public.alertas_seguranca (
        veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
        velocidade, detalhes, reconhecido, created_at
      ) VALUES (
        NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
        COALESCE(NEW.ultima_latitude, 0),
        COALESCE(NEW.ultima_longitude, 0),
        COALESCE(NEW.velocidade_atual::INT, 0),
        v_mensagem, false, now()
      );

      INSERT INTO public.notificacoes_sistema (
        destinatario_user_id, destinatario_cliente_id,
        titulo, mensagem, tipo, url, placa, lida, created_at
      ) VALUES (
        v_cliente_user_id, NEW.cliente_id,
        v_titulo, v_mensagem, v_tipo, '/monitor-gps',
        COALESCE(NEW.placa, ''), false, now()
      );
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALERTA F: GEOFENCE COM MÁQUINA DE ESTADOS FÍSICA (ZERO REPETIÇÃO)
  -- Regra Pétrea Hunter: "Saiu avisa (uma única vez). Entrou avisa (uma única vez)."
  -- Local X tem monitoramento de saída: saiu, recebe msg imediatamente, 1 única vez,
  -- até que esteja novamente no local X e saia novamente do local.
  -- ─────────────────────────────────────────────────────────────────────────
  IF NEW.ultima_latitude IS NOT NULL 
     AND NEW.ultima_longitude IS NOT NULL 
     AND (NEW.ultima_latitude <> 0 OR NEW.ultima_longitude <> 0) THEN

    FOR v_area IN
      SELECT id, nome, latitude, longitude, raio_metros, 
             COALESCE(tolerancia_metros, 30) AS tolerancia_metros,
             COALESCE(regra_entrada, 'permitida') AS regra_entrada,
             COALESCE(regra_saida, 'permitida') AS regra_saida,
             hora_inicio, hora_fim, dias_semana
      FROM public.areas_seguras
      WHERE (veiculo_id = NEW.id OR (veiculo_id IS NULL AND cliente_id = NEW.cliente_id))
        AND ativo = true
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND raio_metros > 0
    LOOP
      -- Distância geodésica do veículo até o centro da área protegida
      v_dlat_area := radians(NEW.ultima_latitude - v_area.latitude);
      v_dlon_area := radians(NEW.ultima_longitude - v_area.longitude);
      v_a := sin(v_dlat_area / 2.0)^2 + cos(radians(v_area.latitude)) * cos(radians(NEW.ultima_latitude)) * sin(v_dlon_area / 2.0)^2;
      v_dist_area_new := 6371000.0 * 2.0 * atan2(sqrt(v_a), sqrt(GREATEST(0.0, 1.0 - v_a)));

      -- Histerese anti-oscilação com tolerância
      v_tolerancia := GREATEST(COALESCE(v_area.tolerancia_metros, 30.0), 20.0);
      v_raio_saida := v_area.raio_metros + v_tolerancia;
      v_raio_entrada := v_area.raio_metros;

      -- Determina se o momento atual está fora da janela habitual da área
      v_area_fora_horario := false;
      IF v_area.hora_inicio IS NOT NULL AND v_area.hora_fim IS NOT NULL THEN
        IF v_area.dias_semana IS NOT NULL AND NOT (v_dow_atual = ANY(v_area.dias_semana)) THEN
          v_area_fora_horario := true;
        ELSIF v_area.hora_inicio <= v_area.hora_fim THEN
          IF v_hora_atual < v_area.hora_inicio OR v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        ELSE
          IF v_hora_atual < v_area.hora_inicio AND v_hora_atual > v_area.hora_fim THEN
            v_area_fora_horario := true;
          END IF;
        END IF;
      END IF;

      -- Consulta estado persistente na máquina de estados
      SELECT estado INTO v_estado_anterior
      FROM public.veiculo_areas_estado
      WHERE veiculo_id = NEW.id AND area_id = v_area.id;

      -- Se não existir registro prévio, inicializa de forma neutra sem disparo
      IF v_estado_anterior IS NULL THEN
        IF v_dist_area_new <= v_raio_entrada THEN
          v_estado_anterior := 'dentro';
        ELSE
          v_estado_anterior := 'fora';
        END IF;

        INSERT INTO public.veiculo_areas_estado (
          veiculo_id, area_id, estado, distancia_metros, updated_at
        ) VALUES (
          NEW.id, v_area.id, v_estado_anterior, v_dist_area_new, now()
        ) ON CONFLICT (veiculo_id, area_id) DO NOTHING;
      END IF;

      -- ───────────────────────────────────────────────────────────────────────
      -- F.1) TRANSIÇÃO PARA SAÍDA: DE 'dentro' PARA 'fora'
      -- Só ocorre se estava 'dentro' e passou do raio_saida (raio + histerese).
      -- Transita para 'fora' e NUNCA MAIS repete saída enquanto permanecer fora!
      -- ───────────────────────────────────────────────────────────────────────
      IF v_estado_anterior = 'dentro' AND v_dist_area_new > v_raio_saida THEN
        UPDATE public.veiculo_areas_estado
        SET estado = 'fora',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'saida_area',
            ultimo_evento_em = now(),
            notificacao_enviada = true,
            whatsapp_enviado = false,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        -- Avalia se deve emitir o alerta único de saída
        IF COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_saida = 'alertar'
             OR (v_area.regra_saida = 'fora_horario' AND v_area_fora_horario)
           ) THEN

          v_titulo := format('🚨 Saída de Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_saida = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s saiu da área protegida "%s" FORA do horário habitual em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s saiu da área monitorada "%s" em %s (distância: %s m).',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str,
              ROUND(v_dist_area_new)
            );
            v_gravidade := 'media';
          END IF;

          v_tipo := 'saida_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      -- ───────────────────────────────────────────────────────────────────────
      -- F.2) TRANSIÇÃO PARA ENTRADA: DE 'fora' PARA 'dentro'
      -- Só ocorre se estava 'fora' e entrou na área (distância <= raio_entrada).
      -- Transita para 'dentro' e NUNCA MAIS repete entrada enquanto permanecer dentro!
      -- ───────────────────────────────────────────────────────────────────────
      ELSIF v_estado_anterior = 'fora' AND v_dist_area_new <= v_raio_entrada THEN
        UPDATE public.veiculo_areas_estado
        SET estado = 'dentro',
            distancia_metros = v_dist_area_new,
            ultimo_evento_tipo = 'entrada_area',
            ultimo_evento_em = now(),
            notificacao_enviada = true,
            whatsapp_enviado = false,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;

        -- Avalia se deve emitir o alerta único de entrada
        IF COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true
           AND (
             v_area.regra_entrada = 'alertar'
             OR (v_area.regra_entrada = 'fora_horario' AND v_area_fora_horario)
           ) THEN

          v_titulo := format('✅ Chegada em Área Protegida — %s', COALESCE(NEW.placa, ''));
          IF v_area.regra_entrada = 'fora_horario' THEN
            v_mensagem := format(
              'Veículo %s entrou na área protegida "%s" FORA do horário habitual em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'alta';
          ELSE
            v_mensagem := format(
              'Veículo %s entrou na área monitorada "%s" em %s.',
              COALESCE(NEW.placa, ''),
              v_area.nome,
              v_hora_evento_str
            );
            v_gravidade := 'baixa';
          END IF;

          v_tipo := 'entrada_area';

          INSERT INTO public.alertas_seguranca (
            veiculo_id, cliente_id, tipo, gravidade, latitude, longitude,
            velocidade, detalhes, reconhecido, created_at
          ) VALUES (
            NEW.id, NEW.cliente_id, v_tipo, v_gravidade,
            COALESCE(NEW.ultima_latitude, 0),
            COALESCE(NEW.ultima_longitude, 0),
            COALESCE(NEW.velocidade_atual::INT, 0),
            v_mensagem, false, now()
          );

          INSERT INTO public.notificacoes_sistema (
            destinatario_user_id, destinatario_cliente_id,
            titulo, mensagem, tipo, url, placa, lida, created_at
          ) VALUES (
            v_cliente_user_id, NEW.cliente_id,
            v_titulo, v_mensagem, v_tipo, '/monitor-gps',
            COALESCE(NEW.placa, ''), false, now()
          );
        END IF;

      ELSE
        -- Mantém a distância atualizada na máquina de estados sem disparar novo alerta
        UPDATE public.veiculo_areas_estado
        SET distancia_metros = v_dist_area_new,
            updated_at = now()
        WHERE veiculo_id = NEW.id AND area_id = v_area.id;
      END IF;

    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_avaliar_alertas_telemetria falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Invalidação canônica do cache PostgREST
NOTIFY pgrst, 'reload schema';
