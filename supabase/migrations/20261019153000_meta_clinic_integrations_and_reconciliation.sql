-- Configuração Meta por clínica. Tokens e app secrets ficam no Vault; esta
-- tabela contém apenas IDs e nomes dos segredos. Não aplicar remotamente sem
-- revisar/autorizar a etapa de implantação.

create schema if not exists private;

create table if not exists private.meta_whatsapp_integrations (
  clinic_id uuid primary key references public.clinicas(id) on delete cascade,
  app_id text not null,
  waba_id text not null,
  phone_number_id text not null unique,
  access_token_secret_name text not null,
  app_secret_secret_name text not null,
  verify_token_secret_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_whatsapp_integration_app_id_not_empty check (length(trim(app_id)) > 0),
  constraint meta_whatsapp_integration_waba_id_not_empty check (length(trim(waba_id)) > 0),
  constraint meta_whatsapp_integration_phone_id_not_empty check (length(trim(phone_number_id)) > 0)
);

alter table private.meta_whatsapp_integrations enable row level security;
revoke all on table private.meta_whatsapp_integrations from public, anon, authenticated;
grant select, insert, update, delete on table private.meta_whatsapp_integrations to service_role;

create or replace function public.get_meta_whatsapp_integrations()
returns table (
  clinic_id uuid,
  app_id text,
  waba_id text,
  phone_number_id text,
  app_secret text,
  verify_token text,
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
    app_secret.decrypted_secret,
    verify_secret.decrypted_secret,
    integration.active
  from private.meta_whatsapp_integrations as integration
  left join vault.decrypted_secrets as app_secret
    on app_secret.name = integration.app_secret_secret_name
  left join vault.decrypted_secrets as verify_secret
    on verify_secret.name = integration.verify_token_secret_name
  where integration.active = true;
$$;

revoke all on function public.get_meta_whatsapp_integrations() from public, anon, authenticated;
grant execute on function public.get_meta_whatsapp_integrations() to service_role;
comment on function public.get_meta_whatsapp_integrations() is
  'Retorna IDs Meta e segredos de assinatura/verificação do Vault exclusivamente a Edge Functions autenticadas como service_role.';

create or replace function public.get_meta_whatsapp_outbound_integrations()
returns table (
  clinic_id uuid,
  app_id text,
  waba_id text,
  phone_number_id text,
  access_token text,
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
    access_secret.decrypted_secret,
    integration.active
  from private.meta_whatsapp_integrations as integration
  left join vault.decrypted_secrets as access_secret
    on access_secret.name = integration.access_token_secret_name
  where integration.active = true;
$$;

revoke all on function public.get_meta_whatsapp_outbound_integrations() from public, anon, authenticated;
grant execute on function public.get_meta_whatsapp_outbound_integrations() to service_role;
comment on function public.get_meta_whatsapp_outbound_integrations() is
  'Retorna tokens Meta do Vault somente para Edge Functions de saída com service_role; não retorna App Secret nem token de verificação.';

alter table public.fila_mensagens
  drop constraint if exists fila_mensagens_status_check;

alter table public.fila_mensagens
  add constraint fila_mensagens_status_check
  check (status in ('pendente', 'processando', 'enviado', 'erro', 'cancelado', 'reconciliacao'));

comment on column public.fila_mensagens.status is
  'reconciliacao indica que a Meta pode ter aceitado a mensagem; o item é terminal e não deve ser reenviado automaticamente.';
