# Guia de Instalacao

## Estado atual do projeto local

O repositorio local ainda nao possui ambiente Node/React, Dockerfile ou `package.json`.

O que existe hoje:

- Site estatico que pode ser aberto diretamente no navegador.
- Painel legado em Google Apps Script.
- Servidor local de preview do Apps Script em `apps-script/local-preview-server.js`.
- Banco Supabase remoto ja configurado.

## Pre-requisitos

Para visualizar o site estatico:

- Navegador moderno.

Para trabalhar com Apps Script:

- Conta Google.
- Acesso ao Google Apps Script.
- Permissoes para Google Sheets e Google Calendar.

Para trabalhar com Supabase:

- Conta Supabase.
- Projeto `estetica_schneider`.
- Variavel `SUPABASE_ACCESS_TOKEN` configurada no ambiente de desenvolvimento para MCP/manutencao.

Para futura aplicacao moderna:

- Node.js LTS.
- npm, pnpm ou yarn.
- Supabase CLI recomendado.

## Rodando o site estatico

Abra o arquivo:

```text
index.html
```

Ou sirva a pasta com qualquer servidor estatico.

Exemplo com Node, quando disponivel:

```bash
npx serve .
```

## Rodando o preview local do Apps Script

Existe um servidor local:

```text
apps-script/local-preview-server.js
```

Como nao ha `package.json`, a execucao depende de Node instalado globalmente.

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

Observacao: esta rota e considerada legado. O alvo e migrar para Supabase.

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

- Criar app `Vite + React + TypeScript`.
- Adicionar Dockerfile para build estatico.
- Adicionar docker-compose apenas se houver backend proprio local.
- Usar Supabase remoto durante desenvolvimento ou Supabase CLI para stack local.

## Proximo setup recomendado

Criar estrutura:

```text
app/
  package.json
  src/
    main.tsx
    lib/supabase.ts
    pages/
    components/
```

Dependencias previstas:

```bash
npm create vite@latest app -- --template react-ts
cd app
npm install @supabase/supabase-js
```

