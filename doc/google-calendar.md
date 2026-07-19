# Google Calendar bidirecional

A agenda do Supabase e a agenda principal do administrador são sincronizadas pela Edge Function
`google-calendar-sync`.

## Comportamento

- Agendamentos criados, editados ou cancelados no sistema são enviados ao Google.
- Eventos comuns criados diretamente no Google aparecem no sistema como bloqueios de horário.
- Alterações e exclusões no Google voltam ao registro local.
- Eventos criados pelo sistema carregam `appointmentId` em `extendedProperties.private`, evitando duplicidade.
- O webhook usa sincronização incremental por `syncToken`; canais próximos da expiração são renovados.

## Publicação

1. Aplique a migration `20260718180000_google_calendar_bidirectional_sync.sql`.
2. Habilite a Google Calendar API em um projeto Google Cloud.
3. Crie credenciais OAuth do tipo Aplicativo da Web.
4. Cadastre como redirect URI o valor exato de `GOOGLE_FUNCTION_URL`.
5. Configure os secrets da Edge Function:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
GOOGLE_SYNC_CRON_SECRET
GOOGLE_FUNCTION_URL=https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
SITE_URL=https://URL-DA-APLICACAO
```

6. Publique sem verificação JWT na borda, pois callback OAuth e webhook do Google são públicos; a própria
função valida o `state`, token do canal e, nas ações administrativas, o JWT e o papel do usuário.

```bash
supabase functions deploy google-calendar-sync --no-verify-jwt
```

7. No painel, acesse Configurações e clique em **Conectar Google Agenda**.

Nunca use a service role, segredo OAuth ou chave de criptografia no frontend.

## Reconciliação

O frontend solicita uma sincronização após criar, alterar ou cancelar agendamentos. Para cobrir alterações
feitas por integrações externas enquanto nenhum administrador está usando o painel, configure também um
agendamento periódico da função no Supabase (recomendado: a cada cinco minutos) enviando:

```json
{ "action": "sync", "clinicId": "UUID_DA_CLINICA" }
```

Para a reconciliação periódica, envie `{ "action": "sync-all" }` com o header `X-Cron-Secret` igual ao
secret `GOOGLE_SYNC_CRON_SECRET`. O webhook continua sendo o caminho principal para mudanças originadas
no Google.
