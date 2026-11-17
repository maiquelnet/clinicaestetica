const RETRY_DELAYS_MS = [1000, 2000, 4000]

type FetchLike = typeof fetch
type Sleep = (milliseconds: number) => Promise<void>

const sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function isPostgrestRead(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return false
  const url = input instanceof Request ? input.url : String(input)
  return new URL(url).pathname.startsWith('/rest/v1/')
}

async function isFutureJwtError(response: Response) {
  if (response.status !== 401) return false
  const body = await response.clone().json().catch(() => null) as { code?: string; message?: string } | null
  return body?.code === 'PGRST303' && body.message === 'JWT issued at future'
}

// Supabase's built-in PostgREST retry does not include this intermittent 401.
// Limit the workaround to idempotent Data API reads; never replay writes.
export function createFutureJwtRetryFetch(baseFetch: FetchLike = fetch, wait: Sleep = sleep): FetchLike {
  return async (input, init) => {
    if (!isPostgrestRead(input, init)) return baseFetch(input, init)
    for (const delay of RETRY_DELAYS_MS) {
      const response = await baseFetch(input, init)
      if (!await isFutureJwtError(response)) return response
      await wait(delay)
    }
    return baseFetch(input, init)
  }
}
