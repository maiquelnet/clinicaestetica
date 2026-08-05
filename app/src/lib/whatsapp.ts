import { supabase } from './supabase'

export type WhatsAppStatus = {
  configured: boolean
  sendReady: boolean
  missingSecrets: string[]
  automaticRules: number
  pendingMessages: number
  failedMessages: number
  recentFailures: Array<{
    id: string
    type: string
    scheduledAt: string
    attempts: number
    error: string | null
  }>
  scheduler: {
    cronActive: boolean
    vaultConfigured: boolean
    lastRunStatus: string | null
    lastRunAt: string | null
  }
}

async function invoke<T>(action: string, clinicId: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) {
    throw new Error('Sua sessao expirou. Entre novamente antes de configurar o WhatsApp.')
  }

  const { data, error } = await supabase.functions.invoke('whatsapp-messages', {
    body: { action, clinicId, ...body },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    let message = error.message
    const context = 'context' in error ? error.context : null
    if (context instanceof Response) {
      const responseBody = await context.clone().json().catch(() => null) as { error?: string } | null
      if (responseBody?.error) message = responseBody.error
    }
    throw new Error(message)
  }
  return data as T
}

export const getWhatsAppStatus = (clinicId: string) =>
  invoke<WhatsAppStatus>('status', clinicId)

export const sendWhatsAppTest = (clinicId: string, recipient: string) =>
  invoke<{ sent: boolean; messageId: string }>('send-test', clinicId, { recipient })

export const validateWhatsAppTemplate = (clinicId: string, templateName: string, language: string) =>
  invoke<{ approved: true; category: 'UTILITY'; status: 'APPROVED' }>('validate-template', clinicId, {
    templateName,
    language,
  })
