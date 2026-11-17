export type ClinicMetaIntegration = {
  clinicId: string
  appId: string
  wabaId: string
  phoneNumberId: string
  accessToken?: string | null
  appSecret?: string | null
  verifyToken?: string | null
  active?: boolean
}

export class MetaRequestError extends Error {
  readonly certainty: 'rejected' | 'unknown'
  readonly httpStatus?: number

  constructor(message: string, certainty: 'rejected' | 'unknown', httpStatus?: number) {
    super(message)
    this.name = 'MetaRequestError'
    this.certainty = certainty
    this.httpStatus = httpStatus
  }
}

export function resolveClinicIntegration(
  integrations: ClinicMetaIntegration[],
  input: { phoneNumberId?: string | null; wabaId?: string | null },
) {
  const phoneNumberId = input.phoneNumberId?.trim()
  const wabaId = input.wabaId?.trim()
  if (!phoneNumberId || !wabaId) throw new Error('Webhook Meta sem WABA ou phone_number_id.')

  const matches = integrations.filter((integration) =>
    integration.active !== false && integration.phoneNumberId === phoneNumberId
  )
  if (matches.length === 0) throw new Error('phone_number_id não associado a uma clínica ativa.')
  if (matches.length > 1) throw new Error('phone_number_id associado a mais de uma clínica.')
  if (matches[0].wabaId !== wabaId) throw new Error('WABA do webhook não corresponde à integração da clínica.')
  return matches[0]
}

export function appointmentMaySend(appointmentId: string | null, appointmentStatus: string | null | undefined) {
  if (!appointmentId) return true
  return Boolean(appointmentStatus && appointmentStatus !== 'cancelado')
}

export function parseTemplateBodyParameters(value: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON precisa ser um array JSON de textos.')
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('WHATSAPP_REVIEW_TEMPLATE_PARAMETERS_JSON precisa conter somente textos não vazios.')
  }
  return parsed.map((item: string) => item.trim())
}

export function countTemplateBodyParameters(text: string) {
  const indexes = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]))
  return indexes.length ? Math.max(...indexes) : 0
}

export function templateSupportsBodyTextSend(components: Array<{
  type?: string
  format?: string
  text?: string
  buttons?: Array<{ type?: string; url?: string }>
}>) {
  if (!components.some((component) => component.type === 'BODY')) return false

  return components.every((component) => {
    if (component.type === 'HEADER') {
      return component.format === 'TEXT' && countTemplateBodyParameters(component.text || '') === 0
    }
    if (component.type === 'BODY' || component.type === 'FOOTER') return true
    if (component.type === 'BUTTONS') {
      return Boolean(component.buttons?.length) && component.buttons!.every((button) =>
        button.type === 'PHONE_NUMBER' ||
        (button.type === 'URL' && countTemplateBodyParameters(button.url || '') === 0)
      )
    }
    return false
  })
}

export function reviewSenderIsAllowed(wabaId: string, phoneNumberId: string) {
  return wabaId !== '5523215167904668' && phoneNumberId !== '1287807847751041'
}

export function queueFailureDisposition(input: {
  requestStarted: boolean
  metaAccepted?: boolean
  definitiveRejection?: boolean
}): 'retry' | 'reconcile' {
  if (input.metaAccepted) return 'reconcile'
  if (input.requestStarted && !input.definitiveRejection) return 'reconcile'
  return 'retry'
}

export type ReviewSendResult = {
  outcome: 'not_sent' | 'accepted' | 'rejected' | 'unknown'
  sendAttempted: boolean
  auditPersisted: boolean
  messageId: string | null
  detail: string
}

export async function performAuditedReviewSend(input: {
  createAudit: () => Promise<void>
  send: () => Promise<{ messageId?: string | null }>
  persistAccepted: (messageId: string | null) => Promise<void>
  persistRejected: (detail: string) => Promise<void>
  persistUnknown: (detail: string) => Promise<void>
}): Promise<ReviewSendResult> {
  try {
    await input.createAudit()
  } catch (error) {
    return {
      outcome: 'not_sent',
      sendAttempted: false,
      auditPersisted: false,
      messageId: null,
      detail: error instanceof Error ? error.message : 'Não foi possível criar a auditoria antes do envio.',
    }
  }

  try {
    const response = await input.send()
    const messageId = response.messageId || null
    try {
      await input.persistAccepted(messageId)
      return {
        outcome: 'accepted',
        sendAttempted: true,
        auditPersisted: true,
        messageId,
        detail: messageId ? 'A Meta aceitou a mensagem e a auditoria foi atualizada.' : 'A Meta aceitou a chamada sem retornar WAMID; reconciliação necessária.',
      }
    } catch (error) {
      return {
        outcome: 'accepted',
        sendAttempted: true,
        auditPersisted: false,
        messageId,
        detail: error instanceof Error ? error.message : 'A Meta aceitou a mensagem, mas a auditoria não foi atualizada.',
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Resultado da solicitação à Meta desconhecido.'
    const certainty = error instanceof MetaRequestError ? error.certainty : 'unknown'
    try {
      if (certainty === 'rejected') await input.persistRejected(detail)
      else await input.persistUnknown(detail)
      return {
        outcome: certainty,
        sendAttempted: true,
        auditPersisted: true,
        messageId: null,
        detail,
      }
    } catch (auditError) {
      return {
        outcome: certainty,
        sendAttempted: true,
        auditPersisted: false,
        messageId: null,
        detail: `${detail} A atualização da auditoria também falhou: ${auditError instanceof Error ? auditError.message : 'erro desconhecido'}`,
      }
    }
  }
}
