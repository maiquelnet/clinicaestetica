-- Expõe ao worker apenas o estado do cron; nenhum valor de secret é retornado.
create or replace function public.get_whatsapp_worker_status()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with job as (
    select active
      from cron.job
     where jobname = 'process-whatsapp-messages'
     order by jobid desc
     limit 1
  ),
  last_run as (
    select status, start_time
      from cron.job_run_details
     where jobid = (select jobid from cron.job where jobname = 'process-whatsapp-messages' order by jobid desc limit 1)
     order by start_time desc
     limit 1
  )
  select jsonb_build_object(
    'cronActive', coalesce((select active from job), false),
    'vaultConfigured', (
      select count(*) = 2
        from vault.secrets
       where name in ('whatsapp_function_url', 'whatsapp_cron_secret')
    ),
    'lastRunStatus', (select status from last_run),
    'lastRunAt', (select start_time from last_run)
  );
$$;

revoke all on function public.get_whatsapp_worker_status() from public, anon, authenticated;
grant execute on function public.get_whatsapp_worker_status() to service_role;
