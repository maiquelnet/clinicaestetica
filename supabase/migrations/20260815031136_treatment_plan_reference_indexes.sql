create index if not exists planos_tratamento_profissional_idx
  on public.planos_tratamento (profissional_id)
  where profissional_id is not null;

create index if not exists planos_tratamento_servico_idx
  on public.planos_tratamento (servico_id)
  where servico_id is not null;
