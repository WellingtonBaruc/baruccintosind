CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sync-historico-diario')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-historico-diario'
);

SELECT cron.schedule(
  'sync-historico-diario',
  '0 5 * * *',
  $$
    SELECT net.http_post(
      url := 'https://xaxfrqgqocqrosbbnjeh.supabase.co/functions/v1/sync-historico',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhheGZycWdxb2Nxcm9zYmJuamVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTk5ODksImV4cCI6MjA4OTU5NTk4OX0.6art8IDgWuxdeSzbwaXAOyNcYi8zJ2up9FkfRs2wUEE'
      ),
      body := '{"tipo":"HISTORICO_DIARIO","dias":2}'::jsonb
    );
  $$
);