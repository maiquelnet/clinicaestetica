# Estética Schneider

## Problema e objetivo

O sistema reúne a presença pública da Estética Schneider e ferramentas administrativas para organizar o relacionamento com clientes, serviços, agenda e operação da clínica.

## Público e papéis

- Clientes e visitantes usam o site público para conhecer a clínica e iniciar cadastro/interesse.
- Profissionais e equipe autenticados usam a área administrativa; os acessos variam por vínculo à clínica e papel configurado.

## Fluxos implementados segundo o repositório

1. Consultar a landing page, serviços e informações públicas.
2. Cadastrar dados e interesses pelo formulário público.
3. Entrar no painel autenticado e administrar clientes, serviços, agenda, disponibilidade, tratamentos, financeiro, estoque e configurações.
4. Usar os módulos de mensagens, campanhas, avaliações e integração com Google conforme as permissões e configurações presentes.

## Escopo atual

O produto documentado é o sistema da Estética Schneider. O repositório contém uma aplicação React/Vite, backend Supabase e hospedagem web na Vercel. Há código para integrações Google e WhatsApp; a disponibilidade real de cada integração depende de configuração, permissões e estado externo, que não são inferidos apenas pelo código.

## Fora do escopo confirmado

- Converter esta instalação em SaaS multi-tenant para clientes independentes.
- Criar automaticamente novas contas, portfólios ou WABAs da Meta para outras empresas.
- Publicar campanhas em Instagram/Meta Ads ou mudar a operação da clínica.
- Tratar como concluídas aprovações externas da Meta, deploys ou validações remotas que não foram verificadas.

## Restrições e decisões técnicas

- Frontend: React, Vite e TypeScript; estado remoto com TanStack Query; formulários com React Hook Form/Zod.
- Backend: Supabase Auth, PostgreSQL, RLS, RPCs e Edge Functions Deno.
- Deploy web: Vercel; Node/npm e `app/package-lock.json` são a base do frontend.
- Preservar essa stack. Não introduzir uma migração de arquitetura ou serviço por efeito de tarefas de manutenção.
- Ambientes locais/Preview não devem escrever no Supabase de produção. Um projeto Supabase separado para staging ainda precisa ser confirmado.

## Critérios de aceitação do produto

- A área pública carrega sem sessão e expõe apenas dados/cadastros públicos previstos.
- A área administrativa exige autenticação e respeita os vínculos e autorizações da clínica.
- A documentação distingue comportamento implementado de integrações/configurações pendentes.

## Manutenção

Atualize este arquivo se objetivo, papéis ou escopo do produto mudar. Arquitetura, setup e funcionamento externo ficam documentados em `doc/`.
