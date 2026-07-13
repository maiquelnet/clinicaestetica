# Documentacao da API

## Estado atual

Nao existe API propria implementada no repositorio local.

As APIs existentes ou previstas sao:

- Google Apps Script legado via `google.script.run`.
- Supabase PostgREST gerado automaticamente a partir das tabelas `public`.
- Supabase Auth.

Nao ha Swagger/OpenAPI versionado no repositorio neste momento.

## API legado: Google Apps Script

O frontend `apps-script/Client.html` chama funcoes do backend `apps-script/Code.gs` via `google.script.run`.

Funcoes principais:

| Funcao | Entrada | Saida | Observacao |
| --- | --- | --- | --- |
| `getInitialData()` | Nenhuma | Estado completo do painel | Carrega dashboard, clientes, servicos, agenda, mensagens, campanhas e financeiro. |
| `saveClient(payload)` | Dados de cliente | Estado completo atualizado | Cria ou atualiza cliente no Google Sheets. |
| `saveService(payload)` | Dados de servico | Estado completo atualizado | Cria/atualiza servico e historico de preco. |
| `saveAppointment(payload)` | Dados de agendamento | Estado completo atualizado | Cria/atualiza agenda e sincroniza Google Calendar. |
| `saveConfig(payload)` | Configuracoes | Estado completo atualizado | Salva configuracoes do painel. |
| `saveMessageTemplate(payload)` | Modelo de mensagem | Estado completo atualizado | Cria/atualiza modelo. |
| `saveCampaign(payload)` | Campanha e clientes | Estado completo atualizado | Cria lista de envio. |
| `recordMessageSent(payload)` | Mensagem enviada | Estado completo atualizado | Registra envio manual. |
| `dismissAlert(payload)` | Pendencia | Estado completo atualizado | Dispensa alerta. |

## API alvo: Supabase PostgREST

Base URL:

```text
https://xucttzuthznqwlhushmg.supabase.co/rest/v1
```

Headers esperados:

```http
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <JWT_DO_USUARIO>
Content-Type: application/json
```

Observacao: o sistema deve usar chave publishable/anon no frontend. Chaves secretas nao devem ir para o navegador.

## Endpoints principais previstos

### Clientes

Listar:

```http
GET /rest/v1/clientes?select=*
```

Criar:

```http
POST /rest/v1/clientes
```

Payload:

```json
{
  "clinica_id": "uuid",
  "nome": "Nome da cliente",
  "telefone": "51999999999",
  "email": "cliente@email.com",
  "data_nascimento": "1990-01-01",
  "observacoes": "Texto livre",
  "aceita_marketing": true,
  "ativo": true
}
```

Atualizar:

```http
PATCH /rest/v1/clientes?id=eq.<uuid>
```

Arquivar:

```http
PATCH /rest/v1/clientes?id=eq.<uuid>
```

Payload:

```json
{
  "ativo": false,
  "arquivado_em": "2026-07-03T00:00:00Z"
}
```

### Servicos

Listar:

```http
GET /rest/v1/servicos?select=*,precos_servicos(*)
```

Criar:

```http
POST /rest/v1/servicos
```

Payload:

```json
{
  "clinica_id": "uuid",
  "nome": "Peeling diamante",
  "categoria": "Procedimentos",
  "descricao": "Descricao do servico",
  "duracao_minutos": 60,
  "preco_sob_consulta": false,
  "observacao_preco": null,
  "ativo": true
}
```

### Precos de servico

Criar preco:

```http
POST /rest/v1/precos_servicos
```

Payload:

```json
{
  "clinica_id": "uuid",
  "servico_id": "uuid",
  "valor": 100,
  "inicio_validade": "2026-07-03",
  "fim_validade": null
}
```

### Agendamentos

Listar por periodo:

```http
GET /rest/v1/agendamentos?select=*,clientes(*),servicos(*)&inicio_em=gte.<inicio>&inicio_em=lt.<fim>
```

Criar:

```http
POST /rest/v1/agendamentos
```

Payload:

```json
{
  "clinica_id": "uuid",
  "cliente_id": "uuid",
  "servico_id": "uuid",
  "profissional_id": "uuid",
  "inicio_em": "2026-07-03T13:00:00-03:00",
  "fim_em": "2026-07-03T14:00:00-03:00",
  "status": "agendado",
  "valor_aplicado": 100,
  "observacoes": "Texto livre"
}
```

### Mensagens

Modelos:

```http
GET /rest/v1/modelos_mensagens?select=*,regras_mensagens(*)
```

Logs:

```http
POST /rest/v1/logs_mensagens
```

Payload:

```json
{
  "clinica_id": "uuid",
  "cliente_id": "uuid",
  "agendamento_id": "uuid",
  "modelo_mensagem_id": "uuid",
  "canal": "whatsapp_manual",
  "texto": "Mensagem enviada",
  "ciclo": "confirmacao_agendamento:<agendamento_id>",
  "status": "enviado",
  "enviado_em": "2026-07-03T00:00:00Z"
}
```

## OpenAPI

O Supabase consegue expor OpenAPI a partir do schema, mas o arquivo ainda nao foi versionado neste repositorio.

Recomendacao futura:

- Exportar OpenAPI do Supabase.
- Salvar em `doc/openapi.json`.
- Gerar SDK ou validacoes a partir desse contrato.

