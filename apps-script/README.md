# Painel Administrativo | Google Apps Script

Este diretório contém o painel administrativo da Thais Schneider Estética como um Web App do Google Apps Script.

## Arquivos

- `Code.gs`: backend, planilha, Google Agenda, regras de alerta e mensagens.
- `Index.html`: estrutura do painel.
- `Styles.html`: estilos da interface.
- `Client.html`: JavaScript do painel.
- `appsscript.json`: timezone, permissões e configuração do Web App.

## Publicação

1. Crie uma planilha no Google Sheets para ser a base de dados.
2. Na planilha, acesse `Extensões > Apps Script`.
3. Copie os arquivos deste diretório para o projeto do Apps Script.
4. Em `Code.gs`, troque `troque-pelo-email-da-profissional@gmail.com` pelo email Google da profissional.
5. Execute a função `setup()` no editor do Apps Script e autorize os acessos solicitados.
6. Verifique se as abas foram criadas: `clientes`, `servicos`, `precos_servicos`, `agendamentos`, `mensagens_enviadas`, `mensagens_dispensadas` e `configuracoes`.
7. Confirme na aba `servicos` que os serviços iniciais da estética foram criados. A função `setup()` é idempotente: ela não duplica serviços nem sobrescreve histórico de preços já existente.
8. Em `Implantar > Nova implantação`, escolha `App da Web`.
9. Use:
   - Executar como: `Eu`
   - Quem tem acesso: `Somente eu`
10. Abra a URL gerada pelo Apps Script.

## Configurações

No painel, ajuste:

- Nome da clínica.
- Link de avaliação do Google.
- ID do calendário Google, se quiser usar um calendário específico. Se ficar vazio, será usado o calendário padrão da conta.
- Emails administradores, separados por vírgula.

## WhatsApp

O envio é manual nesta versão. O painel gera o link com a mensagem pronta, abre o WhatsApp e a profissional confirma no painel quando a mensagem foi enviada.

## Alertas implementados

- Confirmação de agendamento: imediatamente após criar o agendamento.
- Lembrete de agendamento: a partir de 8 horas antes do horário.
- Falta, pós-atendimento crítico e pedido de avaliação: a partir de 2 horas após o horário.
- Aniversário: a partir de 1 dia antes do aniversário.
- Lembrete de retorno: a partir de 20 dias após o último agendamento.
- Promoção/campanha: envio manual, sem alerta automático.
