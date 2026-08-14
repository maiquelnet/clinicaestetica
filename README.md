# Estética Schneider

Sistema web de atendimento e gestão para a Estética Schneider.

Produção: https://www.esteticaschneider.com.br

Backend: Supabase `xucttzuthznqwlhushmg` (`sa-east-1`)

Deploy web: Vercel, branch `main`

## Tecnologia

- Vite 8, React 19 e TypeScript 6;
- React Router, TanStack React Query, React Hook Form e Zod;
- Supabase Auth, PostgreSQL 17, PostgREST, RLS, RPCs e Edge Functions Deno;
- Google Calendar API, Google Places API e Meta WhatsApp Cloud API;
- Vercel para build e hospedagem da SPA.

## Estrutura

- `app/`: frontend moderno e fontes usadas em deploys recentes;
- `supabase/`: única fonte canônica de migrations e Edge Functions;
- `doc/`: documentação técnica, operacional e funcional;
- `vercel.json`: build e rewrite de rotas da Vercel.

## Desenvolvimento

```bash
cd app
npm ci
npm run dev
```

Crie `app/.env.local`:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=https://xucttzuthznqwlhushmg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<CHAVE_PUBLISHABLE_DEFAULT>
```

Nunca use secret key, service role ou tokens de integrações em variáveis `VITE_*`.

## Validação

```bash
cd app
npm run typecheck
npm run lint
npm run build
```

## Vercel

`vercel.json` executa:

- Install: `cd app && npm ci`
- Build: `cd app && npm run build`
- Output: `app/dist`

Variáveis de produção:

```text
VITE_APP_ENV=production
VITE_SUPABASE_URL=https://xucttzuthznqwlhushmg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<CHAVE_PUBLISHABLE_DEFAULT>
```

## Documentação

Comece em [doc/README.md](./doc/README.md) e consulte principalmente [operação, acessos e plataformas](./doc/operacao-plataformas.md).

O runbook registra as URLs, os nomes exatos dos Secrets, as Edge Functions implantadas, as pendências de segurança e o estado real do agendador WhatsApp sem versionar credenciais.
