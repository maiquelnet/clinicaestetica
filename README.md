# Estética Schneider

Sistema web de atendimento e gestão da Estética Schneider, com site público e área administrativa.

Produção: <https://www.esteticaschneider.com.br>

## Stack e estrutura

- `app/`: SPA em Vite, React e TypeScript.
- `supabase/`: fonte canônica de migrations e Edge Functions.
- `doc/`: documentação técnica, operacional e funcional.
- Vercel: build e hospedagem do frontend.
- Supabase: Auth, PostgreSQL, RLS, RPCs e Edge Functions.

Os módulos e limites do produto estão em [PRODUCT.md](./PRODUCT.md); o mapa técnico está em [doc/arquitetura.md](./doc/arquitetura.md).

## Desenvolvimento local

```powershell
cd app
npm ci
npm run dev
```

Configure `app/.env.local` com URL e chave publicável de um ambiente autorizado. Não há um Supabase de staging confirmado. A Preview da Vercel usa o projeto Supabase de produção e não isola dados/Secrets/Functions; durante a validação Meta, use somente o painel isolado `Sandbox do App Review`, que tem destinatário e remetente de teste restritos. Não use os fluxos comuns de envio em Preview ou desenvolvimento. Valores `VITE_*` vão para o navegador: nunca coloque neles `service_role`, secret keys ou tokens de integração.

## Verificações

```powershell
cd app
npm run typecheck
npm run lint
npm run test
npm run build
```

O que cada comando cobre e quais validações ainda são manuais está em [doc/testes.md](./doc/testes.md).

## Documentação e trabalho assistido

- [Instruções do projeto para agentes](./AGENTS.md)
- [Preparação local e ambientes](./doc/instalacao.md)
- [Arquitetura](./doc/arquitetura.md)
- [Design e acessibilidade](./doc/design.md)
- [Operação das plataformas](./doc/operacao-plataformas.md)
- [Setup de ferramentas e evidências](./doc/setup.md)
- [Índice da documentação](./doc/README.md)

Antes de qualquer operação remota, publicação ou migration, confira [doc/retomada-projeto.md](./doc/retomada-projeto.md) e o estado real do checkout. As instruções do projeto não substituem autorização para acessar ou alterar produção.
