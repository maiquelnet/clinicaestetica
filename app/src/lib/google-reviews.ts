import { supabase } from './supabase'

export type GoogleReview = {
  id: string
  author: string
  rating: number
  text: string
  publishedAt: string | null
  authorUrl: string | null
}

export type GoogleReviewsResponse = {
  reviews: GoogleReview[]
  rating: number | null
  userRatingCount: number | null
  googleMapsUrl: string | null
  reviewLink: string | null
}

export async function fetchGoogleReviews(): Promise<GoogleReviewsResponse> {
  const { data, error } = await supabase.functions.invoke('google-reviews', { method: 'GET' })
  if (error) throw new Error('Não foi possível carregar as avaliações do Google agora.')
  return data as GoogleReviewsResponse
}
