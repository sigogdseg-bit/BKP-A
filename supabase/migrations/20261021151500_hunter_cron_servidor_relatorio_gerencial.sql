-- Migration: Agendador Autônomo de Servidor para o Relatório Gerencial Diário (SuperADM)
-- Garantia de disparo 24/7 originado no servidor (Supabase pg_cron + pg_net)

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 1. Função canônica do servidor para disparar o endpoint do relatório via pg_net
CREATE OR REPLACE FUNCTION public.cron_disparar_relatorio_gerencial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://sigoguardiao.oficial.tec.br/api/relatorios/metricas-diarias/enviar?token=hunter-cron-jammer-2026',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"origem": "pg_cron_supabase"}'::jsonb,
    timeout_milliseconds := 20000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[CRON-RELATORIO] Falha ao disparar relatório via pg_net: %', SQLERRM;
END;
$$;

-- 2. Permissões explícitas para a função
GRANT EXECUTE ON FUNCTION public.cron_disparar_relatorio_gerencial() TO authenticated, service_role;

-- 3. Agendamento diário pontual às 13:00 UTC (10:00 Horário de Brasília)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('hunter-relatorio-gerencial-10h')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hunter-relatorio-gerencial-10h');
      
      PERFORM cron.schedule(
        'hunter-relatorio-gerencial-10h',
        '0 13 * * *',
        'SELECT public.cron_disparar_relatorio_gerencial();'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[PG_CRON] Agendamento manual recomendado se permissão restrita: %', SQLERRM;
    END;
  END IF;
END;
$$;

-- 4. Notifica invalidação do schema cache PostgREST
NOTIFY pgrst, 'reload schema';
