# clinicaestetica

Sistema de controle de agendamento e relacionamento com cliente voltado para clinicas de estetica e salao de beleza.

## Deploy na Vercel

O repositorio esta configurado para deploy pela Vercel usando o arquivo `vercel.json` na raiz.

Configuracao esperada:

- Framework: Vite
- Install command: `cd app && npm ci`
- Build command: `cd app && npm run build`
- Output directory: `app/dist`

Variaveis obrigatorias por ambiente:

```text
VITE_APP_ENV=production
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable
```

Use `VITE_APP_ENV=preview` para Preview Deployments e `VITE_APP_ENV=development` no ambiente local.
