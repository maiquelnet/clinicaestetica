# API e Edge Functions

Atualizado em: 2026-08-11.

## Modelo de API

Não existe servidor HTTP próprio. A aplicação usa:

- Supabase Data API/PostgREST para tabelas e views expostas;
- Supabase RPC para operações transacionais;
- Supabase Auth para sessão e JWT do usuário;
- três Edge Functions para integrações externas.

Base REST:

```text
https://xucttzuthznqwlhushmg.supabase.co/rest/v1
```

Headers do frontend autenticado:

```http
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <JWT_DO_USUARIO>
Content-Type: application/json
```

A publishable key não concede acesso às linhas por si só. As policies RLS usam a sessão e o vínculo em `usuarios_clinicas`.

## Data API

Principais recursos usados pela SPA:

- acesso/contexto: `perfis`, `usuarios_clinicas`, `clinicas`;
- clientes: `clientes`, `anotacoes_clientes`;
- agenda: `agendamentos`, `bloqueios_agenda`, `eventos_agenda`, `lista_espera`;
- serviços: `servicos`, `precos_servicos`;
- mensagens: `modelos_mensagens`, `regras_mensagens`, `logs_mensagens`, `mensagens_dispensadas`, `fila_mensagens`;
- financeiro: `movimentacoes_financeiras`, `contas_financeiras`, `categorias_financeiras`, `metodos_pagamento`, `caixas`;
- estoque/ativos: `itens_estoque`, `movimentacoes_estoque`, `fornecedores`, `equipamentos`;
- marketing: `campanhas`, `destinatarios_campanhas`, `avaliacoes_clientes`;
- tratamentos: `planos_tratamento`, `itens_plano_tratamento`.

## RPCs relevantes

| RPC | Uso |
| --- | --- |
| `salvar_agendamento` | Criação/edição transacional de agendamento. |
| `salvar_servico_com_preco` | Serviço e preço vigente na mesma operação. |
| `confirmar_lista_espera` | Confirma reserva da fila com validação de conflito. |
| `salvar_campanha_com_destinatarios` | Campanha e público destinatário. |
| `salvar_modelo_mensagem_e_regra` | Modelo, regra e configuração WhatsApp. |
| `list_public_signup_services` | Lista serviços ativos para o cadastro público. |
| `register_public_client_signup` | Registra cliente/interesses sem abrir CRUD administrativo ao `anon`. |
| `claim_whatsapp_message_queue` | Reserva lote da fila com `FOR UPDATE SKIP LOCKED`. |
| `complete_whatsapp_message_queue` | Finaliza item aceito pela Meta. |
| `fail_whatsapp_message_queue` | Marca falha e agenda retry limitado. |

As RPCs públicas devem validar internamente a clínica e limitar os campos retornados. RPCs administrativas precisam de `search_path` fixo, autorização e grants mínimos.

## Edge Function `google-calendar-sync`

URL:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-calendar-sync
```

Versão remota confirmada: `32`; `verify_jwt=false`.

### Ações POST administrativas

```json
{ "action": "status", "clinicId": "<uuid>" }
{ "action": "connect", "clinicId": "<uuid>" }
{ "action": "sync", "clinicId": "<uuid>" }
```

Exigem JWT de usuário e vínculo ativo como proprietário/administrador.

### OAuth callback

`GET` com `code/state` vindo do Google. O `state` é assinado, tem expiração e associa `userId` e `clinicId`. Ao concluir, redireciona para as configurações do site oficial.

### Webhook Google

Usa headers `x-goog-channel-id`, `x-goog-channel-token`, `x-goog-resource-id` e `x-goog-resource-state`. A função compara canal/token/resource com `google_calendar_connections`.

### Cron

```json
{ "action": "sync-all" }
```

Header privado:

```http
x-cron-secret: <GOOGLE_SYNC_CRON_SECRET>
```

## Edge Function `google-reviews`

URL:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/google-reviews
```

Versão remota: `2`; `verify_jwt=false`.

- Método: `GET`;
- acesso público;
- consulta a primeira clínica ativa para obter `google_place_id`;
- chama Places API (New) com FieldMask;
- retorna no máximo cinco avaliações, nota agregada, total e links públicos;
- não retorna API key nem dados administrativos.

Resposta resumida:

```json
{
  "reviews": [],
  "rating": 5,
  "userRatingCount": 10,
  "googleMapsUrl": "https://maps.google.com/...",
  "reviewLink": "https://g.page/r/.../review"
}
```

## Edge Function `whatsapp-messages`

URL:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
```

Versão remota: `4`; `verify_jwt=false`.

### `status`

```json
{ "action": "status", "clinicId": "<uuid>" }
```

Exige JWT e papel proprietário/administrador. Retorna configuração de secrets, regras automáticas, fila e falhas recentes.

### `validate-template`

```json
{
  "action": "validate-template",
  "clinicId": "<uuid>",
  "templateName": "confirmacao_agendamento_v1",
  "language": "pt_BR"
}
```

Consulta a WABA e exige template aprovado.

### `send-test`

```json
{
  "action": "send-test",
  "clinicId": "<uuid>",
  "recipient": "5551999999999"
}
```

Usa o primeiro modelo ativo de confirmação/lembrete. Durante homologação, o destinatário precisa estar permitido no painel Meta.

### `process`

```json
{ "action": "process", "clinicId": "<uuid>" }
```

Autorização por:

```http
x-whatsapp-cron-secret: <WHATSAPP_CRON_SECRET>
```

Gera itens idempotentes em `fila_mensagens`, reserva até 25, envia templates e registra sucesso/falha. Em 2026-08-11 não existia `pg_cron` no banco; um scheduler externo é necessário.

### Limitações da versão 4

- não implementa webhook de status `sent/delivered/read/failed`;
- registra `meta_message_id`, mas o log atual representa aceite/envio, não confirmação de leitura;
- CORS está como `*` na implementação implantada;
- o processamento lê no máximo 500 agendamentos e 2.000 logs/dispensas por execução;
- a Graph API padrão é `v23.0` se `WHATSAPP_GRAPH_VERSION` não estiver definido.

## OpenAPI

O Supabase expõe o contrato OpenAPI do Data API, mas não há snapshot `openapi.json` versionado. Futuramente, exporte-o depois de estabilizar grants/RLS para auxiliar geração de tipos e revisão de endpoints.
