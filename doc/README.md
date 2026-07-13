# Documentacao do Sistema

Projeto: Thais Schneider Estetica

Status da documentacao: inicial, criada em 2026-07-03.

Esta pasta concentra a documentacao tecnica, funcional, de seguranca e de IA do sistema. A documentacao deve ser atualizada sempre que houver mudanca de banco, arquitetura, fluxos de usuario, integracoes ou prompts.

## Indice

- [Arquitetura do Sistema](./arquitetura.md)
- [Dicionario de Dados](./dicionario-de-dados.md)
- [Documentacao da API](./api.md)
- [Guia de Instalacao](./instalacao.md)
- [Especificacoes da IA](./ia.md)
- [Qualidade e Casos de Teste](./testes.md)
- [Seguranca e LGPD](./seguranca-lgpd.md)
- [Manual do Usuario](./manual-usuario.md)
- [Historico de Implementacao](./historico-implementacao.md)

## Estado atual resumido

O repositorio local contem:

- Site publico estatico: `index.html`, `styles.css`, `script.js`, `assets/hero-estetica.avif`, `assets/hero-estetica.webp` e fallback `assets/hero-estetica.png`.
- Pagina de admin que embute o Apps Script legado: `admin.html`.
- Painel Apps Script legado: `apps-script/Code.gs`, `apps-script/Index.html`, `apps-script/Client.html`, `apps-script/Styles.html`.
- Banco Supabase ja modelado, com 37 tabelas publicas, RLS habilitado e dados zerados.

O sistema novo ainda nao possui aplicacao frontend moderna com Supabase no repositorio. A recomendacao e criar uma app `Vite + React + TypeScript + Supabase` para substituir gradualmente o painel Apps Script.

## Decisoes atuais

- Os dados das tabelas `public` do Supabase foram descartados porque o sistema esta sendo criado do zero.
- A estrutura do banco foi preservada.
- RLS, policies, funcoes e indices foram mantidos e corrigidos.
- Nao ha IA aplicacional implementada ainda.
- Nao ha API propria implementada no repositorio; a API atual prevista e a API gerada pelo Supabase/PostgREST.
