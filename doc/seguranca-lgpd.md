# Seguranca e LGPD

## Dados pessoais tratados

O sistema foi modelado para armazenar:

- Nome.
- Telefone.
- E-mail.
- Data de nascimento.
- CPF, quando informado.
- Genero, quando necessario.
- Historico de agendamentos.
- Observacoes internas.
- Dados financeiros.
- Registros de mensagens.
- Anexos de atendimento, quando implementados.

Esses dados podem ser dados pessoais e, em alguns contextos, dados sensiveis ou relacionados a saude/estetica. Devem ser tratados com cautela.

## Principios LGPD

Recomendacoes:

- Coletar somente dados necessarios.
- Informar finalidade do uso.
- Registrar consentimento para marketing em `clientes.aceita_marketing`.
- Permitir correcao e exclusao/arquivamento quando aplicavel.
- Restringir acesso por clinica e papel.
- Evitar envio de dados sensiveis para servicos externos sem base legal.

## Estado atual de seguranca no Supabase

Ja implementado:

- RLS habilitado nas tabelas publicas.
- Isolamento por `clinica_id`.
- Funcoes auxiliares de RLS movidas para schema `private`.
- Execucao direta de funcoes sensiveis revogada para `anon` e `authenticated`.
- `citext` movida para schema `extensions`.
- FKs sem cobertura receberam indices.
- Dados das tabelas `public` foram zerados.

Migrations:

- `20260703014440_fix_security_advisor_findings`
- `20260703014500_add_missing_foreign_key_indexes`

Pendente por limitacao de plano:

- Protecao contra senhas vazadas via HaveIBeenPwned. A API retornou `402 Payment Required`, indicando recurso disponivel em planos Pro ou superiores.

## Politicas RLS

Padrao geral:

- Tabelas com `clinica_id` usam policy baseada em `private.usuario_tem_acesso_clinica(clinica_id)`.
- `usuarios_clinicas` usa policies separadas para select/insert/update/delete.
- `perfis` permite acesso ao proprio registro com `(select auth.uid())`.
- `modulos` permite leitura para usuarios autenticados.

## IA e treinamento

Nao ha IA implementada no produto.

Portanto:

- Dados de usuarios ainda nao sao enviados para APIs de IA pelo sistema.
- Nao ha uso de dados para treinamento de IA.
- Quando IA for adicionada, cada provedor deve ser avaliado quanto a retencao, treinamento, logs e residencia de dados.

## Regras recomendadas para futura IA

- Nunca enviar CPF, telefone ou observacoes sensiveis para IA sem necessidade.
- Preferir anonimizar contexto.
- Registrar consentimento quando IA atuar em comunicacao personalizada.
- Nunca permitir envio automatico de mensagens sem revisao humana.

## Segredos e chaves

Nao versionar:

- `SUPABASE_ACCESS_TOKEN`
- service role key
- tokens Google
- secrets de IA
- webhooks privados

Chaves publicaveis do Supabase podem ser usadas no frontend, mas sempre com RLS corretamente configurado.

## Auditoria recomendada

Antes de producao:

1. Revisar todas as policies RLS.
2. Criar usuario de teste sem permissao e validar isolamento.
3. Criar usuario admin e validar permissoes.
4. Testar leitura/escrita cross-clinica.
5. Revisar logs de Auth.
6. Revisar backups e plano de recuperacao.

