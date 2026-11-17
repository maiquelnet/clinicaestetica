import assert from 'node:assert/strict'
import test from 'node:test'
import { createFutureJwtRetryFetch } from './pgrst-future-jwt-retry.ts'

const futureJwt = () => Response.json({ code: 'PGRST303', message: 'JWT issued at future' }, { status: 401 })

test('retries only the transient future-JWT error on a PostgREST read', async () => {
  const delays: number[] = []
  let calls = 0
  const retryFetch = createFutureJwtRetryFetch(async () => {
    calls++
    return calls < 3 ? futureJwt() : Response.json({ ok: true })
  }, async (milliseconds) => { delays.push(milliseconds) })

  const response = await retryFetch('https://example.supabase.co/rest/v1/clinicas?select=id')
  assert.equal(response.status, 200)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 2000])
})

test('returns the original error after bounded retries', async () => {
  let calls = 0
  const retryFetch = createFutureJwtRetryFetch(async () => { calls++; return futureJwt() }, async () => {})
  const response = await retryFetch('https://example.supabase.co/rest/v1/clinicas')
  assert.equal(response.status, 401)
  assert.equal(calls, 4)
  assert.equal((await response.json()).code, 'PGRST303')
})

test('never retries writes or unrelated 401 responses', async () => {
  let calls = 0
  const retryFetch = createFutureJwtRetryFetch(async () => { calls++; return futureJwt() }, async () => {})
  await retryFetch('https://example.supabase.co/rest/v1/fila_mensagens', { method: 'POST' })
  await retryFetch('https://example.supabase.co/auth/v1/user')
  assert.equal(calls, 2)

  const authFetch = createFutureJwtRetryFetch(async () => { calls++; return Response.json({ code: 'PGRST301' }, { status: 401 }) }, async () => {})
  await authFetch('https://example.supabase.co/rest/v1/clinicas')
  assert.equal(calls, 3)
})
