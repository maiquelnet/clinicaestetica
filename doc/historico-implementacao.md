# Histórico de Implementação

Atualizado em: 2026-08-13.

## 2026-06

- Projeto Supabase `estetica_schneider` criado/reativado.
- Ref `xucttzuthznqwlhushmg`, região São Paulo.
- MCP Supabase preparado para inspeção/manutenção.

## 2026-07

### Banco e segurança inicial

- dados iniciais descartados para reinício do sistema;
- RLS/policies revisados;
- helpers de autorização movidos para schema `private`;
- execução de funções sensíveis restringida;
- extensão `citext` organizada;
- índices de FKs adicionados;
- regras de mensagens e preços iniciais criados.

### Aplicação React

- SPA Vite + React + TypeScript implementada em `app/`;
- Supabase Auth, sessão persistida, perfil e vínculo por clínica;
- rotas públicas/protegidas e layout administrativo;
- módulos de dashboard, clientes, serviços, agenda e mensagens;
- módulos administrativos de fila de espera, equipamentos, tratamento, financeiro, estoque, fornecedores, campanhas, disparos, satisfação, parâmetros e usuários;
- RPCs transacionais para operações críticas;
- Vercel configurada por `vercel.json` com build a partir da raiz.

### Google Agenda

- Edge Function unificada `google-calendar-sync`;
- OAuth por usuário com associação à clínica;
- tokens criptografados;
- sincronização bidirecional de agendamentos;
- eventos externos importados como bloqueios;
- sync token, webhook e renovação de canal;
- testes unitários de conexão, envio, importação e cancelamento;
- função publicada com `verify_jwt=false` e autenticação própria.

## 2026-08

### Produção web

- domínio oficial consolidado em `https://www.esteticaschneider.com.br`;
- alias Vercel conhecido `https://clinicaestetica-softolive.vercel.app`;
- branch `main` configurada como fonte de produção;
- cadastro público de clientes e interesses em serviços;
- landing page atualizada e simplificada;
- integração Google Places para avaliações públicas.

### Google Reviews

- campos `google_place_id` e `link_google_avaliacao` em clínicas;
- Edge Function `google-reviews` publicada, versão remota 2;
- landing page carrega nota/avaliações e mantém fallback de conteúdo;
- segredo `GOOGLE_PLACES_API_KEY` mantido no Supabase.

### WhatsApp Cloud API

- consentimento específico separado de marketing;
- campos de opt-in/opt-out adicionados a clientes;
- nomes/idioma dos templates Meta adicionados a modelos;
- ativação automática adicionada a regras;
- painel de configuração/status/teste e validação de template;
- fila `fila_mensagens` e RPCs de claim/complete/fail;
- Edge Function `whatsapp-messages` versão 4 publicada com `verify_jwt=false`;
- Meta Graph, número remetente, WABA e cron configuráveis por Secrets;
- versão implantada consolidada em `supabase/functions/whatsapp-messages`.

### Consolidação estrutural de 2026-08-13

- projeto NestJS, site estático, builds, dependências e documentação antigos removidos da pasta externa;
- conteúdo do repositório Git promovido para a raiz `sistema_estetica`;
- `github_repo/` eliminado;
- Apps Script, páginas de prévia e assets estáticos legados removidos;
- `app/supabase/` consolidado em `supabase/`;
- versão WhatsApp implantada definida como única fonte canônica;
- implementação WhatsApp experimental e testes incompatíveis removidos para impedir uso acidental;
- Google Reviews movido para `supabase/functions/google-reviews`;
- migrations da fila WhatsApp movidas para `supabase/migrations`.

### Configuração operacional do WhatsApp em 2026-08-12/13

- teste de envio pelo número de homologação da Meta concluído com recebimento no destinatário permitido;
- IDs do número remetente e da WABA cadastrados como Edge Function Secrets;
- token temporário substituído por token de System User sem expiração configurada;
- permissões `whatsapp_business_messaging` e `whatsapp_business_management` concedidas;
- WABA `Estética Schneider` e app atribuídos ao System User;
- `WHATSAPP_GRAPH_VERSION=v23.0`, URL da função e segredo do cron cadastrados;
- Supabase Vault, `pg_cron` e `pg_net` habilitados;
- job `process-whatsapp-messages` criado para execução a cada cinco minutos;
- chamada do job validada com HTTP `200` e painel confirmado como `Agendador ativo`;
- templates `confirmacao_agendamento_v1` e `lembrete_agendamento_v1` criados como `UTILITY`/`pt_BR`, ainda em análise pela Meta;
- verificação do portfólio do desenvolvedor pausada até existir documentação empresarial apropriada.

### Documentação e auditoria de 2026-08-11

- tecnologias, rotas, plataformas e variáveis consolidadas;
- Supabase confirmado saudável, PostgreSQL 17, 45 tabelas públicas e três Edge Functions ativas;
- uma conexão Google Calendar confirmada;
- migrations remotas WhatsApp registradas;
- ausência inicial de `pg_cron`/`pg_net` confirmada; ambos foram instalados e o scheduler ativado em 2026-08-13;
- Security Advisor apontou RLS desabilitado em `integracoes_google`; em 2026-08-13 o RLS foi habilitado, os grants públicos foram revogados e o erro crítico desapareceu;
- auditoria confirmou `integracoes_google` vazia e sem consumidores no banco ou no código; a tabela foi removida sem `CASCADE` em 2026-08-14;
- código remoto WhatsApp foi posteriormente consolidado em `supabase/`.

## Pendências abertas

1. Reautenticar GitHub CLI e enviar a atualização documental/código remoto.
2. Monitorar o scheduler WhatsApp e alertar sobre falhas HTTP recorrentes.
3. Criar suite dedicada para a versão WhatsApp implantada e canônica.
4. Fixar `search_path` das RPCs indicadas pelo Advisor.
5. Revisar FKs sem índice e policies duplicadas.
6. Criar ambiente Supabase de staging para Preview Deployments.
7. Concluir aprovação dos templates e homologação funcional com cliente/agendamento de teste.
8. Substituir o número de teste por número controlado pela clínica antes da produção.
9. Formalizar/verificar o portfólio do desenvolvedor e implementar Embedded Signup antes de vender como plataforma multiempresa.
