# Manual do Usuário

Atualizado em: 2026-09-07.

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

Resumo de agenda, clientes, próximos horários e indicadores operacionais. O card `Próximos 7 dias` considera os sete dias seguintes no fuso da clínica e mostra capacidade comercial, ocupação, bloqueios e janelas livres.

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

### Disponibilidade comercial

1. Abra `Configurações > Horários`.
2. Configure os períodos habituais de cada dia e salve os horários semanais.
3. Para uma data fora do padrão, use `Adicionar exceção`.
4. Escolha novos períodos ou marque `Não atenderei neste dia`; adicione uma observação se desejar.
5. Edite ou exclua a exceção quando necessário. Ao excluir, a data volta a usar o horário semanal.

A disponibilidade comercial não bloqueia a criação manual de agendamentos e não altera bloqueios da agenda ou a sincronização com o Google.

### Radar de oportunidades

Na área `Secretária`, o `Radar da agenda` destaca os dias com baixa ocupação e pelo menos 120 minutos livres. Ao abrir um dia, confira clientes compatíveis da lista de espera ativa e clientes cujo retorno já venceu após um atendimento concluído.

O Radar é informativo: ele não envia mensagens, não reserva horários e não cria agendamentos. As oportunidades são recalculadas com os dados atuais e respeitam duração do serviço, preferências da fila, consentimentos e agendamentos futuros ativos.

### Plano de ação da secretária

1. Na área `Secretária`, encontre um dia destacado pelo Radar e clique em `Preparar ação`.
2. Revise o plano criado com até cinco clientes únicos. A lista de espera aparece antes dos retornos.
3. Desmarque ou use `Remover` para retirar um candidato. A remoção fica registrada e não apaga o histórico.
4. Abra `Ver outras oportunidades atuais` para adicionar um cliente que ainda esteja no resultado atual do Radar. Não há busca geral nem inclusão manual nesta versão.
5. Use `Atualizar plano` para recalcular a agenda e a elegibilidade dos candidatos.
6. Clique em `Aprovar plano` somente depois da revisão. Se a agenda mudou, o sistema informa a mudança e pede atualização; não aprova silenciosamente.
7. Use `Cancelar plano` para encerrar a revisão sem excluir os registros de auditoria.

A aprovação não envia WhatsApp, não abre conversa, não agenda atendimento, não reserva horário e não altera a lista de espera. Ela apenas registra que o plano foi aprovado; os clientes ainda não foram contatados.

### Mensagens

Há dois canais:

- WhatsApp manual: abrir a conversa, revisar/enviar e registrar no painel;
- WhatsApp Business automático: usa template Meta aprovado, consentimento e regra ativa.

Na primeira versão automática, use somente confirmação e lembrete. O envio periódico depende do agendador técnico; confirme o status `Configurado` e `Agendador ativo` em Configurações antes de considerar a automação ativa.

### Marketing

- Campanhas: cria a mensagem e público por todos os clientes, clientes ativos ou interesses em serviços; a tela mostra uma estimativa e gera os destinatários.
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

### Planos de tratamento

1. Abra Planos de tratamento e crie ou edite um plano.
2. Informe início, horário, total de sessões, frequência e duração do serviço.
3. Para intervalo personalizado, informe a quantidade de dias; habilite sábado e domingo quando necessário.
4. Revise as datas exibidas no cronograma e salve.
5. As sessões são criadas na Agenda com o profissional autenticado. Datas passadas, ajustes manuais e itens aguardando reagendamento são preservados ao recalcular.

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
- Cada template usado precisa estar `APPROVED` na WABA correta. O template de confirmação já foi validado; o lembrete deve ser conferido antes de ativar uma regra que o utilize.
- A integração Meta registra os estados entregue/lido quando esses eventos são enviados pelo webhook oficial publicado e configurado.
- Não existe IA generativa no produto.
- Alguns módulos administrativos ainda têm pendências de segurança/performance registradas no runbook.
- O cronograma de tratamentos e a segmentação por interesses estão disponíveis na aplicação, mas continuam sujeitos à validação funcional antes de uso operacional amplo.
- O Apps Script é legado e não deve ser usado como painel principal.
