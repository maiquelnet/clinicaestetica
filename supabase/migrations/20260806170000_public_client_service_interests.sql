alter table public.clientes
  add column if not exists servicos_interesse uuid[] not null default '{}';

comment on column public.clientes.servicos_interesse is 'IDs dos serviços que o cliente informou ter interesse no cadastro público.';

create index if not exists clientes_servicos_interesse_gin_idx
  on public.clientes using gin (servicos_interesse);

create or replace function public.list_public_signup_services(p_clinica_id uuid)
returns table (id uuid, nome text, categoria text, descricao text)
language sql
security definer
set search_path = public
stable
as $$
  select servicos.id, servicos.nome, servicos.categoria, servicos.descricao
  from public.servicos
  where servicos.clinica_id = p_clinica_id
    and servicos.ativo = true
    and servicos.arquivado_em is null
  order by servicos.categoria nulls last, servicos.nome;
$$;

revoke all on function public.list_public_signup_services(uuid) from public;
grant execute on function public.list_public_signup_services(uuid) to anon, authenticated;
