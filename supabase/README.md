# Supabase

Fonte canônica única do backend Supabase da Estética Schneider.

## Estrutura

- `functions/google-calendar-sync`: sincronização bidirecional do Google Agenda;
- `functions/google-reviews`: consulta pública de avaliações;
- `functions/whatsapp-messages`: versão implantada do WhatsApp baseada em fila;
- `migrations/`: histórico SQL versionado;
- `seed.sql`: dados iniciais de desenvolvimento;
- `config.toml`: configuração local do Supabase.

Não crie cópias de Edge Functions ou migrations dentro de `app/`. Antes de qualquer deploy, compare o código local com a versão remota e confirme a compatibilidade das migrations registradas.
