# API e Edge Functions

Atualizado em: 2026-09-07.

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
- agenda: `agendamentos`, `bloqueios_agenda`, `eventos_agenda`, `lista_espera`, `disponibilidade_semanal`, `disponibilidade_excecoes`, `disponibilidade_excecao_periodos`;
- secretária assistida: `secretaria_planos_acao`, `secretaria_plano_itens`, `secretaria_atividades`;
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
| `salvar_plano_tratamento_com_cronograma` | Salva plano, ocorrências e agendamentos recorrentes em uma transação. |
| `salvar_cliente_com_interesses` | Salva cliente e seus interesses normalizados. |
| `salvar_disponibilidade_semanal` | Substitui atomicamente os períodos semanais de um profissional. |
| `salvar_disponibilidade_excecao` | Cria/edita uma exceção de data com períodos ou dia sem atendimento. |
| `excluir_disponibilidade_excecao` | Remove a exceção e devolve a data ao padrão semanal. |
| `prever_publico_campanha` | Calcula o público estimado de uma campanha, inclusive por interesses. |
| `salvar_modelo_mensagem_e_regra` | Modelo, regra e configuração WhatsApp. |
| `list_public_signup_services` | Lista serviços ativos para o cadastro público. |
| `register_public_client_signup` | Registra cliente/interesses sem abrir CRUD administrativo ao `anon`. |
| `claim_whatsapp_message_queue` | Reserva lote da fila com `FOR UPDATE SKIP LOCKED`. |
| `complete_whatsapp_message_queue` | Finaliza item aceito pelo provedor sem preencher o WAMID. |
| `fail_whatsapp_message_queue` | Marca falha e agenda retry limitado. |
| `calcular_capacidade_comercial_periodo` | Retorna capacidade comercial e janelas livres por data/profissional. |
| `calcular_radar_ocupacao_periodo` | Classifica ocupação e marca dias que merecem atenção. |
| `calcular_oportunidades_comerciais_periodo` | Retorna candidatos de lista de espera e retorno nos dias de atenção. |
| `listar_secretaria_planos_acao_periodo` | Lista planos ativos de ação por clínica, profissional e período. |
| `buscar_secretaria_plano_acao` | Carrega um plano e seus itens para revisão. |
| `preparar_secretaria_plano` | Recalcula Radar/oportunidades e cria um plano RASCUNHO com até cinco clientes únicos. |
| `revalidar_secretaria_plano` | Recalcula o plano e invalida candidatos que deixaram de ser elegíveis. |
| `atualizar_secretaria_plano` | Reconsulta fontes canônicas, preserva remoções e recompõe candidatos disponíveis. |
| `remover_secretaria_plano_item` | Remove um candidato de um plano em RASCUNHO, sem apagar o item. |
| `adicionar_secretaria_plano_item` | Adiciona somente uma oportunidade atual retornada pelo motor canônico. |
| `aprovar_secretaria_plano` | Revalida agenda/capacidade/oportunidades e aprova após revisão humana. |
| `cancelar_secretaria_plano` | Cancela logicamente um plano, mantendo sua auditoria. |

As RPCs públicas devem validar internamente a clínica e limitar os campos retornados. RPCs administrativas precisam de `search_path` fixo, autorização e grants mínimos.

### Capacidade, Radar e oportunidades

As três RPCs abaixo exigem JWT de usuário autenticado, vínculo à clínica e `profissional_id` pertencente à clínica. Recebem:

```json
{
  "p_clinica_id": "<uuid>",
  "p_profissional_id": "<uuid>",
  "p_data_inicio": "YYYY-MM-DD",
  "p_data_fim": "YYYY-MM-DD"
}
```

`calcular_capacidade_comercial_periodo` retorna uma linha por data com `capacidade_minutos`, `ocupado_minutos`, `livre_minutos`, `bloqueado_minutos`, `ocupacao_percentual`, `possui_capacidade`, `periodos_livres` e `fonte_disponibilidade` (`semanal` ou `excecao`). `periodos_livres` contém `inicio_em`/`fim_em` e os horários locais.

`calcular_radar_ocupacao_periodo` acrescenta `classificacao` e `merece_atencao`. `calcular_oportunidades_comerciais_periodo` acrescenta `oportunidades`, `total_oportunidades`, `lista_espera_count`, `retorno_count` e `clientes_unicos_count`. Cada oportunidade inclui origem, cliente, serviço, duração, motivo, consentimento, última mensagem conhecida e janelas compatíveis. Nenhuma dessas RPCs envia contato, cria agendamento, reserva horário ou persiste resultado.

### Secretária assistida V1

As RPCs `listar_secretaria_planos_acao_periodo` e `buscar_secretaria_plano_acao` leem somente planos pertencentes à clínica e ao profissional informados. `preparar_secretaria_plano` recebe `p_clinica_id`, `p_profissional_id` e `p_data_alvo`, consulta novamente as três RPCs canônicas e persiste um plano `RASCUNHO` com no máximo cinco clientes únicos na ordem do motor: lista de espera antes de retorno. A seleção não é feita a partir de estado antigo do React.

`revalidar_secretaria_plano` e `atualizar_secretaria_plano` repetem a consulta canônica e marcam cada candidato desatualizado como `INVALIDO`, sem invalidar o plano inteiro. `remover_secretaria_plano_item` usa o estado `REMOVIDO`; `adicionar_secretaria_plano_item` aceita somente uma oportunidade ainda retornada pelo motor atual e mantém o limite de cinco clientes.

`aprovar_secretaria_plano` revalida capacidade, Radar e oportunidades dentro da mesma transação. Se a agenda mudou, se o dia deixou de merecer atenção ou se algum item ficou inválido, a RPC não aprova silenciosamente e devolve a situação para revisão. A aprovação apenas muda o estado para `APROVADO`: não envia mensagem, não cria agendamento, não reserva horário e não altera a lista de espera. `cancelar_secretaria_plano` muda o estado para `CANCELADO` sem apagar o histórico.

Todas as RPCs exigem JWT, vínculo à clínica, profissional ativo vinculado e `search_path` fixo. Os grants de execução são apenas para `authenticated`; as tabelas têm RLS por `clinica_id`. As atividades persistem somente os eventos `PLANO_CRIADO`, `PLANO_ATUALIZADO`, `PLANO_APROVADO`, `PLANO_CANCELADO`, `CANDIDATO_REMOVIDO` e `CANDIDATO_INVALIDADO`.

### Segmentação de campanhas

O público `interesses` recebe uma lista de IDs de serviços em `p_servicos_alvo`. A previsão e a geração de destinatários consideram clientes com qualquer interesse selecionado e respeitam a clínica, o status ativo do serviço e o consentimento de marketing conforme o fluxo da campanha.

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

`whatsapp-messages` e `meta-whatsapp-webhook` usam `verify_jwt=false` porque validam o contexto internamente. A fila e a autorização própria para admin/cron foram preservadas.

### `status`

```json
{ "action": "status", "clinicId": "<uuid>" }
```

Exige JWT e papel proprietário/administrador. Retorna apenas indicadores não sensíveis da Meta, template, worker, fila e falhas recentes. Segredos nunca são retornados.

### `validate-template`

```json
{
  "action": "validate-template",
  "clinicId": "<uuid>",
  "templateName": "nome_aprovado_na_meta",
  "language": "pt_BR"
}
```

Consulta o template na Meta por WABA, nome e idioma e exige status `APPROVED`.

### `send-test`

```json
{
  "action": "send-test",
  "clinicId": "<uuid>",
  "recipient": "+5511999999999"
}
```

Usa o primeiro modelo ativo de confirmação/lembrete e um destinatário explicitamente autorizado. O WAMID retornado pela Meta é gravado em `whatsapp_testes`.

### `process`

```json
{ "action": "process", "clinicId": "<uuid>" }
```

Autorização por:

```http
x-whatsapp-cron-secret: <WHATSAPP_CRON_SECRET>
```

Gera itens idempotentes em `fila_mensagens`, reserva até 25, envia templates pela Meta Cloud API e registra aceite/falha. O job Supabase Cron `process-whatsapp-messages` chama essa ação a cada cinco minutos usando `pg_net`; URL e segredo do worker continuam no Vault.

### Contrato Meta

- `provider_message_id` e `meta_message_id` guardam o WAMID retornado pela Meta;
- `provider_status` diferencia `accepted`, `sent`, `delivered`, `read` e `failed`;
- falhas de transporte usam o retry existente; falhas posteriores do webhook não reentram automaticamente na fila;
- o webhook público é `https://xucttzuthznqwlhushmg.supabase.co/functions/v1/meta-whatsapp-webhook`;
- o GET valida `META_WEBHOOK_VERIFY_TOKEN` e o POST valida `X-Hub-Signature-256` com `META_APP_SECRET`;
- CORS está como `*` na implementação implantada;
- o processamento lê no máximo 500 agendamentos e 2.000 logs/dispensas por execução;
- mensagens recebidas, mídia e sincronização de histórico não são processadas nesta fase.

## OpenAPI

O Supabase expõe o contrato OpenAPI do Data API, mas não há snapshot `openapi.json` versionado. Futuramente, exporte-o depois de estabilizar grants/RLS para auxiliar geração de tipos e revisão de endpoints.
