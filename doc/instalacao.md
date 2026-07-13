# Guia de Instalacao

## Estado atual do projeto local

O repositorio contem:

- Aplicacao moderna `Vite + React + TypeScript` em `app/`.
- Site publico estatico na raiz.
- Painel legado em Google Apps Script.
- Servidor local de preview do Apps Script em `apps-script/local-preview-server.js`.
- Banco Supabase remoto ja configurado.

## Pre-requisitos

Para a aplicacao moderna:

- Node.js LTS.
- npm.
- Conta Supabase.
- Projeto Supabase com as migrations aplicadas.

Para trabalhar com Apps Script:

- Conta Google.
- Acesso ao Google Apps Script.
- Permissoes para Google Sheets e Google Calendar.

Para manutencao Supabase via MCP/Codex:

- Variavel `SUPABASE_ACCESS_TOKEN` configurada no ambiente de desenvolvimento.

## Rodando o app React local

Crie `app/.env.local` a partir de `app/.env.example`:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable
```

Depois execute:

```bash
cd app
npm ci
npm run dev
```

Validacao local:

```bash
npm run typecheck
npm run lint
npm run build
```

## Publicando na Vercel

O arquivo `vercel.json` na raiz define:

```text
installCommand = cd app && npm ci
buildCommand = cd app && npm run build
outputDirectory = app/dist
```

Configure as variaveis na Vercel separando os ambientes.

Production:

```text
VITE_APP_ENV=production
VITE_SUPABASE_URL=https://seu-projeto-producao.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable-producao
```

Preview:

```text
VITE_APP_ENV=preview
VITE_SUPABASE_URL=https://seu-projeto-preview-ou-staging.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable-preview
```

Development/local:

```text
VITE_APP_ENV=development
VITE_SUPABASE_URL=https://seu-projeto-dev.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publishable-dev
```

Nao publique `app/.env.local`; ele fica ignorado pelo Git.

## Rodando o site estatico

Abra o arquivo:

```text
index.html
```

Ou sirva a pasta com qualquer servidor estatico.

Exemplo com Node:

```bash
npx serve .
```

## Rodando o preview local do Apps Script

Existe um servidor local:

```text
apps-script/local-preview-server.js
```

Com Node instalado:

```bash
node apps-script/local-preview-server.js
```

Consulte o terminal para a URL local exposta pelo script.

## Publicando o Apps Script legado

Resumo:

1. Crie uma planilha no Google Sheets.
2. Abra `Extensoes > Apps Script`.
3. Copie os arquivos de `apps-script/`.
4. Execute `setup()`.
5. Autorize permissoes.
6. Publique como Web App.

Observacao: esta rota e considerada legado. O alvo principal do sistema agora e o app React com Supabase.

## Configurando Supabase MCP no Codex

Arquivo local:

```text
C:\Users\maiqu\.codex\config.toml
```

Bloco esperado:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=xucttzuthznqwlhushmg"
bearer_token_env_var = "SUPABASE_ACCESS_TOKEN"
enabled = true
```

Variavel:

```powershell
setx SUPABASE_ACCESS_TOKEN "seu_token"
```

Depois de configurar, reabra o Codex.

## Docker

Ainda nao existe Dockerfile nem docker-compose no repositorio.

Recomendacao futura:

- Adicionar Dockerfile apenas se houver necessidade de empacotar o frontend fora da Vercel.
- Adicionar docker-compose apenas se houver backend proprio local.
- Usar Supabase remoto durante desenvolvimento ou Supabase CLI para stack local.
