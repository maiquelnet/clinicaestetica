import { supabase } from './supabase'

export type WhatsAppReviewStatus = {
  environment: 'meta_review_sandbox'
  configured: boolean
  sendReady: boolean
  missingSecrets: string[]
  senderConfigured: boolean
  template: { name: string; language: string }
}

async function invoke<T>(action: string, clinicId: string, body: Record<string, unknown> = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error('Sua sessão expirou. Entre novamente antes de configurar o WhatsApp.')

  const { data, error } = await supabase.functions.invoke('whatsapp-review-test', {
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

export const getWhatsAppReviewStatus = (clinicId: string) =>
  invoke<WhatsAppReviewStatus>('status', clinicId)

export const sendWhatsAppReviewTest = (clinicId: string, recipient: string) =>
  invoke<{ sent: boolean; status: string; provider: string; testId: string; messageId: string }>('send-test', clinicId, { recipient })
