# Instruções do projeto

Aplicam-se ao repositório inteiro. Mantenha este arquivo curto; detalhes ficam em `PRODUCT.md` e `doc/`.

## Mapa e comandos

- `app/`: SPA React/Vite/TypeScript; `supabase/`: fonte canônica de migrations e Edge Functions; `doc/`: documentação canônica.
- Frontend: `cd app`; `npm ci`; `npm run dev`; checks `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- Use `doc/arquitetura.md` para fluxos e limites, `doc/instalacao.md` para ambiente e `doc/operacao-plataformas.md` para operações externas.

## Segurança e escopo

- Preserve alterações locais e a branch ativa. Não crie/troque branch, descarte trabalho, faça commit/push, publique, altere Meta ou chame serviços de produção sem pedido explícito.
- Não abra `.env*`, `.vercel/`, caches ou credenciais sem necessidade concreta. Nunca exponha secrets, tokens, service role ou corpos com dados pessoais. `VITE_*` é público.
- O Supabase documentado é de produção; não o use como banco de desenvolvimento ou teste. Antes de qualquer gravação remota, confirme um destino de desenvolvimento autorizado. Não aplique migrations, altere Secrets, cron ou Edge Functions remotas sem autorização específica e revisão das migrations.
- Para WhatsApp/Meta, confira `doc/meta-whatsapp-app-review.md` e o estado atual do código. Não presuma que um teste no painel Meta prova o funcionamento do sistema publicado.

## Implementação e validação

- Leia instruções, código e testes pertinentes. Distinga fato, hipótese e estado externo não verificado.
- Preserve React/Vite, Supabase, Oxlint, npm e os padrões existentes. Prefira a menor mudança completa; não refatore arquivos grandes apenas pelo tamanho.
- Adicione testes para comportamento/regressão quando viável; rode os checks afetados e relate falhas ou limitações sem tratá-las como sucesso.
- Atualize o documento responsável em `doc/` quando mudar comportamento, contratos, comandos ou ambiente.
- Use subagentes apenas quando houver benefício real; tarefas paralelas precisam ser independentes e ter arquivos de escrita distintos. O coordenador revisa o diff e os checks.
- Consulte documentação oficial atual para APIs/configurações que possam ter mudado. Context7, se descoberto, é apenas para documentação pública — nunca envie segredos ou código privado.
- Ao concluir um ciclo de implementação, recomende 3–8 ciclos posteriores de code review, com focos e comando real do projeto; não os execute automaticamente.

## Cliente Codex

Configuração de ferramentas em `.codex/config.toml` é local ao projeto e exige confiança/reinício para ser carregada. Sua presença não comprova que o MCP esteja ativo. Não altere autenticação, modelo, permissões ou configuração global.
