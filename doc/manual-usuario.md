# Manual do Usuário

Atualizado em: 2026-08-13.

## Acesso

Site: `https://www.esteticaschneider.com.br`

Painel: `https://www.esteticaschneider.com.br/login`

Entre com o usuário criado no Supabase Auth. O usuário precisa ter perfil e vínculo ativo com a clínica; sem isso, o sistema mostra “Acesso sem clínica vinculada”.

## Site público

- apresenta a Estética Schneider e seus serviços;
- exibe avaliações públicas do Google quando configuradas;
- oferece links de contato/avaliação;
- permite cadastro público em `/cadastro-cliente`.

O cadastro público não marca automaticamente consentimento de marketing ou WhatsApp.

## Painel administrativo

### Dashboard

Resumo de agenda, clientes, próximos horários e indicadores operacionais.

### Clientes

1. Abra Clientes.
2. Clique em Novo cliente ou edite um registro.
3. Informe nome e telefone com DDD.
4. Complete dados opcionais.
5. Marque consentimentos somente quando a cliente tiver autorizado.
6. Salve.

Marketing e WhatsApp são autorizações diferentes. Ao trocar o telefone, obtenha novo consentimento para mensagens nesse número.

### Serviços e preços

Cadastre nome, categoria, duração, descrição e preço. Alterações de serviço/preço são salvas de forma transacional.

### Agenda

1. Escolha cliente, serviço, início e fim.
2. Salve o agendamento.
3. Se o Google Agenda estiver conectado, o sistema solicita sincronização.
4. Use os status agendado, confirmado, concluído ou cancelado conforme o fluxo.

Eventos externos do Google aparecem como bloqueios. A fila de espera permite reservar interesse e confirmar somente quando não houver conflito.

### Mensagens

Há dois canais:

- WhatsApp manual: abrir a conversa, revisar/enviar e registrar no painel;
- WhatsApp Business automático: usa template Meta aprovado, consentimento e regra ativa.

Na primeira versão automática, use somente confirmação e lembrete. O envio periódico ainda depende do agendador técnico; confirme o status em Configurações antes de considerar a automação ativa.

### Marketing

- Campanhas: cria a mensagem e público.
- Disparos: abre WhatsApp e registra resultado manual.
- Satisfação: registra avaliações internas e abre o link Google.

Campanhas devem respeitar `aceita_marketing`.

### Demais módulos

- Equipamentos e salas;
- Planos de tratamento;
- Fluxo de caixa, contas a receber e a pagar;
- Itens de estoque e fornecedores;
- Usuários e papéis;
- Parâmetros da clínica e integrações.

## Conectar Google Agenda

1. Configurações > Parâmetros Gerais > Google Agenda.
2. Clique em Conectar Google Agenda.
3. Escolha a conta Google e autorize Calendar.
4. Retorne ao sistema e confira “Conectado”.
5. Use Sincronizar agora para um teste inicial.

O Google sabe qual conta foi escolhida pelo login OAuth; o sistema associa o retorno à clínica usando um `state` seguro. A senha Google não passa pelo sistema.

## Testar WhatsApp

1. A Meta e os Secrets precisam estar configurados.
2. Ative um modelo aprovado.
3. Em Configurações, informe um destinatário autorizado de teste.
4. Envie e confirme o recebimento.
5. Só depois habilite regra automática e consentimento de uma cliente de teste.

O botão de teste não significa que o scheduler periódico está ativo. Consulte o responsável técnico.

## Limitações atuais

- WhatsApp automático usa Supabase Cron a cada cinco minutos; em 2026-08-13 o painel confirmou `Agendador ativo`.
- Os templates de confirmação e lembrete ainda aguardavam aprovação da Meta nessa data; regras automáticas não devem ser ativadas antes de `APPROVED`.
- A versão WhatsApp implantada não registra entregue/lido por webhook.
- Não existe IA generativa no produto.
- Alguns módulos administrativos ainda têm pendências de segurança/performance registradas no runbook.
- O Apps Script é legado e não deve ser usado como painel principal.
