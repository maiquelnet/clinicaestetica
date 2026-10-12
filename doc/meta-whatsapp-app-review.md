# Guia Meta: WhatsApp Cloud API e análise do app

Atualizado em: 2026-10-08.

Este guia descreve a configuração da integração atual da Estética Schneider. Ele é específico para o aplicativo Meta da Thaís e não deve ser usado para trocar IDs, WABA, telefone ou Secrets por valores de outro portfólio.

## 1. Ativos corretos

| Ativo | Identificação | Estado/uso |
| --- | --- | --- |
| Portfólio empresarial | `958284598092300` | `Thaís Schneider` |
| App Meta | `1637078911202031` | `API Estética Schneider Auto` |
| WABA | `5523215167904668` | `Thaís Schneider` |
| Phone Number ID | `1287807847751041` | Número remetente configurado na Meta |
| System User | `61594998936645` | `sistemaesteticawhatsapp` |

O aplicativo `Thaís Schneider Estética Whats` (`1369639224651650`) não é o app usado pela integração atual. Não misture seus templates, tokens ou Phone Number ID com os ativos desse aplicativo.

## 2. O que já está concluído

- App Meta criado no portfólio da Thaís.
- Política de privacidade configurada em `https://www.esteticaschneider.com.br/politica-de-privacidade`.
- Categoria do app definida como `Business` e ícone configurado.
- Verificação da empresa aprovada.
- System User com acesso total ao app e à WABA correta.
- Versão Meta de `whatsapp-messages` publicada no Supabase.
- Webhook Meta publicado e ativo.
- Assinatura Meta ativa para `messages` e `account_update`.
- Envio de teste validado pela Cloud API.
- O template `confirmacao_agendamento_v1`, idioma `pt_BR`, foi validado como aprovado na WABA correta.

O App Meta continua em `dev_mode`. As permissões avançadas `whatsapp_business_messaging` e `whatsapp_business_management` ainda não estão live; portanto, a análise do app continua sendo uma etapa pendente para produção aberta.

## 3. Configuração no Meta for Developers

### 3.1 Selecionar o app correto

1. Abra o Meta for Developers.
2. Selecione `API Estética Schneider Auto`.
3. Confirme o App ID `1637078911202031`.
4. Em Casos de uso, mantenha `Conectar no WhatsApp`.
5. Use `Integrar com API`, pois este app opera o número próprio da clínica.
6. Não use `Torne-se um parceiro` neste app da Thaís.

### 3.2 Registrar o número e a cobrança

1. Entre em Configuração básica > Etapa 2. Configuração de produção.
2. Confirme que o número já aparece como registrado.
3. Não clique em “Adicionar novo número” se estiver configurando o número já existente na WABA `5523215167904668`.
4. A forma de pagamento pertence à WABA, não ao App ID. Confira o cartão em Billing Hub selecionando `Thaís Schneider` e o ID `5523215167904668`.
5. Não use o WABA de teste `4544814659084494`.

### 3.3 Configurar o webhook

Use exatamente:

```text
URL de callback:
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/meta-whatsapp-webhook

Token de verificação:
o mesmo valor do Secret META_WEBHOOK_VERIFY_TOKEN
```

Depois de verificar e salvar:

1. Assine o campo `messages`.
2. Mantenha `account_update` se ele continuar ativo no painel.
3. Confirme que a assinatura aponta para o callback acima.
4. Não cole o token de verificação no GitHub, na Vercel ou no frontend.

O webhook valida o desafio inicial com `META_WEBHOOK_VERIFY_TOKEN` e valida os POSTs com `META_APP_SECRET`/`X-Hub-Signature-256`.

### 3.4 Gerar o token correto

1. Em Configurações do negócio > Usuários do sistema, selecione `sistemaesteticawhatsapp`.
2. Confirme acesso total ao app `API Estética Schneider Auto`.
3. Confirme acesso total à WABA `Thaís Schneider`.
4. Gere um token para o App ID `1637078911202031`.
5. Use as permissões necessárias para a integração:
   - `whatsapp_business_messaging`;
   - `whatsapp_business_management`, somente para consultar/administrar ativos e templates.
6. Atualize o Secret `WHATSAPP_ACCESS_TOKEN` no Supabase.

O token temporário do botão “Gerar token” da tela de teste da Meta serve apenas para o experimento do painel. Ele não deve substituir o token permanente do System User no Supabase.

## 4. Templates de mensagem

O sistema não cria templates via API. Ele consulta e envia templates que já existem e foram aprovados na WABA.

Para criar um template:

1. Abra o Gerenciador do WhatsApp.
2. Selecione a conta `Thaís Schneider` com ID `5523215167904668`.
3. Crie o modelo na categoria adequada, normalmente `Utility` para confirmação e lembrete.
4. Use o idioma exato `pt_BR`.
5. Aguarde o status `Approved`.
6. Cadastre no sistema o nome Meta exatamente igual ao nome aprovado.
7. Execute `validate-template` antes de ativar a regra automática.

O nome, idioma e WABA precisam corresponder. O erro `(#132001) Template name does not exist in the translation` normalmente indica nome/idioma no WABA errado, nome digitado diferente ou template ainda não aprovado.

## 5. Secrets do Supabase

Cadastre os nomes abaixo em Supabase > Edge Functions > Secrets. Os valores não devem ser documentados:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_CRON_SECRET
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
```

Valores públicos de referência:

```text
WHATSAPP_PHONE_NUMBER_ID=1287807847751041
WHATSAPP_BUSINESS_ACCOUNT_ID=5523215167904668
WHATSAPP_GRAPH_VERSION=v23.0
```

O `WHATSAPP_FUNCTION_URL` é usado pelo scheduler/Vault:

```text
https://xucttzuthznqwlhushmg.supabase.co/functions/v1/whatsapp-messages
```

Nunca coloque `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `service_role` ou secret key em variáveis `VITE_*`.

### 5.1 Sandbox separado para a gravação do App Review

O branch `meta-review-sandbox` usa `VITE_APP_ENV=preview` e exibe, em Configurações > Parâmetros, um painel separado chamado **Sandbox do App Review**. Esse painel chama a Edge Function `whatsapp-review-test` e nunca reutiliza o remetente da produção.

Cadastre no Supabase os Secrets abaixo usando os dados exibidos pelo número de teste do app Meta `1637078911202031`:

```text
WHATSAPP_REVIEW_ACCESS_TOKEN
WHATSAPP_REVIEW_PHONE_NUMBER_ID
WHATSAPP_REVIEW_GRAPH_VERSION=v23.0
WHATSAPP_REVIEW_TEMPLATE_NAME=hello_world
WHATSAPP_REVIEW_TEMPLATE_LANGUAGE=en_US
```

`WHATSAPP_REVIEW_ACCESS_TOKEN` e os IDs do número de teste ficam somente no servidor. O painel aceita apenas usuários administradores da clínica e grava o WAMID do teste em `whatsapp_testes` com o provedor `meta_review_sandbox`.

O sandbox não altera `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` ou `WHATSAPP_BUSINESS_ACCOUNT_ID` da produção. Depois da gravação, o branch pode ser removido ou mantido apenas para homologação; a branch `main` continua sendo o ambiente de produção.

## 6. Teste completo

### Teste manual no sistema

1. Entre no sistema com usuário proprietário ou administrador.
2. Abra Configurações > Parâmetros.
3. Localize a seção WhatsApp Cloud API.
4. Confirme o status `Configurado`.
5. Informe um destinatário autorizado, diferente do número remetente.
6. Clique em `Enviar mensagem de teste`.
7. Confirme o WAMID retornado.
8. Confira o recebimento no WhatsApp do destinatário.

### Teste automático

1. Cadastre um cliente com telefone em formato internacional.
2. Registre o consentimento WhatsApp como `aceito`.
3. Crie um agendamento futuro.
4. Ative uma regra com `canal_padrao=whatsapp_business`.
5. Confirme que o template usado está aprovado.
6. Aguarde o job `process-whatsapp-messages` a cada cinco minutos.
7. Verifique a fila, o log e o WAMID.
8. Confirme que o mesmo ciclo não foi enviado duas vezes.

Aceite HTTP da Meta significa que a chamada foi aceita, não que a mensagem foi lida. Entrega e leitura dependem dos eventos recebidos pelo webhook.

## 7. Análise do app

Na página de Envios de análise do app, as permissões devem ser solicitadas somente quando o sistema realmente usar cada uma:

- `whatsapp_business_messaging`: necessária para enviar mensagens.
- `whatsapp_business_management`: necessária para administrar/consultar ativos e modelos; o sistema atual não cria modelos via API.
- `public_profile`: não é necessária para o fluxo atual.

Para `whatsapp_business_messaging`, o screencast deve mostrar:

1. O sistema aberto e autenticado.
2. Configurações > Parâmetros.
3. O status Meta configurado e o modelo aprovado.
4. O clique em `Enviar mensagem de teste`.
5. O retorno de sucesso/WAMID.
6. O mesmo texto recebido no WhatsApp do destinatário.

Para `whatsapp_business_management`, só grave um vídeo se houver uma operação real de gerenciamento via API, como criação/consulta de modelo pela API. Criar o modelo manualmente no WhatsApp Manager não prova criação via API.

Antes de enviar a análise, conclua para cada permissão: descrição de uso, screencast, API precheck, Data Use Checkup, tratamento de dados e instruções para o analista.

Estado verificado em 2026-10-08:

- App Review: `UNSUBMITTED`.
- Compliance: `compliant`, sem ações necessárias.
- Política de privacidade e verificação da empresa: presentes/aprovadas.
- Webhook: ativo.
- Permissões WhatsApp avançadas: ainda não live.

## 8. Limitações atuais e próximos passos

- A integração atual atende uma única clínica e usa Secrets globais.
- Ela não é multi-tenant para várias WABAs.
- Não importa histórico completo de conversas recebidas.
- A criação de modelos via API ainda não faz parte do sistema.
- O próximo passo Meta é concluir corretamente a análise do app, sem declarar uma capacidade que o sistema não implementa.
- Para novos clientes, mantenha WABA, número, cobrança, tokens e templates separados.

