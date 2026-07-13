# Historico de Implementacao

## 2026-06

### MCP Supabase

Foi configurado o MCP do Supabase no Codex:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=xucttzuthznqwlhushmg"
bearer_token_env_var = "SUPABASE_ACCESS_TOKEN"
enabled = true
```

Projeto conectado:

```text
https://xucttzuthznqwlhushmg.supabase.co
```

## 2026-07-02

### Raio-x inicial

Foi identificado:

- Site estatico local.
- Painel Apps Script legado.
- Banco Supabase modelado.
- Projeto inicialmente inativo e depois reativado.

### Projeto Supabase ativo

Status confirmado:

- Nome: `estetica_schneider`
- Ref: `xucttzuthznqwlhushmg`
- Status: `ACTIVE_HEALTHY`
- Regiao: `sa-east-1`
- Postgres: `17`

## 2026-07-03

### Reset de dados

Como o sistema esta sendo criado do zero, todas as tabelas do schema `public` foram truncadas com `CASCADE`.

Resultado:

- Estrutura preservada.
- RLS preservado.
- Policies preservadas e depois corrigidas.
- Funcoes preservadas e depois corrigidas.
- Dados zerados.

### Correcoes de seguranca

Migration:

```text
20260703014440_fix_security_advisor_findings
```

Correcoes:

- `definir_atualizado_em` recebeu `search_path` fixo.
- Funcoes auxiliares de RLS movidas para schema `private`.
- Execucao direta de funcoes sensiveis revogada para `anon` e `authenticated`.
- Policies passaram a chamar `private.usuario_tem_acesso_clinica`.
- Policies passaram a chamar `private.usuario_e_admin_clinica`.
- Uso de `auth.uid()` em policies ajustado para `(select auth.uid())`.
- Policies sobrepostas de `usuarios_clinicas` foram separadas por acao.
- Extensao `citext` movida para schema `extensions`.

### Correcoes de performance

Migration:

```text
20260703014500_add_missing_foreign_key_indexes
```

Correcoes:

- Criados indices para FKs sem cobertura.
- Validado `uncovered_fk_count = 0`.

### Pendencias conhecidas

- Protecao contra senhas vazadas depende de plano Pro ou superior no Supabase.
- Advisors de `unused_index` podem aparecer enquanto o banco estiver vazio ou sem uso real.
- Ainda nao ha app moderna Supabase no repositorio.

