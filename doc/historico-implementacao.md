# Histórico de Implementação

Atualizado em: 2026-08-11.

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
- versão implantada preservada localmente em `app/supabase` para ser commitada.

### Implementação WhatsApp experimental

Uma versão mais robusta foi criada em `supabase/functions/whatsapp-messages` com webhook, status do provedor, CORS por allowlist, reservas e testes. Ela foi integrada ao Git, mas não é a mesma versão remota atualmente ativa. A produção posterior adotou uma fila simplificada. Futuras evoluções devem reconciliar esses dois desenhos antes do deploy.

### Documentação e auditoria de 2026-08-11

- tecnologias, rotas, plataformas e variáveis consolidadas;
- Supabase confirmado saudável, PostgreSQL 17, 45 tabelas públicas e três Edge Functions ativas;
- uma conexão Google Calendar confirmada;
- migrations remotas WhatsApp registradas;
- ausência de `pg_cron`/`pg_net` confirmada: scheduler WhatsApp ainda pendente;
- Security Advisor apontou RLS desabilitado em `integracoes_google` e outros avisos documentados;
- código remoto WhatsApp não commitado identificado em `app/supabase`.

## Pendências abertas

1. Reautenticar GitHub CLI e enviar a atualização documental/código remoto.
2. Definir scheduler real do WhatsApp e monitoramento.
3. Consolidar `supabase/` e `app/supabase/` sem substituir a função remota errada.
4. Corrigir/remover `integracoes_google` após confirmar que o legado não depende dela.
5. Fixar `search_path` das RPCs indicadas pelo Advisor.
6. Revisar FKs sem índice e policies duplicadas.
7. Criar suite dedicada para a versão WhatsApp implantada.
8. Criar ambiente Supabase de staging para Preview Deployments.
