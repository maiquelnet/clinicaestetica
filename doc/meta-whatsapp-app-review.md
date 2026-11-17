# Meta WhatsApp: ativos, homologação e App Review

Atualizado em: 2026-11-11. Este documento separa dados fornecidos pelo usuário, observações do MCP e estado local do repositório. Um snapshot não comprova que a configuração remota permaneça igual.

## 1. App disponível e ativos: não misturar teste com número real

Em 2026-10-22, o usuário informou que o app `Thaís Schneider Estética Whats` (`1369639224651650`) foi excluído. A consulta atual do Meta MCP retornou somente `API Estética Schneider Auto` (`1637078911202031`), o único app disponível nesta sessão e a referência para as próximas etapas de App Review. A ausência do app 136 na lista do MCP, isoladamente, não prova exclusão — o MCP lista apenas apps concedidos à integração —, mas ele deve ser tratado como excluído/indisponível conforme a informação do usuário e não deve ser usado.

| Ativo | Identificação | Estado e fonte |
| --- | --- | --- |
| App `API Estética Schneider Auto` | `1637078911202031` | Meta MCP em 2026-10-22: papel `admin`, `dev_mode`, `is_live=false`, caso de uso WhatsApp. É o único app disponível nesta sessão e o contexto do teste direto da Meta. O status de App Review está contraditório; não chamar a solicitação de pendente ou aprovada sem confirmar na tela. |
| App `Thaís Schneider Estética Whats` | `1369639224651650` | Usuário informa que foi excluído; não apareceu na lista atual do MCP. Não usar. A exclusão não foi confirmada por uma consulta administrativa à Meta. |
| Portfólio empresarial consolidado pelo usuário | `958284598092300` | “Thaís Schneider”. A consulta atual do MCP retornou `businesses: []`; esta autorização do MCP não incluiu acesso de negócios. `owning_business_id=null`/`owning_business_granted=false` não prova ausência de proprietário empresarial. |
| WABA real consolidado pelo usuário | `5523215167904668` | Conta “Thaís Schneider”. A relação atual com o app 163 não foi exposta pelo MCP. |
| Número real e Phone Number ID consolidados pelo usuário | `+55 51 8591-0322`; `1813419303167468` | Confirmados pelo usuário em 2026-10-24 como pertencentes ao WABA acima. O ID anterior `1287807847751041` fica substituído neste registro; a Meta não confirmou a troca via MCP. Não usar o número real no Sandbox de App Review. |
| Usuário do sistema informado | `sistemaesteticawhatsapp` (`61594998936645`) | Atribuições e token atuais não foram verificados nesta consulta. |

**O vínculo do app 163 ao WABA e ao telefone reais continua não confirmado.** A tela anterior do usuário mostrava o app como propriedade de “Thaís Schneider”, mas isso não demonstra que o WABA/número real esteja conectado ao caso de uso do app. O MCP atual não lista portfólios nem expõe ativos WhatsApp. A confirmação exige consultar o app 163 e o WABA/telefone na interface Meta com a conta e o portfólio corretos.

### Ativos do teste direto da Meta

No payload de teste fornecido pelo usuário em 2026-10-13, a Meta mostrou:

- app no contexto do evento: `1637078911202031`;
- WABA de teste: `4544814659084494`;
- Phone Number ID de teste: `1255191607683337`;
- destinatário que recebeu: `+55 51 98660-3385`;
- estados retornados: `sent` e `delivered`.

Isso comprova que aquele teste do painel Meta foi aceito e entregue pelo fluxo do app 163. Não é o WABA, o remetente ou o Phone Number ID real da Thaís, e não comprova a coexistência nem o vínculo do app 163 ao número real.

## 2. Snapshot Meta MCP — 2026-10-22

- A lista de apps concedidos ao MCP contém somente `1637078911202031`, como `admin`, com permissões MCP de leitura e gestão. A lista de portfólios está vazia. O MCP não tem, nesta autorização, visibilidade suficiente para confirmar o proprietário empresarial nem os ativos WhatsApp.
- O app 163 está em `dev_mode` (`is_live=false`) e tem o caso de uso “Conectar-se com clientes pelo WhatsApp”, cujas permissões requeridas são `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile`.
- Configurações básicas: categoria `BUSINESS`, ícone e política de privacidade configurados; contato `maiquelnet@gmail.com` não verificado; URL dos termos e URL de exclusão de dados apontam para `https://www.facebook.com/`. Nos requisitos, a Meta retornou `business_verification_passes=true` e `has_privacy_policy=true`.
- O estado de App Review é inconclusivo e contraditório entre operações do MCP: `status` retornou `UNSUBMITTED`, `is_approved=true` e submission ID `1643837040526218`; `history` retornou lista vazia e `has_been_previously_reviewed=false`; `requirements` diz que não pode enviar porque um envio anterior estaria em análise e marca as etapas de ambas as permissões como incompletas; `privileges` retornou `REJECTED` para `whatsapp_business_messaging` e `whatsapp_business_management`, ambas com `in_current_submission=true`. Não concluir que as permissões foram aprovadas, rejeitadas definitivamente ou que exista análise pendente sem conferir a tela Meta.
- O usuário confirmou em 2026-10-22 que uma mensagem enviada pelo Sandbox chegou ao WhatsApp destinatário. Isso é evidência de sucesso do teste configurado, não confirmação do vínculo do número real nem da coexistência.
- Nenhuma operação de escrita foi feita na Meta nesta verificação.

Para confirmar o vínculo, reautorize o Meta MCP incluindo o portfólio `958284598092300` na concessão `business_management` e consulte os ativos WhatsApp, ou verifique manualmente no Business Settings/WhatsApp Manager. A sessão de navegador disponível nesta tarefa não apresentou uma sessão Meta para essa consulta. Até lá, mantenha a relação app–WABA–telefone como “não confirmada pela Meta”.

Correção manual ainda necessária nas configurações básicas do app 163: substituir as URLs genéricas `https://www.facebook.com/` dos Termos de Serviço e da exclusão de dados por páginas públicas apropriadas, e concluir a verificação do e-mail de contato. O MCP disponível só lê essas configurações; não ofereceu operação para editá-las.

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

A função consulta a Meta antes de enviar: confirma se o token é válido, se o `app_id` retornado corresponde ao `WHATSAPP_REVIEW_APP_ID`, se o token tem `whatsapp_business_messaging` e `whatsapp_business_management`, se o Phone Number ID consta no WABA e se existe nele um modelo `APPROVED` com nome e idioma exatos. Também compara o maior placeholder do corpo (por exemplo, `{{3}}` exige três valores) com o array JSON `WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON`, enviado como parâmetros do corpo. Para modelo sem variáveis, configure `[]`. Este teste suporta somente texto no corpo e cabeçalho textual estático; bloqueia cabeçalho de mídia/variável e botão com URL dinâmica para evitar envios incompletos. O endpoint rejeita os IDs conhecidos do WABA e do telefone reais; use somente o remetente de teste. Esses valores ainda precisam ser cadastrados/confirmados no painel Supabase; nenhum token ou segredo é documentado aqui. A versão Graph, nome e idioma do modelo devem vir do painel do app/WABA que realmente será analisado, sem usar valores presumidos.

Se a auditoria não puder ser criada antes da chamada, nada é enviado. Depois da chamada, “aceita pela Meta” fica separado de “auditoria persistida”. Resposta incerta, aceite sem WAMID ou falha da atualização de auditoria exige reconciliação manual e bloqueia novo envio até conferência. A aceitação HTTP não prova entrega; confirme o recebimento no WhatsApp e o evento de status.

### Estado remoto do teste

Em 2026-10-19, o MCP Supabase confirmou `whatsapp-review-test` v1 e publicou as versões endurecidas v2, v3 e v4. A v4 exige corpo textual e só aceita cabeçalho textual estático, botão URL estático ou botão de telefone; bloqueia mídia, cabeçalho dinâmico, resposta rápida e componentes desconhecidos. Em 2026-10-22, o usuário confirmou que o Sandbox enviou e entregou uma mensagem. A presença/validade atual dos Secrets não é visível pelo MCP, e a consulta Meta retornou estado contraditório de App Review; portanto, a entrega relatada não confirma o vínculo do número real nem substitui o screencast e a validação da tela de análise.

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

- O ambiente é definido pela variável pública de build `VITE_APP_ENV`; o build da Vercel exige que ela corresponda a `VERCEL_ENV` (`preview` em Preview e `production` em Production).
- A Vercel Preview usa atualmente o mesmo projeto Supabase de produção `xucttzuthznqwlhushmg`; não existe staging Supabase isolado confirmado. A flag `preview` não isola banco, Auth, dados, Vault, Secrets, Edge Functions, cron ou webhooks.
- A interface de Preview esconde o painel normal que poderia chamar o envio WhatsApp de produção e mostra somente o Sandbox do App Review.
- Não conecte o onboarding real em Preview: a conexão deve ocorrer somente em Production, após revisão e publicação controladas da migration e das Edge Functions.
- A integração GitHub–Vercel pode criar uma Preview após o push, mas não se considera deploy concluído sem verificar o check/URL da Vercel.

## 8. Próximas ações seguras

1. Reautorizar o Meta MCP para o portfólio `958284598092300` e confirmar, com evidência da Meta, se o app 163 está ligado ao WABA `5523215167904668` e ao Phone Number ID real `1813419303167468`.
2. Usar `API Estética Schneider Auto` (`1637078911202031`) como único app disponível para a revisão. Manter os IDs do WABA e número de teste separados dos ativos reais; nunca configurar o número real como remetente do Sandbox.
3. Cadastrar no Supabase, sem expor no chat, os Secrets `WHATSAPP_REVIEW_*` listados acima para o app que será analisado e seu remetente de teste confirmado. Não reutilizar os IDs do número real.
4. Confirmar no Preview que o status da Meta, as permissões, o template exato e a quantidade de parâmetros estão verificados; enviar uma única mensagem ao destinatário autorizado, confirmar auditoria e recebimento.
5. Gravar e submeter o vídeo manualmente no App Review quando o app e o Configuration ID v4 estiverem confirmados. O site já possui o onboarding local de coexistência, mas ele só deve ser liberado após essa validação externa e a publicação controlada das migrations/funções.

## 9. Embedded Signup e coexistência

O frontend local abre o Embedded Signup v4 com `featureType=whatsapp_business_app_onboarding`, recebe o código temporário e os dados de sessão, e chama `whatsapp-onboarding`. Essa Edge Function troca o código somente no servidor, valida que o `phone_number_id` pertence à WABA retornada, assina o app aos webhooks e grava o token no Vault por clínica. Ela não chama `/register` nem desregistra o número, para não converter o fluxo em Cloud API exclusiva.

Os identificadores públicos fornecidos para esta configuração são App ID `1637078911202031` e Configuration ID `1428537329377840`; a relação com o WABA/número real ainda precisa ser confirmada na Meta. Consulte [WhatsApp coexistência](./whatsapp-coexistencia.md) para a sequência, Secrets, migration e pendências.
