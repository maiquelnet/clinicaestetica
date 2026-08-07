import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GoogleReviewResponse = {
  name?: string
  rating?: number
  relativePublishTimeDescription?: string
  publishTime?: string
  text?: { text?: string }
  originalText?: { text?: string }
  authorAttribution?: { displayName?: string; uri?: string }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !googleApiKey) {
    return json({ error: 'Integração do Google ainda não configurada no servidor.' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: clinic, error: clinicError } = await admin
    .from('clinicas')
    .select('google_place_id, link_google_avaliacao')
    .eq('ativo', true)
    .is('arquivado_em', null)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (clinicError) return json({ error: 'Não foi possível consultar a configuração da clínica.' }, 500)
  if (!clinic?.google_place_id) return json({ error: 'O Google Place ID ainda não foi configurado.' }, 422)

  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(clinic.google_place_id)}`)
  url.searchParams.set('languageCode', 'pt-BR')
  const googleResponse = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': 'reviews,rating,userRatingCount,googleMapsUri',
    },
  })

  if (!googleResponse.ok) {
    console.error('Google Places API error', googleResponse.status, await googleResponse.text())
    return json({ error: 'O Google não retornou as avaliações agora.' }, 502)
  }

  const payload = await googleResponse.json() as {
    reviews?: GoogleReviewResponse[]
    rating?: number
    userRatingCount?: number
    googleMapsUri?: string
  }
  const reviews = (payload.reviews || []).slice(0, 5).map((review, index) => ({
    id: review.name || `google-review-${index}`,
    author: review.authorAttribution?.displayName || 'Cliente do Google',
    rating: review.rating || 0,
    text: review.text?.text || review.originalText?.text || '',
    publishedAt: review.publishTime || null,
    authorUrl: review.authorAttribution?.uri || null,
  }))

  return json({
    reviews,
    rating: payload.rating || null,
    userRatingCount: payload.userRatingCount || null,
    googleMapsUrl: payload.googleMapsUri || null,
    reviewLink: clinic.link_google_avaliacao || null,
  })
})
