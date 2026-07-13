import {
  Brush,
  CalendarCheck,
  Check,
  Menu,
  Palette,
  Quote,
  Send,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import heroAvif from '../assets/hero-estetica.avif'
import heroImage from '../assets/hero-estetica.png'
import heroWebp from '../assets/hero-estetica.webp'
import './LandingPage.css'

const instagramUrl = 'https://www.instagram.com/thaisschneider_estetica_/'

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function updateHeaderState() {
      setScrolled(window.scrollY > 12)
    }

    updateHeaderState()
    window.addEventListener('scroll', updateHeaderState, { passive: true })
    return () => window.removeEventListener('scroll', updateHeaderState)
  }, [])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="landing-site">
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <a className="brand" href="#inicio" aria-label="Thais Schneider Estetica" onClick={closeMenu}>
          <span className="brand-mark">TS</span>
          <span>
            <strong>Thais Schneider</strong>
            <small>Estetica</small>
          </span>
        </a>

        <button
          className="nav-toggle"
          type="button"
          aria-label="Abrir menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <Menu size={20} />
        </button>

        <nav className={`site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegacao publica">
          <a href="#servicos" onClick={closeMenu}>Servicos</a>
          <a href="#experiencia" onClick={closeMenu}>Experiencia</a>
          <a href="#resultado" onClick={closeMenu}>Resultado</a>
          <a href="#contato" onClick={closeMenu}>Contato</a>
          <Link className="panel-link" to="/login" onClick={closeMenu}>Acessar painel</Link>
        </nav>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="hero-title">
          <picture>
            <source srcSet={heroAvif} type="image/avif" />
            <source srcSet={heroWebp} type="image/webp" />
            <img className="hero-image" src={heroImage} alt="Sala elegante de estetica com maca, produtos de beleza e luz natural" />
          </picture>
          <div className="hero-overlay" />
          <div className="hero-content">
            <p className="eyebrow">Esteticista | Micropigmentadora | Maquiadora</p>
            <h1 id="hero-title">Thais Schneider Estetica</h1>
            <p className="hero-copy">
              Beleza natural com tecnica, cuidado e uma experiencia acolhedora em Porto Alegre.
            </p>
            <div className="hero-actions" aria-label="Acoes principais">
              <a className="button primary" href={instagramUrl} target="_blank" rel="noreferrer">
                <CalendarCheck size={19} />
                Agendar pelo Instagram
              </a>
              <a className="button secondary" href="#servicos">
                <Sparkles size={19} />
                Ver servicos
              </a>
              <Link className="button panel-cta" to="/login">
                Acessar painel
              </Link>
            </div>
          </div>
        </section>

        <section className="quick-strip" aria-label="Destaques">
          <div>
            <strong>Porto Alegre</strong>
            <span>Atendimento com hora marcada</span>
          </div>
          <div>
            <strong>Naturalidade</strong>
            <span>Procedimentos pensados para realcar seus tracos</span>
          </div>
          <div>
            <strong>Cuidado completo</strong>
            <span>Estetica, micropigmentacao e maquiagem</span>
          </div>
        </section>

        <section className="section service-section" id="servicos" aria-labelledby="services-title">
          <div className="section-heading">
            <p className="eyebrow">Servicos</p>
            <h2 id="services-title">Servicos para beleza, pele e autocuidado</h2>
            <p>
              Atendimentos com hora marcada para depilacao, procedimentos esteticos, micropigmentacao e maquiagem.
            </p>
          </div>

          <div className="service-grid">
            <article className="service-card">
              <span className="icon-badge"><Sparkles size={22} /></span>
              <h3>Depilacao</h3>
              <p>Sobrancelha, buco/nariz, rosto completo, axila, virilha, pernas e pacote completo.</p>
            </article>
            <article className="service-card">
              <span className="icon-badge"><WandSparkles size={22} /></span>
              <h3>Procedimentos esteticos</h3>
              <p>Peeling diamante, plasma lifting, jato de plasma, radiofrequencia, endermoterapia, vacuoterapia e pump up.</p>
            </article>
            <article className="service-card">
              <span className="icon-badge"><Brush size={22} /></span>
              <h3>Micropigmentacao</h3>
              <p>Micropigmentacao de sobrancelhas para valorizar o desenho com acabamento delicado.</p>
            </article>
            <article className="service-card">
              <span className="icon-badge"><Palette size={22} /></span>
              <h3>Maquiagem</h3>
              <p>Producao para eventos e ocasioes especiais, com ou sem aplicacao de cilios.</p>
            </article>
          </div>
        </section>

        <section className="section experience-section" id="experiencia" aria-labelledby="experience-title">
          <div className="experience-copy">
            <p className="eyebrow">Experiencia</p>
            <h2 id="experience-title">Um atendimento pensado para voce se sentir segura</h2>
            <p>
              Da primeira mensagem ao pos-atendimento, a proposta e unir tecnica, escuta e delicadeza.
              Cada detalhe foi organizado para comunicar confianca sem perder a leveza da marca.
            </p>
            <ul className="check-list">
              <li><Check size={22} /> Orientacao antes e depois do procedimento</li>
              <li><Check size={22} /> Ambiente limpo, calmo e acolhedor</li>
              <li><Check size={22} /> Resultado alinhado ao seu estilo pessoal</li>
            </ul>
          </div>
          <div className="process-list" aria-label="Etapas do atendimento">
            <article>
              <span>01</span>
              <h3>Escuta</h3>
              <p>Entendimento das expectativas, historico e rotina de cuidados.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Planejamento</h3>
              <p>Escolha do procedimento, formato, acabamento e orientacoes.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Finalizacao</h3>
              <p>Entrega do resultado e combinados para manutencao.</p>
            </article>
          </div>
        </section>

        <section className="section result-section" id="resultado" aria-labelledby="result-title">
          <div className="section-heading narrow">
            <p className="eyebrow">Resultado</p>
            <h2 id="result-title">Beleza com acabamento leve, preciso e duradouro</h2>
          </div>
          <div className="result-layout">
            <div className="result-panel">
              <Quote size={36} />
              <p>
                Um site com visual limpo e premium ajuda o cliente a entender rapidamente o que voce faz,
                sentir confianca e chamar para agendar.
              </p>
            </div>
            <div className="stats">
              <div>
                <strong>3</strong>
                <span>frentes de atendimento</span>
              </div>
              <div>
                <strong>1:1</strong>
                <span>experiencia personalizada</span>
              </div>
              <div>
                <strong>POA</strong>
                <span>atendimento em Porto Alegre</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section contact-section" id="contato" aria-labelledby="contact-title">
          <div>
            <p className="eyebrow">Contato</p>
            <h2 id="contact-title">Pronta para marcar seu horario?</h2>
            <p>
              Envie uma mensagem pelo Instagram para consultar disponibilidade, valores e escolher o melhor atendimento.
            </p>
          </div>
          <div className="contact-actions">
            <a className="button primary" href={instagramUrl} target="_blank" rel="noreferrer">
              <Send size={19} />
              Abrir Instagram
            </a>
            <Link className="button ghost" to="/login">
              Acessar painel
            </Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>Thais Schneider Estetica</p>
        <span>Porto Alegre | {new Date().getFullYear()}</span>
        <Link className="footer-admin-link" to="/login">Painel administrativo</Link>
      </footer>
    </div>
  )
}
