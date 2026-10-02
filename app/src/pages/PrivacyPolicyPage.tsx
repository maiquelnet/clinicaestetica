import { ArrowLeft, Mail, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './PrivacyPolicyPage.css'

const effectiveDate = '2 de outubro de 2026'

export function PrivacyPolicyPage() {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const previousDescription = description?.getAttribute('content')

    document.title = 'Política de Privacidade | Thaís Schneider Estética'
    description?.setAttribute(
      'content',
      'Política de Privacidade da Thaís Schneider Estética, com informações sobre coleta, uso, compartilhamento e proteção de dados pessoais.',
    )

    return () => {
      document.title = previousTitle
      if (description && previousDescription) description.setAttribute('content', previousDescription)
    }
  }, [])

  return (
    <div className="privacy-page">
      <header className="privacy-header">
        <div className="privacy-container privacy-header-inner">
          <Link className="privacy-brand" to="/" aria-label="Voltar para Thaís Schneider Estética">
            <span className="privacy-brand-mark">TS</span>
            <span>
              <strong>Thaís Schneider</strong>
              <small>Estética</small>
            </span>
          </Link>
          <Link className="privacy-back-link" to="/">
            <ArrowLeft size={17} aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="privacy-main">
        <div className="privacy-container privacy-layout">
          <article className="privacy-article">
            <div className="privacy-intro">
              <p className="privacy-eyebrow"><ShieldCheck size={17} aria-hidden="true" /> Transparência e cuidado</p>
              <h1>Política de Privacidade</h1>
              <p className="privacy-lead">
                Esta política explica como a Thaís Schneider Estética trata dados pessoais quando você acessa nosso site,
                realiza um cadastro, agenda um atendimento ou conversa conosco pelos canais digitais.
              </p>
              <p className="privacy-updated">Última atualização: {effectiveDate}</p>
            </div>

            <nav className="privacy-contents" aria-label="Conteúdo desta política">
              <strong>Nesta página</strong>
              <div>
                <a href="#controladora">Quem trata seus dados</a>
                <a href="#dados">Dados que podemos coletar</a>
                <a href="#finalidades">Como usamos os dados</a>
                <a href="#compartilhamento">Compartilhamento</a>
                <a href="#direitos">Seus direitos</a>
                <a href="#contato">Contato</a>
              </div>
            </nav>

            <section id="controladora" className="privacy-section" aria-labelledby="controladora-title">
              <p className="privacy-section-number">01</p>
              <div>
                <h2 id="controladora-title">Quem trata seus dados</h2>
                <p>
                  A responsável pelo tratamento é <strong>Thaís Schneider Estética</strong>, inscrita no CNPJ sob o nº
                  <strong> 17.228.454/0001-17</strong>, com endereço na Rua Paulino Chaves, 437, Santo Antônio,
                  Porto Alegre–RS, CEP 90640-200.
                </p>
                <p>
                  Para dúvidas sobre privacidade ou para exercer seus direitos, entre em contato pelo e-mail
                  <a href="mailto:contato@esteticaschneider.com.br"> contato@esteticaschneider.com.br</a>.
                </p>
              </div>
            </section>

            <section id="dados" className="privacy-section" aria-labelledby="dados-title">
              <p className="privacy-section-number">02</p>
              <div>
                <h2 id="dados-title">Dados que podemos coletar</h2>
                <p>Coletamos somente os dados necessários para cada finalidade. Dependendo da interação, isso pode incluir:</p>
                <ul>
                  <li>nome, telefone e e-mail;</li>
                  <li>data de nascimento, quando informada no cadastro;</li>
                  <li>serviços de interesse e informações necessárias para organizar o atendimento;</li>
                  <li>dados de agendamento, histórico de contato e preferências de comunicação;</li>
                  <li>mensagens enviadas pelos canais de atendimento, incluindo WhatsApp;</li>
                  <li>informações técnicas e de navegação, como dispositivo, navegador e páginas acessadas, quando a medição for autorizada.</li>
                </ul>
                <p>
                  Pedimos que você não envie pelo formulário público informações médicas ou outros dados sensíveis que não sejam
                  necessários. Quando informações de saúde forem indispensáveis para o atendimento, elas serão tratadas com
                  cuidado reforçado e somente para a finalidade informada.
                </p>
              </div>
            </section>

            <section id="finalidades" className="privacy-section" aria-labelledby="finalidades-title">
              <p className="privacy-section-number">03</p>
              <div>
                <h2 id="finalidades-title">Como usamos os dados</h2>
                <p>Os dados podem ser utilizados para:</p>
                <ul>
                  <li>responder dúvidas e iniciar a triagem pelo WhatsApp;</li>
                  <li>realizar e atualizar cadastros de clientes;</li>
                  <li>agendar, confirmar, alterar ou cancelar atendimentos;</li>
                  <li>enviar lembretes e comunicações relacionadas a um atendimento solicitado;</li>
                  <li>gerenciar modelos e mensagens da WhatsApp Business Platform;</li>
                  <li>proteger o site, prevenir fraude, corrigir falhas e manter os serviços seguros;</li>
                  <li>medir o uso do site e melhorar a experiência, quando você autorizar cookies de análise.</li>
                </ul>
                <p>
                  O tratamento é realizado conforme a finalidade, podendo se basear no seu consentimento, na execução de medidas
                  relacionadas ao atendimento solicitado, no cumprimento de obrigações legais ou no legítimo interesse de manter
                  a operação segura e organizada, sempre respeitando seus direitos.
                </p>
              </div>
            </section>

            <section id="compartilhamento" className="privacy-section" aria-labelledby="compartilhamento-title">
              <p className="privacy-section-number">04</p>
              <div>
                <h2 id="compartilhamento-title">Com quem podemos compartilhar</h2>
                <p>
                  Não vendemos dados pessoais. Quando necessário para prestar o serviço, podemos utilizar fornecedores que atuam
                  em nosso nome, sempre limitados à finalidade contratada, incluindo:
                </p>
                <ul>
                  <li><strong>Supabase</strong>, para infraestrutura, autenticação, banco de dados e funções do sistema;</li>
                  <li><strong>Meta/WhatsApp Business Platform</strong>, para envio e recebimento de comunicações pelo WhatsApp;</li>
                  <li><strong>Google</strong>, quando recursos de agenda, mapas, avaliações ou medição forem habilitados;</li>
                  <li>prestadores técnicos e autoridades públicas, quando houver obrigação legal ou necessidade de proteção de direitos.</li>
                </ul>
                <p>
                  Alguns fornecedores podem processar dados fora do Brasil. Nesses casos, adotamos as medidas contratuais e técnicas
                  aplicáveis ao serviço utilizado.
                </p>
              </div>
            </section>

            <section id="cookies" className="privacy-section" aria-labelledby="cookies-title">
              <p className="privacy-section-number">05</p>
              <div>
                <h2 id="cookies-title">Cookies e medição</h2>
                <p>
                  O site pode utilizar recursos essenciais para funcionar e armazenar sua escolha de privacidade. Recursos de
                  medição, como Google Analytics, somente são ativados quando você autoriza a análise no aviso de privacidade.
                </p>
                <p>
                  Você pode recusar a medição ou revisar sua escolha pelo botão <strong>“Revisar privacidade”</strong> disponível
                  no rodapé do site quando esse recurso estiver ativo.
                </p>
              </div>
            </section>

            <section id="retencao" className="privacy-section" aria-labelledby="retencao-title">
              <p className="privacy-section-number">06</p>
              <div>
                <h2 id="retencao-title">Armazenamento e retenção</h2>
                <p>
                  Mantemos os dados pelo tempo necessário para cumprir as finalidades desta política, prestar o atendimento,
                  cumprir obrigações legais e exercer ou proteger direitos. Quando não houver mais necessidade, os dados serão
                  eliminados, anonimizados ou mantidos apenas quando houver fundamento legal para sua conservação.
                </p>
                <p>
                  Usamos medidas técnicas e administrativas proporcionais para reduzir riscos de acesso indevido, perda, alteração
                  ou divulgação não autorizada. Nenhum serviço conectado à internet é totalmente livre de riscos.
                </p>
              </div>
            </section>

            <section id="direitos" className="privacy-section" aria-labelledby="direitos-title">
              <p className="privacy-section-number">07</p>
              <div>
                <h2 id="direitos-title">Seus direitos</h2>
                <p>Nos termos da legislação aplicável, especialmente a LGPD, você pode solicitar:</p>
                <ul>
                  <li>confirmação da existência de tratamento e acesso aos seus dados;</li>
                  <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>informações sobre uso e compartilhamento;</li>
                  <li>eliminação de dados tratados com base no consentimento, quando aplicável;</li>
                  <li>revogação do consentimento e oposição a determinados tratamentos;</li>
                  <li>portabilidade, observados os limites regulamentares e a proteção de segredos comerciais.</li>
                </ul>
                <p>
                  Para solicitar algo, envie uma mensagem para <a href="mailto:contato@esteticaschneider.com.br">contato@esteticaschneider.com.br</a>.
                  Podemos pedir informações adicionais para confirmar sua identidade e proteger seus dados.
                </p>
              </div>
            </section>

            <section id="menores" className="privacy-section" aria-labelledby="menores-title">
              <p className="privacy-section-number">08</p>
              <div>
                <h2 id="menores-title">Menores de idade</h2>
                <p>
                  O atendimento de menores de idade depende da participação e autorização do responsável legal. Se você acredita que
                  um menor forneceu dados sem a autorização necessária, entre em contato para que possamos avaliar a situação.
                </p>
              </div>
            </section>

            <section id="atualizacoes" className="privacy-section" aria-labelledby="atualizacoes-title">
              <p className="privacy-section-number">09</p>
              <div>
                <h2 id="atualizacoes-title">Atualizações desta política</h2>
                <p>
                  Podemos atualizar esta política para refletir mudanças no site, nos serviços ou na legislação. A versão vigente
                  estará sempre disponível nesta página, com a data da última atualização.
                </p>
              </div>
            </section>

            <section id="contato" className="privacy-contact" aria-labelledby="contato-title">
              <div>
                <p className="privacy-eyebrow">Fale conosco</p>
                <h2 id="contato-title">Privacidade também é cuidado.</h2>
                <p>Se algo não ficou claro ou você precisa exercer um direito, escreva para nossa equipe.</p>
              </div>
              <a className="privacy-contact-link" href="mailto:contato@esteticaschneider.com.br">
                <Mail size={19} aria-hidden="true" />
                contato@esteticaschneider.com.br
              </a>
            </section>
          </article>

          <aside className="privacy-aside" aria-label="Dados da empresa">
            <div className="privacy-aside-card">
              <span className="privacy-aside-icon"><MapPin size={19} aria-hidden="true" /></span>
              <p className="privacy-eyebrow">Responsável</p>
              <h2>Thaís Schneider Estética</h2>
              <p>CNPJ 17.228.454/0001-17</p>
              <address>Rua Paulino Chaves, 437<br />Santo Antônio · Porto Alegre–RS<br />CEP 90640-200</address>
              <a href="tel:+5551985910322">+55 51 98591-0322</a>
              <a href="mailto:contato@esteticaschneider.com.br">contato@esteticaschneider.com.br</a>
            </div>
            <div className="privacy-aside-note">
              <strong>Uma política clara</strong>
              <p>Explicamos de forma simples quais dados usamos e por quê.</p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="privacy-footer">
        <div className="privacy-container privacy-footer-inner">
          <span>© {new Date().getFullYear()} Thaís Schneider Estética</span>
          <Link to="/">Voltar para o site</Link>
        </div>
      </footer>
    </div>
  )
}

export default PrivacyPolicyPage
