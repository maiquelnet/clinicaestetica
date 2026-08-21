export const WHATSAPP_NUMBER = '5551985910322'

export type LandingInterest = 'general' | 'skin' | 'eyebrows' | 'toxin' | 'result'

export type WhatsAppPlacement =
  | 'header'
  | 'hero'
  | 'interest'
  | 'result'
  | 'location'
  | 'final'
  | 'mobile'

type BuildWhatsAppUrlOptions = {
  interest: LandingInterest
  placement: WhatsAppPlacement
}

const interestMessages: Record<LandingInterest, string> = {
  general:
    'Olá, vim pelo site e gostaria de fazer uma triagem gratuita para entender qual cuidado combina comigo.',
  skin:
    'Olá, vim pelo site e gostaria de uma orientação personalizada sobre cuidados para a pele.',
  eyebrows:
    'Olá, vim pelo site e gostaria de saber qual cuidado para sobrancelhas combina com o resultado natural que procuro.',
  toxin:
    'Olá, vim pelo site e gostaria de conversar sobre avaliação para toxina botulínica e tirar minhas dúvidas.',
  result:
    'Olá, vi o resultado real no site e gostaria de conversar sobre uma avaliação personalizada.',
}

export function buildWhatsAppUrl({ interest, placement }: BuildWhatsAppUrlOptions) {
  const message = interestMessages[interest]
  const source = `site-${placement}`
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`${message} Referência: ${source}.`)}`
}

export function isAnalyticsMeasurementId(value: string | undefined): value is string {
  return Boolean(value && /^G-[A-Z0-9]{6,}$/i.test(value.trim()))
}
