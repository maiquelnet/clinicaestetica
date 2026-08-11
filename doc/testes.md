# Qualidade e Casos de Teste

Atualizado em: 2026-08-11.

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

Edge Functions:

```bash
deno test supabase/functions/google-calendar-sync/core.test.ts
deno check supabase/functions/google-calendar-sync/index.ts
deno test supabase/functions/whatsapp-messages/core.test.ts
deno check supabase/functions/whatsapp-messages/index.ts
deno check app/supabase/functions/whatsapp-messages/index.ts
```

Google Calendar possui testes de OAuth, conexão, envio idempotente, importação e cancelamento bidirecional. A implementação WhatsApp robusta da raiz possui testes unitários, mas a versão 4 implantada é o arquivo simplificado em `app/supabase` e ainda não tem suite dedicada. Essa diferença deve aparecer no aceite de qualquer mudança.

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

A versão implantada não recebe webhooks delivered/read; não use esses estados como critério de aceite.

## Módulos administrativos

- serviço/preço salvos transacionalmente;
- fila de espera impede conflito ao confirmar;
- financeiro filtra fluxo, receber e pagar;
- estoque/fornecedor/equipamento respeitam clínica;
- campanha gera destinatários conforme público e consentimento;
- usuário sem papel de admin não altera configurações sensíveis.

## Segurança

- procurar secrets no diff e no bundle;
- verificar CORS e autenticação de cada Edge Function;
- revisar `integracoes_google` com RLS desabilitado;
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
