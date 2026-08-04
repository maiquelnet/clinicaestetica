# Google Calendar bidirecional

A agenda do Supabase e a agenda principal autorizada no Google são sincronizadas pela Edge Function
`google-calendar-sync`.

## Comportamento

- Agendamentos criados, editados ou cancelados no sistema são enviados ao Google.
- IDs determinísticos evitam eventos duplicados em sincronizações concorrentes.
- Eventos comuns criados diretamente no Google aparecem no sistema como bloqueios de horário.
- Alterações e exclusões no Google voltam ao registro local.
- Eventos criados pelo sistema carregam `appointmentId` e `clinicId` em
  `extendedProperties.private`.
- Para minimizar exposição de dados, os eventos recebem somente horário e nome do serviço; nome,
  telefone, e-mail e observações do cliente não são enviados ao Google.
- O webhook usa sincronização incremental por `syncToken`; canais próximos da expiração são renovados.
- Tokens OAuth são criptografados com AES-GCM. A função mantém compatibilidade de leitura com tokens
  gravados pela versão anterior e os regrava no novo formato após uma renovação.

## Publicação

1. Aplique a migration `20260718180000_google_calendar_bidirectional_sync.sql`.
2. Habilite a Google Calendar API em um projeto Google Cloud.
3. Crie credenciais OAuth do tipo **Aplicativo da Web**.
4. Cadastre como URI de redirecionamento:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
```

5. Em **Supabase → Edge Functions → Secrets**, configure:

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

6. Publique com `verify_jwt=false`. O callback OAuth e o webhook chegam sem JWT; a própria função
valida o `state`, o token e recurso do canal e, nas ações administrativas, o JWT e o papel do usuário.

```bash
supabase functions deploy google-calendar-sync --no-verify-jwt
```

O mesmo comportamento está registrado em `supabase/config.toml`:

```toml
[functions.google-calendar-sync]
verify_jwt = false
```

7. No painel, acesse **Configurações → Google Agenda** e clique em **Conectar Google Agenda**.

Nunca use a service role, o segredo OAuth ou a chave de criptografia no frontend. Credenciais Google
devem ser Edge Function secrets, não API keys do Supabase.

## Reconciliação

O frontend solicita sincronização após criar, alterar ou cancelar agendamentos. Para cobrir mudanças
enquanto nenhum administrador usa o painel, agende uma chamada periódica com:

```json
{ "action": "sync-all" }
```

Envie o header `X-Cron-Secret` com o valor de `GOOGLE_SYNC_CRON_SECRET`. O webhook continua sendo o
caminho principal para alterações originadas no Google.

## Testes

Os testes usam um banco e uma API Google simulados; nenhum token ou evento real é alterado:

```bash
node --test supabase/functions/google-calendar-sync/core.test.ts
```

São cobertos: inicialização sem depender dos secrets Google, OAuth e criação da conexão, envio sem
duplicidade, importação como bloqueio e cancelamentos nos dois sentidos.
