create index clientes_servicos_interesse_cliente_clinica_idx
  on public.clientes_servicos_interesse (cliente_id, clinica_id);

create index clientes_servicos_interesse_servico_clinica_idx
  on public.clientes_servicos_interesse (servico_id, clinica_id);

create index campanhas_servicos_alvo_campanha_clinica_idx
  on public.campanhas_servicos_alvo (campanha_id, clinica_id);

create index campanhas_servicos_alvo_servico_clinica_idx
  on public.campanhas_servicos_alvo (servico_id, clinica_id);
