# Setup de ferramentas e evidências

Revisão em: 2026-10-17. Toolkit `soumatheusgomes/vibe-coding-toolkit`, commit `f13bb354363dafef8ce8d8f605856cc9e1cc52cc`, prompt `12-existing-project-setup.md`. Ambiente principal: Codex; Windows; Node `v24.15.0`, npm `11.12.1`, Codex CLI `0.156.1`. Nenhum serviço remoto foi consultado ou alterado nesta revisão.

## Objetivo e decisões

Adotar um harness leve para o repositório React/Vite + Supabase + Vercel, sem migrar a stack, criar outra branch, publicar ou alterar comportamento de produto. `doc/` permanece a pasta canônica em português; novos documentos foram criados somente para responsabilidades ainda ausentes. A branch e alterações que já estavam no checkout foram preservadas.

## Matriz do catálogo

| Componente | Necessidade e estado observado | Ação/escopo e motivo | Risco, dependência e validação |
|---|---|---|---|
| Superpowers | Não descoberto como skill/plugin no host. O prompt exige brainstorming e gates. | O protocolo foi aplicado nesta tarefa. Instalação do plugin Codex é global; não realizada. | Requer instalação explícita pelo cliente e nova sessão para confirmar descoberta. |
| Subagentes | Host disponibiliza delegação; dois levantamentos independentes foram usados nesta revisão. | Reaproveitar a capacidade nativa; delegar no futuro somente trabalho independente. | Sem configuração adicional. Coordenador confere arquivos e evidência; um escritor por arquivo. |
| RTK | Não detectado; pode interceptar comandos via configuração global. | Não instalado nem configurado. Oxlint e comandos npm existentes são suficientes para o escopo atual. | Exigiria instalação/integração global e nova sessão; só reconsiderar com necessidade mensurável. |
| Ponytail | Plugin não descoberto. | Princípio de solução mínima incluído em `AGENTS.md`; plugin global não instalado. | Configuração do plugin exige autorização e verificação numa nova sessão. |
| Caveman | Plugin não descoberto; a preferência é comunicação clara em português. | Não instalado. Concisão não será aplicada a código, documentação ou mensagens que exijam explicação completa. | Nenhuma dependência; convenção de comunicação, não ferramenta de build. |
| ESLint/Biome quality gates | O projeto já usa Oxlint, TypeScript strict, testes Node e build Vite. | Reutilizar a stack; nenhuma migração nem dependência redundante. | Typecheck/test/build passaram; lint ficou pendente nesta máquina. |
| Graphify | Não instalado; não havia grafo pertinente no checkout. | Sem CLI global, extração semântica, hook ou upload de grafo. Busca, mapa de código e testes existentes atendem este setup. | Se for retomado, instalar explicitamente, excluir segredos/artefatos e validar grafo/consulta local. |
| Obsidian Memory | Nenhum vault ou MCP externo documentado. | Não aplicável: `doc/` versionado é a fonte de verdade e já existe runbook de retomada. | Evita duplicação e cópia de dados da clínica para memória externa. |
| Claude Memory System | Não há uso confirmado de Claude Code neste projeto. | Não aplicável; criada apenas uma ponte mínima `CLAUDE.md` para `AGENTS.md`, sem memória própria. | A ponte não comprova que Claude Code esteja instalado ou em uso. |
| Hooks | Nenhum hook de projeto identificado. | Não foram criados hooks, bloqueios Git ou ações automáticas. | Sem interceptação inadvertida; reconsiderar somente para uma falha repetida e reproduzível. |
| agent-browser | CLI não detectada. | Nenhuma dependência adicional; automação de navegador oferecida pelo host pode ser usada para smoke tests locais quando necessária. Não foi usada nesta tarefa. | Testes de browser exigem backend isolado e dados de teste. |
| Context7 | Não estava listado como MCP ativo. | Configurado em `.codex/config.toml` como endpoint público, no escopo deste projeto. | Estado “configurado sem execução”: exige confiar no checkout, reiniciar a sessão e fazer consulta real. Não enviar código privado/segredos. |
| Anthropic Skills | Nenhuma necessidade específica de geração de artefatos ou skill Anthropic. | Não instalada; usar apenas skills nativas disponíveis quando pertinentes, sem duplicação. | Reavaliar quando surgir tarefa recorrente de artefato que não esteja coberta. |
| Chrome DevTools MCP | Não detectado. A tarefa não alterou nem inspecionou UI renderizada. | Não configurado neste ciclo. | Pode ser reconsiderado se uma falha de console/rede/performance exigir essa capacidade além da automação visual disponível. |
| Codex workflow | CLI existente; não havia instruções de projeto nem config `.codex`. | Criados `AGENTS.md`, `CLAUDE.md` ponte e `.codex/config.toml`; nenhuma configuração global alterada. | Conferir carregamento de instruções e MCP em nova sessão confiável; arquivos presentes não provam descoberta. |
| Vercel Skills + find-skills | React/Vite web na Vercel; não havia skills locais no projeto. | Instalação local tentada pelo CLI oficial (`npx skills@latest ... --list`), mas não houve saída após cerca de 40s; tentativa interrompida. Nenhuma skill copiada manualmente. | Pendente: investigar acesso/execução do npm CLI e repetir o catálogo/instalação oficial com `--copy`, depois validar lockfile e descoberta. Nenhuma ação de deploy executada. |

## Destinos de documentação

| Destino do toolkit | Fonte canônica adotada |
|---|---|
| `README.md` | `README.md` da raiz, atualizado |
| `PRODUCT.md` | `PRODUCT.md`, criado |
| `AGENTS.md` | `AGENTS.md`, criado e curto |
| `CLAUDE.md` | `CLAUDE.md`, ponte mínima para `AGENTS.md` |
| `docs/architecture.md` | `doc/arquitetura.md`, preservado e atualizado |
| `docs/design.md` | `doc/design.md`, criado com tokens observados e limites da auditoria |
| `docs/onboarding.md` | `doc/instalacao.md`, preservado e atualizado com alerta de ambiente |
| `docs/quality.md` | `doc/testes.md`, preservado e atualizado |
| `docs/setup.md` | `doc/setup.md`, esta matriz e evidências |

O índice `doc/README.md`, o runbook `doc/retomada-projeto.md` e `doc/operacao-plataformas.md` também foram ajustados para alertar sobre isolamento de Preview. Não foi criada uma pasta `docs/` concorrente.

## Verificações históricas do setup — 2026-10-17

| Verificação | Resultado | Evidência/limite |
|---|---|---|
| TypeScript | Validado | `node .\node_modules\typescript\bin\tsc -b --pretty false` passou no baseline local. |
| Testes de frontend | Validado | `node --test` com os sete arquivos declarados no `app/package.json`: 76 testes passaram. |
| Build Vite | Validado | `vite build` completou em 1m38s com variáveis locais fictícias e saída temporária fora de `app/dist`; sem acesso Supabase. |
| Oxlint | Pendente | CLI respondeu a `--version` (`1.72.0`), mas a execução sem argumentos ficou sem saída por mais de 30s e foi interrompida. Não contar como lint aprovado. |
| Context7 | Configurado sem execução | Arquivo de projeto criado; reinício/confiança e consulta real ainda necessários. |
| Skills Vercel | Pendente | CLI oficial não respondeu no tempo observado; skills não foram instaladas. |
| Supabase, Meta e Vercel remotos | Não executado | Sem login/consulta remota, migration, alteração de Secrets, mensagem, push ou deploy. |
| Revisão visual/teclado | Não executada | Apenas inspeção estática de componentes/CSS; sem declaração de conformidade WCAG. |

## Achados do setup de 2026-10-17

Leitura estática local, sem confirmar comportamento implantado:

- Na leitura estática de 2026-10-17, o webhook escolhia a primeira clínica ativa, a fila omitia agendamentos cancelados, falha após possível aceite poderia gerar retry e o teste ignorava erros de auditoria. Esses achados foram tratados em código local em 2026-10-19, conforme abaixo; não são afirmações sobre as funções remotas.
- O setup não confirmou o ambiente do Preview; consulta Supabase/MCP de 2026-10-19 confirmou que Preview compartilha o projeto de produção `xucttzuthznqwlhushmg`.

## Revalidação de homologação — 2026-10-19

- `npm test`: 88 testes passaram (76 preexistentes e 12 testes Meta puros).
- `npm run typecheck`, `npm run lint` e build Preview em diretório temporário passaram.
- Deno `check` passou para `meta-whatsapp-webhook`, `whatsapp-messages` e `whatsapp-review-test`; Deno `test` passou para os 12 testes Meta.
- `git diff --check` passou sem erros; apenas avisos do Git sobre conversão de finais de linha.
- Os testes automatizados não chamaram Meta nem Supabase. Nesta sessão, os MCPs consultaram os estados remotos e publicaram somente `whatsapp-review-test` v2; não leram nem alteraram Secrets. A verificação do envio ainda depende das credenciais Meta corretas e de uma tentativa manual posterior.

As correções locais não foram publicadas no webhook/fila e a migration não foi aplicada. Operações remotas continuam sujeitas a revisão e autorização.

## Próximos passos

1. O Preview não é isolado do Supabase de produção. `whatsapp-review-test` v2 já está publicado e falha fechado; cadastre/valide os Secrets dedicados antes de tentar um único envio ao destinatário restrito.
2. Em uma nova sessão Codex confiável, verificar o carregamento de `AGENTS.md` e Context7 e executar uma consulta pública de documentação.
3. Resolver o bloqueio do instalador oficial de skills Vercel; instalar somente o conjunto web aprovado e registrar versões/lockfile.
4. Reexecutar o lint e diagnosticar seu tempo de execução antes de usá-lo como gate.
5. Antes de produção, revisar e publicar separadamente a migration, a fila e o webhook; a branch atual não deve ser mesclada em `main` com `VITE_APP_ENV=preview`.

## Implementação de homologação — 2026-10-19

- Meta MCP consultado em leitura: `business_list` permaneceu vazio. O MCP lista os apps 136 e 163, mas não prova relação app–WABA–telefone. O usuário indica app 136 para o número real; vínculo não confirmado.
- Supabase MCP consultado: projeto principal ativo; `whatsapp-messages` v29, `meta-whatsapp-webhook` v8 e `whatsapp-review-test` v2 (publicado em 2026-10-19). Secrets não são acessíveis pelo MCP.
- Código local: integração por clínica via Vault/RPC, roteamento webhook por WABA + Phone Number ID, verificação de cancelamento imediatamente antes do envio, estado de reconciliação sem retry automático e auditoria explícita do teste.
- Preview: fluxo comum de envio oculto; painel de revisão exige validação de App ID/token/WABA/remetente via Meta e só aceita `+55 51 98660-3385`.
- Migration `20261019153000_meta_clinic_integrations_and_reconciliation.sql` apenas local; não aplicada. `whatsapp-messages` e `meta-whatsapp-webhook` não foram publicados. `whatsapp-review-test` v2 foi publicado; nenhum Secret foi lido/alterado e nenhuma mensagem foi enviada nesta tarefa.
- `npm test` incluiu os testes puros novos. Typecheck/build/lint e validação Deno são registrados após execução. A CLI Supabase não está instalada; tentativa `npx supabase@latest --version` ficou sem saída e foi cancelada, então o arquivo migration foi criado diretamente no repositório e não aplicado.
