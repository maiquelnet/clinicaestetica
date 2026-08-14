# WhatsApp Cloud API

Atualizado em: 2026-08-13.

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
- função remota corresponde ao código em `supabase/functions/whatsapp-messages`;
- Supabase Vault instalado e usado para proteger a URL e o segredo do agendador;
- extensões `pg_cron` e `pg_net` instaladas;
- job `process-whatsapp-messages` ativo a cada cinco minutos;
- chamada do job à Edge Function validada com HTTP `200` em 2026-08-13;
- painel do sistema confirmou `Configurado` e `Agendador ativo`;
- fila, automações e falhas estavam zeradas no último teste, antes da ativação dos templates.

Desde 2026-08-13, a implementação experimental anterior foi removida. Existe uma única fonte canônica, correspondente à versão remota baseada em fila.

## Configuração Meta realizada em 2026-08-12/13

- App `Thais Schneider Estética` configurado com o caso de uso do WhatsApp;
- envio pelo número de teste da Meta concluído e recebido pelo destinatário permitido;
- número remetente de homologação e WABA identificados;
- System User criado no portfólio empresarial do desenvolvedor;
- WABA `Estética Schneider` atribuída ao System User com permissões mínimas de mensagens e visualização de modelos/número;
- app atribuído ao System User;
- token sem expiração gerado com `whatsapp_business_messaging` e `whatsapp_business_management`;
- `WHATSAPP_ACCESS_TOKEN` do Supabase substituído pelo token do System User;
- nenhum token ou segredo deve ser registrado neste repositório.

O portfólio empresarial atualmente aberto na Meta pertence ao desenvolvedor, não à clínica. A verificação desse portfólio foi pausada porque não há empresa/MEI formalizado para comprovação. Isso não impede a homologação individual da clínica, mas deve ser resolvido antes de apresentar a aplicação como Tech Provider.

## Preparação Meta para produção

1. Crie um app em Meta for Developers e adicione WhatsApp.
2. Em homologação, use o número de teste da Meta.
3. Adicione o número pessoal como destinatário permitido.
4. Para produção, associe um número pertencente à clínica.
5. Crie templates `UTILITY` em `pt_BR` e aguarde `APPROVED`.
6. Substitua o número de teste por um número controlado pela clínica.
7. Confirme propriedade, cobrança, nome de exibição e situação da WABA antes de atender clientes reais.

Sugestões:

### `confirmacao_agendamento_v1`

```text
Olá, {{1}}! Seu horário na Estética Thais Schneider está confirmado para {{2}} às {{3}}, para {{4}}. Qualquer ajuste, me avise por aqui.
```

### `lembrete_agendamento_v1`

```text
Olá, {{1}}! Passando para lembrar do seu horário na Estética Thais Schneider: {{2}} às {{3}}, para {{4}}. Te espero!
```

Os dois templates foram enviados à Meta como `UTILITY`/`pt_BR` e permaneciam `Em análise` em 2026-08-13. Não editar nem recriar durante a análise, pois uma alteração inicia uma nova revisão.

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

O token temporário do painel Meta foi substituído em 2026-08-13 por um token de System User sem expiração configurada. Ele continua revogável e deve ser rotacionado após suspeita de vazamento ou mudança de responsáveis. Permissões concedidas:

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

Desde 2026-08-13, o processamento usa Supabase Cron com `pg_net` e Vault:

- job: `process-whatsapp-messages`;
- agenda: `*/5 * * * *` (a cada cinco minutos);
- método: `POST`;
- timeout: 30 segundos;
- URL lida do secret `whatsapp_function_url` no Vault;
- header `x-whatsapp-cron-secret` lido do secret `whatsapp_cron_secret` no Vault;
- corpo contém `action=process` e o UUID da clínica.

O retorno `{"enqueued":0,"processed":0,"sent":0,"failed":0,"skipped":0}` com HTTP `200` confirmou o funcionamento sem itens elegíveis. Ocorreram respostas transitórias `400` com `JWT issued at future`; uma execução posterior normalizou sem mudança de configuração. Monitorar recorrência antes de tratar como incidente.

## Segurança da função atual

- `status`, `send-test` e `validate-template` exigem JWT de usuário e papel proprietário/administrador;
- `process` exige `x-whatsapp-cron-secret`;
- o código usa service role apenas no servidor;
- CORS remoto está como `*`, por isso a autorização de cada ação é essencial;
- a versão implantada não valida webhook Meta e não mantém estados entregue/lido.

## Homologação

1. Confirmar todos os Secrets. Concluído em 2026-08-13.
2. Aguardar os dois modelos passarem de `Em análise` para `APPROVED`.
3. Enviar teste a destinatário permitido.
4. Criar cliente de teste com consentimento explícito.
5. Criar agendamento futuro e chamar manualmente `process`.
6. Confirmar um único item por `ciclo`.
7. Reagendar antes do processamento e validar horário/payload.
8. Cancelar antes do processamento e confirmar ausência de envio.
9. Revogar consentimento e confirmar bloqueio/cancelamento.
10. Simular erro Meta e validar retry/`ultimo_erro`.

Não homologue com clientes reais enquanto número, token e templates de produção não estiverem aprovados. Não afirme status entregue ou lido com a versão 4; ela registra o aceite retornado pela chamada de envio.

## Comercialização para outras clínicas

É possível repetir a configuração manual para cada cliente, mantendo WABA, número, templates, consentimentos, IDs e tokens isolados por empresa. Nenhuma credencial da Estética Schneider pode ser reutilizada para outra clínica.

Para escalar como produto, o caminho recomendado é formalizar a empresa desenvolvedora, verificar seu portfólio empresarial, candidatar-se como Tech Provider e implementar o Embedded Signup. Cada cliente deve continuar proprietário dos próprios ativos e autorizar somente as permissões necessárias. A arquitetura atual usa Secrets globais da Edge Function e atende uma única clínica; ela precisa ser redesenhada para credenciais segregadas por tenant antes de suportar múltiplos clientes no mesmo projeto.

## Evolução recomendada

Webhook assinado, estados do provedor, CORS por allowlist, reservas mais rígidas e testes devem ser implementados incrementalmente sobre a versão canônica, com novas migrations e preservando compatibilidade com `fila_mensagens`, frontend e scheduler atuais.
