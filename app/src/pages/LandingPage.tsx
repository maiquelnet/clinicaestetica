import {
  ArrowRight,
  Mail,
  Menu,
  MessageCircle,
  Star,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import beforeAfterImage from '../assets/antes_depois_20260611.jpg'
import profileImage from '../assets/foto_perfil_thais.jpg'
import heroImage from '../assets/hero-estetica.png'
import brandEmblem from '../assets/logo_1080.jpg'
import brandLogo from '../assets/logo_150.jpg'
import './LandingPage.css'

const instagramUrl = 'https://www.instagram.com/thaisschneider_estetica_/'
const emailUrl = 'mailto:contato@esteticaschneider.com.br'
const whatsappUrl =
  'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20vim%20pelo%20site%20e%20gostaria%20de%20agendar%20um%20atendimento.'

const whatsappLinks = {
  facial:
    'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20est%C3%A9tica%20facial.',
  micropigmentation:
    'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20micropigmenta%C3%A7%C3%A3o.',
  makeup:
    'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20maquiagem.',
  about:
    'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20gostaria%20de%20conhecer%20mais%20sobre%20os%20atendimentos%20da%20Thais.',
  result:
    'https://wa.me/5551985910322?text=Ol%C3%A1%2C%20vi%20o%20resultado%20de%20micropigmenta%C3%A7%C3%A3o%20no%20site%20e%20gostaria%20de%20saber%20mais.',
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="landing-site">
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Thais Schneider Estética" onClick={closeMenu}>
          <img src={brandLogo} alt="" aria-hidden="true" />
          <span className="brand-text">
            <strong>Thais Schneider</strong>
            <span>Estética em Porto Alegre</span>
          </span>
        </a>

        <button
          className="nav-toggle"
          type="button"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav id="landing-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Navegação principal">
          <a href="#atendimentos" onClick={closeMenu}>Atendimentos</a>
          <a href="#beneficios" onClick={closeMenu}>Benefícios</a>
          <a href="#quem-sou" onClick={closeMenu}>Quem sou eu</a>
          <a href="#avaliacoes" onClick={closeMenu}>Avaliações</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
        </nav>

        <a className="header-cta" href={whatsappUrl} target="_blank" rel="noreferrer">
          Agendar agora
        </a>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="hero-title" style={{ '--hero-image': `url(${heroImage})` } as React.CSSProperties}>
          <div className="hero-content">
            <p className="tag">Esteticista | Micropigmentadora | Maquiadora</p>
            <h1 id="hero-title">Realce sua beleza natural com atendimento personalizado.</h1>
            <p>
              Agende sua avaliação e descubra o procedimento ideal para sua pele, sobrancelhas ou produção especial.
            </p>

            <div className="contact-actions" aria-label="Canais para agendamento">
              <a className="contact-card instagram" href={instagramUrl} target="_blank" rel="noreferrer">
                <span className="icon" aria-hidden="true">
                  <svg className="social-icon" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span><strong>Instagram</strong><small>Chamar no perfil</small></span>
              </a>
              <a className="contact-card whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">
                <span className="icon" aria-hidden="true"><MessageCircle size={24} /></span>
                <span><strong>WhatsApp</strong><small>Agendar agora</small></span>
              </a>
              <a className="contact-card email" href={emailUrl}>
                <span className="icon" aria-hidden="true"><Mail size={24} /></span>
                <span><strong>E-mail</strong><small>Enviar mensagem</small></span>
              </a>
            </div>

            <a className="text-link" href="#atendimentos">
              Escolher atendimento <ArrowRight size={17} />
            </a>
          </div>
        </section>

        <section className="section choice" id="atendimentos" aria-labelledby="choice-title">
          <div className="section-head">
            <p className="tag">Escolha seu atendimento</p>
            <h2 id="choice-title">O que você quer melhorar hoje?</h2>
          </div>
          <div className="choice-grid">
            <article>
              <span>Pele</span>
              <h3>Estética facial</h3>
              <p>Para luminosidade, textura, viço e uma rotina de cuidado mais direcionada.</p>
              <a href={whatsappLinks.facial} target="_blank" rel="noreferrer">Quero cuidar da pele</a>
            </article>
            <article>
              <span>Sobrancelhas</span>
              <h3>Micropigmentação</h3>
              <p>Para valorizar o desenho natural com acabamento delicado e personalizado.</p>
              <a href={whatsappLinks.micropigmentation} target="_blank" rel="noreferrer">Quero saber mais</a>
            </article>
            <article>
              <span>Evento</span>
              <h3>Maquiagem</h3>
              <p>Para produções elegantes em eventos, ensaios e momentos especiais.</p>
              <a href={whatsappLinks.makeup} target="_blank" rel="noreferrer">Quero agendar maquiagem</a>
            </article>
          </div>
        </section>

        <section className="brand-emblem" aria-labelledby="brand-emblem-title">
          <div className="emblem-card">
            <img src={brandEmblem} alt="Emblema Thais Schneider Estética" />
            <div>
              <p className="tag">Marca e propósito</p>
              <h2 id="brand-emblem-title">Cuidado estético com assinatura, técnica e acolhimento.</h2>
              <p>Cada detalhe da marca traduz um atendimento delicado, seguro e pensado para valorizar a sua beleza natural.</p>
            </div>
          </div>
        </section>

        <section className="benefits" id="beneficios" aria-label="Benefícios rápidos">
          <div><strong>01</strong><span>Avaliação individual</span></div>
          <div><strong>02</strong><span>Resultado natural</span></div>
          <div><strong>03</strong><span>Ambiente acolhedor</span></div>
          <div><strong>04</strong><span>Cuidados pós-atendimento</span></div>
        </section>

        <section className="section about" id="quem-sou" aria-labelledby="about-title">
          <div className="about-copy">
            <p className="tag">Quem sou eu</p>
            <h2 id="about-title">Ciência, técnica e carinho em cada protocolo.</h2>
            <p>
              Transformar a autoestima é minha missão desde 2012. Sou Thaís Schneider e, por trás de cada protocolo que realizo, existe muito estudo e um cuidado real com a sua saúde. Minha formação acadêmica me deu a base científica perfeita para entender a sua pele de forma profunda e oferecer resultados seguros e duradouros. Com extensões em estética facial e aplicação de toxina botulínica, uno ciência, técnica e muito carinho. Cristã, esposa e mãe de dois, levo toda essa dedicação para o meu espaço, onde cada atendimento é uma experiência única de autocuidado. Vamos realçar a sua melhor versão?
            </p>
            <a className="about-cta" href={whatsappLinks.about} target="_blank" rel="noreferrer">Conversar com a Thais</a>
          </div>
          <figure className="about-photo">
            <img src={profileImage} alt="Thaís Schneider sorrindo" />
          </figure>
        </section>

        <section className="section result-showcase" aria-labelledby="result-title">
          <div className="result-copy">
            <p className="tag">Resultado real</p>
            <h2 id="result-title">Resultado real em micropigmentação</h2>
            <p>Um exemplo de trabalho realizado para demonstrar como a técnica certa valoriza os traços com naturalidade, definição e harmonia.</p>
            <a className="result-cta" href={whatsappLinks.result} target="_blank" rel="noreferrer">Quero um resultado assim</a>
          </div>
          <figure className="result-image">
            <img src={beforeAfterImage} alt="Antes e depois de micropigmentação realizada por Thaís Schneider" />
          </figure>
        </section>

        <section className="section reviews" id="avaliacoes" aria-labelledby="reviews-title">
          <div className="reviews-copy">
            <p className="tag">Avaliações do Google</p>
            <h2 id="reviews-title">A experiência de quem escolhe se cuidar.</h2>
            <p>Em breve, as avaliações verificadas do Google estarão disponíveis aqui.</p>
          </div>
          <div className="reviews-coming-soon" aria-label="Avaliações em breve">
            <div className="stars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((star) => <Star key={star} size={22} fill="currentColor" />)}
            </div>
            <strong>Avaliações verificadas</strong>
            <span>Espaço preparado para integração com o Google</span>
          </div>
        </section>

        <section className="section faq" id="faq" aria-labelledby="faq-title">
          <div className="section-head">
            <p className="tag">Perguntas frequentes</p>
            <h2 id="faq-title">Tire suas dúvidas antes de chamar</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Como faço para agendar?</summary>
              <p>Chame pelo Instagram ou WhatsApp, envie o atendimento desejado e combine o melhor horário disponível.</p>
            </details>
            <details>
              <summary>Preciso passar por avaliação?</summary>
              <p>A avaliação ajuda a entender seu objetivo e indicar o procedimento mais adequado.</p>
            </details>
            <details>
              <summary>Quanto custa cada procedimento?</summary>
              <p>Os valores podem variar conforme o atendimento. A consulta de preço é feita pelo Instagram, WhatsApp ou e-mail.</p>
            </details>
            <details>
              <summary>Onde é o atendimento?</summary>
              <p>O atendimento é em Porto Alegre, com hora marcada.</p>
            </details>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-title" style={{ '--hero-image': `url(${heroImage})` } as React.CSSProperties}>
          <p className="tag">Agendamento rápido</p>
          <h2 id="final-title">Quer saber qual atendimento combina com você?</h2>
          <p>Envie uma mensagem agora e receba orientação para escolher o melhor procedimento.</p>
          <div className="final-actions">
            <a className="button light" href={whatsappUrl} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
            <a className="button outline" href={instagramUrl} target="_blank" rel="noreferrer">Abrir Instagram</a>
            <a className="button outline" href={emailUrl}>Enviar e-mail</a>
          </div>
        </section>
      </main>

      <footer>
        <strong>Thais Schneider Estética</strong>
        <span>Porto Alegre | contato@esteticaschneider.com.br | +55 51 98591-0322</span>
        <Link className="footer-admin-link" to="/login">Painel administrativo</Link>
      </footer>
    </div>
  )
}
