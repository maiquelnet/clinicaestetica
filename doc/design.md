# Design e acessibilidade

Atualizado em: 2026-10-17. Auditoria estática; não equivale a uma medição WCAG completa.

## Direção e usuários

A interface atende dois contextos: clientes/visitantes no site público e equipe da clínica no painel autenticado. O idioma observado é português do Brasil. A landing comunica estética e serviços; o painel prioriza leitura operacional, formulários e agenda. Preserve essa distinção quando alterar uma tela.

## Sistema visual existente

A fonte de verdade dos estilos globais é `app/src/index.css`; a landing e a política também mantêm variáveis locais em seus CSS. Não consolide nem substitua tokens sem revisar as telas que os consomem.

Tokens globais encontrados no CSS:

| Função | Valor observado |
|---|---|
| Rosa | `#b8757a` |
| Rosa suave | `#f3dadd` |
| Verde sálvia | `#66745f` |
| Verde escuro | `#344338` |
| Fundo névoa | `#edf1ee` |
| Papel | `#fffdf9` |
| Superfície | `#ffffff` |
| Texto principal | `#252321` |
| Texto secundário | `#6e6962` |
| Erro / alerta / sucesso | `#a54848` / `#9b6c18` / `#2f7353` |

Há outro conjunto `:root` mais adiante em `index.css` com cores de workspace (inclui dourado), além de uma paleta própria da landing em `app/src/pages/LandingPage.css`. Existem estilos globais extensos; não há uma escala central única de espaçamento ou breakpoints registrada. A tipografia base usa system UI/Segoe UI e alguns contextos usam Inter. Reutilize os estilos e tokens reais, sem presumir consistência que o código ainda não centraliza.

## Interação e acessibilidade

- Manter HTML semântico, nomes acessíveis, labels associados, foco visível e operação por teclado.
- Erros e estados assíncronos devem ser comunicados além de cor; formulários precisam de estados de espera, sucesso e falha.
- Respeitar zoom, telas estreitas e preferência por movimento reduzido.
- A auditoria estática de 2026-10-17 encontrou na caixa de entrada WhatsApp uma lista sem semântica explícita e erros sem região de alerta. O diálogo de ações da agenda requer verificação manual de foco inicial, Escape, contenção e retorno do foco. São pontos pendentes, não correções incluídas neste setup.
- Não foi executado teste visual/teclado completo nem medição de contraste nesta entrega. Não declarar conformidade WCAG sem essa evidência.

## Manutenção

Ao alterar estilos ou interação, atualize os componentes/arquivos que são a fonte dos tokens. Valide ao menos larguras móvel e desktop e os estados afetados em navegador local quando o ambiente estiver isolado de produção.
