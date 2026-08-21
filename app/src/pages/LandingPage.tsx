import {
  ArrowRight,
  Award,
  Check,
  Clock3,
  GraduationCap,
  MapPin,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import beforeAfterImage from '../assets/antes_depois_20260611.jpg'
import profileImage from '../assets/foto_perfil_thais.jpg'
import heroAvif from '../assets/hero-estetica.avif'
import heroWebp from '../assets/hero-estetica.webp'
import heroPng from '../assets/hero-estetica.png'
import brandLogo from '../assets/logo_150.jpg'
import {
  analyticsConfigured,
  clearAnalyticsConsent,
  initializeAnalytics,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  trackLandingEvent,
  type AnalyticsConsent,
} from '../lib/landing-analytics'
import { buildWhatsAppUrl, type LandingInterest, type WhatsAppPlacement } from '../lib/landing'
import type { GoogleReviewsResponse } from '../lib/google-reviews'
import './LandingPage.css'

const mapsUrl = 'https://share.google/yGBANlVbrTTMG3HX6'
const SHOW_TOXIN_CONTENT = false

const serviceCards: Array<{
  interest: LandingInterest
  eyebrow: string
  title: string
  description: string
  items: string[]
}> = [
  {
    interest: 'skin',
    eyebrow: 'Pele',
    title: 'Cuidado que respeita o momento da sua pele',
    description: 'Uma escolha orientada para tratar textura, viço e sinais que incomodam você.',
    items: ['Avaliação personalizada', 'Protocolos faciais', 'Orientação de cuidados'],
  },
  {
    interest: 'eyebrows',
    eyebrow: 'Sobrancelhas',
    title: 'Expressão definida sem perder sua identidade',
    description: 'Design e técnicas que consideram seus traços, rotina e resultado desejado.',
    items: ['Design personalizado', 'Micropigmentação', 'Resultado natural'],
  },
  {
    interest: 'toxin',
    eyebrow: 'Toxina botulínica',
    title: 'Leveza para as marcas de expressão',
    description: 'Conversa e avaliação individual para alinhar expectativas com segurança e naturalidade.',
    items: ['Avaliação individual', 'Plano personalizado', 'Acompanhamento'],
  },
]

const visibleServiceCards = serviceCards.filter(
  (service) => SHOW_TOXIN_CONTENT || service.interest !== 'toxin',
)

const selectedTrainingDescription = SHOW_TOXIN_CONTENT
  ? 'Micropigmentação, jato de plasma, equipamentos estéticos e atualização em toxina botulínica.'
  : 'Micropigmentação, jato de plasma e equipamentos estéticos.'

const procedureGroups = [
  { title: 'Pele e face', items: ['Limpeza de pele', 'Peeling químico', 'Jato de plasma', 'Dermaplaning', 'Microagulhamento'] },
  { title: 'Sobrancelhas', items: ['Design de sobrancelhas', 'Design com henna', 'Micropigmentação', 'Retoque de micropigmentação'] },
  { title: 'Corpo e bem-estar', items: ['Drenagem linfática', 'Massagem modeladora', 'Vacuoterapia', 'Endermoterapia'] },
  { title: 'Beleza e ocasião', items: ['Maquiagem social', 'Maquiagem para noivas', 'Depilação facial', 'Depilação corporal'] },
]

const faqs: Array<[string, string]> = [
  ['Como funciona a primeira conversa?', 'Você conta pelo WhatsApp o que deseja melhorar e recebe uma orientação inicial gratuita. Quando necessário, a avaliação presencial define o cuidado mais adequado.'],
  ['O atendimento precisa ser agendado?', 'Sim. Todos os atendimentos são realizados com hora marcada para que você receba atenção exclusiva e sem pressa.'],
  ['Como saber o valor do procedimento?', 'O valor depende do procedimento e, em alguns casos, da avaliação individual. Na conversa pelo WhatsApp você recebe as informações adequadas ao seu objetivo.'],
  ['Os procedimentos são seguros?', 'Antes de indicar qualquer cuidado, Thaís considera seu histórico, suas necessidades e possíveis contraindicações. As orientações antes e depois do atendimento fazem parte do processo.'],
  ['Tem estacionamento?', 'Sim. Há estacionamento para tornar sua chegada mais tranquila. O endereço é Rua Paulino Chaves, 437, no bairro Santo Antônio.'],
  ['O que significa atendimento exclusivo?', 'Seu horário é reservado e o atendimento é conduzido de forma individual, com escuta, privacidade e foco nas suas necessidades.'],
]

type WhatsAppLinkProps = {
  interest: LandingInterest
  placement: WhatsAppPlacement
  className?: string
  children: ReactNode
  onClick?: () => void
}

function WhatsAppLink({ interest, placement, className, children, onClick }: WhatsAppLinkProps) {
  return (
    <a
      className={className}
      href={buildWhatsAppUrl({ interest, placement })}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        onClick?.()
        trackLandingEvent('whatsapp_click', { interest, placement })
        trackLandingEvent('generate_lead', { method: 'whatsapp', interest, placement })
      }}
    >
      {children}
    </a>
  )
}

function useLazyReviews(sectionRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error'
    data: GoogleReviewsResponse | null
  }>({ status: 'idle', data: null })

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    let cancelled = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        setState({ status: 'loading', data: null })
        void import('../lib/google-reviews')
          .then(({ fetchGoogleReviews }) => fetchGoogleReviews())
          .then((data) => {
            if (!cancelled) setState({ status: 'success', data })
          })
          .catch(() => {
            if (!cancelled) setState({ status: 'error', data: null })
          })
      },
      { rootMargin: '500px 0px' },
    )

    observer.observe(section)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [sectionRef])

  return state
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [consent, setConsent] = useState<AnalyticsConsent>(() => readAnalyticsConsent())
  const reviewsRef = useRef<HTMLElement>(null)
  const reviewsState = useLazyReviews(reviewsRef)
  const hasAnalytics = analyticsConfigured()

  useEffect(() => {
    if (consent === 'granted') initializeAnalytics()
  }, [consent])

  useEffect(() => {
    const reached = new Set<number>()
    const handleScroll = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight
      if (available <= 0) return
      const percentage = Math.round((window.scrollY / available) * 100)
      for (const depth of [25, 50, 75, 90]) {
        if (percentage >= depth && !reached.has(depth)) {
          reached.add(depth)
          trackLandingEvent('scroll_depth', { percent_scrolled: depth })
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  const updateConsent = (value: Exclude<AnalyticsConsent, 'unset'>) => {
    saveAnalyticsConsent(value)
    setConsent(value)
  }

  const resetConsent = () => {
    clearAnalyticsConsent()
    setConsent('unset')
  }

  return (
    <div className="landing-site">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>

      <header className="site-header">
        <div className="landing-container header-inner">
          <a className="brand" href="#inicio" aria-label="Thaís Schneider Estética, início">
            <img src={brandLogo} width="64" height="64" alt="" />
            <span><strong>Thaís Schneider</strong><small>Estética</small></span>
          </a>

          <button
            className="menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>

          <nav id="site-navigation" className={menuOpen ? 'site-nav is-open' : 'site-nav'} aria-label="Navegação principal">
            <a href="#objetivos" onClick={() => setMenuOpen(false)}>Cuidados</a>
            <a href="#resultados" onClick={() => setMenuOpen(false)}>Resultados</a>
            <a href="#sobre" onClick={() => setMenuOpen(false)}>Sobre</a>
            <a href="#localizacao" onClick={() => setMenuOpen(false)}>Localização</a>
            <a href="/cadastro-cliente" onClick={() => setMenuOpen(false)}>Cadastro de cliente</a>
          </nav>

          <WhatsAppLink className="button button-primary header-cta" interest="general" placement="header">
            Falar com a Thaís
          </WhatsAppLink>
        </div>
      </header>

      <main id="conteudo">
        <section className="hero" id="inicio">
          <div className="landing-container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><Sparkles aria-hidden="true" /> Estética em Porto Alegre • Desde 2012</p>
              <h1>Realce o que você já tem de mais bonito — com naturalidade.</h1>
              <p className="hero-lead">Cuidados personalizados para pele, sobrancelhas e marcas de expressão, escolhidos depois de uma conversa atenta sobre você.</p>
              <div className="hero-actions">
                <WhatsAppLink className="button button-primary button-large" interest="general" placement="hero">
                  Fazer minha triagem gratuita <ArrowRight aria-hidden="true" />
                </WhatsAppLink>
                <span><Clock3 aria-hidden="true" /> Resposta média em 15 minutos</span>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <picture>
                <source srcSet={heroAvif} type="image/avif" />
                <source srcSet={heroWebp} type="image/webp" />
                <img
                  src={heroPng}
                  width="1744"
                  height="902"
                  alt=""
                  fetchPriority="high"
                  loading="eager"
                  decoding="async"
                />
              </picture>
              <div className="hero-note"><ShieldCheck aria-hidden="true" /><span><strong>Atendimento só seu</strong>Com hora marcada e sem pressa</span></div>
            </div>
          </div>

          <div className="landing-container trust-strip" aria-label="Diferenciais do atendimento">
            <span><strong>Desde 2012</strong><small>experiência e cuidado</small></span>
            <span><strong>Atendimento exclusivo</strong><small>um horário reservado para você</small></span>
            <span><strong>Estacionamento</strong><small>mais tranquilidade na chegada</small></span>
            <span><strong>15 minutos</strong><small>tempo médio de resposta</small></span>
          </div>
        </section>

        <section className="section objectives" id="objetivos" aria-labelledby="objectives-title">
          <div className="landing-container">
            <div className="section-heading centered">
              <p className="eyebrow">Comece pelo seu objetivo</p>
              <h2 id="objectives-title">O que você deseja cuidar agora?</h2>
              <p>Você não precisa saber o nome do procedimento. Conte o que incomoda e receba uma orientação inicial.</p>
            </div>
            <div className={SHOW_TOXIN_CONTENT ? 'service-grid' : 'service-grid is-condensed'}>
              {visibleServiceCards.map((service, index) => (
                <article className="service-card" key={service.interest}>
                  <span className="card-number">0{index + 1}</span>
                  <p className="eyebrow">{service.eyebrow}</p>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <ul>
                    {service.items.map((item) => <li key={item}><Check aria-hidden="true" />{item}</li>)}
                  </ul>
                  <WhatsAppLink
                    className="text-link"
                    interest={service.interest}
                    placement="interest"
                    onClick={() => trackLandingEvent('service_interest', { interest: service.interest })}
                  >
                    Conversar sobre {service.eyebrow.toLowerCase()} <ArrowRight aria-hidden="true" />
                  </WhatsAppLink>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section procedures" id="procedimentos" aria-labelledby="procedures-title">
          <div className="landing-container procedures-grid">
            <div className="section-heading">
              <p className="eyebrow">Cuidados disponíveis</p>
              <h2 id="procedures-title">Um repertório completo, uma indicação que faz sentido.</h2>
              <p>Os procedimentos são escolhidos conforme seu objetivo, sua rotina e a avaliação profissional — nunca como uma lista automática.</p>
              <WhatsAppLink className="button button-secondary" interest="general" placement="interest">
                Pedir uma orientação <MessageCircle aria-hidden="true" />
              </WhatsAppLink>
            </div>
            <div className="procedure-list">
              {procedureGroups.map((group, index) => (
                <details key={group.title} open={index === 0}>
                  <summary><span>{group.title}</span><span aria-hidden="true">+</span></summary>
                  <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section process" aria-labelledby="process-title">
          <div className="landing-container">
            <div className="section-heading centered">
              <p className="eyebrow">Simples, humano e individual</p>
              <h2 id="process-title">Você entende cada passo antes de decidir.</h2>
            </div>
            <ol className="process-list">
              <li><span>1</span><div><h3>Conversa inicial</h3><p>Você conta o que deseja e recebe uma orientação inicial pelo WhatsApp.</p></div></li>
              <li><span>2</span><div><h3>Avaliação personalizada</h3><p>Thaís considera seus traços, histórico, rotina e expectativas com clareza.</p></div></li>
              <li><span>3</span><div><h3>Atendimento com hora marcada</h3><p>Seu horário é exclusivo, com privacidade, atenção e orientações de cuidado.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="section result-section" id="resultados" aria-labelledby="result-title">
          <div className="landing-container result-grid">
            <div className="result-media">
              <img
                src={beforeAfterImage}
                width="1080"
                height="1350"
                alt="Comparação do resultado real de sobrancelhas: antes à esquerda e depois à direita"
                loading="lazy"
                decoding="async"
              />
              <span className="result-year">Resultado real • 2026</span>
            </div>
            <div className="result-copy">
              <p className="eyebrow">Naturalidade que você percebe</p>
              <h2 id="result-title">Mudança visível. Expressão preservada.</h2>
              <p>O objetivo não é transformar quem você é. É equilibrar detalhes para que você se reconheça ainda mais bonita.</p>
              <ul className="feature-list">
                <li><Check aria-hidden="true" />Planejamento de acordo com seus traços</li>
                <li><Check aria-hidden="true" />Alinhamento claro do resultado desejado</li>
                <li><Check aria-hidden="true" />Orientação antes e depois do atendimento</li>
              </ul>
              <WhatsAppLink className="button button-primary" interest="result" placement="result">
                Quero entender meu caso <ArrowRight aria-hidden="true" />
              </WhatsAppLink>
              <small>Imagem autorizada. Resultados variam conforme características individuais e cuidados posteriores.</small>
            </div>
          </div>
        </section>

        <section className="section authority" aria-labelledby="authority-title">
          <div className="landing-container authority-grid">
            <div>
              <p className="eyebrow light">Formação e prática</p>
              <h2 id="authority-title">Conhecimento que sustenta um atendimento cuidadoso.</h2>
              <p>Formação científica, especialização em estética e atualização contínua ajudam a construir escolhas responsáveis para cada pessoa.</p>
            </div>
            <div className="credential-grid">
              <article><GraduationCap aria-hidden="true" /><h3>Ciências Biológicas</h3><p>Graduação que oferece uma base sólida sobre o corpo e seus processos.</p></article>
              <article><Award aria-hidden="true" /><h3>Estética e Cosmetologia</h3><p>Pós-graduação com foco em saúde, bem-estar e cuidados estéticos.</p></article>
              <article><Sparkles aria-hidden="true" /><h3>Capacitações selecionadas</h3><p>{selectedTrainingDescription}</p></article>
            </div>
          </div>
        </section>

        <section className="section about" id="sobre" aria-labelledby="about-title">
          <div className="landing-container about-grid">
            <div className="about-photo">
              <img src={profileImage} width="1335" height="1335" alt="Thaís Schneider sorrindo" loading="lazy" decoding="async" />
              <span><strong>+14 anos</strong> de experiência</span>
            </div>
            <div className="about-copy">
              <p className="eyebrow">Quem cuida de você</p>
              <h2 id="about-title">Oi, eu sou a Thaís.</h2>
              <p className="about-lead">Acredito que um bom atendimento começa pela escuta — e que o melhor resultado é aquele que combina com você.</p>
              <p>Atuo na estética desde 2012, unindo minha formação em Ciências Biológicas à pós-graduação em Estética e Cosmetologia. Em cada atendimento, busco explicar possibilidades com clareza e respeitar seu ritmo, seus traços e suas escolhas.</p>
              <blockquote>“Naturalidade não é fazer menos. É saber exatamente o que valorizar.”</blockquote>
              <WhatsAppLink className="text-link" interest="general" placement="final">
                Conversar diretamente comigo <ArrowRight aria-hidden="true" />
              </WhatsAppLink>
            </div>
          </div>
        </section>

        <section className="section location" id="localizacao" aria-labelledby="location-title">
          <div className="landing-container location-card">
            <div>
              <p className="eyebrow light">Fácil de chegar</p>
              <h2 id="location-title">Seu momento de cuidado no bairro Santo Antônio.</h2>
              <p>Rua Paulino Chaves, 437<br />Santo Antônio, Porto Alegre–RS<br />CEP 90640-200</p>
              <div className="location-features">
                <span><MapPin aria-hidden="true" />Estacionamento no local</span>
                <span><Clock3 aria-hidden="true" />Atendimento com hora marcada</span>
                <span><ShieldCheck aria-hidden="true" />Atendimento exclusivo</span>
              </div>
            </div>
            <div className="location-actions">
              <a className="button button-light" href={mapsUrl} target="_blank" rel="noreferrer">
                Abrir no Google Maps <ArrowRight aria-hidden="true" />
              </a>
              <WhatsAppLink className="button button-outline-light" interest="general" placement="location">
                Agendar atendimento
              </WhatsAppLink>
            </div>
          </div>
        </section>

        <section className="section reviews" ref={reviewsRef} aria-labelledby="reviews-title">
          <div className="landing-container">
            <div className="section-heading centered">
              <p className="eyebrow">Experiência compartilhada</p>
              <h2 id="reviews-title">Conheça a experiência de quem já foi atendida.</h2>
            </div>

            {reviewsState.status === 'loading' || reviewsState.status === 'idle' ? (
              <div className="reviews-loading" role="status">
                <span className="spinner" aria-hidden="true" />
                Carregando avaliações do Google
              </div>
            ) : reviewsState.status === 'success' && reviewsState.data?.reviews.length ? (
              <>
                <div className="rating-summary">
                  <strong>{reviewsState.data.rating?.toFixed(1)}</strong>
                  <span><span className="stars" aria-label={`${reviewsState.data.rating} de 5 estrelas`}>★★★★★</span>{reviewsState.data.userRatingCount} avaliações no Google</span>
                </div>
                <div className="review-grid">
                  {reviewsState.data.reviews.slice(0, 3).map((review) => (
                    <article key={review.id}>
                      <Star aria-hidden="true" />
                      <p>“{review.text}”</p>
                      <strong>{review.author}</strong>
                    </article>
                  ))}
                </div>
                <a className="text-link review-link" href={reviewsState.data.googleMapsUrl ?? mapsUrl} target="_blank" rel="noreferrer">
                  Ver perfil no Google <ArrowRight aria-hidden="true" />
                </a>
              </>
            ) : (
              <div className="reviews-fallback">
                <Star aria-hidden="true" />
                <div>
                  <h3>Veja as avaliações diretamente no Google</h3>
                  <p>A integração não trouxe avaliações agora. Para manter esta página honesta e atualizada, consulte o perfil oficial.</p>
                </div>
                <a className="button button-secondary" href={reviewsState.data?.googleMapsUrl ?? mapsUrl} target="_blank" rel="noreferrer">
                  Consultar no Google <ArrowRight aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </section>

        <section className="section faq" aria-labelledby="faq-title">
          <div className="landing-container faq-grid">
            <div className="section-heading">
              <p className="eyebrow">Antes de agendar</p>
              <h2 id="faq-title">Dúvidas comuns, respostas claras.</h2>
              <p>Se sua dúvida não estiver aqui, fale diretamente com a Thaís pelo WhatsApp.</p>
            </div>
            <div className="faq-list">
              {faqs.map(([question, answer]) => (
                <details
                  key={question}
                  onToggle={(event) => {
                    if (event.currentTarget.open) trackLandingEvent('faq_open', { question })
                  }}
                >
                  <summary>{question}<span aria-hidden="true">+</span></summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section final-cta" aria-labelledby="final-title">
          <div className="landing-container final-card">
            <p className="eyebrow light">Seu próximo passo pode ser simples</p>
            <h2 id="final-title">Conte o que você deseja cuidar. Eu ajudo você a escolher com calma.</h2>
            <p>A triagem inicial é gratuita, pelo WhatsApp, e não obriga você a agendar.</p>
            <WhatsAppLink className="button button-light button-large" interest="general" placement="final">
              Falar com a Thaís agora <MessageCircle aria-hidden="true" />
            </WhatsAppLink>
            <span><Clock3 aria-hidden="true" /> Resposta média em 15 minutos durante os períodos de atendimento</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="landing-container footer-grid">
          <div className="brand footer-brand">
            <img src={brandLogo} width="56" height="56" alt="" loading="lazy" />
            <span><strong>Thaís Schneider</strong><small>Estética</small></span>
          </div>
          <address>Rua Paulino Chaves, 437<br />Santo Antônio • Porto Alegre–RS<br />CEP 90640-200</address>
          <div className="footer-meta">
            <span>CNPJ 17.228.454/0001-17</span>
            <span>Atendimento somente com hora marcada</span>
            <a href="/login">Área de gestão</a>
            {hasAnalytics ? <button type="button" onClick={resetConsent}>Revisar privacidade</button> : null}
          </div>
        </div>
        <div className="landing-container footer-bottom">© {new Date().getFullYear()} Thaís Schneider Estética. Todos os direitos reservados.</div>
      </footer>

      <WhatsAppLink className="mobile-whatsapp" interest="general" placement="mobile">
        <MessageCircle aria-hidden="true" /> Falar com a Thaís
      </WhatsAppLink>

      {hasAnalytics && consent === 'unset' ? (
        <aside className="consent-banner" aria-labelledby="consent-title">
          <div>
            <strong id="consent-title">Sua privacidade importa</strong>
            <p>Usamos cookies de medição apenas com sua permissão para entender o uso da página. Nenhum dado sensível é enviado.</p>
          </div>
          <div className="consent-actions">
            <button type="button" className="button button-secondary" onClick={() => updateConsent('denied')}>Recusar</button>
            <button type="button" className="button button-primary" onClick={() => updateConsent('granted')}>Aceitar medição</button>
          </div>
        </aside>
      ) : null}
    </div>
  )
}

export default LandingPage
