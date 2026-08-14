# Documentação do Sistema

Projeto: Estética Schneider

Última revisão geral: 2026-08-13.

Esta pasta documenta a aplicação React em produção, o backend Supabase, a implantação Vercel e as integrações Google e WhatsApp. Atualize-a junto com qualquer mudança de arquitetura, banco, variáveis, Edge Functions ou fluxo de usuário.

## Comece por aqui

- [Operação, acessos e plataformas](./operacao-plataformas.md): identificadores, URLs, variáveis, Secrets, deploy, rotação e pendências verificadas.
- [Arquitetura do sistema](./arquitetura.md): componentes, tecnologias e fluxos.
- [Guia de instalação](./instalacao.md): desenvolvimento local e publicação.
- [Histórico de implementação](./historico-implementacao.md): linha do tempo do que foi realizado.

## Referências por assunto

- [Dicionário de dados](./dicionario-de-dados.md)
- [API e Edge Functions](./api.md)
- [Qualidade e testes](./testes.md)
- [Segurança e LGPD](./seguranca-lgpd.md)
- [Manual do usuário](./manual-usuario.md)
- [Google Agenda bidirecional](./google-calendar.md)
- [WhatsApp Cloud API](./whatsapp-cloud.md)
- [Especificações de IA](./ia.md)

## Estado atual resumido

- Frontend moderno em `app/`, construído com Vite, React e TypeScript.
- Produção em `https://www.esteticaschneider.com.br`, com deploy pela Vercel a partir da branch `main`.
- Supabase de produção `estetica_schneider`, ref `xucttzuthznqwlhushmg`, região `sa-east-1`, PostgreSQL 17.
- Autenticação pelo Supabase Auth e isolamento por clínica com RLS/papéis.
- Módulos de clientes, serviços, agenda, fila de espera, equipamentos, tratamentos, financeiro, estoque, mensagens, campanhas, avaliações e configurações.
- Google Agenda bidirecional conectado por OAuth e Edge Function.
- Avaliações públicas do Google Places carregadas por Edge Function.
- WhatsApp Cloud API implantado com consentimento, templates e fila; Supabase Cron está ativo a cada cinco minutos, e os dois templates transacionais aguardam aprovação da Meta.
- Código legado de Google Apps Script permanece apenas como referência histórica e não é a aplicação administrativa principal.

## Regras de documentação

- Não grave valores de secret keys, service role, tokens OAuth, tokens Meta ou Personal Access Tokens.
- Registre nomes exatos de variáveis e o local onde o valor é recuperado.
- Diferencie claramente o que está implantado, o que foi apenas testado e o que está pendente.
- Ao aplicar migration remota, registre o nome/versionamento retornado pelo Supabase.
