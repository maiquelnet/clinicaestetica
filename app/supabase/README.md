# Supabase deployment snapshots

Atualizado em: 2026-08-11.

Esta pasta preserva os fontes usados nos deploys mais recentes executados a partir de `app/`.

## Conteúdo

- `functions/google-reviews`: corresponde à Edge Function remota `google-reviews`, versão 2.
- `functions/whatsapp-messages`: corresponde à Edge Function remota `whatsapp-messages`, versão 4.
- `migrations/*whatsapp*`: SQL usado para os recursos WhatsApp atualmente existentes no banco.

## Atenção à duplicidade

Também existe `../../supabase/` na raiz do repositório. A função Google Calendar da raiz corresponde à implantação atual, mas a função WhatsApp da raiz é uma implementação experimental mais robusta e diferente da versão remota 4.

Antes de publicar:

1. consulte a função remota no Supabase;
2. compare o código e os nomes das actions/secrets;
3. confirme a migration compatível;
4. só então escolha a pasta de deploy.

Não execute `supabase db push` sem reconciliar o histórico remoto: ferramentas de aplicação geraram timestamps diferentes dos arquivos locais.

Mapeamento remoto conhecido:

| Arquivo local | Migration remota |
| --- | --- |
| `20260807000100_whatsapp_automation.sql` | `20260807185358_whatsapp_automation` |
| `20260807000200_fix_whatsapp_rpc_security.sql` | `20260807190318_fix_whatsapp_rpc_security` |
| `20260810000100_whatsapp_message_queue.sql` | `20260810173548_whatsapp_message_queue` |

Consulte também `../../doc/operacao-plataformas.md` e `../../doc/whatsapp-cloud.md`.
