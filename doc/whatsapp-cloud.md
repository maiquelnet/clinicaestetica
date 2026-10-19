# WhatsApp Cloud API — Meta

Atualizado em: 2026-10-19. Abaixo, o registro histórico consultado em 2026-10-08.

> **Histórico, não estado atual:** as descrições de implantação e associação de ativos abaixo refletem o registro de 2026-10-08 e não foram confirmadas como vigentes. O snapshot MCP de 2026-10-19 não conseguiu confirmar a relação app–WABA–telefone. O código de integração por clínica, roteamento estrito, reconciliação e proteção contra cancelamento está somente local; consulte [Meta WhatsApp App Review](./meta-whatsapp-app-review.md) e [Operação de plataformas](./operacao-plataformas.md) antes de qualquer mudança remota.

## Ativos oficiais da integração

| Ativo | ID | Uso atual |
| --- | --- | --- |
| Portfólio empresarial `Thaís Schneider` | `958284598092300` | Proprietário dos ativos da clínica |
| App `API Estética Schneider Auto` | `1637078911202031` | App visto no teste direto Meta de 2026-10-13; vínculo ao telefone real não confirmado |
| App `Thaís Schneider Estética Whats` | `1369639224651650` | App indicado pelo usuário para o número real; vínculo não confirmado pelo MCP |
| WABA informado pelo usuário | `5523215167904668` | Associado pelo usuário ao portfólio `958284598092300`; relação com app/telefone não confirmada pelo MCP |
| Phone Number ID exibido no perfil | `1287807847751041` | Informado pelo usuário como o número real; não usar no teste de App Review |
| System User `sistemaesteticawhatsapp` | `61594998936645` | ID informado pelo usuário; permissão/token atuais não confirmados nesta revisão |

Não concluir que qualquer um dos dois apps esteja ligado ao número real sem evidência explícita da Meta. O remetente de teste observado (`1255191607683337`) pertence ao fluxo de teste direto da Meta, não é o Phone Number ID real.

## Escopo da primeira versão

A integração atende somente a Estética Schneider e foi preparada para:

- confirmação de agendamento;
- lembrete antes do atendimento.

Pós-atendimento, aniversários, retorno e campanhas permanecem no fluxo manual. O número pessoal do desenvolvedor/proprietário pode ser destinatário verificado de homologação, mas o remetente de produção deve ser um número controlado pela clínica.

## Estado implantado

- Edge Function `whatsapp-messages` para envio e consulta de templates;
- Edge Function `meta-whatsapp-webhook` para verificação do callback e estados de entrega;
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

O envio usa `POST /{PHONE_NUMBER_ID}/messages`; o webhook registra os estados assíncronos da Meta sem importar mensagens recebidas ou histórico de conversas.

## Registro histórico de estado Meta de 2026-10-08 (não confirmado atualmente)

- O registro anterior tratava `API Estética Schneider Auto` (`1637078911202031`) como app de integração. Essa associação não foi confirmada no snapshot MCP de 2026-10-19.
- A função Meta direta de envio está publicada no Supabase e o envio de teste foi validado.
- O webhook está ativo para o tópico `whatsapp_business_account`, com os campos `messages` e `account_update`.
- A política de privacidade, o ícone, a categoria `Business` e a verificação da empresa estão configurados.
- O app ainda está em `dev_mode`/`is_live=false`.
- O App Review está `UNSUBMITTED`; as permissões WhatsApp avançadas ainda não estão live.
- O status de compliance verificado pelo Meta MCP é `compliant`, sem ações obrigatórias abertas.
- O template `confirmacao_agendamento_v1` em `pt_BR` foi validado como `APPROVED` na WABA correta.
- Outros templates precisam ser validados individualmente; não presuma que um template aprovado em outro WABA exista nesta conta.

O passo a passo detalhado, incluindo configuração do app, WABA, System User, callback, Secrets, testes e App Review, está em [Guia Meta: WhatsApp e análise do app](./meta-whatsapp-app-review.md).

Sugestões:

### `confirmacao_agendamento_v1`

```text
Olá, {{1}}! Seu horário na Estética Thais Schneider está confirmado para {{2}} às {{3}}, para {{4}}. Qualquer ajuste, me avise por aqui.
```

### `lembrete_agendamento_v1`

```text
Olá, {{1}}! Passando para lembrar do seu horário na Estética Thais Schneider: {{2}} às {{3}}, para {{4}}. Te espero!
```

O registro de 2026-10-08 dizia que `confirmacao_agendamento_v1` estava `APPROVED` em uma WABA então tratada como correta; o vínculo app–WABA atual não está confirmado. O estado de cada tradução deve ser consultado no WABA efetivamente selecionado antes de ativar uma regra. Não recrie um template em outro WABA para corrigir erro de integração: primeiro confirme WABA, nome e idioma.

A implementação atual monta parâmetros conforme os placeholders nomeados existentes em `modelos_mensagens.texto`, como `{nome}`, `{data}`, `{hora}`, `{servico}` e `{link_avaliacao_google}`, e também aceita placeholders numéricos `{{1}}` a `{{5}}`. O texto cadastrado no sistema e o template Meta precisam ter a mesma ordem de parâmetros.

## Edge Secrets da versão implantada

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_CRON_SECRET
WHATSAPP_FUNCTION_URL=https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
```

Os três primeiros são necessários para status pronto/envio. `WHATSAPP_CRON_SECRET` e `WHATSAPP_FUNCTION_URL` são necessários ao processamento periódico/status do agendador. `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` são necessários somente para o webhook público.

Para desenvolvimento local, copie `supabase/functions/.env.example` para `supabase/functions/.env` e preencha os valores reais. Esse arquivo é ignorado pelo Git; não use tokens em `VITE_*`.

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

## Segurança das funções

- `status`, `send-test` e `validate-template` exigem JWT de usuário e papel proprietário/administrador;
- `process` exige `x-whatsapp-cron-secret`;
- o código usa service role apenas no servidor;
- CORS remoto está como `*`, por isso a autorização de cada ação é essencial;
- o webhook Meta responde ao desafio `hub.challenge` somente com o token configurado;
- eventos POST do webhook exigem `X-Hub-Signature-256` válido com `META_APP_SECRET`;
- estados e mensagens recebidas são deduplicados em `whatsapp_webhook_events` e pelo WAMID antes de atualizar os registros.

## Recebimento de mensagens

O callback `meta-whatsapp-webhook` agora processa eventos `messages` de entrada, além dos estados de mensagens enviadas:

- cria ou reutiliza o cliente pelo telefone normalizado;
- não concede automaticamente consentimento de marketing: o cliente fica com `whatsapp_opt_in_status='pendente'`;
- cria uma conversa em `whatsapp_conversas` por telefone e clínica;
- grava cada mensagem em `whatsapp_mensagens`, incluindo tipo, texto, WAMID, horário e payload original;
- abre/renova a janela de atendimento de 24 horas a partir da mensagem recebida;
- ignora duplicidades sem criar novo cliente, conversa ou mensagem.

As tabelas de conversa e mensagem possuem RLS: o painel autenticado pode ler somente registros da clínica à qual o usuário tem acesso. As escritas ficam restritas ao webhook via `service_role`.

O painel administrativo exibe as conversas em **Secretária > Conversas WhatsApp**. A tela atualiza automaticamente, mas ainda não envia respostas livres: o próximo passo é implementar o compositor de resposta respeitando a janela de 24 horas e os modelos aprovados da Meta.

## Homologação

1. Confirmar todos os Secrets no ambiente de publicação.
2. Confirmar individualmente que o template usado está `APPROVED`.
3. Enviar teste a destinatário permitido.
4. Criar cliente de teste com consentimento explícito.
5. Criar agendamento futuro e chamar manualmente `process`.
6. Confirmar um único item por `ciclo`.
7. Reagendar antes do processamento e validar horário/payload.
8. Cancelar antes do processamento e confirmar ausência de envio.
9. Revogar consentimento e confirmar bloqueio/cancelamento.
10. Simular erro Meta e validar retry/`ultimo_erro`.
11. Enviar uma mensagem real ao número oficial, abrir **Secretária > Conversas WhatsApp** e confirmar cliente, conversa, texto e janela de atendimento.

Não ative regras automáticas para clientes reais enquanto o número, o token, o webhook e cada template usado não estiverem confirmados. O aceite da chamada não significa entrega; os estados entregue/lido só devem ser considerados após o webhook Meta atualizar os registros.

## Comercialização para outras clínicas

É possível repetir a configuração manual para cada cliente, mantendo WABA, número, templates, consentimentos, IDs e tokens isolados por empresa. Nenhuma credencial da Estética Schneider pode ser reutilizada para outra clínica.

Para escalar como produto, o caminho recomendado é formalizar a empresa desenvolvedora, verificar seu portfólio empresarial, candidatar-se como Tech Provider e implementar o Embedded Signup. Cada cliente deve continuar proprietário dos próprios ativos e autorizar somente as permissões necessárias. A arquitetura atual usa Secrets globais da Edge Function e atende uma única clínica; ela precisa ser redesenhada para credenciais segregadas por tenant antes de suportar múltiplos clientes no mesmo projeto.

## Evolução recomendada

Como evolução, implementar respostas pelo painel, automações de triagem, CORS por allowlist, reservas mais rígidas e testes dedicados, preservando compatibilidade com `fila_mensagens`, frontend e scheduler atuais.
