# Guia de Instalação e Desenvolvimento

Atualizado em: 2026-08-11.

## Pré-requisitos

- Git;
- Node.js compatível com Vite 8 e npm;
- acesso ao repositório GitHub `maiquelnet/clinicaestetica`;
- acesso ao projeto Supabase `xucttzuthznqwlhushmg`;
- acesso à equipe/projeto Vercel para publicar;
- Deno ou Supabase CLI para validar Edge Functions;
- acesso Google Cloud/Meta apenas quando a tarefa envolver essas integrações.

## Checkout e frontend

```bash
git clone https://github.com/maiquelnet/clinicaestetica.git
cd clinicaestetica/app
npm ci
```

Crie `app/.env.local` a partir de `app/.env.example`:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=https://xucttzuthznqwlhushmg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<CHAVE_PUBLISHABLE_DEFAULT>
```

A publishable key é encontrada em Supabase > Settings > API Keys. Ela pode estar no frontend porque o acesso efetivo é protegido por Auth/RLS. Nunca use secret key ou service role nesse arquivo.

Executar:

```bash
npm run dev
```

Validação obrigatória antes de commit:

```bash
npm run typecheck
npm run lint
npm run build
```

## Ambientes

| Ambiente | `VITE_APP_ENV` | Observação |
| --- | --- | --- |
| Local | `development` | Normalmente usa `app/.env.local`. |
| Vercel Preview | `preview` | Idealmente deve apontar para staging. |
| Vercel Production | `production` | Usa o Supabase de produção documentado. |

Todos os nomes iniciados por `VITE_` são incorporados ao bundle e devem ser considerados públicos.

## Publicação Vercel

O deploy parte da raiz do repositório. `vercel.json` configura:

```text
Install: cd app && npm ci
Build: cd app && npm run build
Output: app/dist
```

Passos:

1. Confirme que o projeto Vercel está ligado ao repositório e que `main` é a Production Branch.
2. Configure `VITE_APP_ENV`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nos ambientes corretos.
3. Faça push da branch para obter Preview.
4. Depois de revisar, integre à `main` para gerar Production.
5. Teste `https://www.esteticaschneider.com.br`, `/login`, `/dashboard` e `/cadastro-cliente`.

Se usar CLI:

```bash
npm install --global vercel
vercel login
vercel link
vercel env ls
vercel inspect <deployment-url>
```

Não versione a pasta `.vercel/`. O vínculo local contém metadados do projeto e é recriado por `vercel link`.

## Supabase CLI

Descubra a sintaxe da versão instalada antes de usar:

```bash
supabase --version
supabase --help
supabase functions --help
supabase migration --help
```

Vincule ao projeto somente em uma máquina autorizada:

```bash
supabase login
supabase link --project-ref xucttzuthznqwlhushmg
```

As migrations remotas foram aplicadas em parte por ferramentas que geraram timestamps diferentes dos arquivos locais. Compare o histórico antes de `db push`:

```bash
supabase migration list --local
supabase migration list --linked
```

Não execute `supabase db push` automaticamente enquanto as duas listas não estiverem reconciliadas.

## Edge Functions

Funções de produção:

```text
google-calendar-sync
google-reviews
whatsapp-messages
```

Implantação:

```bash
supabase functions deploy google-calendar-sync --no-verify-jwt
supabase functions deploy google-reviews --no-verify-jwt
supabase functions deploy whatsapp-messages --no-verify-jwt
```

O uso de `--no-verify-jwt` é intencional apenas porque cada função possui seu próprio modelo de acesso. Revise o código antes de qualquer redeploy.

Secrets de produção podem ser cadastrados no Dashboard ou pela CLI:

```bash
supabase secrets list
supabase secrets set NOME=valor
```

Prefira fornecer um arquivo `.env` local ignorado pelo Git quando houver vários valores. Nunca coloque o arquivo no commit.

## Fontes Supabase duplicadas

Os deploys recentes criaram arquivos também em `app/supabase/`. Em 2026-08-11:

- `app/supabase/functions/google-reviews` corresponde à função Google Reviews implantada;
- `app/supabase/functions/whatsapp-messages` corresponde à versão 4 implantada;
- `supabase/functions/google-calendar-sync` corresponde à versão Google Calendar implantada;
- `supabase/functions/whatsapp-messages` contém uma implementação mais robusta, porém diferente da função WhatsApp remota.

Antes de consolidar diretórios, baixe ou consulte a função remota e compare o conteúdo. Não substitua produção pela versão experimental apenas porque ela possui mais recursos.

## Testes de Edge Functions

Google Calendar possui `core.test.ts`; a versão experimental WhatsApp da raiz também possui testes. Rode com Deno:

```bash
deno test supabase/functions/google-calendar-sync/core.test.ts
deno test supabase/functions/whatsapp-messages/core.test.ts
deno check supabase/functions/google-calendar-sync/index.ts
deno check app/supabase/functions/whatsapp-messages/index.ts
```

Os testes do WhatsApp da raiz não validam automaticamente a versão simplificada implantada em `app/supabase`; trate isso como dívida técnica.

## Google e Meta

As instruções específicas estão em:

- [Google Agenda](./google-calendar.md)
- [WhatsApp Cloud API](./whatsapp-cloud.md)
- [Operação e plataformas](./operacao-plataformas.md)

## Docker

Não há Dockerfile nem docker-compose. A arquitetura atual não precisa deles para produção: Vercel hospeda o frontend e Supabase hospeda o backend. Para banco local, prefira a stack do Supabase CLI.
