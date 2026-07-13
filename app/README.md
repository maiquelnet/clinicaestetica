# App React

Painel administrativo em `Vite + React + TypeScript`.

## Ambientes

O app centraliza leitura de variaveis em `src/lib/env.ts`.

Arquivos de exemplo:

- `.env.development.example`
- `.env.preview.example`
- `.env.production.example`

Crie `app/.env.local` para desenvolvimento local. Esse arquivo e ignorado pelo Git.

Variaveis obrigatorias:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable
```

Valores aceitos para `VITE_APP_ENV`:

- `development`
- `preview`
- `production`

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Vercel

O deploy deve ser feito a partir da raiz do repositorio. O arquivo `../vercel.json` define:

- Install command: `cd app && npm ci`
- Build command: `cd app && npm run build`
- Output directory: `app/dist`

Configure `VITE_APP_ENV`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nos ambientes Production, Preview e Development da Vercel.
