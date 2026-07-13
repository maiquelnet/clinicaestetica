# Qualidade e Casos de Teste

## Estado atual

Nao ha suite automatizada de testes no repositorio.

O projeto atual contem arquivos estaticos e Apps Script legado. A futura app moderna deve incluir testes automatizados.

## Casos de teste recomendados por modulo

### Autenticacao e acesso

| Cenario | Resultado esperado |
| --- | --- |
| Usuario nao autenticado tenta acessar app admin | Redirecionar para login. |
| Usuario autenticado sem vinculo em `usuarios_clinicas` | Bloquear acesso. |
| Usuario vinculado a uma clinica acessa dados dela | Permitir leitura/escrita conforme papel. |
| Usuario tenta acessar dados de outra clinica | Bloquear via RLS. |

### Clientes

| Cenario | Resultado esperado |
| --- | --- |
| Criar cliente com nome e telefone validos | Registro criado. |
| Criar cliente sem nome | Exibir erro de validacao. |
| Criar cliente sem telefone | Exibir erro de validacao. |
| Arquivar cliente | `ativo=false` e `arquivado_em` preenchido. |
| Cliente com `aceita_marketing=false` entra em campanha | Bloquear selecao ou alertar operador. |

### Servicos e precos

| Cenario | Resultado esperado |
| --- | --- |
| Criar servico com duracao positiva | Registro criado. |
| Criar servico com duracao zero ou negativa | Bloquear. |
| Criar preco atual | Inserir em `precos_servicos`. |
| Alterar preco | Encerrar preco anterior e criar novo. |
| Servico sob consulta | Nao exigir valor. |

### Agendamentos

| Cenario | Resultado esperado |
| --- | --- |
| Criar agendamento com fim depois do inicio | Registro criado. |
| Criar agendamento com fim antes do inicio | Bloquear. |
| Criar agendamento sem cliente | Bloquear. |
| Criar agendamento sem servico, se obrigatorio no fluxo | Bloquear. |
| Cancelar agendamento | Atualizar status e registrar historico. |

### Mensagens

| Cenario | Resultado esperado |
| --- | --- |
| Gerar confirmacao de agendamento | Criar pendencia ou sugestao de mensagem. |
| Registrar mensagem enviada | Inserir em `logs_mensagens`. |
| Dispensar mensagem | Inserir em `mensagens_dispensadas`. |
| Tentar gerar mensagem duplicada para mesmo ciclo | Bloquear duplicidade. |

### Financeiro

| Cenario | Resultado esperado |
| --- | --- |
| Registrar receita de agendamento | Criar `movimentacoes_financeiras`. |
| Registrar despesa | Valor positivo e tipo `despesa`. |
| Marcar pagamento | Preencher `pago_em` e status `pago`. |

## Testes de IA

Nao aplicavel no estado atual, pois nao ha IA implementada.

Quando IA for adicionada, testar:

- Resposta sem alucinacao para servicos inexistentes.
- Recusa de diagnostico medico.
- Recusa de promessa de resultado garantido.
- Respeito a opt-out de marketing.
- Uso apenas de dados da clinica atual.
- Timeout e fallback manual.

## Testes de seguranca

Obrigatorios antes de producao:

- Usuario sem clinica nao acessa dados.
- Usuario de uma clinica nao acessa outra.
- `anon` nao executa RPCs sensiveis.
- Chaves secretas nao aparecem no bundle frontend.
- RLS bloqueia inserts com `clinica_id` indevida.

## Ferramentas recomendadas

Para app React futura:

- Vitest para testes unitarios.
- Testing Library para componentes.
- Playwright para E2E.
- Supabase CLI para banco local.
- SQL tests para policies RLS.

