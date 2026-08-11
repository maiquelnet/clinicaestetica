# Operação, acessos e plataformas

Atualizado em: 2026-08-11.

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
  "buildCommand": "cd app && npm run build",
  "outputDirectory": "app/dist"
}
```

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

Snapshot confirmado em 2026-08-11:

| Função | Versão remota | `verify_jwt` | URL |
| --- | ---: | --- | --- |
| `google-calendar-sync` | 32 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync` |
| `google-reviews` | 2 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-reviews` |
| `whatsapp-messages` | 4 | `false` | `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages` |

`verify_jwt=false` não significa acesso irrestrito por si só:

- Google Calendar valida callback OAuth, webhook Google, secret de cron e JWT/papel para ações administrativas.
- WhatsApp valida JWT/papel de administrador nas ações de configuração e `WHATSAPP_CRON_SECRET` no processamento automático.
- Google Reviews é um GET público e retorna somente dados de avaliações públicas da clínica.

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

O número pessoal pode ser destinatário verificado durante a homologação. Para produção, o remetente deve ser um número controlado pela Estética Schneider e habilitado na Meta.

### Estado do agendador WhatsApp

Em 2026-08-11, `pg_cron` e `pg_net` não estavam instalados no projeto. Portanto, a fila não é processada automaticamente pelo Postgres. Para automatizar, um agendador externo ou uma futura migration precisa chamar:

```http
POST /functions/v1/whatsapp-messages
Content-Type: application/json
x-whatsapp-cron-secret: <WHATSAPP_CRON_SECRET>

{
  "action": "process",
  "clinicId": "<UUID_DA_CLINICA>"
}
```

Até esse agendador existir e ser testado, considere o WhatsApp automático parcialmente configurado. A fila `public.fila_mensagens` e as RPCs de claim/complete/fail já estão no banco.

## Banco de dados: fotografia verificada

Em 2026-08-11:

- 45 tabelas base no schema `public`;
- PostgreSQL 17;
- 1 conexão Google Calendar;
- 8 modelos de mensagem e 10 regras;
- fila WhatsApp e logs automáticos vazios;
- extensões confirmadas: `citext 1.6` e `supabase_vault 0.3.1`;
- `pg_cron` e `pg_net` não instalados.

As migrations remotas registradas terminam em:

```text
20260807185358_whatsapp_automation
20260807190318_fix_whatsapp_rpc_security
20260810173548_whatsapp_message_queue
```

Algumas migrations foram aplicadas por ferramentas remotas e receberam timestamps diferentes dos arquivos locais. Antes de usar `supabase db push`, compare `supabase migration list --local` e `--linked`; não aplique a pasta inteira às cegas.

## Pendências de segurança conhecidas

O Security Advisor confirmou um erro crítico: `public.integracoes_google` está no schema exposto com RLS desabilitado. A tabela está vazia e não é a tabela usada pela sincronização nova, mas continua exposta enquanto não houver decisão de removê-la ou protegê-la. Não habilite RLS sem definir as policies necessárias ao fluxo que ainda depender dela.

Outros avisos atuais:

- `fila_mensagens` e `google_calendar_connections` têm RLS habilitado sem policies; são usadas pelo backend/service role. Manter sem acesso frontend é aceitável se essa for a decisão arquitetural.
- quatro RPCs administrativas ainda aparecem com `search_path` mutável;
- a RPC pública de cadastro precisa permanecer pública somente se o formulário público continuar ativo;
- proteção contra senhas vazadas está desabilitada;
- há FKs sem índices e policies permissivas duplicadas em módulos administrativos.

Consulte periodicamente o Security Advisor e o Performance Advisor do projeto. Referência para a pendência crítica: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

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
