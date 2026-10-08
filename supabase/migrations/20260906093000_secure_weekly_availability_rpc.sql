create index if not exists disponibilidade_semanal_profissional_fk_idx
  on public.disponibilidade_semanal (profissional_id);

create or replace function private.salvar_disponibilidade_semanal_impl(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_periodos jsonb
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

  if p_periodos is null or jsonb_typeof(p_periodos) <> 'array' then
    raise exception 'A disponibilidade precisa ser uma lista de períodos.';
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
    raise exception 'Você só pode administrar a sua própria disponibilidade.';
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

  perform pg_advisory_xact_lock(hashtextextended(p_clinica_id::text || ':' || p_profissional_id::text, 0));

  if exists (
    with periodos as (
      select
        (item->>'dia_semana')::smallint as dia_semana,
        (item->>'inicio')::time as inicio,
        (item->>'fim')::time as fim
      from jsonb_array_elements(p_periodos) item
    )
    select 1 from periodos where dia_semana not between 0 and 6 or fim <= inicio
  ) then
    raise exception 'Existe um período inválido na disponibilidade.';
  end if;

  if exists (
    with periodos as (
      select
        ordinality,
        (item->>'dia_semana')::smallint as dia_semana,
        (item->>'inicio')::time as inicio,
        (item->>'fim')::time as fim
      from jsonb_array_elements(p_periodos) with ordinality
    )
    select 1
    from periodos a
    join periodos b
      on a.dia_semana = b.dia_semana
     and a.ordinality < b.ordinality
     and a.inicio < b.fim
     and b.inicio < a.fim
  ) then
    raise exception 'Existem períodos sobrepostos na disponibilidade.';
  end if;

  delete from public.disponibilidade_semanal
  where clinica_id = p_clinica_id
    and profissional_id = p_profissional_id;

  insert into public.disponibilidade_semanal (clinica_id, profissional_id, dia_semana, inicio, fim)
  select
    p_clinica_id,
    p_profissional_id,
    (item->>'dia_semana')::smallint,
    (item->>'inicio')::time,
    (item->>'fim')::time
  from jsonb_array_elements(p_periodos) item;
end;
$$;

revoke all on function private.salvar_disponibilidade_semanal_impl(uuid, uuid, jsonb) from public, anon;
grant execute on function private.salvar_disponibilidade_semanal_impl(uuid, uuid, jsonb) to authenticated;

create or replace function public.salvar_disponibilidade_semanal(
  p_clinica_id uuid,
  p_profissional_id uuid,
  p_periodos jsonb
)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.salvar_disponibilidade_semanal_impl(p_clinica_id, p_profissional_id, p_periodos);
$$;

revoke all on function public.salvar_disponibilidade_semanal(uuid, uuid, jsonb) from public, anon;
grant execute on function public.salvar_disponibilidade_semanal(uuid, uuid, jsonb) to authenticated;
