alter table public.bloqueios_agenda
  add column if not exists tipo text not null default 'outro',
  add column if not exists dia_inteiro boolean not null default false,
  add column if not exists serie_id uuid,
  add column if not exists recorrencia jsonb,
  add column if not exists ocorrencia_numero integer;

create index if not exists bloqueios_agenda_serie_inicio_idx
  on public.bloqueios_agenda (clinica_id, serie_id, inicio_em)
  where serie_id is not null;
