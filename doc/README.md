# Documentação do Sistema

Projeto: Estética Schneider

Última revisão do índice e do estado resumido: 2026-10-19. Os fatos remotos têm data e fonte em cada seção; nem todo serviço foi revalidado.

Esta pasta documenta a aplicação React em produção, o backend Supabase, a implantação Vercel e as integrações Google e WhatsApp. Atualize-a junto com qualquer mudança de arquitetura, banco, variáveis, Edge Functions ou fluxo de usuário.

## Comece por aqui

- [Retomada do projeto](./retomada-projeto.md): checklist completo para reiniciar o desenvolvimento, recuperar configurações e continuar a publicação Meta com segurança.
- [Operação, acessos e plataformas](./operacao-plataformas.md): identificadores, URLs, variáveis, Secrets, deploy, rotação e pendências verificadas.
- [Arquitetura do sistema](./arquitetura.md): componentes, tecnologias e fluxos.
- [Guia de instalação](./instalacao.md): desenvolvimento local e publicação.
- [Produto](../PRODUCT.md): objetivo, usuários e limites do sistema atual.
- [Design e acessibilidade](./design.md): tokens observados e verificações ainda pendentes.
- [Setup de ferramentas e evidências](./setup.md): configuração do Codex, matriz do toolkit e checks desta revisão.
- [Histórico de implementação](./historico-implementacao.md): linha do tempo do que foi realizado.

## Referências por assunto

- [Dicionário de dados](./dicionario-de-dados.md)
- [API e Edge Functions](./api.md)
- [Qualidade e testes](./testes.md)
- [Segurança e LGPD](./seguranca-lgpd.md)
- [Manual do usuário](./manual-usuario.md)
- [Google Agenda bidirecional](./google-calendar.md)
- [WhatsApp Cloud API](./whatsapp-cloud.md)
- [Guia Meta: WhatsApp e análise do app](./meta-whatsapp-app-review.md)
- [WhatsApp Business + YCloud / Coexistence — legado](./whatsapp-ycloud-coexistence.md)
- [Especificações de IA](./ia.md)

## Estado atual resumido

- Frontend moderno em `app/`, construído com Vite, React e TypeScript.
- Produção em `https://www.esteticaschneider.com.br`, com deploy pela Vercel a partir da branch `main`.
- Supabase de produção `estetica_schneider`, ref `xucttzuthznqwlhushmg`, região `sa-east-1`, PostgreSQL 17.
- Autenticação pelo Supabase Auth e isolamento por clínica com RLS/papéis.
- Módulos de clientes, serviços, agenda, fila de espera, equipamentos, tratamentos, financeiro, estoque, mensagens, campanhas, avaliações e configurações.
- Planos de tratamento com cronograma recorrente e campanhas segmentadas por interesses em serviços.
- Google Agenda bidirecional conectado por OAuth e Edge Function.
- Avaliações públicas do Google Places carregadas por Edge Function.
- Há correções locais para roteamento Meta por clínica, cancelamento de agendamento e reconciliação; webhook e fila remotos não foram substituídos. `whatsapp-review-test` v4 foi publicado em 2026-10-19 com validação estrita do vínculo, do template, do destinatário e da auditoria. Secrets de revisão não foram alterados nem validados, então o envio ainda está bloqueado.
- Código legado de Google Apps Script permanece apenas como referência histórica e não é a aplicação administrativa principal.

O único projeto confirmado neste checkout é o Supabase de produção `xucttzuthznqwlhushmg`; não há staging isolado confirmado. A Preview usa o projeto compartilhado e os testes de App Review gravam auditoria no banco de produção, ainda que usem credenciais/número de teste. Não grave nem envie por outros fluxos em Preview.

## Regras de documentação

- Não grave valores de secret keys, service role, tokens OAuth, tokens Meta ou Personal Access Tokens.
- Registre nomes exatos de variáveis e o local onde o valor é recuperado.
- Diferencie claramente o que está implantado, o que foi apenas testado e o que está pendente.
- Ao aplicar migration remota, registre o nome/versionamento retornado pelo Supabase.
