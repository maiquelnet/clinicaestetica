# Meta WhatsApp: ativos, homologação e App Review

Atualizado em: 2026-10-19. Este documento separa dados fornecidos pelo usuário, observações do MCP e estado local do repositório. Um snapshot não comprova que a configuração remota permaneça igual.

## 1. Apps e números: não misturar os ativos

Há dois apps Meta com nomes parecidos no portfólio empresarial `958284598092300` (“Thaís Schneider”):

| App | App ID | O que está confirmado neste registro |
| --- | --- | --- |
| API Estética Schneider Auto | `1637078911202031` | O MCP Meta listou o app em 2026-10-19. Um payload fornecido pelo usuário para um teste direto da Meta registrou `app_id=1637078911202031`. O estado de App Review retornado pelo MCP foi contraditório (`UNSUBMITTED` junto de `is_approved=true`); não tratar como aprovado. |
| Thaís Schneider Estética Whats | `1369639224651650` | O usuário identificou este como o app pretendido para o número real. O MCP listou o app, mas não confirmou a relação app–WABA–telefone. O snapshot do MCP indicou `dev_mode`, sem URL de privacidade, categoria ou ícone, e `NO_SUBMISSION`. |

O usuário informou que o número real `+55 51 8591-0322` está no WABA `5523215167904668`, no portfólio `958284598092300`; a tela também mostrou Phone Number ID `1287807847751041`. O usuário afirmou que o app `1369639224651650` é o correto para esse número. **Essa associação continua não verificada pela Meta/MCP.** O acesso MCP disponível listou apps, mas não expôs a relação entre app, WABA e número. Não usar os IDs do teste como prova dessa relação.

### Ativos do teste direto da Meta

No payload de teste fornecido pelo usuário em 2026-10-13, a Meta mostrou:

- app no contexto do evento: `1637078911202031`;
- WABA de teste: `4544814659084494`;
- Phone Number ID de teste: `1255191607683337`;
- destinatário que recebeu: `+55 51 98660-3385`;
- estados retornados: `sent` e `delivered`.

Isso comprova que aquele teste do painel Meta foi aceito e entregue. Não é o WABA, o remetente ou o Phone Number ID real da Thaís, e não comprova que o app 136 esteja ligado ao número real.

## 2. Snapshot Meta MCP — 2026-10-19

- Portfólios retornados pelo MCP: nenhum (`businesses: []`); os detalhes dos apps eram visíveis, mas o portfólio/ativos empresariais não estavam autorizados para consulta nesse MCP.
- `1637078911202031`: modo de desenvolvimento; privacidade, categoria e ícone apareciam configurados no snapshot. O estado de revisão retornado foi inconsistente, portanto permanece **não confirmado**.
- `1369639224651650`: modo de desenvolvimento, sem URL de privacidade, categoria ou ícone no snapshot; App Review `NO_SUBMISSION`.
- Nenhuma operação de escrita foi feita na Meta nesta etapa.

Para confirmar qual app pertence ao número real, é necessário reautorizar o Meta MCP com acesso ao portfólio `958284598092300` e consultar os ativos WhatsApp do portfólio, ou verificar manualmente no Business Settings/WhatsApp Manager. Até lá, mantenha a relação registrada como “informada pelo usuário, não confirmada pela Meta”.

## 3. Modelo de integração no sistema

O desenho local passa a ser **um app Meta e uma WABA por clínica**, com IDs e nomes dos segredos associados à clínica. Tokens, App Secrets e tokens de verificação ficam no Supabase Vault; não entram no bundle Vite, GitHub, Vercel ou respostas do frontend.

Uma migration local cria `private.meta_whatsapp_integrations` e RPCs de backend com `EXECUTE` restrito a `service_role`. A função de saída recebe apenas o token necessário; a função de webhook recebe apenas App Secret e token de verificação. A migration está **somente no repositório** e não foi aplicada ao Supabase remoto. Portanto, as Edge Functions locais dependentes dela ainda não estão prontas para substituir as funções publicadas.

Convenção futura para nomes dos segredos no Vault:

```text
meta:<clinic_id>:access_token
meta:<clinic_id>:app_secret
meta:<clinic_id>:verify_token
```

A tabela de integração guarda os nomes desses segredos, nunca seus valores. A RPC descriptografada é chamada apenas pelo backend usando `service_role`. Acesso à view `vault.decrypted_secrets` deve continuar restrito; consulte [Supabase Vault](https://supabase.com/docs/guides/database/vault).

## 4. Teste de App Review no Preview

O painel **Sandbox do App Review** só é renderizado quando `VITE_APP_ENV=preview`. Ele chama `whatsapp-review-test`, não a fila automática de produção, e usa exclusivamente `WHATSAPP_REVIEW_*`. O teste está limitado no frontend e no backend ao destinatário `+55 51 98660-3385`.

Antes de habilitar o envio, a função exige estes Secrets no Supabase Edge Functions:

```text
WHATSAPP_REVIEW_ACCESS_TOKEN
WHATSAPP_REVIEW_APP_ID
WHATSAPP_REVIEW_APP_SECRET
WHATSAPP_REVIEW_WABA_ID
WHATSAPP_REVIEW_PHONE_NUMBER_ID
WHATSAPP_REVIEW_GRAPH_VERSION
WHATSAPP_REVIEW_TEMPLATE_NAME
WHATSAPP_REVIEW_TEMPLATE_LANGUAGE
WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON
```

A função consulta a Meta antes de enviar: confirma se o token é válido, se o `app_id` retornado corresponde ao `WHATSAPP_REVIEW_APP_ID`, se o token tem `whatsapp_business_messaging` e `whatsapp_business_management`, se o Phone Number ID consta no WABA e se existe nele um modelo `APPROVED` com nome e idioma exatos. Também compara o maior placeholder do corpo (por exemplo, `{{3}}` exige três valores) com o array JSON `WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON`, enviado como parâmetros do corpo. Para modelo sem variáveis, configure `[]`. O endpoint rejeita os IDs conhecidos do WABA e do telefone reais; use somente o remetente de teste. Esses valores ainda precisam ser cadastrados/confirmados no painel Supabase; nenhum token ou segredo é documentado aqui. A versão Graph, nome e idioma do modelo devem vir do painel do app/WABA que realmente será analisado, sem usar valores presumidos.

Se a auditoria não puder ser criada antes da chamada, nada é enviado. Depois da chamada, “aceita pela Meta” fica separado de “auditoria persistida”. Resposta incerta, aceite sem WAMID ou falha da atualização de auditoria exige reconciliação manual e bloqueia novo envio até conferência. A aceitação HTTP não prova entrega; confirme o recebimento no WhatsApp e o evento de status.

### Estado remoto do teste

Em 2026-10-19, o MCP Supabase confirmou `whatsapp-review-test` v1 e, depois, publicou a versão endurecida **v2**. O MCP não permite ler os valores nem confirmar a presença dos Secrets `WHATSAPP_REVIEW_*`; ainda não foi confirmado qual app/token/remetente eles representam. A função agora falha fechada e não libera envio até a Meta confirmar o app, permissões, remetente, template, idioma e parâmetros. O envio pelo sistema e a gravação do vídeo ainda não foram validados.

## 5. Correções locais da fila e do webhook

O código local agora:

- resolve cada webhook pela dupla WABA + `phone_number_id` da integração ativa; associação desconhecida, ausente ou ambígua é rejeitada; não escolhe mais a primeira clínica;
- verifica a assinatura com o App Secret da integração correspondente;
- consulta o status atual do agendamento imediatamente antes do envio; cancelado ou não encontrado é bloqueado e marcado na fila;
- trata uma recusa explícita da Meta como falha recuperável, mas trata timeout/resposta incerta ou falha de persistência após aceite como `reconciliacao`, um estado terminal que não entra no claim automático;
- não converte falha da auditoria de App Review em envio “não realizado” se a Meta já aceitou a mensagem.

Essas alterações no webhook e na fila são **locais**. Não foram publicadas e a migration de estado `reconciliacao` não foi aplicada. O projeto remoto continua no estado anterior até uma publicação separada, autorizada e revisada.

## 6. App Review: o que o sistema demonstra hoje

- `whatsapp_business_messaging`: o sistema usa a Cloud API para enviar um modelo existente. O fluxo de teste pode demonstrar o envio ao destinatário permitido, desde que o token e o remetente sejam do app submetido e a auditoria/entrega estejam verificadas.
- `whatsapp_business_management`: o sistema ainda não cria modelos via API. Criar um modelo manualmente no WhatsApp Manager não demonstra uso dessa permissão. Não alegar essa capacidade no vídeo atual.
- `public_profile`: não é requisito do fluxo de envio descrito aqui.

O vídeo só deve ser gravado depois de o painel Preview mostrar o App ID/WABA/remetente confirmados pela função, o envio ser aceito, a auditoria ser gravada e a mensagem chegar ao destinatário. Grave o painel e o WhatsApp recebendo a mesma mensagem; o WAMID, isoladamente, só prova aceitação.

## 7. Preview, Vercel e Supabase

- `vercel.json` neste branch fixa `VITE_APP_ENV=preview`.
- A Vercel Preview usa atualmente o mesmo projeto Supabase de produção `xucttzuthznqwlhushmg`; não existe staging Supabase isolado confirmado. A flag `preview` não isola banco, Auth, dados, Vault, Secrets, Edge Functions, cron ou webhooks.
- A interface de Preview esconde o painel normal que poderia chamar o envio WhatsApp de produção e mostra somente o Sandbox do App Review.
- Não mescle essa configuração em `main`: o `buildCommand` versionado também aplica `preview` ao build iniciado por esse arquivo. A configuração deve ser separada/revertida antes da retomada de produção.
- A integração GitHub–Vercel pode criar uma Preview após o push, mas não se considera deploy concluído sem verificar o check/URL da Vercel.

## 8. Próximas ações seguras

1. Reautorizar o Meta MCP para o portfólio `958284598092300` e confirmar, com evidência da Meta, qual app está ligado ao WABA `5523215167904668` e ao Phone Number ID real `1287807847751041`.
2. No Supabase, cadastrar os Secrets `WHATSAPP_REVIEW_*` correspondentes ao app que será revisado. Não reutilizar o teste `1255191607683337` como número real nem como remetente do app 136 sem comprovação.
3. Cadastrar no Supabase, sem expor no chat, os Secrets `WHATSAPP_REVIEW_*` listados acima para o app que será analisado e seu remetente de teste confirmado. Não reutilizar os IDs do número real.
4. Confirmar no Preview que o status da Meta, as permissões, o template exato e a quantidade de parâmetros estão verificados; enviar uma única mensagem ao destinatário autorizado, confirmar auditoria e recebimento.
5. Gravar e submeter o vídeo manualmente no App Review. A coexistência e a retomada da produção permanecem para depois dessa validação.
