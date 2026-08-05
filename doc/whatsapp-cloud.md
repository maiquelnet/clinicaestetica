# WhatsApp Cloud API

## Escopo da primeira versao

A integracao atende somente a Estetica Schneider e automatiza dois eventos:

- confirmacao de um agendamento novo;
- lembrete antes do horario do agendamento.

Pos-atendimento, aniversarios, retorno e campanhas continuam no fluxo manual. O numero pessoal pode ser usado como destinatario verificado durante os testes, mas nao deve ser adotado como remetente de producao. Para producao, prefira um numero pertencente e dedicado a clinica.

## Preparacao na Meta

1. Crie um app em Meta for Developers e adicione o produto WhatsApp.
2. Durante a homologacao, use o numero de teste fornecido pela Meta.
3. Cadastre o numero pessoal como destinatario verificado de teste.
4. Crie e envie para aprovacao dois modelos da categoria `UTILITY`, idioma `pt_BR`:

### `confirmacao_agendamento_v1`

```text
Ola, {{1}}. Seu agendamento na Estetica Schneider esta confirmado para {{2}}, as {{3}}. Esta e uma mensagem automatica.
```

### `lembrete_agendamento_v1`

```text
Ola, {{1}}. Este e um lembrete do seu agendamento na Estetica Schneider em {{2}}, as {{3}}. Esta e uma mensagem automatica.
```

Os tres parametros sao nome, data e horario. O procedimento nao e enviado para reduzir a exposicao de informacao sensivel.

## Secrets da Edge Function

Em Supabase, abra **Edge Functions > Secrets** e configure:

```text
WHATSAPP_SYSTEM_USER_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_WABA_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN
META_APP_SECRET
WHATSAPP_CRON_SECRET
META_GRAPH_API_VERSION=v25.0
```

O token temporario do painel da Meta serve para homologacao e expira. Antes da producao, substitua-o por um token de System User com privilegio minimo. Nunca use variaveis `VITE_*` para esses valores.

Permissoes minimas do token:

- `whatsapp_business_messaging` para enviar;
- `whatsapp_business_management` para inscrever o app na conta WhatsApp Business.

## Webhook

Configure no produto WhatsApp da Meta:

```text
Callback URL: https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
Verify token: o mesmo valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
Campo assinado: messages
```

Inscreva o app explicitamente na WABA uma vez, usando o ID da conta WhatsApp Business e o token com `whatsapp_business_management`:

```http
POST https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps
Authorization: Bearer <SYSTEM_USER_ACCESS_TOKEN>
```

A funcao valida `X-Hub-Signature-256` com `META_APP_SECRET` antes de aceitar eventos. Os estados `sent`, `delivered`, `read` e `failed` sao armazenados usando o horario informado pela Meta.

Respostas recebidas dos clientes ainda nao formam uma caixa de entrada nesta versao; o webhook processa apenas o status dos envios.

## Ativar o agendador

A migracao cria um Cron que executa a fila a cada minuto. Ele permanece inerte enquanto estes dois valores nao existirem no Supabase Vault:

```sql
select vault.create_secret(
  'https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages',
  'whatsapp_function_url'
);

select vault.create_secret(
  '<MESMO_VALOR_DE_WHATSAPP_CRON_SECRET>',
  'whatsapp_cron_secret'
);
```

Os nomes no Vault sao unicos. Se eles ja existirem, atualize-os pela tela do Vault ou com `vault.update_secret`, em vez de criar outra copia.

## Ativacao no sistema

1. Em **Configuracoes > Parametros Gerais > WhatsApp Cloud API**, atualize o status.
2. Envie `hello_world` para um destinatario verificado.
3. Em cada cliente, marque o consentimento somente depois de obter autorizacao explicita para confirmacoes e lembretes.
4. Em **Mensagens**, abra os modelos de confirmacao e lembrete, informe o nome aprovado na Meta e escolha **Automatico pela Meta Cloud API**.

O momento de ativacao vira a data de corte. Confirmacoes historicas nao sao enviadas. Lembretes sao criados somente para agendamentos futuros e clientes com consentimento ativo.

## Garantias operacionais

- A fila e processada no servidor mesmo com o painel fechado.
- Chaves de deduplicacao e reserva antes do envio evitam repeticao pelo Cron.
- Um timeout depois da chamada a Meta nao e reenviado automaticamente; fica para revisao manual.
- Reagendamento, troca de cliente, cancelamento, revogacao de consentimento ou desativacao da regra cancelam o job anterior.
- O webhook e persistido mesmo se chegar antes de o ID da mensagem ser associado ao log.
- O navegador pode consultar a fila, mas nao criar ou alterar envios do canal automatico.

## Roteiro de homologacao

1. **Conexao:** confirme que a tela mostra todos os Secrets configurados.
2. **Envio:** use o botao de teste e confirme o recebimento de `hello_world`.
3. **Confirmacao:** crie uma cliente de teste com consentimento e um agendamento futuro; confira um unico envio.
4. **Lembrete:** use um agendamento dentro da janela da regra e aguarde o Cron.
5. **Reagendamento:** altere o horario antes do envio e confira que apenas o horario novo permanece na fila.
6. **Cancelamento:** cancele antes do envio e confirme que nenhuma mensagem e disparada.
7. **Opt-out:** revogue o consentimento e confirme que os jobs pendentes ficam dispensados.
8. **Webhook:** confira no log a progressao para enviado, entregue e lido.

Nao execute a homologacao com clientes reais enquanto o app Meta, os modelos e o numero de producao nao estiverem aprovados.
