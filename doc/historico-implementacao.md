# Histórico de Implementação

Atualizado em: 2026-09-07.

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

### Evolução da aplicação em 2026-08-14/21

- telas de mensagens separadas entre controle operacional e cadastro de modelos/regras;
- planos de tratamento passaram a gerar cronograma recorrente na Agenda, com frequências diária, semanal, mensal e intervalo personalizado;
- cronograma permite considerar sábado/domingo, preservar passado e ajustes manuais e controlar reagendamentos/cancelamentos;
- telas administrativas de serviços, fila de espera, equipamentos, financeiro, estoque e fornecedores foram padronizadas, incluindo navegação mobile;
- landing page de conversão foi reestruturada, com logo, CTAs contextuais para WhatsApp e analytics opcional;
- interesses de serviços de clientes passaram a ter relação normalizada em `clientes_servicos_interesse`, mantendo o array legado por compatibilidade;
- campanhas passaram a segmentar por interesse em serviços, com alvos em `campanhas_servicos_alvo` e previsão de público;
- migrations locais adicionadas: `20260815024033_treatment_plan_scheduling`, `20260815031136_treatment_plan_reference_indexes`, `20260815031322_fix_treatment_plan_rpc_coalesce`, `20260822024932_client_service_campaign_segmentation` e `20260822025101_add_interest_relation_fk_indexes`.

### Documentação e auditoria de 2026-08-11

- tecnologias, rotas, plataformas e variáveis consolidadas;
- Supabase confirmado saudável, PostgreSQL 17, 45 tabelas públicas e três Edge Functions ativas;
- uma conexão Google Calendar confirmada;
- migrations remotas WhatsApp registradas;
- ausência inicial de `pg_cron`/`pg_net` confirmada; ambos foram instalados e o scheduler ativado em 2026-08-13;
- Security Advisor apontou RLS desabilitado em `integracoes_google`; em 2026-08-13 o RLS foi habilitado, os grants públicos foram revogados e o erro crítico desapareceu;
- auditoria confirmou `integracoes_google` vazia e sem consumidores no banco ou no código; a tabela foi removida sem `CASCADE` em 2026-08-14;
- código remoto WhatsApp foi posteriormente consolidado em `supabase/`.

## 2026-09

### Disponibilidade comercial

- disponibilidade semanal e exceções pontuais por data adicionadas em `/configuracoes/horarios`;
- exceções modeladas em `disponibilidade_excecoes` e `disponibilidade_excecao_periodos`, com suporte a múltiplos intervalos, dia inteiro sem atendimento e observação;
- RPCs transacionais com validação de clínica, profissional, permissões e sobreposição;
- RLS/grants aplicados e migration de exceções confirmada no projeto Supabase `xucttzuthznqwlhushmg`;
- capacidade comercial canônica passou a unir disponibilidade, exceções, bloqueios e atendimentos válidos no fuso da clínica;
- Radar server-side consolidado com horizonte de sete dias a partir de amanhã e regra de atenção abaixo de 65%/120 minutos;
- Home e Secretária passaram a consumir as RPCs sem alterar o layout existente nem duplicar regra no frontend;
- motor de oportunidades V1 adicionado para lista de espera ativa e retorno devido, somente leitura e sem envio, reserva, agendamento, IA ou persistência;
- migration remota `20260907183341_canonical_commercial_capacity_radar_opportunities` confirmada no projeto Supabase `xucttzuthznqwlhushmg`;
- testes de contrato cobrem capacidade, Radar, compatibilidade de janelas, retorno, cancelamento, prioridade e ausência de capacidade.

### Secretária assistida V1

- plano de ação persistido somente por ação explícita da equipe, com snapshot da data, clínica, profissional e Radar;
- tabelas `secretaria_planos_acao`, `secretaria_plano_itens` e `secretaria_atividades` com RLS, grants mínimos e estados simples;
- seleção determinística limitada a cinco clientes únicos, seguida de revisão humana mobile;
- RPCs de preparação, consulta, revalidação, atualização, remoção, adição, aprovação e cancelamento;
- aprovação revalida capacidade, Radar e oportunidades e não envia mensagens, cria agendamentos, reserva horários ou altera a fila;
- auditoria dos eventos de plano/candidato implementada sem criar um log genérico de mensagens;
- migration local `20260907210000_assisted_secretary_action_plans` criada e migration remota `20260907200519_assisted_secretary_action_plans` confirmada; smoke test transacional validado.

### Integração direta Meta — preparação local

- transporte de saída da fila ajustado para a Meta WhatsApp Cloud API oficial;
- validação de templates feita pela WABA e WAMID registrado em fila, logs e testes;
- Edge Function `meta-whatsapp-webhook` adicionada com verificação de desafio, assinatura e WABA/número;
- migration local `20260912090000_meta_whatsapp_cloud_direct` adicionada para estados `sent`, `delivered`, `read` e `failed`;
- publicação da migration, da Edge Function e dos Secrets permanece pendente para homologação controlada.

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
