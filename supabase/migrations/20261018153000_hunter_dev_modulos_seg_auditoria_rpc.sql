-- ==============================================================================
-- HUNTER — MIGRATION: DEV-MODULOS SEG - RPC AUDITORIA_SEGURANCA AO VIVO
-- Inspeciona dinamicamente pg_class, pg_policies, pg_proc, storage e contagens reais
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.auditoria_seguranca()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tabelas jsonb;
  v_policies jsonb;
  v_funcoes jsonb;
  v_buckets jsonb;
  v_contagens jsonb;
BEGIN
  -- 1. Inspeciona todas as tabelas do schema public e status do RLS
  SELECT jsonb_agg(jsonb_build_object(
    'tabela', c.relname,
    'rls_habilitado', c.relrowsecurity,
    'rls_forcado', c.relforcerowsecurity,
    'total_politicas', (
      SELECT count(*) FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname
    )
  ) ORDER BY c.relname)
    INTO v_tabelas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r';

  -- 2. Inspeciona políticas ativas
  SELECT jsonb_agg(jsonb_build_object(
    'tabela', tablename, 'politica', policyname, 'comando', cmd,
    'permissiva', permissive, 'roles', roles,
    'expressao_usando', qual, 'expressao_verificando', with_check
  ) ORDER BY tablename, policyname)
    INTO v_policies FROM pg_policies WHERE schemaname = 'public';

  -- 3. Inspeciona funções com privilégio SECURITY DEFINER
  SELECT jsonb_agg(jsonb_build_object(
    'funcao', p.proname, 'security_definer', p.prosecdef,
    'linguagem', l.lanname,
    'retorna', pg_catalog.format_type(p.prorettype, NULL),
    'stable_ou_immutable', CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END
  ) ORDER BY p.proname)
    INTO v_funcoes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.prosecdef = true;

  -- 4. Inspeciona buckets de armazenamento
  SELECT jsonb_agg(jsonb_build_object(
    'bucket', id, 'nome', name, 'publico', public, 'criado_em', created_at
  ) ORDER BY name) INTO v_buckets FROM storage.buckets;

  -- 5. Contagens reais da trilha
  v_contagens := jsonb_build_object(
    'logins_total', (SELECT count(*) FROM public.system_login_logs),
    'logins_ultimos_30d', (
      SELECT count(*) FROM public.system_login_logs
       WHERE created_at > now() - interval '30 days'
    ),
    'sessoes_abertas_agora', (
      SELECT count(DISTINCT user_id) FROM public.system_login_logs
       WHERE created_at >= now() - interval '3 minutes'
    ),
    'usuarios_multi_sessao_24h', (
      SELECT count(*) FROM (
        SELECT user_id FROM public.system_login_logs
         WHERE created_at > now() - interval '24 hours' AND ip_address IS NOT NULL
         GROUP BY user_id HAVING count(DISTINCT ip_address) > 1
      ) x
    ),
    'atividades_total', (SELECT count(*) FROM public.system_activity_logs),
    'atividades_ultimos_30d', (
      SELECT count(*) FROM public.system_activity_logs
       WHERE created_at > now() - interval '30 days'
    ),
    'dispositivos_autorizados', (
      SELECT count(*) FROM public.dispositivos_autorizados WHERE status = 'autorizado'
    ),
    'dispositivos_pendentes', (
      SELECT count(*) FROM public.dispositivos_autorizados WHERE status = 'pendente'
    ),
    'login_falhas_ultima_hora', (
      SELECT count(*) FROM public.system_login_logs
       WHERE status = 'falha' AND created_at > now() - interval '1 hour'
    ),
    'identificadores_bloqueados_agora', (
      SELECT count(*) FROM public.login_lockouts
       WHERE bloqueado_ate > now()
    ),
    'honeytokens_ativos', (
      SELECT count(*) FROM public.honeytokens_deception WHERE ativo = true
    ),
    'solicitacoes_lgpd_pendentes', (
      SELECT count(*) FROM public.lgpd_solicitacoes WHERE status = 'pendente'
    ),
    'total_admins', (
      SELECT count(*) FROM public.profiles WHERE role IN ('superadmin', 'adm')
    )
  );

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'tabelas', COALESCE(v_tabelas, '[]'::jsonb),
    'politicas', COALESCE(v_policies, '[]'::jsonb),
    'funcoes_security_definer', COALESCE(v_funcoes, '[]'::jsonb),
    'buckets_storage', COALESCE(v_buckets, '[]'::jsonb),
    'contagens', v_contagens
  );
END $function$;

-- Conceder permissão de execução aos usuários autenticados
GRANT EXECUTE ON FUNCTION public.auditoria_seguranca() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auditoria_seguranca() TO service_role;

-- Invalidação compulsória de cache do PostgREST
NOTIFY pgrst, 'reload schema';
