# Operação, acessos e plataformas

Atualizado em: 2026-10-19. Os snapshots de estado remoto abaixo mantêm as datas de consulta registradas; não foram consultados novamente nesta revisão.

Este documento é o runbook de operação da aplicação Estética Schneider. Ele registra os identificadores que podem ser versionados, as variáveis necessárias e onde recuperar credenciais. Valores secretos não devem ser gravados no Git, em chamados ou em mensagens.

## Ambientes e endereços

| Item | Valor conhecido | Observação |
| --- | --- | --- |
| Site de produção | `https://www.esteticaschneider.com.br` | Endereço oficial para clientes e equipe. |
| Alias Vercel conhecido | `https://clinicaestetica-softolive.vercel.app` | Alias técnico observado durante a implantação. |
| Login administrativo | `https://www.esteticaschneider.com.br/login` | Redireciona usuários autenticados para `/dashboard`. |
| Cadastro público | `https://www.esteticaschneider.com.br/cadastro-cliente` | Formulário público de cadastro e interesses. |
| Repositório GitHub | `maiquelnet/clinicaestetica` | Branch de produção: `main`. |
| Supabase Dashboard | `https://supabase.com/dashboard/project/xucttzuthznqwlhushmg` | Projeto de produção. |
| Supabase API URL | `https://xucttzuthznqwlhushmg.supabase.co` | Usada pelo frontend e pelas Edge Functions. |
| Supabase Project Ref | `xucttzuthznqwlhushmg` | Identificador público do projeto. |
| Supabase Project Name | `estetica_schneider` | Nome confirmado em 2026-08-11. |
| Supabase Organization ID | `pxzhdgsggtrncluifije` | Identificador da organização; não é credencial. |
| Região Supabase | `sa-east-1` | South America (São Paulo). |
| Banco | PostgreSQL `17.6.1.127` | Engine principal `17`, canal GA. |

### Isolamento de desenvolvimento e Preview

Snapshot consultado em 2026-10-19: `xucttzuthznqwlhushmg` está `ACTIVE_HEALTHY`; o projeto antigo `olmspqsciwoxbpgslsoz` está `INACTIVE`. Não há staging Supabase ativo confirmado. O Preview usa o mesmo Supabase de produção: a flag `VITE_APP_ENV=preview` não isola banco, Auth, Secrets, Edge Functions, cron ou webhook.

Exceção temporária e restrita para a gravação App Review: o Preview mostra o Sandbox, que chama apenas `whatsapp-review-test`, grava auditoria em `whatsapp_testes` no banco de produção e aceita apenas credenciais dedicadas `WHATSAPP_REVIEW_*` e o destinatário `+55 51 98660-3385`. O painel comum de WhatsApp/produção fica oculto em Preview e desenvolvimento. Não use em Preview ações que alterem cadastro/agenda nem o fluxo de fila automática. Não é um ambiente isolado.

O ID interno e o slug da equipe/projeto Vercel não estão versionados: não existe `.vercel/project.json` no checkout e a CLI Vercel não está instalada. Para confirmá-los, abra o projeto que atende os dois domínios acima no Dashboard da Vercel ou execute `vercel link` em uma máquina autorizada. Não invente `VERCEL_ORG_ID` ou `VERCEL_PROJECT_ID`.

## Como obter acesso

### GitHub

1. Solicite acesso ao repositório `maiquelnet/clinicaestetica`.
2. Instale o GitHub CLI.
3. Autentique com `gh auth login -h github.com`.
4. Verifique com `gh auth status`.

O deploy da Vercel parte da integração GitHub. Alterações na `main` devem gerar o deploy de produção; branches geram Preview Deployments quando a integração está habilitada.

### Supabase

1. O proprietário deve convidar o desenvolvedor para a organização/projeto pelo Dashboard.
2. Para operações manuais, use o Dashboard do projeto informado acima.
3. Para CLI ou MCP, crie um Personal Access Token próprio em Supabase Account > Access Tokens e guarde-o localmente como `SUPABASE_ACCESS_TOKEN`.
4. Nunca use `SUPABASE_ACCESS_TOKEN`, chave secret ou `service_role` no frontend.

Exemplo de configuração local do MCP, sem o valor do token:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=xucttzuthznqwlhushmg"
bearer_token_env_var = "SUPABASE_ACCESS_TOKEN"
enabled = true
```

### Vercel

1. Solicite acesso à equipe que controla `www.esteticaschneider.com.br` e o alias `clinicaestetica-softolive.vercel.app`.
2. Localize o projeto conectado a `maiquelnet/clinicaestetica`.
3. Confirme em Settings > Git a branch de produção `main`.
4. Confirme em Settings > Domains os dois domínios listados neste documento.
5. Para uso da CLI, faça login com `vercel login` e vincule o checkout com `vercel link`.

`VERCEL_TOKEN`, quando necessário em CI, é secreto. `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` são metadados do vínculo, mas devem ser obtidos do projeto real, normalmente em `.vercel/project.json` depois de `vercel link`.

## Configuração da Vercel

O arquivo `vercel.json` da raiz é a fonte versionada:

```json
{
  "installCommand": "cd app && npm ci",
  "buildCommand": "cd app && VITE_APP_ENV=preview npm run build",
  "outputDirectory": "app/dist"
}
```

Esse comando Preview está versionado no branch de homologação. Se o mesmo `vercel.json` for mesclado em `main`, também forçará `preview` no build de produção; não mescle sem restaurar a configuração de produção.

A rewrite envia todas as rotas para `app/dist/index.html`, permitindo que o React Router trate `/login`, `/dashboard` e as demais URLs da SPA.

Variáveis obrigatórias no ambiente Production:

| Nome | Valor/documentação | Exposição |
| --- | --- | --- |
| `VITE_APP_ENV` | `production` | Pública no bundle. |
| `VITE_SUPABASE_URL` | `https://xucttzuthznqwlhushmg.supabase.co` | Pública. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave `default` em Supabase > Settings > API Keys | Pública, protegida por RLS. Não confundir com secret key. |

Para Preview use `VITE_APP_ENV=preview`; para desenvolvimento local, `VITE_APP_ENV=development`. Se Preview e Production apontarem para o mesmo Supabase, os testes de preview alterarão dados reais. O recomendado é criar um projeto/branch de staging antes de habilitar testes destrutivos.

Depois de alterar variáveis `VITE_*`, gere um novo deploy: elas são incorporadas durante o build. Variáveis de Edge Functions do Supabase não exigem redeploy da Vercel.

## Configuração do Supabase

### Chaves da aplicação

- Frontend: `VITE_SUPABASE_PUBLISHABLE_KEY`, obtida em Settings > API Keys > Publishable keys.
- Edge Functions: `SUPABASE_URL` e `SUPABASE_SECRET_KEYS` são fornecidas pelo Supabase. O código ainda aceita `SUPABASE_SERVICE_ROLE_KEY` em pontos legados.
- Nunca coloque `sb_secret_...`, `service_role`, tokens OAuth ou tokens Meta em variáveis `VITE_*`.

O Supabase recomenda publishable keys (`sb_publishable_...`) no navegador e secret keys (`sb_secret_...`) apenas no backend. Secret keys ignoram RLS.

### Edge Functions implantadas

Snapshot remoto consultado por MCP somente leitura em 2026-10-19:

| Função | Versão remota | `verify_jwt` | URL |
| --- | ---: | --- | --- |
| `google-calendar-sync` | 48 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync` |
| `google-reviews` | 18 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-reviews` |
| `whatsapp-messages` | 29 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages` |
| `ycloud-webhook` | 9 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/ycloud-webhook` |
| `meta-whatsapp-webhook` | 8 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/meta-whatsapp-webhook` |
| `whatsapp-review-test` | 2 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-review-test` |

`verify_jwt=false` não significa acesso irrestrito por si só:

- Google Calendar valida callback OAuth, webhook Google, secret de cron e JWT/papel para ações administrativas.
- WhatsApp valida JWT/papel de administrador nas ações de configuração e `WHATSAPP_CRON_SECRET` no processamento automático.
- Google Reviews é um GET público e retorna somente dados de avaliações públicas da clínica.

Snapshot consultado por MCP em 2026-10-19: `whatsapp-messages` v29 e `meta-whatsapp-webhook` v8 permanecem remotos e sem os fixes locais. `whatsapp-review-test` v2 foi publicado nesta data com validação Meta de App ID/token/permissões/WABA/remetente/template/tradução/parâmetros, destinatário fixo e auditoria obrigatória. Não houve alteração de Secrets nem envio de mensagem; o fluxo v2 deve permanecer bloqueado até os Secrets de revisão estarem configurados e validados. `ycloud-webhook` permanece como legado. A migration remota mais recente listada foi `20260922074529_meta_whatsapp_cloud_direct`; a nova migration local por clínica ainda não aparece no banco.

### Secrets do Google Calendar

Cadastrar em Supabase > Edge Functions > Secrets:

| Nome | Origem/valor esperado |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth Client ID do Google Cloud, tipo Web application. |
| `GOOGLE_CLIENT_SECRET` | Secret do mesmo cliente OAuth. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Chave aleatória para AES-GCM; manter estável para conseguir descriptografar tokens existentes. |
| `GOOGLE_CALENDAR_ID` | `primary`, salvo se a clínica usar outro calendário. |
| `GOOGLE_SYNC_CRON_SECRET` | String aleatória compartilhada somente com o agendador. |
| `SITE_URL` | `https://www.esteticaschneider.com.br` |
| `GOOGLE_FUNCTION_URL` | URL da função; opcional porque o código deriva da Supabase URL. |
| `CORS_ALLOWED_ORIGINS` | Origens extras separadas por vírgula, quando necessárias. |

No Google Cloud, a URI de redirecionamento autorizada é:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
```

Existe uma conexão ativa em `public.google_calendar_connections`. Tokens são armazenados criptografados em `tokens_encrypted`; não copie esse conteúdo para documentação.

### Secret do Google Places/Reviews

| Nome | Origem |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Google Cloud > APIs & Services > Credentials; restringir à Places API (New) e ao uso necessário. |

O `google_place_id` e o `link_google_avaliacao` ficam em `public.clinicas` e são editáveis em Configurações > Parâmetros Gerais.

### Secrets do WhatsApp implantado

A função atualmente implantada usa estes nomes exatos:

| Nome | Obrigatório | Origem/uso |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Sim | Token da Meta Cloud API. Em produção, usar token de System User e rotação controlada. |
| `WHATSAPP_PHONE_NUMBER_ID` | Sim | ID do número remetente na configuração da API do WhatsApp. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Sim | WABA ID usado para consultar templates. |
| `WHATSAPP_GRAPH_VERSION` | Não | Versão Graph; a função atual usa `v23.0` se ausente. |
| `WHATSAPP_CRON_SECRET` | Para automação | Secret enviado no header `x-whatsapp-cron-secret`. |
| `WHATSAPP_FUNCTION_URL` | Para status do agendador | URL completa da Edge Function. |
| `META_APP_SECRET` | Para webhook | App Secret usado para validar `X-Hub-Signature-256`. |
| `META_WEBHOOK_VERIFY_TOKEN` | Para webhook | Token escolhido no cadastro do callback da Meta. |

### Secrets temporários do Sandbox de App Review

A versão remota v2 de `whatsapp-review-test` usa apenas credenciais dedicadas. Não substitui as credenciais reais e não aceita destinatários arbitrários:

| Nome | Obrigatório | Origem/uso |
| --- | --- | --- |
| `WHATSAPP_REVIEW_ACCESS_TOKEN` | Sim | Token de teste emitido para o app que será submetido. |
| `WHATSAPP_REVIEW_APP_ID` | Sim | App ID que o endpoint de debug da Meta deve retornar para esse token. |
| `WHATSAPP_REVIEW_APP_SECRET` | Sim | App Secret do mesmo app; usado somente no backend para validar o token. |
| `WHATSAPP_REVIEW_WABA_ID` | Sim | WABA que contém o remetente de teste. |
| `WHATSAPP_REVIEW_PHONE_NUMBER_ID` | Sim | Remetente de teste listado pela Meta dentro desse WABA. |
| `WHATSAPP_REVIEW_GRAPH_VERSION` | Sim | Versão mostrada/definida no painel Meta do app; sem fallback presumido. |
| `WHATSAPP_REVIEW_TEMPLATE_NAME` | Sim | Nome exato do template disponível no WABA de teste. |
| `WHATSAPP_REVIEW_TEMPLATE_LANGUAGE` | Sim | Código exato do idioma do template. |
| `WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON` | Sim | Array JSON com parâmetros de texto do corpo na ordem dos placeholders (`[]` se não houver variáveis). |

Esses Secrets nunca devem ser colocados em `VITE_*`. A função local confirma com a Meta o vínculo do token ao App ID, a permissão `whatsapp_business_messaging` e a presença do Phone Number ID no WABA antes de habilitar envio. O vínculo entre app real e WABA/número real ainda não foi confirmado pelo MCP. `vercel.json` nesta branch fixa `VITE_APP_ENV=preview`; mesclar esse arquivo em `main` também levaria `preview` ao build de produção. Rever esse comando antes de retomar produção.

O único destinatário de teste permitido no código local é `+55 51 98660-3385`, que recebeu o teste direto da Meta. O remetente de teste e o app que serão analisados precisam ser confirmados juntos; não usar o Phone Number ID real `1287807847751041` como remetente do sandbox. Consulte a distinção entre os apps no [guia Meta](./meta-whatsapp-app-review.md).

### Estado do agendador WhatsApp

Em 2026-08-13, Supabase Cron, `pg_cron` e `pg_net` foram instalados. O job `process-whatsapp-messages` chama a Edge Function a cada cinco minutos. A URL e o segredo do cron ficam no Supabase Vault com os nomes `whatsapp_function_url` e `whatsapp_cron_secret`; o comando não contém o segredo em texto claro.

Formato da chamada:

```http
POST /functions/v1/whatsapp-messages
Content-Type: application/json
x-whatsapp-cron-secret: <WHATSAPP_CRON_SECRET>

{
  "action": "process",
  "clinicId": "<UUID_DA_CLINICA>"
}
```

O job retornou HTTP `200` no teste e o painel exibiu `Agendador ativo`. A fila `public.fila_mensagens` e as RPCs de claim/complete/fail estão no banco. O envio de teste pela Meta foi validado; o automático depende de consentimento, regra ativa e template individualmente aprovado.

Para monitorar, consulte o histórico em Integrations > Cron > Jobs, os logs de `whatsapp-messages` e, quando necessário, `net._http_response`. Foram observados erros transitórios `JWT issued at future`, seguidos de execução normal sem alteração de configuração.

## Banco de dados: fotografia verificada

Em 2026-08-11:

- 44 tabelas base no schema `public`;
- PostgreSQL 17;
- 1 conexão Google Calendar;
- 8 modelos de mensagem e 10 regras;
- fila WhatsApp e logs automáticos vazios;
- extensões confirmadas no snapshot inicial: `citext 1.6` e `supabase_vault 0.3.1`;
- `pg_cron` e `pg_net` instalados posteriormente, em 2026-08-13.

As migrations remotas relacionadas ao WhatsApp incluem:

```text
20260907202917_ycloud_coexistence_outbound_status
20260907203731_ycloud_worker_status
```

As migrations anteriores continuam no histórico remoto; estas são as últimas relacionadas ao fluxo YCloud verificadas. A migration local `20260912090000_meta_whatsapp_cloud_direct` foi aplicada remotamente em 2026-09-22 e recebeu o registro `20260922074529_meta_whatsapp_cloud_direct`. Algumas migrations foram aplicadas por ferramentas remotas e receberam timestamps diferentes dos arquivos locais. Antes de usar `supabase db push`, compare `supabase migration list --local` e `--linked`; não aplique a pasta inteira às cegas.

## Segurança: correção de `integracoes_google`

Em 2026-08-13, o alerta crítico `rls_disabled_in_public` de `public.integracoes_google` foi contido com RLS e revogação dos privilégios de `PUBLIC`, `anon` e `authenticated`. O Advisor confirmou a eliminação do erro crítico.

A tabela estava vazia, não era usada pela integração atual e não possuía dependências em funções, views, triggers, publications ou constraints externas. Em 2026-08-14, ela foi removida sem `CASCADE` pela migration `20260814034340_remove_legacy_integracoes_google`.

## Pendências de segurança conhecidas

Outros avisos atuais:

- `fila_mensagens` e `google_calendar_connections` têm RLS habilitado sem policies; são usadas pelo backend/service role. Manter sem acesso frontend é aceitável se essa for a decisão arquitetural.
- quatro RPCs administrativas ainda aparecem com `search_path` mutável;
- a RPC pública de cadastro precisa permanecer pública somente se o formulário público continuar ativo;
- proteção contra senhas vazadas está desabilitada;
- há FKs sem índices e policies permissivas duplicadas em módulos administrativos.

Consulte periodicamente o Security Advisor e o Performance Advisor do projeto. Referência da correção aplicada: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

## Publicação e validação

Fluxo recomendado:

1. Criar branch `agent/<descricao>`.
2. Atualizar código, migrations e documentação juntos.
3. Executar em `app/`:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

4. Validar Edge Functions com Deno e testes próprios antes do deploy.
5. Aplicar migrations de forma controlada e conferir o histórico remoto.
6. Publicar Edge Functions com `verify_jwt=false` somente quando a função tiver autenticação própria adequada.
7. Fazer commit e push no GitHub.
8. Confirmar o deployment da Vercel e testar `/`, `/login`, `/dashboard` e `/cadastro-cliente`.
9. Verificar logs do Supabase e Advisors.

## Recuperação e rotação

- Publishable key vazada: o risco é limitado pelas policies, mas ainda deve ser rotacionada e o RLS revisado.
- Secret key ou service role vazada: rotacionar imediatamente; ela ignora RLS.
- Google client secret vazado: criar novo secret no Google Cloud, atualizar Edge Secrets e revogar o anterior.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` perdida: conexões existentes não poderão ser descriptografadas; reconectar o Google após definir uma nova chave.
- Token Meta vazado: revogar na Meta, criar novo System User token e atualizar o Supabase.
- `WHATSAPP_CRON_SECRET` vazado: rotacionar tanto no Supabase quanto no agendador chamador.

Após atualizar Secrets de Edge Functions, eles ficam disponíveis sem rebuild da Vercel. Após atualizar variáveis `VITE_*`, um novo build/deploy da Vercel é obrigatório.
