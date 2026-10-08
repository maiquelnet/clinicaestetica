# WhatsApp Business + YCloud — Fase 6.5

Atualizado em: 2026-09-07.

## Resultado da auditoria

A implementação anterior usava diretamente a Meta Graph API na Edge Function `whatsapp-messages`. A fila `public.fila_mensagens`, o claim transacional, os retries e o job `process-whatsapp-messages` foram preservados. A Fase 6.5 troca somente o transporte de saída para YCloud e mantém as regras existentes de confirmação/lembrete.

No momento da implementação, o projeto ainda não tinha evidência de onboarding YCloud/coexistência concluído. O cron remoto estava ativo a cada cinco minutos, mas os segredos consultáveis do Vault eram apenas `whatsapp_function_url` e `whatsapp_cron_secret`. Os segredos Meta antigos não foram removidos ou revogados.

## Arquitetura implementada

```text
regras_mensagens + modelos_mensagens
              ↓
       fila_mensagens  ← uma única fila, com idempotência por ciclo
              ↓ claim_whatsapp_message_queue
       whatsapp-messages (cron/worker)
              ↓ X-API-Key, server-side
       POST https://api.ycloud.com/v2/whatsapp/messages
              ↓
       WhatsApp Business App + Coexistence

YCloud webhook → ycloud-webhook → record_ycloud_webhook_event
                                  → status de saída em fila/logs
```

`provider_message_id` guarda o ID interno da YCloud. `meta_message_id` continua reservado para o WAMID enviado nos eventos do WhatsApp. O status de aceite (`accepted`) não é tratado como entrega: `sent`, `delivered`, `read` e `failed` chegam de forma assíncrona pelo webhook.

Falha de transporte antes do aceite usa o retry existente da fila. Falha posterior informada pelo webhook fica registrada como status do provedor e não reentra automaticamente na fila, evitando duplicidade.

## Segredos server-side

Configure apenas em Supabase → Edge Functions → Secrets, nunca no React, banco, Git ou logs:

```text
YCLOUD_API_KEY
YCLOUD_SENDER_PHONE       # telefone Business ativo no YCloud, em E.164
YCLOUD_WABA_ID
YCLOUD_WEBHOOK_SECRET     # segredo retornado ao criar/configurar o webhook YCloud
YCLOUD_COEXISTENCE_CONFIRMED=true   # só depois da validação humana
YCLOUD_BUSINESS_APP_CONFIRMED=true  # só depois de testar o App
YCLOUD_HISTORY_SHARE_STATUS=shared  # ou validated; não declarar sem evidência
```

`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` e `WHATSAPP_GRAPH_VERSION` são legados da integração Meta direta. Não os remover durante a homologação; só fazer a rotação/retirada após identificar o uso e aprovar a mudança. O estado do worker é consultado por uma RPC server-only que retorna apenas atividade do cron, presença dos dois nomes do Vault e última execução.

## Onboarding manual obrigatório

Para continuar, faça isto:

1. No YCloud, conclua o Embedded Signup/onboarding com o número da clínica que usa WhatsApp Business App. Não use número pessoal.
2. Confirme no YCloud que o número está verificado e ativo e que a WABA/Business Portfolio corretos foram vinculados.
3. Ao escanear o QR code, escolha **Share Chats/Compartilhar conversas** se a clínica autorizar a sincronização do histórico. Não prossiga se a tela oferecer uma opção que possa apagar/desvincular o histórico sem sua confirmação.
4. Confirme manualmente que o WhatsApp Business App continua abrindo e enviando mensagens no mesmo número.
5. Crie ou confirme no YCloud um template real aprovado, com nome e idioma exatamente iguais aos cadastrados em `modelos_mensagens`.
6. Crie/configure o webhook público da Edge Function:
   `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/ycloud-webhook`
   Inscreva inicialmente apenas `whatsapp.message.updated`. O código reconhece eventos de coexistência, histórico e ecos, mas deliberadamente não os importa nem responde automaticamente.
7. Guarde o `secret` do webhook em `YCLOUD_WEBHOOK_SECRET` e registre os três flags de confirmação somente depois das verificações acima.
8. Informe ao responsável pela homologação um único telefone autorizado para receber o teste. O sistema não escolherá cliente aleatório.

Não é permitido afirmar que o histórico foi preservado apenas porque o QR foi escaneado. Registre se o compartilhamento foi escolhido, se o sync foi observado e o que foi sincronizado.

## Teste controlado e aceite

Antes do teste direto, o painel deve mostrar API, remetente, WABA, coexistência, Business App e template como prontos. O botão de teste permanece bloqueado até a confirmação do onboarding.

1. Valide o template no painel de modelos; a chamada usa `GET /v2/whatsapp/templates/{wabaId}/{name}/{language}`.
2. Use **Enviar mensagem de teste** com o telefone autorizado em formato E.164. O resultado é gravado em `whatsapp_testes` e exibe o ID YCloud.
3. Confirme a mensagem no aparelho autorizado e a presença dos eventos de status no webhook.
4. Só depois prepare uma mensagem da fila existente e confirme o percurso `fila_mensagens → claim → worker → YCloud → WhatsApp → webhook → logs`.
5. Verifique no banco os campos `provider_message_id`, `meta_message_id`, `provider_status` e `provider_updated_at`.

O teste não envia para cliente escolhido automaticamente, não usa a Secretária, não ativa oportunidades/Radar e não implementa inbound, chatbot, IA ou importação de histórico.

## Eventos fora do escopo atual

- `whatsapp.smb.history`: documentado para futura validação de compartilhamento, sem importar mensagens.
- `whatsapp.smb.message.echoes`: documentado para mensagens enviadas pelo Business App, sem alimentar o domínio comercial.
- `whatsapp.smb.app.state.sync`: documentado para sincronização de contatos, sem criar tabela de histórico nesta fase.
- `whatsapp.inbound_message.received`: não processado e sem resposta automática.

## Referências oficiais YCloud

- [WhatsApp Message Sending Guide](https://docs.ycloud.com/reference/whatsapp-message-sending-guide)
- [List templates](https://docs.ycloud.com/reference/whatsapp_template-list)
- [Retrieve a template by name and language](https://docs.ycloud.com/reference/whatsapp_template-retrieve-by-name-and-language)
- [Webhook Integration Guide](https://docs.ycloud.com/reference/webhook-integration-guide)
- [Webhook Events & Payloads](https://docs.ycloud.com/reference/webhook-events-payloads)
- [WhatsApp Message Updated Webhook Examples](https://docs.ycloud.com/reference/whatsapp-message-updated-webhook-examples)
- [WhatsApp Business App History Message Webhook Examples](https://docs.ycloud.com/reference/whatsapp-business-app-sync-history-message-webhook)

## Estado da fase

Código, migração e validações locais podem ser concluídos sem credenciais reais. A Fase 6.5 só estará **APTA PARA FASE 7** depois do onboarding manual, do teste para telefone autorizado e da confirmação real do webhook/entrega. Até lá, permanece pendente.
