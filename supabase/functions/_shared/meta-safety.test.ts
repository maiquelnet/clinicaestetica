import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appointmentMaySend,
  countTemplateBodyParameters,
  parseTemplateBodyParameters,
  performAuditedReviewSend,
  queueFailureDisposition,
  reviewSenderIsAllowed,
  resolveClinicIntegration,
  MetaRequestError,
  type ClinicMetaIntegration,
} from './meta-safety.ts'

const integrations: ClinicMetaIntegration[] = [
  { clinicId: 'clinic-a', appId: 'app-a', wabaId: 'waba-a', phoneNumberId: 'phone-a' },
  { clinicId: 'clinic-b', appId: 'app-b', wabaId: 'waba-b', phoneNumberId: 'phone-b' },
]

test('routes each phone_number_id to its own clinic and WABA', () => {
  assert.equal(resolveClinicIntegration(integrations, { phoneNumberId: 'phone-b', wabaId: 'waba-b' }).clinicId, 'clinic-b')
})

test('rejects an unknown or ambiguous phone_number_id', () => {
  assert.throws(() => resolveClinicIntegration(integrations, { phoneNumberId: 'unknown', wabaId: 'waba-a' }), /não associado/)
  assert.throws(() => resolveClinicIntegration([...integrations, { ...integrations[0] }], { phoneNumberId: 'phone-a', wabaId: 'waba-a' }), /mais de uma clínica/)
})

test('rejects a phone number paired with the wrong WABA', () => {
  assert.throws(() => resolveClinicIntegration(integrations, { phoneNumberId: 'phone-a', wabaId: 'waba-b' }), /não corresponde/)
})

test('canceled or missing linked appointments are not sendable', () => {
  assert.equal(appointmentMaySend('appointment-1', 'cancelado'), false)
  assert.equal(appointmentMaySend('appointment-1', null), false)
  assert.equal(appointmentMaySend('appointment-1', 'confirmado'), true)
  assert.equal(appointmentMaySend(null, null), true)
})

test('parses template text parameters and counts the highest placeholder index', () => {
  assert.deepEqual(parseTemplateBodyParameters('["Cliente","123","13/10/2026"]'), ['Cliente', '123', '13/10/2026'])
  assert.equal(countTemplateBodyParameters('Olá {{1}}, código {{2}}. {{1}}'), 2)
  assert.equal(countTemplateBodyParameters('Sem parâmetros'), 0)
  assert.throws(() => parseTemplateBodyParameters('{bad json'), /array JSON/)
  assert.throws(() => parseTemplateBodyParameters('["ok", 2]'), /somente textos/)
})

test('review sender cannot be the known real clinic WABA or phone number', () => {
  assert.equal(reviewSenderIsAllowed('test-waba', 'test-phone'), true)
  assert.equal(reviewSenderIsAllowed('5523215167904668', 'test-phone'), false)
  assert.equal(reviewSenderIsAllowed('test-waba', '1287807847751041'), false)
})

test('accepted Meta send followed by audit failure is accepted but requires reconciliation', async () => {
  const result = await performAuditedReviewSend({
    createAudit: async () => {},
    send: async () => ({ messageId: 'wamid.1' }),
    persistAccepted: async () => { throw new Error('database unavailable') },
    persistRejected: async () => {},
    persistUnknown: async () => {},
  })
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.messageId, 'wamid.1')
  assert.equal(result.auditPersisted, false)
  assert.equal(queueFailureDisposition({ requestStarted: true, metaAccepted: true }), 'reconcile')
})

test('does not retry when the network outcome is uncertain', async () => {
  const result = await performAuditedReviewSend({
    createAudit: async () => {},
    send: async () => { throw new MetaRequestError('timeout', 'unknown') },
    persistAccepted: async () => {},
    persistRejected: async () => {},
    persistUnknown: async () => {},
  })
  assert.equal(result.outcome, 'unknown')
  assert.equal(queueFailureDisposition({ requestStarted: true }), 'reconcile')
})

test('allows retry only for a definite rejection or a failure before request', () => {
  assert.equal(queueFailureDisposition({ requestStarted: true, definitiveRejection: true }), 'retry')
  assert.equal(queueFailureDisposition({ requestStarted: false }), 'retry')
})

test('does not call Meta if the initial audit insert fails', async () => {
  let called = false
  const result = await performAuditedReviewSend({
    createAudit: async () => { throw new Error('audit insert failed') },
    send: async () => { called = true; return { messageId: 'wamid.2' } },
    persistAccepted: async () => {},
    persistRejected: async () => {},
    persistUnknown: async () => {},
  })
  assert.equal(called, false)
  assert.equal(result.outcome, 'not_sent')
  assert.equal(result.sendAttempted, false)
})

test('returns accepted separately when audit update fails after Meta acceptance', async () => {
  const result = await performAuditedReviewSend({
    createAudit: async () => {},
    send: async () => ({ messageId: null }),
    persistAccepted: async () => { throw new Error('audit update failed') },
    persistRejected: async () => {},
    persistUnknown: async () => {},
  })
  assert.equal(result.outcome, 'accepted')
  assert.equal(result.auditPersisted, false)
})

test('records a definite Meta rejection separately from an uncertain result', async () => {
  const result = await performAuditedReviewSend({
    createAudit: async () => {},
    send: async () => { throw new MetaRequestError('rejected', 'rejected', 400) },
    persistAccepted: async () => {},
    persistRejected: async () => {},
    persistUnknown: async () => { throw new Error('must not run') },
  })
  assert.equal(result.outcome, 'rejected')
  assert.equal(result.auditPersisted, true)
})
