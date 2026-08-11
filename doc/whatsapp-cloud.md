# WhatsApp Cloud API

Atualizado em: 2026-08-11.

## Escopo da primeira versão

A integração atende somente a Estética Schneider e foi preparada para:

- confirmação de agendamento;
- lembrete antes do atendimento.

Pós-atendimento, aniversários, retorno e campanhas permanecem no fluxo manual. O número pessoal do desenvolvedor/proprietário pode ser destinatário verificado de homologação, mas o remetente de produção deve ser um número controlado pela clínica.

## Estado implantado

- Edge Function `whatsapp-messages`, versão remota `4`;
- `verify_jwt=false`, com autorização própria para admin/cron;
- templates/regras configuráveis no painel;
- consentimento de WhatsApp por cliente;
- fila `public.fila_mensagens` com claim transacional e retry;
- função remota corresponde ao código em `app/supabase/functions/whatsapp-messages`;
- fila e logs automáticos estavam vazios no snapshot de 2026-08-11;
- o banco não possui `pg_cron`/`pg_net`: processamento periódico ainda precisa de scheduler externo.

Existe também uma implementação mais robusta em `supabase/functions/whatsapp-messages`, com core/testes/webhook, mas ela não corresponde à versão 4 implantada. Não faça redeploy dessa versão sem planejar a migration e o cron compatíveis.

## Preparação Meta

1. Crie um app em Meta for Developers e adicione WhatsApp.
2. Em homologação, use o número de teste da Meta.
3. Adicione o número pessoal como destinatário permitido.
4. Para produção, associe um número pertencente à clínica.
5. Crie templates `UTILITY` em `pt_BR` e aguarde `APPROVED`.

Sugestões:

### `confirmacao_agendamento_v1`

```text
Olá, {{1}}. Seu agendamento na Estética Schneider está confirmado para {{2}}, às {{3}}. Esta é uma mensagem automática.
```

### `lembrete_agendamento_v1`

```text
Olá, {{1}}. Este é um lembrete do seu agendamento na Estética Schneider em {{2}}, às {{3}}. Esta é uma mensagem automática.
```

A implementação atual monta parâmetros conforme os placeholders nomeados existentes em `modelos_mensagens.texto`, como `{nome}`, `{data}`, `{hora}`, `{servico}` e `{link_avaliacao_google}`. O texto cadastrado no sistema e o template Meta precisam ter a mesma ordem de parâmetros.

## Edge Secrets da versão implantada

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_CRON_SECRET
WHATSAPP_FUNCTION_URL=https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
```

Os três primeiros são necessários para status pronto/envio. `WHATSAPP_CRON_SECRET` e `WHATSAPP_FUNCTION_URL` são necessários ao processamento periódico/status do agendador.

O token temporário do painel Meta expira. Para produção, use System User token com permissões mínimas:

- `whatsapp_business_messaging`;
- `whatsapp_business_management` quando consultar/administrar templates e WABA.

Nunca use `VITE_*` para tokens Meta.

## Consentimento

Campos em `clientes`:

```text
whatsapp_opt_in_status
whatsapp_opt_in_em
whatsapp_opt_in_origem
whatsapp_opt_in_versao
whatsapp_opt_out_em
```

Estados: `pendente`, `aceito`, `recusado`, `revogado`. Somente `aceito` participa do automático. Marketing (`aceita_marketing`) é consentimento separado.

Ao trocar o telefone, é necessário obter novo consentimento para o número novo. Não reutilize automaticamente a autorização do número anterior.

## Templates e regras

`modelos_mensagens` possui:

- `whatsapp_template_name`;
- `whatsapp_template_language`, padrão `pt_BR`.

`regras_mensagens` possui:

- `gatilho`: `agendamento_criado` ou `inicio_agendamento` para os automáticos;
- `quantidade`, `unidade`, `direcao`;
- `canal_padrao='whatsapp_business'`;
- `automacao_iniciada_em`;
- `ativo`.

O painel valida o template aprovado antes de ativar a automação.

## Fila e processamento

`fila_mensagens` usa chave única `(clinica_id, canal, ciclo)` para evitar duplicidade. Status possíveis:

```text
pendente
processando
enviado
erro
cancelado
```

`claim_whatsapp_message_queue` reserva até 25 registros com `FOR UPDATE SKIP LOCKED`. Falhas usam `fail_whatsapp_message_queue`, retry de 300 segundos e máximo de cinco tentativas na seleção atual.

Chamada do scheduler:

```http
POST https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
Content-Type: application/json
x-whatsapp-cron-secret: <WHATSAPP_CRON_SECRET>

{
  "action": "process",
  "clinicId": "<UUID_DA_CLINICA>"
}
```

Em 2026-08-11 não havia job interno. Opções futuras:

- cron externo da Vercel/serviço dedicado;
- Supabase Cron + `pg_net` e Vault;
- scheduler gerenciado separado.

Qualquer opção deve manter o secret fora do SQL em texto claro e registrar monitoramento de HTTP.

## Segurança da função atual

- `status`, `send-test` e `validate-template` exigem JWT de usuário e papel proprietário/administrador;
- `process` exige `x-whatsapp-cron-secret`;
- o código usa service role apenas no servidor;
- CORS remoto está como `*`, por isso a autorização de cada ação é essencial;
- a versão implantada não valida webhook Meta e não mantém estados entregue/lido.

## Homologação

1. Confirmar todos os Secrets.
2. Criar/ativar um modelo e validar `APPROVED`.
3. Enviar teste a destinatário permitido.
4. Criar cliente de teste com consentimento explícito.
5. Criar agendamento futuro e chamar manualmente `process`.
6. Confirmar um único item por `ciclo`.
7. Reagendar antes do processamento e validar horário/payload.
8. Cancelar antes do processamento e confirmar ausência de envio.
9. Revogar consentimento e confirmar bloqueio/cancelamento.
10. Simular erro Meta e validar retry/`ultimo_erro`.

Não homologue com clientes reais enquanto número, token e templates de produção não estiverem aprovados. Não afirme status entregue ou lido com a versão 4; ela registra o aceite retornado pela chamada de envio.

## Evolução recomendada

A implementação experimental da raiz contém ideias úteis — webhook assinado, estados do provedor, CORS por allowlist, reserva mais rígida e testes. A evolução deve ser feita como uma nova migration/versão, preservando compatibilidade com `fila_mensagens`, frontend e scheduler atuais, em vez de sobrescrever produção diretamente.
