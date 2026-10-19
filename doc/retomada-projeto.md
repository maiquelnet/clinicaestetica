# Retomada do projeto

Atualizado em: 2026-10-19. Snapshots Meta/Supabase desta data foram consultados por MCP em modo somente leitura; o estado da Vercel e os valores de Secrets não foram consultados.

Este é o ponto de partida para reiniciar ou transferir o desenvolvimento da Estética Schneider. Ele reúne os identificadores, o estado real local/remoto, os nomes das configurações e a ordem segura para voltar a trabalhar.

## Estado atual em uma frase

O Supabase remoto está ativo; `whatsapp-review-test` v3 foi publicado em 2026-10-19. A Meta ainda não confirmou pelo MCP qual app está ligado ao WABA/telefone real. O checkout contém correções locais e uma migration por clínica, mas fila, webhook e migration permanecem locais. O envio direto pelo painel da Meta foi entregue ao destinatário de teste; o envio pelo sistema ainda depende dos Secrets `WHATSAPP_REVIEW_*` corretos e da validação do template.

Nenhuma migration, Secret ou Edge Function remota deve ser removida durante o reinício. O YCloud permanece como contingência até a validação completa da Meta.

## Identificação do projeto

| Item | Valor |
| --- | --- |
| Projeto | Estética Schneider |
| Diretório local | `C:\Users\maiqu\sistema_estetica` |
| Frontend | `app/` |
| Backend versionado | `supabase/` |
| Documentação | `doc/` |
| Produção | `https://www.esteticaschneider.com.br` |
| Alias Vercel conhecido | `https://clinicaestetica-softolive.vercel.app` |
| Repositório | `maiquelnet/clinicaestetica` |
| Branch de produção | `main` |
| Projeto Supabase | `estetica_schneider` |
| Supabase Project Ref | `xucttzuthznqwlhushmg` |
| Região Supabase | `sa-east-1` |
| URL Supabase | `https://xucttzuthznqwlhushmg.supabase.co` |
| Dashboard Supabase | `https://supabase.com/dashboard/project/xucttzuthznqwlhushmg` |

O ID do projeto Vercel e seus tokens não estão versionados. Recupere-os no Dashboard da Vercel ou após vincular o checkout com uma conta autorizada.

## Arquitetura que deve ser preservada

- `app/`: SPA Vite com React e TypeScript.
- Supabase Auth: autenticação e sessão.
- PostgreSQL/RLS/RPCs: dados, isolamento por clínica e operações transacionais.
- Edge Functions: Google Calendar, Google Reviews, envio WhatsApp e webhook Meta.
- Vercel: build e hospedagem do frontend.
- Google: OAuth do Calendar e Places/Reviews.
- Meta: WhatsApp Cloud API oficial, com template aprovado, envio de teste validado e estados recebidos por webhook.

Não colocar tokens de integração, `service_role`, secret key ou Personal Access Token em código frontend, no Git ou em variáveis `VITE_*`.

## Primeiro reinício local

1. Abra o checkout e verifique o estado antes de alterar qualquer coisa:

```powershell
cd C:\Users\maiqu\sistema_estetica
git status --short
git branch --show-current
```

Há alterações locais de funcionalidades de agenda, secretaria, disponibilidade e WhatsApp. Preserve-as; não use `git reset --hard` nem descarte arquivos sem conferir a origem.

2. Instale e valide o frontend:

```powershell
cd C:\Users\maiqu\sistema_estetica\app
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

O conjunto de testes validado em 2026-09-12 terminou com 76 testes aprovados. Deno e a CLI do Supabase não estão instalados nesta máquina; a sintaxe das Edge Functions foi verificada por transpilação TypeScript, mas a execução local das funções ainda requer Deno/Supabase CLI.

3. Crie `app/.env.local` a partir do exemplo. Use somente a chave publicável do Supabase:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=<URL_DO_SUPABASE_DE_DESENVOLVIMENTO>
VITE_SUPABASE_PUBLISHABLE_KEY=<CHAVE_PUBLISHABLE_DO_SUPABASE>
```

O checkout documenta `xucttzuthznqwlhushmg` como produção e não confirma staging. Não use essa URL para desenvolvimento/testes; confirme um projeto separado antes de conectar. O arquivo `app/.env.local` não deve ser commitado. Após mudar qualquer `VITE_*`, é necessário executar um novo build/deploy.

4. Para testar as Edge Functions localmente, copie `supabase/functions/.env.example` para `supabase/functions/.env` e preencha os valores reais. Esse arquivo local é ignorado pelo Git.

## Configurações e segredos necessários

Registre apenas os nomes abaixo na documentação. Os valores devem ser recuperados nos respectivos painéis ou no cofre de segredos.

### Frontend/Vercel

| Nome | Uso |
| --- | --- |
| `VITE_APP_ENV` | `development`, `preview` ou `production`. |
| `VITE_SUPABASE_URL` | URL pública do projeto Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável/default do Supabase; protegida por RLS. |

### Supabase Edge Functions — configuração global remota histórica

Os nomes abaixo descrevem o fluxo remoto legado, visto em snapshot de 2026-10-19; valores de Secrets não foram consultados. Não os substitua pela configuração local por clínica sem aplicar e validar a migration correspondente.

| Nome | Obrigatório para | Origem |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Envio e consultas Meta | Token de System User da Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | Número remetente | WhatsApp Manager/Meta. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Consulta de templates e validação do WABA | WhatsApp Manager/Meta. |
| `WHATSAPP_GRAPH_VERSION` | Versão da Graph API | Valor remoto não foi lido; confirme no Supabase e na Meta antes de mudar. |
| `WHATSAPP_CRON_SECRET` | Processamento automático da fila | Segredo aleatório compartilhado com o scheduler. |
| `META_APP_SECRET` | Assinatura `X-Hub-Signature-256` | App Secret do app Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | Verificação inicial do callback | Token escolhido pela equipe e repetido no cadastro da Meta. |

O Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para o ambiente das funções. A service role é somente backend e nunca deve chegar ao navegador.

### Supabase Vault e scheduler

O job `process-whatsapp-messages` usa `pg_cron` + `pg_net` e deve conservar estes nomes no Vault:

| Nome no Vault | Conteúdo |
| --- | --- |
| `whatsapp_function_url` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages` |
| `whatsapp_cron_secret` | Mesmo valor configurado em `WHATSAPP_CRON_SECRET`. |

Agenda esperada: `*/5 * * * *`. Não gravar o segredo diretamente no SQL do job.

### Google e demais integrações

Para preservar as integrações já existentes, confira também os nomes documentados em [operação, acessos e plataformas](./operacao-plataformas.md), especialmente:

- `GOOGLE_CLIENT_ID`;
- `GOOGLE_CLIENT_SECRET`;
- `GOOGLE_TOKEN_ENCRYPTION_KEY`;
- `GOOGLE_CALENDAR_ID`;
- `GOOGLE_SYNC_CRON_SECRET`;
- `GOOGLE_PLACES_API_KEY`;
- `SITE_URL`.

Não troque `GOOGLE_TOKEN_ENCRYPTION_KEY` sem aceitar a necessidade de reconectar contas do Google Calendar.

## Configuração Meta necessária

O usuário informa que o app `1369639224651650` (“Thaís Schneider Estética Whats”) é o pretendido para o número real. O MCP Meta lista esse app, mas não recebeu acesso ao portfólio e não expôs a associação app–WABA–telefone. O app `1637078911202031` (“API Estética Schneider Auto”) foi o contexto de um teste direto da Meta. Não assumir que um deles está conectado ao número real sem confirmação.

Dados informados pelo usuário/telas, não confirmados pelo MCP:

- Portfólio: `958284598092300`;
- WABA real: `5523215167904668`;
- número real: `+55 51 8591-0322`;
- Phone Number ID exibido no perfil: `1287807847751041`.

Antes de publicar ou trocar credenciais, confirme no Meta for Developers/WhatsApp Manager:

- App da Meta com o produto WhatsApp habilitado.
- WABA e número remetente pertencentes ou autorizados pela Estética Schneider.
- App ID, WABA, Phone Number ID, token e template pertencentes à mesma integração.
- System User com token válido e as permissões `whatsapp_business_messaging` e, para administrar/consultar modelos, `whatsapp_business_management`.
- Templates `confirmacao_agendamento_v1` e `lembrete_agendamento_v1` em `pt_BR` com status `APPROVED`.
- Callback da Meta:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/meta-whatsapp-webhook
```

O webhook remoto usa atualmente o Secret global `META_WEBHOOK_VERIFY_TOKEN`; código local futuro lê token/App Secret por clínica via Vault/RPC, mas essa migration não foi aplicada. Não altere a configuração do callback remoto nesta etapa.

O contrato de envio usado pelo projeto é `POST /{PHONE_NUMBER_ID}/messages` na Graph API da Meta, com template e parâmetros de corpo. Consulte a [coleção oficial da Meta para WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages) quando precisar confirmar o formato vigente.

## Código local da migração Meta

Arquivos relevantes:

| Arquivo | Função |
| --- | --- |
| `supabase/functions/whatsapp-messages/index.ts` | Código local em edição: credenciais por clínica, verificação de cancelamento e reconciliação terminal; remoto continua v29. |
| `supabase/functions/meta-whatsapp-webhook/index.ts` | Código local em edição: roteamento WABA + Phone Number ID e HMAC por app; remoto continua v8. |
| `supabase/functions/whatsapp-review-test/index.ts` | Código implantado v3: confirmação de app/token/permissões/WABA/remetente/template/parâmetros/estrutura suportada, destinatário fixo e auditoria antes/depois; ainda sem Secrets confirmados. |
| `supabase/config.toml` | Mantém `verify_jwt = false` no webhook público; a função faz autenticação própria por token/assinatura. |
| `supabase/migrations/20260912090000_meta_whatsapp_cloud_direct.sql` | Colunas, tabelas, índices e RPC de idempotência dos eventos Meta. |
| `supabase/migrations/20261019153000_meta_clinic_integrations_and_reconciliation.sql` | Configuração por clínica no schema `private`, RPCs de Secrets Vault e estado `reconciliacao`; somente local, não aplicada. |
| `supabase/functions/.env.example` | Lista local dos nomes de configuração sem valores secretos. |

A migration de 202609 cria ou ajusta `public.whatsapp_testes`, `public.whatsapp_webhook_events` e `public.record_meta_webhook_event`. A migration de 202610 não foi aplicada ao remoto. O Preview compartilha o Supabase de produção; o Sandbox grava uma auditoria ali.

## Estado e próximos passos da Meta direta

Não publique novamente a função Meta sem comparar a história de migrations local e remota. O projeto remoto possui migrations aplicadas por ferramentas diferentes e também mantém a implementação YCloud legada.

1. Confira branch, diff e cópia segura das alterações locais.
2. Instale a CLI do Supabase, se necessário, e descubra os comandos da versão instalada:

```powershell
supabase --help
supabase db --help
supabase functions --help
```

3. Compare migrations locais e vinculadas ao projeto `xucttzuthznqwlhushmg`. Não aplique a pasta inteira às cegas.
4. A migration local `20260912090000_meta_whatsapp_cloud_direct.sql` já foi aplicada remotamente com o registro `20260922074529_meta_whatsapp_cloud_direct`. Se estiver retomando em outro projeto, aplique-a somente depois de revisar o diff e o impacto em `fila_mensagens`, `logs_mensagens` e `whatsapp_testes`.
5. Confirme os Edge Secrets Meta sem expor valores.
6. Confirme que `whatsapp_function_url` ainda aponta para `whatsapp-messages` e que o job do Vault permanece ativo.
7. Revalide o callback no Meta for Developers se o App ID, URL ou token tiverem mudado.
8. Faça a homologação abaixo com um número autorizado.
9. Confirme junto à Meta qual app será analisado. O usuário indica `1369639224651650` para o WABA/telefone real, mas o MCP não confirmou o vínculo; o teste direto anterior mostrou contexto `1637078911202031`. Consulte o [guia Meta](./meta-whatsapp-app-review.md).
10. Só depois de uma janela estável remova YCloud, seus Secrets e seus arquivos legados.

Ao usar uma versão diferente da CLI, consulte o `--help` dessa instalação; a sintaxe e as opções podem mudar.

## Homologação mínima após a retomada

### Aplicação

- Abrir `/`, `/login`, `/dashboard` e `/cadastro-cliente`.
- Entrar com um usuário administrativo e confirmar o papel/permissões.
- Criar ou editar um cliente sem quebrar o consentimento de WhatsApp.
- Criar, reagendar e cancelar um agendamento.
- Conferir disponibilidade, bloqueios e ações da secretaria.

### WhatsApp Meta

- Consultar `status` e confirmar que as credenciais aparecem como configuradas, sem expor valores.
- Validar os dois templates e exigir resposta `APPROVED`.
- Executar `send-test` para um destinatário permitido.
- Confirmar o WAMID retornado pela Meta em `whatsapp_testes`/logs.
- Criar cliente de teste com `whatsapp_opt_in_status=aceito`.
- Criar agendamento futuro, processar a fila e confirmar apenas um envio por `ciclo`.
- Confirmar no webhook os estados `sent`, `delivered`, `read` e `failed` quando a Meta os enviar.
- Testar reagendamento, cancelamento, revogação de consentimento, retry e erro de template.

Aceite HTTP da Meta não significa entrega ao destinatário. Entrega e leitura só devem ser consideradas após o webhook atualizar os registros.

### Scheduler

- Conferir o job `process-whatsapp-messages` em Supabase Cron.
- Confirmar execução a cada cinco minutos.
- Conferir logs da função e `net._http_response` quando houver falha.
- Confirmar que itens elegíveis não permanecem presos em `processando`.

## Diagnóstico rápido

| Sintoma | Primeira verificação |
| --- | --- |
| Frontend abre, mas não autentica | `VITE_SUPABASE_URL`, chave publicável, domínio Vercel e configuração de Auth. |
| Template rejeitado | Nome/language no sistema, WABA correto e status `APPROVED` na Meta. |
| Envio retorna erro | Token, Phone Number ID, permissão `whatsapp_business_messaging` e formato internacional do telefone. |
| Webhook retorna `403` no GET | `META_WEBHOOK_VERIFY_TOKEN` diferente do valor cadastrado na Meta. |
| Webhook retorna `401` no POST | `META_APP_SECRET` incorreto ou assinatura calculada sobre body alterado. |
| Scheduler não processa | Job, Vault, URL, `WHATSAPP_CRON_SECRET` e relógio/logs da função. |
| Projeto remoto ainda mostra artefatos YCloud | A função legada permanece como contingência; não altere o fluxo Meta por causa dela. |

## Rotação e recuperação

- Token Meta exposto: revogar o token na Meta, criar outro System User token e atualizar `WHATSAPP_ACCESS_TOKEN`.
- App Secret ou token de verificação exposto: rotacionar no app Meta e no Supabase, depois refazer a verificação do callback.
- `WHATSAPP_CRON_SECRET` exposto: alterar no Supabase e no Vault na mesma janela.
- Secret key/service role exposta: revogar/rotacionar imediatamente e revisar logs de acesso.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` perdida: definir uma nova chave e reconectar as contas do Google Calendar.

Após a rotação de Secrets das Edge Functions não é necessário rebuild da Vercel. Após a rotação de qualquer `VITE_*`, faça novo build/deploy.

## Pendências conhecidas

- App 136 (`Thaís Schneider Estética Whats`): `NO_SUBMISSION` e dados básicos incompletos no snapshot MCP de 2026-10-19. App 163 retornou `UNSUBMITTED` junto de `is_approved=true`, combinação contraditória; não declarar aprovação.
- O screencast de mensagens e as etapas de API precheck/Data Use Checkup ainda precisam ser concluídos antes do envio da análise.
- `whatsapp_business_management` só deve permanecer na solicitação se o sistema realmente demonstrar gerenciamento de modelos/ativos via API.
- Templates e ativos Meta de produção devem ser confirmados individualmente antes de mensagens automáticas reais.
- A migration local está desenhada para uma integração Meta por clínica e Secrets no Vault, mas não foi aplicada remotamente. O código remoto ainda usa a versão anterior e os Secrets globais permanecem inalterados.
- Não há, neste fluxo, importação de mensagens recebidas/histórico de conversas nem integração de Instagram/Facebook Ads.
- Advisors Supabase ainda apontam avisos de segurança/performance preexistentes; revisar em tarefa própria antes de ampliar o escopo.

## Documentos complementares

- [Operação, acessos e plataformas](./operacao-plataformas.md)
- [WhatsApp Cloud API — Meta](./whatsapp-cloud.md)
- [API e Edge Functions](./api.md)
- [Arquitetura do sistema](./arquitetura.md)
- [Qualidade e testes](./testes.md)
- [Histórico de implementação](./historico-implementacao.md)
