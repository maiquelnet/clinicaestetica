alter table public.clientes
  alter column aceita_marketing set default false,
  add column if not exists whatsapp_opt_in_status text not null default 'pendente',
  add column if not exists whatsapp_opt_in_em timestamptz,
  add column if not exists whatsapp_opt_in_origem text,
  add column if not exists whatsapp_opt_in_versao text,
  add column if not exists whatsapp_opt_out_em timestamptz;

alter table public.clientes
  drop constraint if exists clientes_whatsapp_opt_in_status_check;

alter table public.clientes
  add constraint clientes_whatsapp_opt_in_status_check
  check (whatsapp_opt_in_status in ('pendente', 'aceito', 'recusado', 'revogado'));
