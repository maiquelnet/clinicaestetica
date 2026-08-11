# Segurança e LGPD

Atualizado em: 2026-08-11.

## Dados tratados

O sistema pode armazenar identificação, contato, nascimento, CPF, agenda, procedimentos, observações, anexos, informações financeiras e histórico de comunicações. Dependendo do conteúdo, registros de atendimento estético podem ser dados pessoais sensíveis relacionados à saúde.

Princípios:

- coletar apenas o necessário;
- informar finalidade e base legal;
- separar consentimento de marketing do consentimento de mensagens operacionais;
- limitar acesso por clínica e papel;
- manter trilha de alterações críticas;
- permitir correção, revogação e retenção/exclusão conforme obrigação legal;
- não enviar observações sensíveis a Google, Meta ou outros terceiros sem necessidade.

## Consentimentos

`aceita_marketing` controla comunicação promocional. WhatsApp de agendamento usa campos próprios:

```text
whatsapp_opt_in_status
whatsapp_opt_in_em
whatsapp_opt_in_origem
whatsapp_opt_in_versao
whatsapp_opt_out_em
```

O checkbox deve começar desmarcado. Registre origem, versão do texto e data/hora. Troca de telefone exige novo aceite; um aceite antigo não deve autorizar automaticamente o novo número.

## Modelo de segurança

- Frontend usa apenas publishable key.
- Supabase Auth identifica o usuário.
- `usuarios_clinicas` e RLS limitam o tenant.
- Edge Functions usam secret/service role somente no servidor.
- OAuth Google é associado à clínica e tokens são criptografados.
- WhatsApp automático exige consentimento, regra ativa e template aprovado.
- Arquivos `.env`, `.vercel/`, tokens e secrets são ignorados pelo Git.

## Chaves e segredos

Nunca versionar ou enviar em chat/e-mail:

- `SUPABASE_ACCESS_TOKEN`;
- Supabase secret key ou `SUPABASE_SERVICE_ROLE_KEY`;
- `GOOGLE_CLIENT_SECRET`;
- `GOOGLE_TOKEN_ENCRYPTION_KEY`;
- `GOOGLE_SYNC_CRON_SECRET`;
- `GOOGLE_PLACES_API_KEY`;
- tokens Meta/WhatsApp;
- `WHATSAPP_CRON_SECRET`;
- `VERCEL_TOKEN`.

Publishable key e project ref não são segredos, mas dependem de RLS correto. Variáveis `VITE_*` são públicas no bundle.

## Security Advisor: fotografia de 2026-08-11

### Crítico

`public.integracoes_google` está exposta pelo schema `public` com RLS desabilitado. A tabela estava vazia e a integração atual usa `google_calendar_connections`, mas o risco permanece. A correção precisa decidir entre:

- remover a tabela legada, se não for usada;
- mover para schema não exposto;
- habilitar RLS e criar policies adequadas.

Não habilite RLS isoladamente sem entender consumidores; isso pode bloquear o legado. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

### Avisos

- `salvar_agendamento`, `confirmar_lista_espera`, `salvar_servico_com_preco` e `salvar_campanha_com_destinatarios` aparecem com `search_path` mutável;
- `fila_mensagens` e `google_calendar_connections` têm RLS habilitado sem policies; o acesso atual é backend-only, mas grants devem ser conferidos;
- `list_public_signup_services` é `SECURITY DEFINER` executável por `anon` e `authenticated`; isso só é aceitável se retornar estritamente os serviços públicos previstos;
- proteção contra senhas vazadas está desabilitada;
- existem policies permissivas duplicadas em módulos e FKs sem índices.

## Edge Functions com `verify_jwt=false`

As três funções remotas estão com verificação da plataforma desativada para suportar publishable keys, OAuth/webhooks ou acesso público. Cada handler precisa autenticar seu próprio fluxo:

- Google Calendar: state OAuth, webhook e JWT/papel;
- WhatsApp: JWT/papel ou cron secret;
- Google Reviews: endpoint deliberadamente público, somente leitura de avaliações públicas.

Qualquer nova action deve começar negando acesso e liberar apenas o caso necessário. Não confie apenas em CORS: ele não é mecanismo de autenticação.

## Integrações e minimização

Google Calendar recebe horário e serviço; não recebe telefone/nome/observações do cliente. Tokens ficam criptografados.

WhatsApp recebe telefone, nome e parâmetros de agendamento necessários ao template. Evite incluir procedimento sensível no texto. A Meta passa a ser operadora/terceiro do tratamento conforme contrato/políticas aplicáveis.

Google Places retorna avaliações públicas; a API key fica na Edge Function.

## Auditoria antes de produção

1. Testar usuário sem clínica e cross-clinic.
2. Revisar RLS e grants de todas as tabelas `public`.
3. Corrigir ou remover `integracoes_google`.
4. Revisar RPCs `SECURITY DEFINER` e `search_path`.
5. Rotacionar tokens temporários Google/Meta.
6. Confirmar que nenhum secret aparece no bundle ou Git.
7. Validar consentimento e opt-out do WhatsApp.
8. Revisar logs de Auth e Edge Functions.
9. Definir backup, retenção e resposta a incidente.
10. Executar Security e Performance Advisors.

## IA

Não há IA generativa no produto. Dados de clientes não são enviados a provedores de IA pela aplicação. Qualquer futura integração deve ter avaliação própria de finalidade, minimização, retenção e uso para treinamento.
