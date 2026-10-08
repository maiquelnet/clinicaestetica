create table if not exists public.disponibilidade_excecoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  profissional_id uuid not null references public.perfis(id) on delete cascade,
  data date not null,
  nao_atende boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint disponibilidade_excecoes_clinica_profissional_data_unique unique (clinica_id, profissional_id, data)
);

create table if not exists public.disponibilidade_excecao_periodos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  excecao_id uuid not null references public.disponibilidade_excecoes(id) on delete cascade,
  inicio time not null,
  fim time not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint disponibilidade_excecao_periodos_periodo_check check (fim > inicio)
);

create index if not exists disponibilidade_excecoes_profissional_data_idx
  on public.disponibilidade_excecoes (clinica_id, profissional_id, data);

create index if not exists disponibilidade_excecoes_profissional_fk_idx
  on public.disponibilidade_excecoes (profissional_id);

create index if not exists disponibilidade_excecao_periodos_excecao_idx
  on public.disponibilidade_excecao_periodos (excecao_id, inicio);

create index if not exists disponibilidade_excecao_periodos_clinica_idx
  on public.disponibilidade_excecao_periodos (clinica_id);

alter table public.disponibilidade_excecoes enable row level security;
alter table public.disponibilidade_excecao_periodos enable row level security;

revoke all on table public.disponibilidade_excecoes, public.disponibilidade_excecao_periodos from anon, authenticated;
grant select on table public.disponibilidade_excecoes, public.disponibilidade_excecao_periodos to authenticated;

drop policy if exists disponibilidade_excecoes_clinica_select on public.disponibilidade_excecoes;
create policy disponibilidade_excecoes_clinica_select
  on public.disponibilidade_excecoes
  for select to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

drop policy if exists disponibilidade_excecao_periodos_clinica_select on public.disponibilidade_excecao_periodos;
create policy disponibilidade_excecao_periodos_clinica_select
  on public.disponibilidade_excecao_periodos
  for select to authenticated
  using (private.usuario_tem_acesso_clinica(clinica_id));

create or replace function private.salvar_disponibilidade_excecao_impl(
  p_excecao_id uuid,
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data date,
  p_nao_atende boolean,
  p_observacao text,
  p_periodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_papel text;
  v_excecao_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória.';
  end if;

  if p_data is null then
    raise exception 'Informe a data da exceção.';
  end if;

  if p_periodos is null or jsonb_typeof(p_periodos) <> 'array' then
    raise exception 'Os períodos da exceção precisam ser uma lista.';
  end if;

  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clínica informada.';
  end if;

  select uc.papel
    into v_papel
  from public.usuarios_clinicas uc
  where uc.clinica_id = p_clinica_id
    and uc.perfil_id = auth.uid()
    and uc.ativo = true;

  if p_profissional_id <> auth.uid()
     and coalesce(v_papel, '') not in ('proprietario', 'administrador') then
    raise exception 'Você só pode administrar as suas próprias exceções.';
  end if;

  if not exists (
    select 1
    from public.usuarios_clinicas uc
    where uc.clinica_id = p_clinica_id
      and uc.perfil_id = p_profissional_id
      and uc.ativo = true
  ) then
    raise exception 'O profissional não pertence a esta clínica.';
  end if;

  if p_nao_atende and jsonb_array_length(p_periodos) > 0 then
    raise exception 'Uma exceção de dia inteiro não pode possuir períodos.';
  end if;

  if not p_nao_atende and jsonb_array_length(p_periodos) = 0 then
    raise exception 'Informe ao menos um período ou marque que não atenderá neste dia.';
  end if;

  if exists (
    with periodos as (
      select
        (item->>'inicio')::time as inicio,
        (item->>'fim')::time as fim
      from jsonb_array_elements(p_periodos) item
    )
    select 1 from periodos where fim <= inicio
  ) then
    raise exception 'Existe um período inválido na exceção.';
  end if;

  if exists (
    with periodos as (
      select
        ordinality,
        (item->>'inicio')::time as inicio,
        (item->>'fim')::time as fim
      from jsonb_array_elements(p_periodos) with ordinality
    )
    select 1
    from periodos a
    join periodos b
      on a.ordinality < b.ordinality
     and a.inicio < b.fim
     and b.inicio < a.fim
  ) then
    raise exception 'Existem períodos sobrepostos na exceção.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text || ':' || p_profissional_id::text || ':' || p_data::text, 0));

  if p_excecao_id is null then
    insert into public.disponibilidade_excecoes (clinica_id, profissional_id, data, nao_atende, observacao)
    values (p_clinica_id, p_profissional_id, p_data, p_nao_atende, nullif(trim(p_observacao), ''))
    returning id into v_excecao_id;
  else
    update public.disponibilidade_excecoes
       set clinica_id = p_clinica_id,
           profissional_id = p_profissional_id,
           data = p_data,
           nao_atende = p_nao_atende,
           observacao = nullif(trim(p_observacao), ''),
           atualizado_em = now()
     where id = p_excecao_id
       and clinica_id = p_clinica_id
       and profissional_id = p_profissional_id
    returning id into v_excecao_id;

    if v_excecao_id is null then
      raise exception 'Exceção não encontrada para este profissional.';
    end if;

    delete from public.disponibilidade_excecao_periodos
    where excecao_id = v_excecao_id;
  end if;

  insert into public.disponibilidade_excecao_periodos (clinica_id, excecao_id, inicio, fim)
  select p_clinica_id, v_excecao_id, (item->>'inicio')::time, (item->>'fim')::time
  from jsonb_array_elements(p_periodos) item;

  return v_excecao_id;
end;
$$;

create or replace function public.salvar_disponibilidade_excecao(
  p_excecao_id uuid,
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_data date,
  p_nao_atende boolean,
  p_observacao text,
  p_periodos jsonb
)
returns uuid
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.salvar_disponibilidade_excecao_impl(p_excecao_id, p_clinica_id, p_profissional_id, p_data, p_nao_atende, p_observacao, p_periodos);
$$;

create or replace function private.excluir_disponibilidade_excecao_impl(
  p_excecao_id uuid,
  p_clinica_id uuid,
  p_profissional_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_papel text;
begin
  if auth.uid() is null then
    raise exception 'Sessão obrigatória.';
  end if;

  if not private.usuario_tem_acesso_clinica(p_clinica_id) then
    raise exception 'Acesso negado para a clínica informada.';
  end if;

  select uc.papel
    into v_papel
  from public.usuarios_clinicas uc
  where uc.clinica_id = p_clinica_id
    and uc.perfil_id = auth.uid()
    and uc.ativo = true;

  if p_profissional_id <> auth.uid()
     and coalesce(v_papel, '') not in ('proprietario', 'administrador') then
    raise exception 'Você só pode administrar as suas próprias exceções.';
  end if;

  delete from public.disponibilidade_excecoes
  where id = p_excecao_id
    and clinica_id = p_clinica_id
    and profissional_id = p_profissional_id;

  if not found then
    raise exception 'Exceção não encontrada para este profissional.';
  end if;
end;
$$;

create or replace function public.excluir_disponibilidade_excecao(
  p_excecao_id uuid,
  p_clinica_id uuid,
  p_profissional_id uuid
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.excluir_disponibilidade_excecao_impl(p_excecao_id, p_clinica_id, p_profissional_id);
$$;

revoke all on function private.salvar_disponibilidade_excecao_impl(uuid, uuid, uuid, date, boolean, text, jsonb) from public, anon;
revoke all on function private.excluir_disponibilidade_excecao_impl(uuid, uuid, uuid) from public, anon;
grant execute on function private.salvar_disponibilidade_excecao_impl(uuid, uuid, uuid, date, boolean, text, jsonb) to authenticated;
grant execute on function private.excluir_disponibilidade_excecao_impl(uuid, uuid, uuid) to authenticated;

revoke all on function public.salvar_disponibilidade_excecao(uuid, uuid, uuid, date, boolean, text, jsonb) from public, anon;
grant execute on function public.salvar_disponibilidade_excecao(uuid, uuid, uuid, date, boolean, text, jsonb) to authenticated;
revoke all on function public.excluir_disponibilidade_excecao(uuid, uuid, uuid) from public, anon;
grant execute on function public.excluir_disponibilidade_excecao(uuid, uuid, uuid) to authenticated;
