# Manual do Usuario

## Estado atual

O sistema final ainda esta em construcao.

Hoje existem:

- Site publico institucional.
- Painel administrativo legado via Google Apps Script.
- Banco Supabase preparado para o novo sistema.

## Site publico

O site apresenta:

- Identidade da profissional.
- Servicos oferecidos.
- Experiencia de atendimento.
- Contato via Instagram.
- Link para painel administrativo.

Arquivo principal:

```text
index.html
```

## Painel administrativo legado

O painel atual permite:

- Ver dashboard.
- Cadastrar clientes.
- Cadastrar servicos.
- Cadastrar agendamentos.
- Gerar mensagens manuais para WhatsApp.
- Criar campanhas.
- Ver indicadores financeiros simples.
- Ajustar configuracoes.

## Fluxos principais

### Cadastrar cliente

1. Acessar aba Clientes.
2. Informar nome e telefone.
3. Opcionalmente informar e-mail, nascimento e observacoes.
4. Salvar.

### Cadastrar servico

1. Acessar aba Servicos.
2. Informar nome, categoria, descricao e duracao.
3. Informar valor ou marcar preco sob avaliacao.
4. Salvar.

### Criar agendamento

1. Acessar aba Agenda.
2. Selecionar cliente.
3. Selecionar servico.
4. Definir inicio e fim.
5. Conferir valor aplicado.
6. Salvar.

### Enviar mensagem manual

1. Ver mensagens pendentes no painel.
2. Abrir WhatsApp.
3. Revisar a mensagem.
4. Enviar manualmente.
5. Marcar como enviada no painel.

## Capacidades futuras no app Supabase

O novo app devera permitir:

- Login seguro.
- Gestao de clientes.
- Gestao de servicos e precos.
- Agenda.
- Historico de atendimento.
- Mensagens e campanhas.
- Financeiro.
- Controle por clinica e papel.

## Limitacoes atuais

- Ainda nao ha app Supabase no repositorio.
- O painel legado usa Google Sheets.
- O envio de WhatsApp e manual.
- Nao ha IA implementada.

