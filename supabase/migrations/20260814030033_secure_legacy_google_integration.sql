-- Bloqueia a tabela legada na Data API. A integração ativa usa
-- public.google_calendar_connections e não depende desta tabela.
alter table public.integracoes_google enable row level security;

revoke all privileges on table public.integracoes_google from public;
revoke all privileges on table public.integracoes_google from anon;
revoke all privileges on table public.integracoes_google from authenticated;
