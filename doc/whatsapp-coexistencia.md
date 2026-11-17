# WhatsApp Business: coexistência do mesmo número

Atualizado em: 2026-11-11. Este documento descreve o que o código local prepara e o que ainda depende da Meta/Supabase. Nenhuma migration ou Edge Function desta etapa foi publicada.

## Resultado esperado

O número que já está ativo no app WhatsApp Business do celular passa pelo Embedded Signup v4 com `featureType=whatsapp_business_app_onboarding`. Depois da autorização, o mesmo número fica disponível para a Cloud API e continua utilizável no app do celular.

O site não registra o número novamente por uma chamada genérica de `/register`: isso pode transformar o onboarding em Cloud API exclusiva. O fluxo de coexistência é escolhido dentro do Embedded Signup e a função apenas troca o código, confirma a dupla WABA/Phone Number ID e assina o app aos webhooks da WABA.

## Pré-requisitos externos

- App WhatsApp Business atualizado e número em uso no celular; a elegibilidade e os limites são decididos pela Meta durante o fluxo.
- App Meta em modo e revisão compatíveis com Embedded Signup, permissões `whatsapp_business_management` e `whatsapp_business_messaging`, e configuração v4 ativa.
- Conta/portfólio empresarial e WABA sob a conta que fará o onboarding.
- Domínio HTTPS do site permitido no Facebook Login for Business e callback do webhook configurado no WhatsApp Manager.
- A Meta precisa reconhecer o negócio como Tech Provider/Solution Partner quando essa exigência aparecer no painel. O código do site não concede essa habilitação.

## Configuração no site

Variáveis públicas do build da Vercel:

```text
VITE_META_APP_ID=1637078911202031
VITE_META_EMBEDDED_SIGNUP_CONFIG_ID=1428537329377840
VITE_META_GRAPH_VERSION=v23.0
```

O App ID e o Configuration ID são identificadores públicos. Não coloque App Secret, token de acesso ou token de verificação em `VITE_*`.

Secrets da Edge Function `whatsapp-onboarding`:

```text
META_APP_ID
META_APP_SECRET
META_GRAPH_VERSION             # opcional; se ausente usa WHATSAPP_GRAPH_VERSION ou v23.0
META_WEBHOOK_VERIFY_TOKEN
```

Depois de configurar a Meta, o frontend chama `whatsapp-onboarding`. O código temporário nunca é persistido pelo navegador: a função troca-o server-side e grava o token retornado no Supabase Vault com o nome `meta:<clinic_id>:access_token`. App Secret e token de verificação também são copiados para os nomes por clínica usados pelo webhook.

## Sequência implementada

1. Administrador clica em **Conectar WhatsApp Business** em Configurações > Parâmetros Gerais.
2. A SDK JavaScript da Meta abre o Embedded Signup v4 com `featureType=whatsapp_business_app_onboarding` e `sessionInfoVersion=3`.
3. O navegador recebe o código temporário e os dados de sessão `waba_id`/`phone_number_id` por canais separados.
4. A Edge Function troca o código, consulta os telefones do WABA e exige que o Phone Number ID retornado pertença àquela WABA.
5. A Edge Function chama `/{waba_id}/subscribed_apps` e só então persiste a integração no Vault/tabela privada.
6. O painel exibe o número, WABA, expiração informada do token e a próxima etapa: validar o callback e um evento real do webhook.

## Limites e operação

- O vínculo pode ser reconectado, mas não deve ser repetido sem necessidade; códigos do Embedded Signup expiram rapidamente.
- A coexistência não torna grupos, chamadas ou todos os recursos do app disponíveis na Cloud API. A qualidade, os limites e a elegibilidade continuam sendo da Meta.
- Para desconectar, use o próprio app WhatsApp Business/WhatsApp Manager conforme a orientação da Meta; não adicione um botão de deregistro genérico no site.
- Antes de ativar automações, valide opt-in do cliente, modelo aprovado, webhook de entrada e estados de entrega.
- Preview não é um ambiente seguro para esse onboarding: hoje ele compartilha o projeto Supabase de produção. A conexão deve ocorrer somente em Production após revisão e publicação controladas.

## Pendências antes de produção

1. Confirmar no painel Meta que o app `1637078911202031` e o Configuration ID `1428537329377840` estão no portfólio correto e elegíveis para coexistência.
2. Configurar os Secrets acima no projeto Supabase autorizado, sem expô-los no chat ou no frontend.
3. Aplicar a migration `20261019153000_meta_clinic_integrations_and_reconciliation.sql` e depois `20261111220000_meta_whatsapp_embedded_signup.sql`, após comparar as migrations remotas.
4. Publicar `whatsapp-onboarding`, `whatsapp-messages` e `meta-whatsapp-webhook` como um conjunto revisado.
5. Configurar/confirmar o webhook da Meta e testar uma mensagem recebida e um status de entrega.

