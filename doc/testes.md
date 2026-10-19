# Qualidade e Casos de Teste

Atualizado em: 2026-10-19.

## Automação existente

Frontend:

```bash
cd app
npm run typecheck
npm run lint
npm run build
```

- `typecheck`: TypeScript project build sem emitir arquivos;
- `lint`: Oxlint;
- `build`: TypeScript + bundle Vite de produção.
- `test`: testes Node dos geradores de cronograma, disponibilidade, capacidade comercial, Radar, oportunidades, utilitários da landing page e regras puras de segurança Meta.

Registro histórico do setup de 2026-10-17: o typecheck passou e a suíte executou **76 testes aprovados**. O build também passou com saída direcionada a uma pasta temporária, sem sobrescrever `app/dist`; a tentativa de lint daquela sessão ficou sem saída e foi interrompida. As verificações atuais estão registradas no bloco de 2026-10-19 abaixo.

Testes frontend existentes:

```bash
cd app
npm test
```

Eles cobrem recorrência diária, semanal, mensal e por intervalo, fins de semana, preservação de ocorrências e contagem de sessões restantes, além de CTAs contextuais e analytics da landing page.

### Disponibilidade comercial

- aceitar múltiplos períodos separados no mesmo dia;
- representar dia sem períodos como não atende normalmente;
- rejeitar fim menor ou igual ao início;
- rejeitar períodos sobrepostos;
- copiar períodos entre dias sem reutilizar IDs.

As exceções por data são persistidas por RPC transacional e devem ser validadas funcionalmente com usuário autenticado: reduzir, ampliar, substituir e remover horários, marcar dia inteiro sem atendimento, impedir sobreposição e confirmar isolamento entre clínicas.

### Capacidade, Radar e oportunidades

- confirmar que exceção substitui o semanal, inclusive para `nao_atende`;
- confirmar que bloqueios e atendimentos sobrepostos contam uma única vez;
- confirmar interseções parciais, registros fora da capacidade e atendimentos cancelados;
- confirmar capacidade zero com ocupação nula e classificação `SEM_CAPACIDADE`;
- confirmar limiares de atenção: ocupação menor que 65% e ao menos 120 minutos livres;
- confirmar horizonte exato de sete dias a partir de amanhã no fuso da clínica;
- confirmar lista de espera ativa, preferências e duração integral nas janelas;
- confirmar retorno apenas após atendimento concluído, intervalo definido e sem agendamento futuro ativo;
- confirmar que cancelamento futuro não suprime retorno e que histórico cancelado não o cria;
- confirmar prioridade da lista de espera, maior atraso de retorno e ausência de duplicidade;
- confirmar que o motor não envia mensagens, não reserva, não agenda e não altera dados.

Registro histórico de smoke test remoto, revisto em 2026-10-19: a data original de execução não foi registrada. O relato descreveu teste em transação com usuário autenticado: capacidade 480 minutos após bloqueio, ocupação 25%, Radar `AGENDA_COM_OPORTUNIDADES`, uma oportunidade de lista de espera e uma de retorno; dados revertidos com `rollback`. Não contar como validação remota atual.

### Secretária assistida V1

- criação explícita do plano consulta novamente capacidade, Radar e oportunidades;
- prioridade canônica, limite de cinco candidatos e uma oportunidade por cliente;
- duplicidade de plano ativo por clínica/profissional/data é rejeitada ou reutilizada de forma determinística;
- remoção preserva o item como `REMOVIDO` e adição aceita somente oportunidade atual;
- revalidação invalida candidatos individualmente e registra `CANDIDATO_INVALIDADO`;
- mudança de agenda impede aprovação silenciosa e oferece atualização;
- aprovação e cancelamento alteram somente o plano e as atividades, sem mensagem, reserva, agendamento ou mutação da fila;
- plano, itens iniciais e `PLANO_CRIADO` são criados na mesma transação;
- atividades ficam limitadas aos seis tipos de auditoria definidos;
- smoke remoto com seis candidatos, remoção, adição, revalidação, aprovação e cancelamento passou em transação com `rollback`, deixando zero dados temporários.

Edge Functions:

```bash
deno test supabase/functions/google-calendar-sync/core.test.ts
deno check supabase/functions/google-calendar-sync/index.ts
deno check supabase/functions/google-reviews/index.ts
deno check supabase/functions/whatsapp-messages/index.ts
deno check supabase/functions/meta-whatsapp-webhook/index.ts
deno check supabase/functions/whatsapp-review-test/index.ts
```

Google Calendar possui testes de OAuth, conexão, envio idempotente, importação e cancelamento bidirecional. A integração Meta está em `supabase/functions/whatsapp-messages` e `supabase/functions/meta-whatsapp-webhook`; o envio de teste e a assinatura do webhook já foram validados, enquanto o teste automático completo depende de cliente com opt-in, regra ativa e template aprovado.

Não há Vitest/Testing Library/Playwright instalados no frontend até esta revisão.

## Smoke test de deploy

Após cada deploy Vercel:

| URL | Resultado esperado |
| --- | --- |
| `/` | Landing carrega serviços e, quando configuradas, avaliações Google. |
| `/cadastro-cliente` | Formulário público lista serviços e conclui cadastro. |
| `/login` | Login Supabase disponível. |
| `/dashboard` sem sessão | Redireciona para `/login`. |
| `/dashboard` com sessão/vínculo | Carrega painel e clínica. |
| rota interna atualizada diretamente | Rewrite da Vercel devolve `index.html`, sem 404. |

## Autenticação e RLS

| Cenário | Esperado |
| --- | --- |
| Usuário não autenticado acessa painel | Bloqueio/redirecionamento. |
| Usuário autenticado sem vínculo | Tela “Acesso sem clínica vinculada”. |
| Usuário de uma clínica consulta outra | Zero linhas/erro de autorização. |
| `anon` acessa tabela administrativa | Bloqueado por grant/RLS. |
| cadastro público | Somente RPC/campos públicos previstos. |
| publishable key sem JWT | Papel `anon`, sem dados privados. |

## Clientes e consentimento

- criar cliente com telefone brasileiro válido;
- rejeitar telefone inválido;
- consentimentos iniciam desmarcados;
- aceitar WhatsApp grava estado/origem/versão/data;
- revogar impede novos envios;
- trocar número invalida consentimento anterior;
- marketing e WhatsApp permanecem independentes;
- arquivamento remove cliente dos fluxos ativos.

## Agenda e Google Calendar

- criar/editar/cancelar agendamento no sistema;
- confirmar evento correspondente no Google sem duplicidade;
- editar/cancelar no Google e confirmar retorno local;
- criar evento comum no Google e confirmar `bloqueios_agenda`;
- validar horários no fuso `America/Sao_Paulo`;
- revogar OAuth e confirmar mensagem de reconexão;
- simular sync token expirado (HTTP 410) e reset incremental;
- confirmar que dados pessoais desnecessários não aparecem no evento.

## WhatsApp

Antes do scheduler automático, chame `action=process` manualmente com cron secret.

1. Secrets ausentes retornam configuração pendente.
2. Template não aprovado bloqueia ativação/envio.
3. Destinatário de teste recebe template.
4. Cliente sem opt-in é ignorado.
5. Confirmação gera um único `ciclo` por agendamento/tipo.
6. Lembrete respeita quantidade/unidade/direção.
7. Cancelamento antes do claim impede envio.
8. Falha Meta grava `ultimo_erro` e retry.
9. Após cinco tentativas, item não deve ser novamente selecionado pela regra atual.
10. `meta_message_id` é gravado no sucesso.

A versão implantada recebe eventos Meta assinados e deduplicados; use `whatsapp_webhook_events`, fila e logs para confirmar os estados retornados pela Meta. Um aceite HTTP isolado ainda não comprova entrega ou leitura.

## Módulos administrativos

Testes puros locais em `supabase/functions/_shared/meta-safety.test.ts` cobrem roteamento para duas clínicas, WABA incorreta, Phone Number ID desconhecido/ambíguo, agendamento cancelado/não encontrado, resultado incerto, aceite seguido de falha de auditoria e bloqueio do envio quando a auditoria inicial falha. Eles não fazem chamadas à Meta nem ao Supabase.

Em 2026-10-19, `npm test` passou com os 76 testes preexistentes mais 13 testes Meta (89 no total). `npm run typecheck`, `npm run lint`, build Preview com saída temporária, `deno check` das três Edge Functions e `deno test` dos testes Meta passaram. `git diff --check` passou sem erros de whitespace (apenas avisos de conversão LF/CRLF). A função isolada `whatsapp-review-test` v4 foi publicada com verificação de estrutura suportada do template. Os fixes de fila/webhook e a migration por clínica continuam locais e não aplicados. O envio real de teste ainda não foi validado.

- serviço/preço salvos transacionalmente;
- fila de espera impede conflito ao confirmar;
- financeiro filtra fluxo, receber e pagar;
- estoque/fornecedor/equipamento respeitam clínica;
- campanha gera destinatários conforme público, interesses selecionados e consentimento;
- plano de tratamento gera cronograma e preserva ajustes manuais;
- usuário sem papel de admin não altera configurações sensíveis.

## Segurança

- procurar secrets no diff e no bundle;
- verificar CORS e autenticação de cada Edge Function;
- confirmar que a tabela legada `integracoes_google` permanece ausente;
- revisar RPCs com `search_path` mutável;
- executar Supabase Security/Performance Advisors;
- testar APIs com publishable key sem sessão;
- verificar que service role nunca aparece em `app/dist`.

## Critério mínimo de release

- `npm run typecheck`, `npm run lint` e `npm run build` aprovados;
- migration revisada e aplicada uma única vez;
- Edge Function comparada com a versão remota correta;
- smoke test das rotas públicas/protegidas;
- teste funcional da integração alterada;
- documentação e variáveis atualizadas;
- commit/push e deploy Vercel confirmados.
