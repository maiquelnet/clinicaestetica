# Google Calendar bidirecional

Atualizado em: 2026-08-11.

A agenda do sistema e o calendário Google autorizado são sincronizados pela Edge Function `google-calendar-sync`.

## Estado implantado

- função remota ativa, versão `32`, `verify_jwt=false`;
- uma conexão ativa em `public.google_calendar_connections`;
- URL: `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync`;
- site de retorno: `https://www.esteticaschneider.com.br`.

## Comportamento

- agendamentos criados, alterados ou cancelados no sistema são enviados ao Google;
- IDs determinísticos evitam duplicidade;
- eventos comuns criados no Google aparecem como bloqueios no sistema;
- alterações/cancelamentos do Google são importados;
- eventos do sistema usam `extendedProperties.private` com `appointmentId` e `clinicId`;
- apenas horário e nome do serviço são enviados, sem nome, telefone, e-mail ou observações do cliente;
- sync incremental usa `syncToken`;
- o canal webhook é renovado próximo da expiração;
- tokens OAuth são criptografados com AES-GCM em `tokens_encrypted`.

## Google Cloud

1. Habilite Google Calendar API.
2. Configure a tela de consentimento OAuth.
3. Crie um OAuth Client do tipo Web application.
4. Cadastre a URI autorizada exata:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
```

Enquanto o app estiver em modo Testing, adicione cada conta Google autorizada em Test users. O erro `403 access_denied` indicando app não verificado normalmente significa que o usuário não está na lista.

## Supabase Edge Secrets

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
GOOGLE_CALENDAR_ID=primary
GOOGLE_SYNC_CRON_SECRET
SITE_URL=https://www.esteticaschneider.com.br
```

Opcionais:

```text
GOOGLE_FUNCTION_URL=https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
CORS_ALLOWED_ORIGINS=https://preview-autorizado.example.com
```

`GOOGLE_CLIENT_ID` não pertence às API Keys do Supabase. Todos esses valores ficam em Edge Functions > Secrets. A publishable key do frontend não substitui credenciais OAuth.

## Por que `verify_jwt=false`

O callback OAuth e o webhook chegam sem JWT Supabase. A função faz autenticação própria:

- valida assinatura/expiração do `state` OAuth;
- valida o canal, token e resource ID do webhook;
- valida JWT e papel de proprietário/administrador nas ações do painel;
- valida `GOOGLE_SYNC_CRON_SECRET` em `sync-all`.

Configuração versionada:

```toml
[functions.google-calendar-sync]
verify_jwt = false
```

## Associação entre usuário e Google

O usuário entra no sistema pelo Supabase Auth. Ao clicar em Conectar Google Agenda:

1. a Edge Function valida o JWT;
2. confirma o vínculo do usuário com a clínica em `usuarios_clinicas`;
3. grava `clinicId` e `userId` no `state` assinado;
4. o Google autentica a conta escolhida pelo usuário;
5. no callback, a função valida novamente o vínculo;
6. os tokens da conta Google são criptografados e associados à `clinica_id` em `google_calendar_connections`.

A relação é pela clínica, não pelo endereço de e-mail do cadastro local. Login e senha Google nunca são armazenados pelo sistema.

## Testes

```bash
deno test supabase/functions/google-calendar-sync/core.test.ts
deno check supabase/functions/google-calendar-sync/index.ts
```

Coberturas implementadas: inicialização, OAuth/conexão, envio idempotente, importação como bloqueio e cancelamentos nos dois sentidos.

Teste manual de produção:

1. status conectado no painel;
2. criar agendamento e confirmar evento Google;
3. editar horário nos dois lados;
4. cancelar nos dois lados;
5. criar evento comum no Google e confirmar bloqueio local;
6. revisar logs da Edge Function e `ultima_sincronizacao_em`.
