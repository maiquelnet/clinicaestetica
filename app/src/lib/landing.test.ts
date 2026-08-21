import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWhatsAppUrl, isAnalyticsMeasurementId, WHATSAPP_NUMBER } from './landing.ts'
import { initializeAnalytics, trackLandingEvent } from './landing-analytics.ts'

test('buildWhatsAppUrl gera URL segura e contextual para cada CTA', () => {
  const url = new URL(buildWhatsAppUrl({ interest: 'eyebrows', placement: 'interest' }))

  assert.equal(url.hostname, 'wa.me')
  assert.equal(url.pathname, `/${WHATSAPP_NUMBER}`)
  assert.match(url.searchParams.get('text') ?? '', /sobrancelhas/i)
  assert.match(url.searchParams.get('text') ?? '', /site-interest/i)
})

test('buildWhatsAppUrl diferencia interesses sem incluir dados pessoais', () => {
  const skin = buildWhatsAppUrl({ interest: 'skin', placement: 'hero' })
  const toxin = buildWhatsAppUrl({ interest: 'toxin', placement: 'interest' })

  assert.notEqual(skin, toxin)
  assert.match(decodeURIComponent(toxin), /toxina botulínica/i)
})

test('analytics permanece sem configuração para IDs ausentes ou inválidos', () => {
  assert.equal(isAnalyticsMeasurementId(undefined), false)
  assert.equal(isAnalyticsMeasurementId(''), false)
  assert.equal(isAnalyticsMeasurementId('UA-123456-1'), false)
  assert.equal(isAnalyticsMeasurementId('G-ABC123456'), true)
  assert.equal(initializeAnalytics(), false)
  assert.equal(trackLandingEvent('whatsapp_click'), false)
})
