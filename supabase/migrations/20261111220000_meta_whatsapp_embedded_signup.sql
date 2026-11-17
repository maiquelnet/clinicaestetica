-- Finalização server-side do Embedded Signup e armazenamento seguro do token
-- trocado. Depende de 20261019153000_meta_clinic_integrations_and_reconciliation.sql.
-- Não aplicar remotamente sem revisar a migration anterior e os Secrets Meta.

alter table private.meta_whatsapp_integrations
  add column if not exists display_phone_number text,
  add column if not exists coexistence_enabled boolean not null default false,
  add column if not exists onboarding_event text,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists access_token_expires_at timestamptz;

create or replace function private.upsert_meta_vault_secret(
  p_name text,
  p_value text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Nome do secret Meta não informado.';
  end if;
  if nullif(trim(coalesce(p_value, '')), '') is null then
    raise exception 'Valor do secret Meta não informado.';
  end if;

  select id
    into v_id
    from vault.secrets
   where name = p_name
   limit 1;

  if v_id is null then
    perform vault.create_secret(p_value, p_name, p_description);
  else
    perform vault.update_secret(v_id, p_value, p_name, p_description);
  end if;
end;
$$;

revoke all on function private.upsert_meta_vault_secret(text, text, text) from public, anon, authenticated, service_role;

create or replace function public.upsert_meta_whatsapp_integration(
  p_clinic_id uuid,
  p_app_id text,
  p_waba_id text,
  p_phone_number_id text,
  p_display_phone_number text,
  p_access_token text,
  p_app_secret text,
  p_verify_token text,
  p_coexistence_enabled boolean default true,
  p_onboarding_event text default null,
  p_access_token_expires_at timestamptz default null
)
returns table (
  clinic_id uuid,
  app_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  coexistence_enabled boolean,
  onboarding_completed_at timestamptz,
  access_token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_name text := format('meta:%s:access_token', p_clinic_id);
  v_app_name text := format('meta:%s:app_secret', p_clinic_id);
  v_verify_name text := format('meta:%s:verify_token', p_clinic_id);
  v_completed_at timestamptz := now();
begin
  if p_clinic_id is null then raise exception 'Clínica não informada.'; end if;
  if nullif(trim(coalesce(p_app_id, '')), '') is null then raise exception 'App ID Meta não informado.'; end if;
  if nullif(trim(coalesce(p_waba_id, '')), '') is null then raise exception 'WABA ID não informado.'; end if;
  if nullif(trim(coalesce(p_phone_number_id, '')), '') is null then raise exception 'Phone Number ID não informado.'; end if;

  -- Os valores passam diretamente ao Vault; não são gravados em tabela própria.
  perform private.upsert_meta_vault_secret(v_access_name, p_access_token, 'Token Meta trocado pelo Embedded Signup.');
  perform private.upsert_meta_vault_secret(v_app_name, p_app_secret, 'App Secret Meta usado na assinatura do webhook.');
  perform private.upsert_meta_vault_secret(v_verify_name, p_verify_token, 'Token de verificação do webhook Meta.');

  insert into private.meta_whatsapp_integrations (
    clinic_id,
    app_id,
    waba_id,
    phone_number_id,
    display_phone_number,
    access_token_secret_name,
    app_secret_secret_name,
    verify_token_secret_name,
    coexistence_enabled,
    onboarding_event,
    onboarding_completed_at,
    access_token_expires_at,
    active,
    updated_at
  ) values (
    p_clinic_id,
    trim(p_app_id),
    trim(p_waba_id),
    trim(p_phone_number_id),
    nullif(trim(coalesce(p_display_phone_number, '')), ''),
    v_access_name,
    v_app_name,
    v_verify_name,
    coalesce(p_coexistence_enabled, true),
    nullif(trim(coalesce(p_onboarding_event, '')), ''),
    v_completed_at,
    p_access_token_expires_at,
    true,
    v_completed_at
  )
  on conflict (clinic_id) do update set
    app_id = excluded.app_id,
    waba_id = excluded.waba_id,
    phone_number_id = excluded.phone_number_id,
    display_phone_number = excluded.display_phone_number,
    access_token_secret_name = excluded.access_token_secret_name,
    app_secret_secret_name = excluded.app_secret_secret_name,
    verify_token_secret_name = excluded.verify_token_secret_name,
    coexistence_enabled = excluded.coexistence_enabled,
    onboarding_event = excluded.onboarding_event,
    onboarding_completed_at = excluded.onboarding_completed_at,
    access_token_expires_at = excluded.access_token_expires_at,
    active = true,
    updated_at = excluded.updated_at
  returning
    private.meta_whatsapp_integrations.clinic_id,
    private.meta_whatsapp_integrations.app_id,
    private.meta_whatsapp_integrations.waba_id,
    private.meta_whatsapp_integrations.phone_number_id,
    private.meta_whatsapp_integrations.display_phone_number,
    private.meta_whatsapp_integrations.coexistence_enabled,
    private.meta_whatsapp_integrations.onboarding_completed_at,
    private.meta_whatsapp_integrations.access_token_expires_at;
end;
$$;

revoke all on function public.upsert_meta_whatsapp_integration(uuid, text, text, text, text, text, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_meta_whatsapp_integration(uuid, text, text, text, text, text, text, text, boolean, text, timestamptz) to service_role;

create or replace function public.get_meta_whatsapp_onboarding_status(p_clinic_id uuid)
returns table (
  clinic_id uuid,
  app_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  coexistence_enabled boolean,
  onboarding_event text,
  onboarding_completed_at timestamptz,
  access_token_expires_at timestamptz,
  active boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    integration.clinic_id,
    integration.app_id,
    integration.waba_id,
    integration.phone_number_id,
    integration.display_phone_number,
    integration.coexistence_enabled,
    integration.onboarding_event,
    integration.onboarding_completed_at,
    integration.access_token_expires_at,
    integration.active
  from private.meta_whatsapp_integrations as integration
  where integration.clinic_id = p_clinic_id;
$$;

revoke all on function public.get_meta_whatsapp_onboarding_status(uuid) from public, anon, authenticated;
grant execute on function public.get_meta_whatsapp_onboarding_status(uuid) to service_role;

