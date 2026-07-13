const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 4173);

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function page() {
  return read('Index.html')
    .replace("<?!= include('Styles'); ?>", read('Styles.html'))
    .replace("<?!= include('Client'); ?>", `${mockGoogleScript()}\n${read('Client.html')}`);
}

function mockGoogleScript() {
  return `<script>
    const previewDb = (() => {
      const now = new Date();
      const iso = (date) => date.toISOString().slice(0, 19);
      const plusHours = (hours) => {
        const date = new Date(now);
        date.setHours(date.getHours() + hours);
        return iso(date);
      };
      const minusHours = (hours) => {
        const date = new Date(now);
        date.setHours(date.getHours() - hours);
        return iso(date);
      };
      const minusDays = (days) => {
        const date = new Date(now);
        date.setDate(date.getDate() - days);
        return iso(date);
      };
      const birthdayTomorrow = () => {
        const date = new Date(now);
        date.setDate(date.getDate() + 1);
        return '1992-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      };
      const messageTypes = [
        ['confirmacao_agendamento', 'Confirmação de agendamento'],
        ['lembrete_agendamento', 'Lembrete de agendamento'],
        ['pos_atendimento', 'Pós-atendimento crítico'],
        ['pedido_avaliacao', 'Pedido de avaliação'],
        ['aniversario', 'Aniversário'],
        ['lembrete_retorno', 'Lembrete de retorno'],
        ['promocao_campanha', 'Promoção / campanha'],
      ].map(([key, label]) => ({ key, label }));
      const state = {
        config: {
          nome_clinica: 'Thais Schneider Estética',
          link_avaliacao_google: 'https://g.page/r/avaliacao-exemplo',
          calendario_padrao_id: '',
          admin_emails: 'profissional@example.com',
        },
        currentUser: {
          activeEmail: 'profissional@example.com',
          effectiveEmail: 'profissional@example.com',
        },
        messageTypes,
        messageTemplates: messageTypes.map((item, index) => ({
          id: 'tpl_' + item.key,
          tipo: item.key,
          nome: item.label,
          texto: '',
          ativo: true,
          regra_tipo: item.key === 'promocao_campanha' ? 'manual' : item.key === 'aniversario' ? 'aniversario' : item.key === 'lembrete_retorno' ? 'ultimo_agendamento' : item.key === 'confirmacao_agendamento' ? 'agendamento_criado' : 'inicio_agendamento',
          regra_quantidade: item.key === 'lembrete_agendamento' ? 8 : item.key === 'aniversario' ? 1 : item.key === 'lembrete_retorno' ? 20 : item.key === 'promocao_campanha' ? '' : 2,
          regra_unidade: item.key === 'aniversario' || item.key === 'lembrete_retorno' ? 'dias' : item.key === 'promocao_campanha' ? '' : 'horas',
          regra_direcao: item.key === 'lembrete_agendamento' || item.key === 'aniversario' ? 'antes' : item.key === 'promocao_campanha' ? '' : 'depois',
          prioridade: index + 1,
        })),
        campaigns: [],
        clients: [
          {
            id: 'cli_ana',
            nome: 'Ana Oliveira',
            telefone: '51999990001',
            email: 'ana@example.com',
            data_nascimento: birthdayTomorrow(),
            observacoes: 'Prefere mensagens pela manhã.',
            ativo: true,
            ultima_mensagem: null,
          },
          {
            id: 'cli_maria',
            nome: 'Maria Santos',
            telefone: '51999990002',
            email: 'maria@example.com',
            data_nascimento: '1988-08-14',
            observacoes: '',
            ativo: true,
            ultima_mensagem: {
              tipo: 'confirmacao_agendamento',
              data_envio: minusDays(2),
            },
          },
        ],
        services: [
          {
            id: 'srv_limpeza',
            nome: 'Limpeza de pele',
            descricao: 'Protocolo facial personalizado.',
            duracao_minutos: 90,
            ativo: true,
            valor_atual: 180,
            historico_precos: [
              { id: 'pre_2', valor: 180, inicio_validade: '2026-06-01', fim_validade: '' },
              { id: 'pre_1', valor: 150, inicio_validade: '2026-01-01', fim_validade: '2026-06-01' },
            ],
          },
          {
            id: 'srv_micro',
            nome: 'Micropigmentação',
            descricao: 'Design delicado para sobrancelhas.',
            duracao_minutos: 120,
            ativo: true,
            valor_atual: 420,
            historico_precos: [
              { id: 'pre_3', valor: 420, inicio_validade: '2026-01-01', fim_validade: '' },
            ],
          },
        ],
        appointments: [
          {
            id: 'age_hoje',
            cliente_id: 'cli_ana',
            servico_id: 'srv_limpeza',
            cliente_nome: 'Ana Oliveira',
            cliente_telefone: '51999990001',
            servico_nome: 'Limpeza de pele',
            data_inicio: plusHours(6),
            data_fim: plusHours(7.5),
            valor_aplicado: 180,
            status: 'agendado',
            google_event_id: 'preview-event-1',
            observacoes: 'Teste de lembrete em 8 horas.',
          },
          {
            id: 'age_passado',
            cliente_id: 'cli_maria',
            servico_id: 'srv_micro',
            cliente_nome: 'Maria Santos',
            cliente_telefone: '51999990002',
            servico_nome: 'Micropigmentação',
            data_inicio: minusHours(3),
            data_fim: minusHours(1),
            valor_aplicado: 420,
            status: 'agendado',
            google_event_id: 'preview-event-2',
            observacoes: 'Teste de pós-atendimento.',
          },
        ],
        messages: [],
        alerts: [],
        dashboard: {},
      };
      state.services = [
        { id: 'srv_depilacao_sobrancelha', categoria: 'Depilação', nome: 'Sobrancelha', descricao: 'Depilação e acabamento para limpeza do desenho natural das sobrancelhas.', duracao_minutos: 30, ativo: true, valor_atual: 35, historico_precos: [{ id: 'pre_sobrancelha', valor: 35, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_buco_nariz', categoria: 'Depilação', nome: 'Buço/Nariz', descricao: 'Remoção rápida de pelos no buço ou nariz.', duracao_minutos: 15, ativo: true, valor_atual: 10, historico_precos: [{ id: 'pre_buco_nariz', valor: 10, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_rosto_completo', categoria: 'Depilação', nome: 'Rosto completo', descricao: 'Depilação facial completa para acabamento uniforme.', duracao_minutos: 45, ativo: true, valor_atual: 50, historico_precos: [{ id: 'pre_rosto_completo', valor: 50, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_axila', categoria: 'Depilação', nome: 'Axila', descricao: 'Depilação de axilas com atendimento rápido e cuidadoso.', duracao_minutos: 20, ativo: true, valor_atual: 15, historico_precos: [{ id: 'pre_axila', valor: 15, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_virilha', categoria: 'Depilação', nome: 'Virilha', descricao: 'Depilação de virilha com técnica cuidadosa.', duracao_minutos: 30, ativo: true, valor_atual: 50, historico_precos: [{ id: 'pre_virilha', valor: 50, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_meia_perna', categoria: 'Depilação', nome: '1/2 perna', descricao: 'Depilação de meia perna.', duracao_minutos: 30, ativo: true, valor_atual: 37, historico_precos: [{ id: 'pre_meia_perna', valor: 37, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_perna_inteira', categoria: 'Depilação', nome: 'Perna inteira', descricao: 'Depilação completa das pernas.', duracao_minutos: 45, ativo: true, valor_atual: 50, historico_precos: [{ id: 'pre_perna_inteira', valor: 50, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_depilacao_completa', categoria: 'Depilação', nome: 'Completa', descricao: 'Pacote de depilação completa conforme combinação no atendimento.', duracao_minutos: 90, ativo: true, valor_atual: 140, historico_precos: [{ id: 'pre_completa', valor: 140, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_pacote_5_sessoes', categoria: 'Procedimentos', nome: 'Pacote de 5 sessões', descricao: 'Pacote promocional para sequência de procedimentos estéticos.', duracao_minutos: 60, observacao_preco: 'Pacote de 5 sessões.', ativo: true, valor_atual: 400, historico_precos: [{ id: 'pre_pacote_5', valor: 400, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_peeling_diamante', categoria: 'Procedimentos', nome: 'Peeling diamante', descricao: 'Procedimento para renovação superficial, textura e luminosidade da pele.', duracao_minutos: 60, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_peeling_diamante', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_plasma_lifting', categoria: 'Procedimentos', nome: 'Plasma lifting', descricao: 'Procedimento estético voltado para firmeza e revitalização da pele.', duracao_minutos: 60, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_plasma_lifting', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_jato_plasma', categoria: 'Procedimentos', nome: 'Jato de plasma', descricao: 'Procedimento definido após avaliação individual.', duracao_minutos: 60, preco_sob_consulta: true, observacao_preco: 'Valor mediante avaliação.', ativo: true, valor_atual: 0, historico_precos: [] },
        { id: 'srv_procedimentos_corrente_russa_radiofrequencia', categoria: 'Procedimentos', nome: 'Corrente russa/radiofrequência', descricao: 'Procedimento corporal para estímulo, firmeza e cuidado estético.', duracao_minutos: 60, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_corrente_russa_radiofrequencia', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_endermoterapia', categoria: 'Procedimentos', nome: 'Endermoterapia', descricao: 'Procedimento corporal com manobras mecânicas para cuidado estético.', duracao_minutos: 60, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_endermoterapia', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_vacuoterapia', categoria: 'Procedimentos', nome: 'Vacuoterapia', descricao: 'Procedimento corporal com sucção controlada para cuidado estético.', duracao_minutos: 60, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_vacuoterapia', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_procedimentos_pump_up', categoria: 'Procedimentos', nome: 'Pump up', descricao: 'Procedimento corporal para estímulo e valorização do contorno.', duracao_minutos: 60, ativo: true, valor_atual: 80, historico_precos: [{ id: 'pre_pump_up', valor: 80, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_micropigmentacao_sobrancelhas', categoria: 'Micropigmentação', nome: 'Micropigmentação de sobrancelhas', descricao: 'Técnica para valorizar o desenho das sobrancelhas com acabamento delicado.', duracao_minutos: 120, observacao_preco: 'ou 2x R$ 300,00 / 3x R$ 210,00', ativo: true, valor_atual: 550, historico_precos: [{ id: 'pre_micropigmentacao', valor: 550, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_maquiagem_sem_cilios', categoria: 'Maquiagem', nome: 'Sem aplicação de cílios', descricao: 'Maquiagem para eventos e ocasiões especiais, sem aplicação de cílios.', duracao_minutos: 90, ativo: true, valor_atual: 90, historico_precos: [{ id: 'pre_make_sem_cilios', valor: 90, inicio_validade: '2026-06-12', fim_validade: '' }] },
        { id: 'srv_maquiagem_com_cilios', categoria: 'Maquiagem', nome: 'Com aplicação de cílios', descricao: 'Maquiagem para eventos e ocasiões especiais, com aplicação de cílios.', duracao_minutos: 105, ativo: true, valor_atual: 100, historico_precos: [{ id: 'pre_make_com_cilios', valor: 100, inicio_validade: '2026-06-12', fim_validade: '' }] },
      ];
      state.appointments = [
        {
          id: 'age_hoje',
          cliente_id: 'cli_ana',
          servico_id: 'srv_depilacao_sobrancelha',
          cliente_nome: 'Ana Oliveira',
          cliente_telefone: '51999990001',
          servico_nome: 'Sobrancelha',
          data_inicio: plusHours(6),
          data_fim: plusHours(6.5),
          valor_aplicado: 35,
          status: 'agendado',
          google_event_id: 'preview-event-1',
          observacoes: 'Teste de lembrete em 8 horas.',
        },
        {
          id: 'age_passado',
          cliente_id: 'cli_maria',
          servico_id: 'srv_micropigmentacao_sobrancelhas',
          cliente_nome: 'Maria Santos',
          cliente_telefone: '51999990002',
          servico_nome: 'Micropigmentação de sobrancelhas',
          data_inicio: minusHours(3),
          data_fim: minusHours(1),
          valor_aplicado: 550,
          status: 'agendado',
          google_event_id: 'preview-event-2',
          observacoes: 'Teste de pós-atendimento.',
        },
      ];
      const templates = {
        confirmacao_agendamento: 'Olá, {nome}! Seu horário na Thais Schneider Estética está confirmado para {data} às {hora}, para {servico}. Qualquer ajuste, me avise por aqui.',
        lembrete_agendamento: 'Olá, {nome}! Passando para lembrar do seu horário na Thais Schneider Estética: {data} às {hora}, para {servico}. Te espero!',
        pos_atendimento: 'Olá, {nome}! Como você está se sentindo após o atendimento de {servico}? Se tiver qualquer dúvida ou reação fora do esperado, me chama por aqui para eu te orientar.',
        pedido_avaliacao: 'Olá, {nome}! Foi um prazer te atender. Se você gostou da experiência, sua avaliação ajuda muito meu trabalho: {link_avaliacao_google}',
        aniversario: 'Olá, {nome}! Passando para te desejar um feliz aniversário, com muita saúde, beleza e momentos especiais. Que seu novo ciclo seja lindo!',
        lembrete_retorno: 'Olá, {nome}! Já faz alguns dias desde o seu último atendimento. Se quiser manter o resultado ou agendar um retorno, me chama por aqui.',
        promocao_campanha: 'Olá, {nome}! Tenho uma condição especial disponível para {campanha}. Se fizer sentido para você, me chama por aqui que te explico os detalhes.',
      };
      state.messageTemplates = state.messageTemplates.map((template) => ({
        ...template,
        texto: templates[template.tipo] || template.texto,
      }));
      const labels = Object.fromEntries(messageTypes.map((item) => [item.key, item.label]));
      const byId = (rows, id) => rows.find((row) => row.id === id);
      const formatDate = (value) => new Date(value).toLocaleDateString('pt-BR');
      const formatTime = (value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const whats = (phone, text) => 'https://wa.me/55' + String(phone || '').replace(/\\D/g, '').replace(/^55/, '') + '?text=' + encodeURIComponent(text);
      const renderText = (type, payload = {}) => {
        const client = byId(state.clients, payload.cliente_id) || state.clients[0];
        const appointment = byId(state.appointments, payload.agendamento_id) || state.appointments.find((item) => item.cliente_id === client.id);
        const service = appointment ? byId(state.services, appointment.servico_id) : state.services[0];
        return templates[type]
          .replaceAll('{nome}', client.nome || '')
          .replaceAll('{data}', appointment ? formatDate(appointment.data_inicio) : '')
          .replaceAll('{hora}', appointment ? formatTime(appointment.data_inicio) : '')
          .replaceAll('{servico}', service ? service.nome : 'atendimento')
          .replaceAll('{link_avaliacao_google}', state.config.link_avaliacao_google || '[link de avaliação]')
          .replaceAll('{campanha}', payload.campanha || 'esta campanha');
      };
      const enrichAppointment = (appointment) => {
        const client = byId(state.clients, appointment.cliente_id) || {};
        const service = byId(state.services, appointment.servico_id) || {};
        return {
          ...appointment,
          cliente_nome: client.nome || '',
          cliente_telefone: client.telefone || '',
          servico_nome: service.nome || '',
        };
      };
      const rebuild = () => {
        state.appointments = state.appointments.map(enrichAppointment);
        state.clients = state.clients.map((client) => {
          const last = state.messages.filter((message) => message.cliente_id === client.id).at(-1) || client.ultima_mensagem || null;
          return { ...client, ultima_mensagem: last };
        });
        const sent = new Set(state.messages.map((message) => message.ciclo));
        const alerts = [];
        const pushAlert = (type, appointment, dueAt) => {
          const cycle = type + ':agendamento:' + appointment.id;
          if (sent.has(cycle)) return;
          const client = byId(state.clients, appointment.cliente_id);
          const service = byId(state.services, appointment.servico_id);
          const text = renderText(type, { cliente_id: client.id, agendamento_id: appointment.id });
          alerts.push({
            id: cycle,
            tipo: type,
            tipo_label: labels[type],
            cliente_id: client.id,
            cliente_nome: client.nome,
            telefone: client.telefone,
            agendamento_id: appointment.id,
            servico_nome: service.nome,
            data_vencimento: dueAt,
            data_referencia: appointment.data_inicio,
            ciclo: cycle,
            texto: text,
            whatsapp_url: whats(client.telefone, text),
            ultima_mensagem: client.ultima_mensagem,
            status: 'atrasado',
          });
        };
        state.appointments.forEach((appointment) => {
          pushAlert('confirmacao_agendamento', appointment, appointment.data_inicio);
          if (new Date(appointment.data_inicio) - now <= 8 * 60 * 60000) pushAlert('lembrete_agendamento', appointment, appointment.data_inicio);
          if (now - new Date(appointment.data_inicio) >= 2 * 60 * 60000) {
            ['pos_atendimento', 'pedido_avaliacao'].forEach((type) => pushAlert(type, appointment, appointment.data_inicio));
          }
        });
        const birthdayClient = state.clients[0];
        const birthdayText = renderText('aniversario', { cliente_id: birthdayClient.id });
        const birthdayCycle = 'aniversario:' + birthdayClient.id + ':' + now.getFullYear();
        if (!sent.has(birthdayCycle)) {
          alerts.push({
            id: birthdayCycle,
            tipo: 'aniversario',
            tipo_label: labels.aniversario,
            cliente_id: birthdayClient.id,
            cliente_nome: birthdayClient.nome,
            telefone: birthdayClient.telefone,
            agendamento_id: '',
            servico_nome: '',
            data_vencimento: iso(now),
            data_referencia: birthdayClient.data_nascimento,
            ciclo: birthdayCycle,
            texto: birthdayText,
            whatsapp_url: whats(birthdayClient.telefone, birthdayText),
            ultima_mensagem: birthdayClient.ultima_mensagem,
            status: 'atrasado',
          });
        }
        state.alerts = alerts;
        const today = now.toISOString().slice(0, 10);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        state.dashboard = {
          total_clientes: state.clients.filter((client) => client.ativo).length,
          total_servicos: state.services.filter((service) => service.ativo).length,
          mensagens_pendentes: state.alerts.length,
          hoje: state.appointments.filter((appointment) => appointment.data_inicio.slice(0, 10) === today),
          amanha: state.appointments.filter((appointment) => appointment.data_inicio.slice(0, 10) === tomorrow.toISOString().slice(0, 10)),
          agenda_visual: state.appointments.filter((appointment) => appointment.data_inicio.slice(0, 10) === today && appointment.status !== 'cancelado'),
          aniversariantes: state.clients.filter((client) => client.data_nascimento === birthdayTomorrow()),
        };
        const attended = state.appointments.filter((appointment) => appointment.status !== 'cancelado' && new Date(appointment.data_inicio) <= now);
        const future = state.appointments.filter((appointment) => appointment.status !== 'cancelado' && new Date(appointment.data_inicio) > now);
        const total = attended.reduce((sum, appointment) => sum + Number(appointment.valor_aplicado || 0), 0);
        const bucket = (rows, keyFn) => {
          const map = {};
          rows.forEach((appointment) => {
            const key = keyFn(appointment);
            if (!map[key]) map[key] = { label: key, total: 0, quantidade: 0 };
            map[key].total += Number(appointment.valor_aplicado || 0);
            map[key].quantidade += 1;
          });
          return Object.values(map);
        };
        state.finance = {
          total_atendido: total,
          total_previsto: future.reduce((sum, appointment) => sum + Number(appointment.valor_aplicado || 0), 0),
          quantidade_atendimentos: attended.length,
          ticket_medio: attended.length ? total / attended.length : 0,
          por_mes: bucket(attended, (appointment) => appointment.data_inicio.slice(0, 7)),
          por_dia: bucket(attended, (appointment) => appointment.data_inicio.slice(0, 10)),
          por_servico: bucket(attended, (appointment) => appointment.servico_nome || appointment.servico_id),
        };
      };
      const save = (collection, payload, prefix) => {
        const rows = state[collection];
        const id = payload.id || prefix + '_' + Date.now();
        const index = rows.findIndex((row) => row.id === id);
        const row = { ...(index >= 0 ? rows[index] : {}), ...payload, id };
        if (collection === 'services') {
          row.preco_sob_consulta = payload.preco_sob_consulta === true || payload.preco_sob_consulta === 'true' || payload.preco_sob_consulta === 'on';
          row.historico_precos = row.historico_precos || [];
          if (!row.preco_sob_consulta && payload.valor) {
            const nextValue = Number(String(payload.valor).replace(',', '.'));
            if (Number.isFinite(nextValue) && nextValue !== Number(row.valor_atual || 0)) {
              const todayValue = payload.inicio_validade || new Date().toISOString().slice(0, 10);
              row.historico_precos = row.historico_precos.map((price) => price.fim_validade ? price : { ...price, fim_validade: todayValue });
              row.historico_precos.unshift({ id: 'pre_' + Date.now(), valor: nextValue, inicio_validade: todayValue, fim_validade: '' });
              row.valor_atual = nextValue;
            }
          }
        }
        if (collection === 'appointments') {
          row.google_event_id = row.google_event_id || 'preview-event-' + Date.now();
          row.valor_aplicado = Number(String(payload.valor_aplicado || row.valor_aplicado || 0).replace(',', '.'));
        }
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        if (collection === 'messageTemplates') {
          state.messageTypes = state.messageTemplates.filter((item) => item.ativo).map((item) => ({ key: item.tipo, label: item.nome }));
        }
        rebuild();
        return state;
      };
      rebuild();
      return {
        getInitialData: () => state,
        saveClient: (payload) => save('clients', payload, 'cli'),
        saveService: (payload) => save('services', payload, 'srv'),
        saveAppointment: (payload) => save('appointments', payload, 'age'),
        saveMessageTemplate: (payload) => save('messageTemplates', payload, 'tpl'),
        archiveClient: (id) => {
          const client = byId(state.clients, id);
          if (client) client.ativo = false;
          rebuild();
          return state;
        },
        archiveService: (id) => {
          const service = byId(state.services, id);
          if (service) service.ativo = false;
          rebuild();
          return state;
        },
        archiveAppointment: (id) => {
          const appointment = byId(state.appointments, id);
          if (appointment) appointment.status = 'cancelado';
          rebuild();
          return state;
        },
        archiveMessageTemplate: (id) => {
          const template = byId(state.messageTemplates, id);
          if (template) template.ativo = false;
          state.messageTypes = state.messageTemplates.filter((item) => item.ativo).map((item) => ({ key: item.tipo, label: item.nome }));
          rebuild();
          return state;
        },
        saveCampaign: (payload) => {
          const ids = Array.isArray(payload.cliente_ids) ? payload.cliente_ids : [];
          const campaignId = 'cmp_' + Date.now();
          state.campaigns.unshift({
            id: campaignId,
            titulo: payload.titulo || 'Campanha',
            mensagem: payload.mensagem,
            status: 'ativa',
            destinatarios: ids.map((clientId, index) => {
              const client = byId(state.clients, clientId) || {};
              const text = String(payload.mensagem || '').replaceAll('{nome}', client.nome || '').replaceAll('{campanha}', payload.titulo || 'esta campanha');
              return {
                id: 'dst_' + Date.now() + '_' + index,
                campanha_id: campaignId,
                cliente_id: clientId,
                cliente_nome: client.nome || '',
                cliente_telefone: client.telefone || '',
                status: 'pendente',
                texto: text,
                whatsapp_url: whats(client.telefone, text),
              };
            }),
          });
          rebuild();
          return state;
        },
        archiveCampaign: (id) => {
          const campaign = byId(state.campaigns, id);
          if (campaign) campaign.status = 'arquivada';
          return state;
        },
        recordCampaignMessageSent: (payload) => {
          const campaign = byId(state.campaigns, payload.campanha_id);
          const recipient = campaign && (campaign.destinatarios || []).find((item) => item.id === payload.destinatario_id);
          if (recipient) recipient.status = 'enviado';
          state.messages.unshift({ id: 'msg_' + Date.now(), ...payload, tipo: 'promocao_campanha', data_envio: iso(new Date()) });
          rebuild();
          return state;
        },
        saveConfig: (payload) => {
          state.config = { ...state.config, ...payload };
          rebuild();
          return state;
        },
        prepareManualMessage: (payload) => {
          const client = byId(state.clients, payload.cliente_id);
          const text = renderText(payload.tipo, payload);
          return {
            ...payload,
            label: labels[payload.tipo],
            ciclo: payload.ciclo || 'manual:' + Date.now(),
            texto: text,
            whatsapp_url: whats(client.telefone, text),
          };
        },
        recordMessageSent: (payload) => {
          state.messages.unshift({
            id: 'msg_' + Date.now(),
            ...payload,
            cliente_nome: byId(state.clients, payload.cliente_id)?.nome || '',
            data_envio: iso(new Date()),
            criado_em: iso(new Date()),
          });
          rebuild();
          return state;
        },
        dismissAlert: (payload) => {
          state.alerts = state.alerts.filter((alert) => alert.ciclo !== payload.ciclo);
          return state;
        },
      };
    })();
    window.google = {
      script: {
        run: {
          withSuccessHandler(success) {
            return {
              withFailureHandler(failure) {
                return new Proxy({}, {
                  get(_target, method) {
                    return (...args) => {
                      setTimeout(() => {
                        try {
                          success(previewDb[method](...args));
                        } catch (error) {
                          failure(error);
                        }
                      }, 160);
                    };
                  },
                });
              },
            };
          },
        },
      },
    };
  </script>`;
}

const server = http.createServer((request, response) => {
  if (request.url === '/' || request.url === '/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page());
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview running at http://127.0.0.1:${port}`);
});
