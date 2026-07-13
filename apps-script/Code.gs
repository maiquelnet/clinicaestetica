const APP = {
  timezone: 'America/Sao_Paulo',
  clinicName: 'Thais Schneider Estética',
  adminEmails: ['tcschneiderster@gmail.com'],
  sheets: {
    clients: 'clientes',
    services: 'servicos',
    prices: 'precos_servicos',
    appointments: 'agendamentos',
    messages: 'mensagens_enviadas',
    dismissed: 'mensagens_dispensadas',
    messageTemplates: 'modelos_mensagens',
    campaigns: 'campanhas',
    campaignRecipients: 'campanha_destinatarios',
    config: 'configuracoes',
  },
};

const HEADERS = {
  clientes: ['id', 'nome', 'telefone', 'email', 'data_nascimento', 'observacoes', 'ativo', 'criado_em', 'atualizado_em'],
  servicos: ['id', 'nome', 'descricao', 'duracao_minutos', 'ativo', 'criado_em', 'atualizado_em', 'categoria', 'preco_sob_consulta', 'observacao_preco'],
  precos_servicos: ['id', 'servico_id', 'valor', 'inicio_validade', 'fim_validade', 'criado_em'],
  agendamentos: ['id', 'cliente_id', 'servico_id', 'data_inicio', 'data_fim', 'valor_aplicado', 'status', 'google_event_id', 'observacoes', 'criado_em', 'atualizado_em'],
  mensagens_enviadas: ['id', 'cliente_id', 'agendamento_id', 'tipo', 'ciclo', 'texto', 'data_envio', 'observacao', 'criado_em'],
  mensagens_dispensadas: ['id', 'cliente_id', 'agendamento_id', 'tipo', 'ciclo', 'motivo', 'data_dispensa', 'criado_em'],
  modelos_mensagens: ['id', 'tipo', 'nome', 'texto', 'ativo', 'regra_tipo', 'regra_quantidade', 'regra_unidade', 'regra_direcao', 'prioridade', 'criado_em', 'atualizado_em'],
  campanhas: ['id', 'titulo', 'mensagem', 'status', 'criado_em', 'atualizado_em'],
  campanha_destinatarios: ['id', 'campanha_id', 'cliente_id', 'status', 'data_envio', 'criado_em', 'atualizado_em'],
  configuracoes: ['chave', 'valor'],
};

const MESSAGE_TYPES = {
  confirmacao_agendamento: {
    label: 'Confirmação de agendamento',
    template: 'Olá, {nome}! Seu horário na Thais Schneider Estética está confirmado para {data} às {hora}, para {servico}. Qualquer ajuste, me avise por aqui.',
  },
  lembrete_agendamento: {
    label: 'Lembrete de agendamento',
    template: 'Olá, {nome}! Passando para lembrar do seu horário na Thais Schneider Estética: {data} às {hora}, para {servico}. Te espero!',
  },
  pos_atendimento: {
    label: 'Pós-atendimento crítico',
    template: 'Olá, {nome}! Como você está se sentindo após o atendimento de {servico}? Se tiver qualquer dúvida ou reação fora do esperado, me chama por aqui para eu te orientar.',
  },
  pedido_avaliacao: {
    label: 'Pedido de avaliação',
    template: 'Olá, {nome}! Foi um prazer te atender. Se você gostou da experiência, sua avaliação ajuda muito meu trabalho: {link_avaliacao_google}',
  },
  aniversario: {
    label: 'Aniversário',
    template: 'Olá, {nome}! Passando para te desejar um feliz aniversário, com muita saúde, beleza e momentos especiais. Que seu novo ciclo seja lindo!',
  },
  lembrete_retorno: {
    label: 'Lembrete de retorno',
    template: 'Olá, {nome}! Já faz alguns dias desde o seu último atendimento. Se quiser manter o resultado ou agendar um retorno, me chama por aqui.',
  },
  promocao_campanha: {
    label: 'Promoção / campanha',
    template: 'Olá, {nome}! Tenho uma condição especial disponível para {campanha}. Se fizer sentido para você, me chama por aqui que te explico os detalhes.',
  },
};

const MESSAGE_TEMPLATE_SEEDS = [
  { tipo: 'confirmacao_agendamento', nome: 'Confirmação de agendamento', texto: MESSAGE_TYPES.confirmacao_agendamento.template, regra_tipo: 'agendamento_criado', regra_quantidade: 0, regra_unidade: 'horas', regra_direcao: 'depois', prioridade: 1 },
  { tipo: 'lembrete_agendamento', nome: 'Lembrete de agendamento', texto: MESSAGE_TYPES.lembrete_agendamento.template, regra_tipo: 'inicio_agendamento', regra_quantidade: 8, regra_unidade: 'horas', regra_direcao: 'antes', prioridade: 2 },
  { tipo: 'pos_atendimento', nome: 'Pós-atendimento crítico', texto: MESSAGE_TYPES.pos_atendimento.template, regra_tipo: 'inicio_agendamento', regra_quantidade: 2, regra_unidade: 'horas', regra_direcao: 'depois', prioridade: 3 },
  { tipo: 'pedido_avaliacao', nome: 'Pedido de avaliação', texto: MESSAGE_TYPES.pedido_avaliacao.template, regra_tipo: 'inicio_agendamento', regra_quantidade: 2, regra_unidade: 'horas', regra_direcao: 'depois', prioridade: 4 },
  { tipo: 'aniversario', nome: 'Aniversário', texto: MESSAGE_TYPES.aniversario.template, regra_tipo: 'aniversario', regra_quantidade: 1, regra_unidade: 'dias', regra_direcao: 'antes', prioridade: 5 },
  { tipo: 'lembrete_retorno', nome: 'Lembrete de retorno', texto: MESSAGE_TYPES.lembrete_retorno.template, regra_tipo: 'ultimo_agendamento', regra_quantidade: 20, regra_unidade: 'dias', regra_direcao: 'depois', prioridade: 6 },
  { tipo: 'promocao_campanha', nome: 'Promoção / campanha', texto: MESSAGE_TYPES.promocao_campanha.template, regra_tipo: 'manual', regra_quantidade: '', regra_unidade: '', regra_direcao: '', prioridade: 9 },
];

const DATE_ONLY_FIELDS = ['data_nascimento', 'inicio_validade', 'fim_validade'];

const INITIAL_SERVICES = [
  { id: 'srv_depilacao_sobrancelha', categoria: 'Depilação', nome: 'Sobrancelha', descricao: 'Depilação e acabamento para limpeza do desenho natural das sobrancelhas.', duracao_minutos: 30, valor: 35 },
  { id: 'srv_depilacao_buco_nariz', categoria: 'Depilação', nome: 'Buço/Nariz', descricao: 'Remoção rápida de pelos no buço ou nariz.', duracao_minutos: 15, valor: 10 },
  { id: 'srv_depilacao_rosto_completo', categoria: 'Depilação', nome: 'Rosto completo', descricao: 'Depilação facial completa para acabamento uniforme.', duracao_minutos: 45, valor: 50 },
  { id: 'srv_depilacao_axila', categoria: 'Depilação', nome: 'Axila', descricao: 'Depilação de axilas com atendimento rápido e cuidadoso.', duracao_minutos: 20, valor: 15 },
  { id: 'srv_depilacao_virilha', categoria: 'Depilação', nome: 'Virilha', descricao: 'Depilação de virilha com técnica cuidadosa.', duracao_minutos: 30, valor: 50 },
  { id: 'srv_depilacao_meia_perna', categoria: 'Depilação', nome: '1/2 perna', descricao: 'Depilação de meia perna.', duracao_minutos: 30, valor: 37 },
  { id: 'srv_depilacao_perna_inteira', categoria: 'Depilação', nome: 'Perna inteira', descricao: 'Depilação completa das pernas.', duracao_minutos: 45, valor: 50 },
  { id: 'srv_depilacao_completa', categoria: 'Depilação', nome: 'Completa', descricao: 'Pacote de depilação completa conforme combinação no atendimento.', duracao_minutos: 90, valor: 140 },
  { id: 'srv_procedimentos_pacote_5_sessoes', categoria: 'Procedimentos', nome: 'Pacote de 5 sessões', descricao: 'Pacote promocional para sequência de procedimentos estéticos.', duracao_minutos: 60, valor: 400, observacao_preco: 'Pacote de 5 sessões.' },
  { id: 'srv_procedimentos_peeling_diamante', categoria: 'Procedimentos', nome: 'Peeling diamante', descricao: 'Procedimento para renovação superficial, textura e luminosidade da pele.', duracao_minutos: 60, valor: 100 },
  { id: 'srv_procedimentos_plasma_lifting', categoria: 'Procedimentos', nome: 'Plasma lifting', descricao: 'Procedimento estético voltado para firmeza e revitalização da pele.', duracao_minutos: 60, valor: 100 },
  { id: 'srv_procedimentos_jato_plasma', categoria: 'Procedimentos', nome: 'Jato de plasma', descricao: 'Procedimento definido após avaliação individual.', duracao_minutos: 60, preco_sob_consulta: true, observacao_preco: 'Valor mediante avaliação.' },
  { id: 'srv_procedimentos_corrente_russa_radiofrequencia', categoria: 'Procedimentos', nome: 'Corrente russa/radiofrequência', descricao: 'Procedimento corporal para estímulo, firmeza e cuidado estético.', duracao_minutos: 60, valor: 100 },
  { id: 'srv_procedimentos_endermoterapia', categoria: 'Procedimentos', nome: 'Endermoterapia', descricao: 'Procedimento corporal com manobras mecânicas para cuidado estético.', duracao_minutos: 60, valor: 100 },
  { id: 'srv_procedimentos_vacuoterapia', categoria: 'Procedimentos', nome: 'Vacuoterapia', descricao: 'Procedimento corporal com sucção controlada para cuidado estético.', duracao_minutos: 60, valor: 100 },
  { id: 'srv_procedimentos_pump_up', categoria: 'Procedimentos', nome: 'Pump up', descricao: 'Procedimento corporal para estímulo e valorização do contorno.', duracao_minutos: 60, valor: 80 },
  { id: 'srv_micropigmentacao_sobrancelhas', categoria: 'Micropigmentação', nome: 'Micropigmentação de sobrancelhas', descricao: 'Técnica para valorizar o desenho das sobrancelhas com acabamento delicado.', duracao_minutos: 120, valor: 550, observacao_preco: 'ou 2x R$ 300,00 / 3x R$ 210,00' },
  { id: 'srv_maquiagem_sem_cilios', categoria: 'Maquiagem', nome: 'Sem aplicação de cílios', descricao: 'Maquiagem para eventos e ocasiões especiais, sem aplicação de cílios.', duracao_minutos: 90, valor: 90 },
  { id: 'srv_maquiagem_com_cilios', categoria: 'Maquiagem', nome: 'Com aplicação de cílios', descricao: 'Maquiagem para eventos e ocasiões especiais, com aplicação de cílios.', duracao_minutos: 105, valor: 100 },
];

function doGet() {
  try {
    ensureDatabase_();
    assertAdmin_();

    return HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Painel Administrativo | Thais Schneider Estética')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService
      .createHtmlOutput('<h1>Acesso restrito</h1><p>' + escapeHtml_(error.message) + '</p>')
      .setTitle('Acesso restrito');
  }
}

function include(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

function setup() {
  ensureDatabase_();
  const seedResult = seedInitialServices_();
  const templateResult = seedMessageTemplates_();
  return 'Banco preparado. Serviços criados: ' + seedResult.created + '. Serviços atualizados: ' + seedResult.updated + '. Preços iniciais criados: ' + seedResult.pricesCreated + '. Modelos de mensagens criados: ' + templateResult.created + '.';
}

function seedInitialServices() {
  ensureDatabase_();
  return seedInitialServices_();
}

function seedMessageTemplates() {
  ensureDatabase_();
  return seedMessageTemplates_();
}

function getInitialData() {
  assertAdmin_();
  ensureDatabase_();
  return buildState_();
}

function saveClient(payload) {
  assertAdmin_();
  ensureDatabase_();

  const now = new Date();
  const rows = readRows_(APP.sheets.clients);
  const existing = payload.id ? rows.find((row) => row.id === payload.id) : null;
  const client = {
    id: existing ? existing.id : createId_('cli'),
    nome: trim_(payload.nome),
    telefone: trim_(payload.telefone),
    email: trim_(payload.email),
    data_nascimento: payload.data_nascimento ? parseDateOnly_(payload.data_nascimento) : '',
    observacoes: trim_(payload.observacoes),
    ativo: payload.ativo !== false && payload.ativo !== 'false',
    criado_em: existing ? existing.criado_em : now,
    atualizado_em: now,
  };

  requireField_(client.nome, 'Informe o nome do cliente.');
  requireField_(client.telefone, 'Informe o telefone do cliente.');

  existing ? updateRowById_(APP.sheets.clients, client.id, client) : appendObject_(APP.sheets.clients, client);
  return buildState_();
}

function saveService(payload) {
  assertAdmin_();
  ensureDatabase_();

  const now = new Date();
  const rows = readRows_(APP.sheets.services);
  const existing = payload.id ? rows.find((row) => row.id === payload.id) : null;
  const service = {
    id: existing ? existing.id : createId_('srv'),
    nome: trim_(payload.nome),
    descricao: trim_(payload.descricao),
    categoria: trim_(payload.categoria),
    duracao_minutos: Number(payload.duracao_minutos || 60),
    preco_sob_consulta: isChecked_(payload.preco_sob_consulta),
    observacao_preco: trim_(payload.observacao_preco),
    ativo: payload.ativo !== false && payload.ativo !== 'false',
    criado_em: existing ? existing.criado_em : now,
    atualizado_em: now,
  };

  requireField_(service.nome, 'Informe o nome do serviço.');
  if (!Number.isFinite(service.duracao_minutos) || service.duracao_minutos <= 0) {
    throw new Error('A duração precisa ser maior que zero.');
  }

  existing ? updateRowById_(APP.sheets.services, service.id, service) : appendObject_(APP.sheets.services, service);

  if (!service.preco_sob_consulta && payload.valor !== undefined && payload.valor !== '') {
    updateServicePrice_(service.id, parseCurrency_(payload.valor), payload.inicio_validade || now);
  }

  return buildState_();
}

function saveAppointment(payload) {
  assertAdmin_();
  ensureDatabase_();

  const clients = readRows_(APP.sheets.clients);
  const services = readRows_(APP.sheets.services);
  const appointments = readRows_(APP.sheets.appointments);
  const existing = payload.id ? appointments.find((row) => row.id === payload.id) : null;
  const client = clients.find((row) => row.id === payload.cliente_id);
  const service = services.find((row) => row.id === payload.servico_id);

  if (!client) throw new Error('Cliente não encontrado.');
  if (!service) throw new Error('Serviço não encontrado.');

  const now = new Date();
  const start = parseLocalDateTime_(payload.data_inicio);
  const end = payload.data_fim
    ? parseLocalDateTime_(payload.data_fim)
    : new Date(start.getTime() + Number(service.duracao_minutos || 60) * 60000);

  if (end <= start) throw new Error('O horário final precisa ser depois do início.');

  const appliedPrice = payload.valor_aplicado !== undefined && payload.valor_aplicado !== ''
    ? parseCurrency_(payload.valor_aplicado)
    : getPriceForServiceAt_(service.id, start);

  const appointment = {
    id: existing ? existing.id : createId_('age'),
    cliente_id: client.id,
    servico_id: service.id,
    data_inicio: start,
    data_fim: end,
    valor_aplicado: appliedPrice,
    status: trim_(payload.status) || 'agendado',
    google_event_id: existing ? existing.google_event_id : '',
    observacoes: trim_(payload.observacoes),
    criado_em: existing ? existing.criado_em : now,
    atualizado_em: now,
  };

  appointment.google_event_id = syncCalendarEvent_(appointment, client, service);
  existing ? updateRowById_(APP.sheets.appointments, appointment.id, appointment) : appendObject_(APP.sheets.appointments, appointment);
  return buildState_();
}

function saveConfig(payload) {
  assertAdmin_();
  ensureDatabase_();

  const allowedKeys = ['nome_clinica', 'link_avaliacao_google', 'calendario_padrao_id', 'admin_emails'];
  allowedKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      setConfigValue_(key, trim_(payload[key]));
    }
  });

  return buildState_();
}

function saveMessageTemplate(payload) {
  assertAdmin_();
  ensureDatabase_();

  const now = new Date();
  const rows = readRows_(APP.sheets.messageTemplates);
  const existing = payload.id ? rows.find((row) => row.id === payload.id) : null;
  const type = trim_(payload.tipo);
  const template = {
    id: existing ? existing.id : createId_('tpl'),
    tipo: type,
    nome: trim_(payload.nome),
    texto: trim_(payload.texto),
    ativo: payload.ativo !== false && payload.ativo !== 'false',
    regra_tipo: trim_(payload.regra_tipo) || 'manual',
    regra_quantidade: payload.regra_quantidade === '' || payload.regra_quantidade === undefined ? '' : Number(payload.regra_quantidade),
    regra_unidade: trim_(payload.regra_unidade),
    regra_direcao: trim_(payload.regra_direcao),
    prioridade: Number(payload.prioridade || 9),
    criado_em: existing ? existing.criado_em : now,
    atualizado_em: now,
  };

  requireField_(template.tipo, 'Informe o tipo da mensagem.');
  requireField_(template.nome, 'Informe o nome da mensagem.');
  requireField_(template.texto, 'Informe o texto da mensagem.');

  if (!existing && rows.some((row) => row.tipo === template.tipo)) {
    throw new Error('Já existe um modelo com este tipo.');
  }

  existing ? updateRowById_(APP.sheets.messageTemplates, template.id, template) : appendObject_(APP.sheets.messageTemplates, template);
  return buildState_();
}

function archiveMessageTemplate(id) {
  assertAdmin_();
  ensureDatabase_();
  archiveRow_(APP.sheets.messageTemplates, id, { ativo: false });
  return buildState_();
}

function archiveClient(id) {
  assertAdmin_();
  ensureDatabase_();
  archiveRow_(APP.sheets.clients, id, { ativo: false });
  return buildState_();
}

function archiveService(id) {
  assertAdmin_();
  ensureDatabase_();
  archiveRow_(APP.sheets.services, id, { ativo: false });
  return buildState_();
}

function archiveAppointment(id) {
  assertAdmin_();
  ensureDatabase_();

  const rows = readRows_(APP.sheets.appointments);
  const appointment = rows.find((row) => row.id === id);
  if (!appointment) throw new Error('Agendamento não encontrado.');

  if (appointment.google_event_id) deleteCalendarEvent_(appointment.google_event_id);

  updateRowById_(APP.sheets.appointments, id, Object.assign({}, appointment, {
    status: 'cancelado',
    google_event_id: '',
    atualizado_em: new Date(),
  }));
  return buildState_();
}

function saveCampaign(payload) {
  assertAdmin_();
  ensureDatabase_();

  const now = new Date();
  const campaign = {
    id: createId_('cmp'),
    titulo: trim_(payload.titulo) || 'Campanha',
    mensagem: trim_(payload.mensagem),
    status: 'ativa',
    criado_em: now,
    atualizado_em: now,
  };
  requireField_(campaign.mensagem, 'Informe a mensagem da campanha.');
  appendObject_(APP.sheets.campaigns, campaign);

  const clientIds = Array.isArray(payload.cliente_ids) ? payload.cliente_ids : String(payload.cliente_ids || '').split(',');
  clientIds.map(trim_).filter(Boolean).forEach((clientId) => {
    appendObject_(APP.sheets.campaignRecipients, {
      id: createId_('dst'),
      campanha_id: campaign.id,
      cliente_id: clientId,
      status: 'pendente',
      data_envio: '',
      criado_em: now,
      atualizado_em: now,
    });
  });

  return buildState_();
}

function archiveCampaign(id) {
  assertAdmin_();
  ensureDatabase_();
  archiveRow_(APP.sheets.campaigns, id, { status: 'arquivada' });
  return buildState_();
}

function recordCampaignMessageSent(payload) {
  assertAdmin_();
  ensureDatabase_();

  const clients = readRows_(APP.sheets.clients);
  const client = clients.find((row) => row.id === payload.cliente_id);
  if (!client) throw new Error('Cliente não encontrado.');

  const text = renderTemplateText_(payload.texto, {
    client,
    service: {},
    appointment: null,
    config: getConfig_(),
  }, payload);
  const now = new Date();

  appendObject_(APP.sheets.messages, {
    id: createId_('msg'),
    cliente_id: client.id,
    agendamento_id: '',
    tipo: 'promocao_campanha',
    ciclo: 'campanha:' + (payload.campanha_id || 'manual') + ':' + client.id,
    texto: text,
    data_envio: now,
    observacao: 'Campanha manual',
    criado_em: now,
  });

  if (payload.destinatario_id) {
    const recipients = readRows_(APP.sheets.campaignRecipients);
    const recipient = recipients.find((row) => row.id === payload.destinatario_id);
    if (recipient) {
      updateRowById_(APP.sheets.campaignRecipients, recipient.id, Object.assign({}, recipient, {
        status: 'enviado',
        data_envio: now,
        atualizado_em: now,
      }));
    }
  }

  return buildState_();
}

function prepareManualMessage(payload) {
  assertAdmin_();
  ensureDatabase_();

  const context = buildMessageContext_(payload);
  const text = renderMessageText_(payload.tipo, context, payload);
  const cycle = payload.ciclo || buildCycleKey_(payload.tipo, context.client, context.appointment, context.now);

  return {
    tipo: payload.tipo,
    label: getMessageTemplateByType_(payload.tipo).nome,
    cliente_id: context.client.id,
    agendamento_id: context.appointment ? context.appointment.id : '',
    ciclo: cycle,
    texto: text,
    whatsapp_url: buildWhatsAppUrl_(context.client.telefone, text),
  };
}

function recordMessageSent(payload) {
  assertAdmin_();
  ensureDatabase_();

  const context = buildMessageContext_(payload);
  const text = payload.texto || renderMessageText_(payload.tipo, context, payload);
  const cycle = payload.ciclo || buildCycleKey_(payload.tipo, context.client, context.appointment, context.now);
  const now = new Date();

  appendObject_(APP.sheets.messages, {
    id: createId_('msg'),
    cliente_id: context.client.id,
    agendamento_id: context.appointment ? context.appointment.id : '',
    tipo: payload.tipo,
    ciclo: cycle,
    texto: text,
    data_envio: now,
    observacao: trim_(payload.observacao),
    criado_em: now,
  });

  return buildState_();
}

function dismissAlert(payload) {
  assertAdmin_();
  ensureDatabase_();

  const now = new Date();
  appendObject_(APP.sheets.dismissed, {
    id: createId_('dsp'),
    cliente_id: payload.cliente_id,
    agendamento_id: payload.agendamento_id || '',
    tipo: payload.tipo,
    ciclo: payload.ciclo,
    motivo: trim_(payload.motivo) || 'Dispensado pelo painel',
    data_dispensa: now,
    criado_em: now,
  });

  return buildState_();
}

function buildState_() {
  const config = getConfig_();
  const clients = readRows_(APP.sheets.clients);
  const services = readRows_(APP.sheets.services);
  const prices = readRows_(APP.sheets.prices);
  const appointments = readRows_(APP.sheets.appointments);
  const messages = readRows_(APP.sheets.messages);
  const dismissed = readRows_(APP.sheets.dismissed);
  const messageTemplates = getMessageTemplates_();
  const campaigns = readRows_(APP.sheets.campaigns);
  const campaignRecipients = readRows_(APP.sheets.campaignRecipients);
  const serviceMap = indexById_(services);
  const clientMap = indexById_(clients);
  const priceHistoryByService = groupBy_(prices, 'servico_id');
  const lastMessageByClient = getLastMessageByClient_(messages);

  const enrichedServices = services.map((service) => {
    const history = (priceHistoryByService[service.id] || []).sort((a, b) => compareDatesDesc_(a.inicio_validade, b.inicio_validade));
    return Object.assign({}, service, {
      valor_atual: getCurrentPriceFromHistory_(history),
      historico_precos: history.map(serializeObject_),
    });
  });

  const enrichedClients = clients.map((client) => Object.assign({}, client, {
    ultima_mensagem: lastMessageByClient[client.id] ? serializeObject_(lastMessageByClient[client.id]) : null,
  }));

  const enrichedAppointments = appointments
    .map((appointment) => enrichAppointment_(appointment, clientMap, serviceMap))
    .sort((a, b) => compareDatesAsc_(a.data_inicio, b.data_inicio));

  const alerts = buildAlerts_(clients, services, appointments, messages, dismissed, config, messageTemplates);
  const dashboard = buildDashboard_(clients, enrichedAppointments, alerts, lastMessageByClient);
  const finance = buildFinance_(enrichedAppointments, services);

  return {
    config,
    currentUser: getCurrentUser_(),
    messageTypes: messageTemplates.filter((template) => isTruthy_(template.ativo)).map((template) => ({ key: template.tipo, label: template.nome })),
    messageTemplates: messageTemplates.map(serializeObject_),
    campaigns: enrichCampaigns_(campaigns, campaignRecipients, clients).map(serializeObject_),
    clients: enrichedClients.map(serializeObject_),
    services: enrichedServices.map(serializeObject_),
    appointments: enrichedAppointments.map(serializeObject_),
    messages: messages
      .map((message) => enrichMessage_(message, clientMap, serviceMap, appointments))
      .sort((a, b) => compareDatesDesc_(a.data_envio, b.data_envio))
      .map(serializeObject_),
    alerts,
    dashboard,
    finance,
  };
}

function buildDashboard_(clients, appointments, alerts, lastMessageByClient) {
  const today = formatDate_(new Date(), 'yyyy-MM-dd');
  const todayMonthDay = formatDate_(new Date(), 'MM-dd');
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate_(tomorrowDate, 'yyyy-MM-dd');

  return {
    total_clientes: clients.filter((client) => isTruthy_(client.ativo)).length,
    total_clientes_arquivados: clients.filter((client) => !isTruthy_(client.ativo)).length,
    total_servicos: readRows_(APP.sheets.services).filter((service) => isTruthy_(service.ativo)).length,
    total_servicos_arquivados: readRows_(APP.sheets.services).filter((service) => !isTruthy_(service.ativo)).length,
    mensagens_pendentes: alerts.length,
    hoje: appointments.filter((appointment) => formatDate_(asDate_(appointment.data_inicio), 'yyyy-MM-dd') === today).map(serializeObject_),
    amanha: appointments.filter((appointment) => formatDate_(asDate_(appointment.data_inicio), 'yyyy-MM-dd') === tomorrow).map(serializeObject_),
    agenda_visual: appointments
      .filter((appointment) => formatDate_(asDate_(appointment.data_inicio), 'yyyy-MM-dd') === today && !isCanceled_(appointment))
      .sort((a, b) => compareDatesAsc_(a.data_inicio, b.data_inicio))
      .map(serializeObject_),
    aniversariantes: clients
      .filter((client) => isTruthy_(client.ativo) && client.data_nascimento && formatDate_(asDate_(client.data_nascimento), 'MM-dd') === todayMonthDay)
      .map((client) => Object.assign({}, serializeObject_(client), {
        ultima_mensagem: lastMessageByClient[client.id] ? serializeObject_(lastMessageByClient[client.id]) : null,
      })),
  };
}

function buildAlerts_(clients, services, appointments, messages, dismissed, config, messageTemplates) {
  const now = new Date();
  const clientMap = indexById_(clients);
  const serviceMap = indexById_(services);
  const sentCycles = buildCycleSet_(messages);
  const dismissedCycles = buildCycleSet_(dismissed);
  const lastMessageByClient = getLastMessageByClient_(messages);
  const alerts = [];
  const activeTemplates = messageTemplates.filter((template) => isTruthy_(template.ativo));
  const appointmentTemplates = activeTemplates.filter((template) => {
    return ['agendamento_criado', 'inicio_agendamento'].indexOf(template.regra_tipo) !== -1;
  });

  const activeAppointments = appointments.filter((appointment) => !isCanceled_(appointment));
  activeAppointments.forEach((appointment) => {
    const client = clientMap[appointment.cliente_id];
    const service = serviceMap[appointment.servico_id];
    if (!client || !service || !isTruthy_(client.ativo)) return;

    appointmentTemplates.forEach((template) => {
      const dueAt = getTemplateDueDate_(template, appointment, client, now);
      if (dueAt && now >= dueAt) {
        addAppointmentAlert_(alerts, template, appointment, client, service, dueAt, now, sentCycles, dismissedCycles, lastMessageByClient, config);
      }
    });
  });

  clients.filter((client) => isTruthy_(client.ativo)).forEach((client) => {
    activeTemplates
      .filter((template) => template.regra_tipo === 'aniversario')
      .forEach((template) => addBirthdayAlert_(alerts, template, client, now, sentCycles, dismissedCycles, lastMessageByClient, config));
    activeTemplates
      .filter((template) => template.regra_tipo === 'ultimo_agendamento')
      .forEach((template) => addReturnAlert_(alerts, template, client, activeAppointments, serviceMap, now, sentCycles, dismissedCycles, lastMessageByClient, config));
  });

  return alerts.sort((a, b) => {
    const dueDiff = new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime();
    if (dueDiff !== 0) return dueDiff;
    return Number(a.prioridade || 9) - Number(b.prioridade || 9);
  });
}

function addAppointmentAlert_(alerts, template, appointment, client, service, dueAt, now, sentCycles, dismissedCycles, lastMessageByClient, config) {
  const type = template.tipo;
  const cycle = buildAppointmentCycle_(type, appointment.id);
  if (sentCycles[cycle] || dismissedCycles[cycle]) return;

  const context = {
    now,
    client,
    service,
    appointment,
    config,
  };
  const text = renderMessageText_(type, context, {});

  alerts.push({
    id: cycle,
    tipo: type,
    tipo_label: template.nome,
    prioridade: Number(template.prioridade || 9),
    cliente_id: client.id,
    cliente_nome: client.nome,
    telefone: client.telefone,
    agendamento_id: appointment.id,
    servico_nome: service.nome,
    data_vencimento: serializeCell_('data_vencimento', dueAt),
    data_referencia: serializeCell_('data_referencia', appointment.data_inicio),
    ciclo: cycle,
    texto: text,
    whatsapp_url: buildWhatsAppUrl_(client.telefone, text),
    ultima_mensagem: lastMessageByClient[client.id] ? serializeObject_(lastMessageByClient[client.id]) : null,
    status: now > dueAt ? 'atrasado' : 'pendente',
  });
}

function addBirthdayAlert_(alerts, template, client, now, sentCycles, dismissedCycles, lastMessageByClient, config) {
  if (!client.data_nascimento) return;

  const birth = asDate_(client.data_nascimento);
  if (!birth) return;

  const year = Number(formatDate_(now, 'yyyy'));
  const offsetDays = Number(template.regra_quantidade || 0);
  const dueAt = new Date(year, birth.getMonth(), birth.getDate(), 8, 0, 0);
  dueAt.setDate(dueAt.getDate() + (template.regra_direcao === 'depois' ? offsetDays : -offsetDays));
  if (now < dueAt) return;

  const cycle = template.tipo + ':' + client.id + ':' + year;
  if (sentCycles[cycle] || dismissedCycles[cycle]) return;

  const context = { now, client, service: {}, appointment: null, config };
  const text = renderMessageText_(template.tipo, context, {});

  alerts.push({
    id: cycle,
    tipo: template.tipo,
    tipo_label: template.nome,
    prioridade: Number(template.prioridade || 9),
    cliente_id: client.id,
    cliente_nome: client.nome,
    telefone: client.telefone,
    agendamento_id: '',
    servico_nome: '',
    data_vencimento: serializeCell_('data_vencimento', dueAt),
    data_referencia: serializeCell_('data_referencia', client.data_nascimento),
    ciclo: cycle,
    texto: text,
    whatsapp_url: buildWhatsAppUrl_(client.telefone, text),
    ultima_mensagem: lastMessageByClient[client.id] ? serializeObject_(lastMessageByClient[client.id]) : null,
    status: now > dueAt ? 'atrasado' : 'pendente',
  });
}

function addReturnAlert_(alerts, template, client, appointments, serviceMap, now, sentCycles, dismissedCycles, lastMessageByClient, config) {
  const clientAppointments = appointments
    .filter((appointment) => appointment.cliente_id === client.id && asDate_(appointment.data_inicio) < now)
    .sort((a, b) => compareDatesDesc_(a.data_inicio, b.data_inicio));

  if (!clientAppointments.length) return;

  const lastAppointment = clientAppointments[0];
  const dueAt = addRuleOffset_(asDate_(lastAppointment.data_inicio), template);
  if (now < dueAt) return;

  const cycle = template.tipo + ':' + client.id + ':' + lastAppointment.id;
  if (sentCycles[cycle] || dismissedCycles[cycle]) return;

  const service = serviceMap[lastAppointment.servico_id] || {};
  const context = { now, client, service, appointment: lastAppointment, config };
  const text = renderMessageText_(template.tipo, context, {});

  alerts.push({
    id: cycle,
    tipo: template.tipo,
    tipo_label: template.nome,
    prioridade: Number(template.prioridade || 9),
    cliente_id: client.id,
    cliente_nome: client.nome,
    telefone: client.telefone,
    agendamento_id: lastAppointment.id,
    servico_nome: service.nome || '',
    data_vencimento: serializeCell_('data_vencimento', dueAt),
    data_referencia: serializeCell_('data_referencia', lastAppointment.data_inicio),
    ciclo: cycle,
    texto: text,
    whatsapp_url: buildWhatsAppUrl_(client.telefone, text),
    ultima_mensagem: lastMessageByClient[client.id] ? serializeObject_(lastMessageByClient[client.id]) : null,
    status: now > dueAt ? 'atrasado' : 'pendente',
  });
}

function buildMessageContext_(payload) {
  const clients = readRows_(APP.sheets.clients);
  const services = readRows_(APP.sheets.services);
  const appointments = readRows_(APP.sheets.appointments);
  const config = getConfig_();
  const client = clients.find((row) => row.id === payload.cliente_id);
  if (!client) throw new Error('Cliente não encontrado para a mensagem.');

  let appointment = payload.agendamento_id
    ? appointments.find((row) => row.id === payload.agendamento_id)
    : null;

  if (!appointment && payload.tipo === 'lembrete_retorno') {
    appointment = appointments
      .filter((row) => row.cliente_id === client.id && !isCanceled_(row))
      .sort((a, b) => compareDatesDesc_(a.data_inicio, b.data_inicio))[0] || null;
  }

  const service = appointment
    ? services.find((row) => row.id === appointment.servico_id) || {}
    : {};

  return {
    now: new Date(),
    client,
    service,
    appointment,
    config,
  };
}

function renderMessageText_(type, context, payload) {
  const messageType = getMessageTemplateByType_(type);
  if (!messageType) throw new Error('Tipo de mensagem inválido.');

  const appointmentDate = context.appointment ? asDate_(context.appointment.data_inicio) : null;
  const replacements = {
    nome: context.client.nome || '',
    data: appointmentDate ? formatDate_(appointmentDate, 'dd/MM/yyyy') : '',
    hora: appointmentDate ? formatDate_(appointmentDate, 'HH:mm') : '',
    servico: context.service.nome || 'atendimento',
    link_avaliacao_google: context.config.link_avaliacao_google || '[link de avaliação]',
    campanha: trim_(payload.campanha) || 'esta campanha',
  };

  return Object.keys(replacements).reduce((text, key) => {
    return text.replace(new RegExp('\\{' + key + '\\}', 'g'), replacements[key]);
  }, messageType.texto || messageType.template || '');
}

function buildCycleKey_(type, client, appointment, now) {
  if (appointment && ['confirmacao_agendamento', 'lembrete_agendamento', 'pos_atendimento', 'pedido_avaliacao'].indexOf(type) !== -1) {
    return buildAppointmentCycle_(type, appointment.id);
  }

  if (type === 'aniversario') {
    return 'aniversario:' + client.id + ':' + formatDate_(now, 'yyyy');
  }

  if (type === 'lembrete_retorno' && appointment) {
    return 'retorno:' + client.id + ':' + appointment.id;
  }

  return 'manual:' + client.id + ':' + type + ':' + now.getTime();
}

function buildAppointmentCycle_(type, appointmentId) {
  return type + ':agendamento:' + appointmentId;
}

function syncCalendarEvent_(appointment, client, service) {
  const calendar = getCalendar_();
  const titlePrefix = appointment.status === 'cancelado' ? '[Cancelado] ' : '';
  const title = titlePrefix + client.nome + ' - ' + service.nome;
  const description = [
    'Cliente: ' + client.nome,
    'Telefone: ' + client.telefone,
    client.email ? 'Email: ' + client.email : '',
    'Serviço: ' + service.nome,
    'Valor aplicado: R$ ' + Number(appointment.valor_aplicado || 0).toFixed(2).replace('.', ','),
    appointment.observacoes ? 'Observações: ' + appointment.observacoes : '',
  ].filter(Boolean).join('\n');

  let event = null;
  if (appointment.google_event_id) {
    try {
      event = calendar.getEventById(appointment.google_event_id);
    } catch (error) {
      event = null;
    }
  }

  if (event) {
    event.setTitle(title);
    event.setTime(appointment.data_inicio, appointment.data_fim);
    event.setDescription(description);
    return event.getId();
  }

  return calendar
    .createEvent(title, appointment.data_inicio, appointment.data_fim, { description })
    .getId();
}

function updateServicePrice_(serviceId, newValue, startValue) {
  if (!Number.isFinite(newValue) || newValue < 0) {
    throw new Error('Informe um valor válido para o serviço.');
  }

  const start = startValue instanceof Date ? startValue : parseDateOnlyOrDateTime_(startValue);
  const history = readRows_(APP.sheets.prices)
    .filter((price) => price.servico_id === serviceId)
    .sort((a, b) => compareDatesDesc_(a.inicio_validade, b.inicio_validade));
  const current = history.find((price) => !price.fim_validade);

  if (current && Number(current.valor) === newValue) return;

  if (current) {
    updateRowById_(APP.sheets.prices, current.id, Object.assign({}, current, { fim_validade: start }));
  }

  appendObject_(APP.sheets.prices, {
    id: createId_('pre'),
    servico_id: serviceId,
    valor: newValue,
    inicio_validade: start,
    fim_validade: '',
    criado_em: new Date(),
  });
}

function getPriceForServiceAt_(serviceId, referenceDate) {
  const date = asDate_(referenceDate) || new Date();
  const history = readRows_(APP.sheets.prices)
    .filter((price) => price.servico_id === serviceId)
    .sort((a, b) => compareDatesDesc_(a.inicio_validade, b.inicio_validade));

  const matching = history.find((price) => {
    const start = asDate_(price.inicio_validade);
    const end = asDate_(price.fim_validade);
    return (!start || start <= date) && (!end || end >= date);
  });

  return matching ? Number(matching.valor || 0) : getCurrentPriceFromHistory_(history);
}

function getCurrentPriceFromHistory_(history) {
  const current = (history || []).find((price) => !price.fim_validade);
  if (current) return Number(current.valor || 0);
  return history && history.length ? Number(history[0].valor || 0) : 0;
}

function seedInitialServices_() {
  const now = new Date();
  const rows = readRows_(APP.sheets.services);
  const prices = readRows_(APP.sheets.prices);
  const startDate = parseDateOnly_(formatDate_(now, 'yyyy-MM-dd'));
  const result = { created: 0, updated: 0, pricesCreated: 0 };

  INITIAL_SERVICES.forEach((seed) => {
    const existing = rows.find((row) => {
      return row.id === seed.id || normalizeForMatch_(row.categoria + ' ' + row.nome) === normalizeForMatch_(seed.categoria + ' ' + seed.nome);
    });

    const serviceId = existing ? existing.id : seed.id;
    const service = {
      id: serviceId,
      nome: existing && existing.nome ? existing.nome : seed.nome,
      descricao: existing && existing.descricao ? existing.descricao : seed.descricao,
      categoria: existing && existing.categoria ? existing.categoria : seed.categoria,
      duracao_minutos: existing && existing.duracao_minutos ? existing.duracao_minutos : seed.duracao_minutos,
      preco_sob_consulta: existing && existing.preco_sob_consulta !== '' ? isChecked_(existing.preco_sob_consulta) : !!seed.preco_sob_consulta,
      observacao_preco: existing && existing.observacao_preco ? existing.observacao_preco : trim_(seed.observacao_preco),
      ativo: existing ? existing.ativo : true,
      criado_em: existing ? existing.criado_em : now,
      atualizado_em: existing ? existing.atualizado_em || now : now,
    };

    if (existing) {
      updateRowById_(APP.sheets.services, serviceId, service);
      result.updated += 1;
    } else {
      appendObject_(APP.sheets.services, service);
      rows.push(service);
      result.created += 1;
    }

    const hasPriceHistory = prices.some((price) => price.servico_id === serviceId);
    if (!service.preco_sob_consulta && seed.valor !== undefined && !hasPriceHistory) {
      appendObject_(APP.sheets.prices, {
        id: createId_('pre'),
        servico_id: serviceId,
        valor: seed.valor,
        inicio_validade: startDate,
        fim_validade: '',
        criado_em: now,
      });
      prices.push({ servico_id: serviceId });
      result.pricesCreated += 1;
    }
  });

  return result;
}

function seedMessageTemplates_() {
  const now = new Date();
  const rows = readRows_(APP.sheets.messageTemplates);
  const result = { created: 0, updated: 0 };

  MESSAGE_TEMPLATE_SEEDS.forEach((seed) => {
    const existing = rows.find((row) => row.tipo === seed.tipo);
    if (existing) return;

    appendObject_(APP.sheets.messageTemplates, {
      id: createId_('tpl'),
      tipo: seed.tipo,
      nome: seed.nome,
      texto: seed.texto,
      ativo: true,
      regra_tipo: seed.regra_tipo,
      regra_quantidade: seed.regra_quantidade,
      regra_unidade: seed.regra_unidade,
      regra_direcao: seed.regra_direcao,
      prioridade: seed.prioridade,
      criado_em: now,
      atualizado_em: now,
    });
    result.created += 1;
  });

  rows
    .filter((row) => row.tipo === 'falta')
    .forEach((row) => {
      updateRowById_(APP.sheets.messageTemplates, row.id, Object.assign({}, row, {
        ativo: false,
        atualizado_em: now,
      }));
      result.updated += 1;
    });

  return result;
}

function getMessageTemplates_() {
  const rows = readRows_(APP.sheets.messageTemplates);
  if (!rows.length) {
    return MESSAGE_TEMPLATE_SEEDS.map((seed) => Object.assign({
      id: seed.tipo,
      ativo: true,
      criado_em: '',
      atualizado_em: '',
    }, seed));
  }

  return rows
    .filter((row) => row.tipo !== 'falta')
    .sort((a, b) => Number(a.prioridade || 9) - Number(b.prioridade || 9));
}

function getMessageTemplateByType_(type) {
  const template = getMessageTemplates_().find((row) => row.tipo === type);
  if (template) return template;
  const fallback = MESSAGE_TYPES[type];
  if (fallback) return { tipo: type, nome: fallback.label, texto: fallback.template, ativo: true };
  throw new Error('Tipo de mensagem inválido.');
}

function getTemplateDueDate_(template, appointment, client, now) {
  if (template.regra_tipo === 'agendamento_criado') {
    return addRuleOffset_(asDate_(appointment.criado_em) || now, template);
  }

  if (template.regra_tipo === 'inicio_agendamento') {
    return addRuleOffset_(asDate_(appointment.data_inicio), template);
  }

  return null;
}

function addRuleOffset_(baseDate, template) {
  const date = asDate_(baseDate);
  if (!date) return null;

  const amount = Number(template.regra_quantidade || 0);
  const direction = template.regra_direcao === 'antes' ? -1 : 1;
  const result = new Date(date.getTime());
  const multiplier = direction * amount;

  if (template.regra_unidade === 'dias') {
    result.setDate(result.getDate() + multiplier);
  } else {
    result.setHours(result.getHours() + multiplier);
  }

  return result;
}

function buildFinance_(appointments, services) {
  const attended = appointments.filter((appointment) => {
    return !isCanceled_(appointment) && asDate_(appointment.data_inicio) <= new Date();
  });
  const future = appointments.filter((appointment) => {
    return !isCanceled_(appointment) && asDate_(appointment.data_inicio) > new Date();
  });

  const byMonth = {};
  const byDay = {};
  const byService = {};

  attended.forEach((appointment) => {
    const value = Number(appointment.valor_aplicado || 0);
    const date = asDate_(appointment.data_inicio);
    if (!date) return;

    const monthKey = formatDate_(date, 'yyyy-MM');
    const dayKey = formatDate_(date, 'yyyy-MM-dd');
    addFinanceBucket_(byMonth, monthKey, value);
    addFinanceBucket_(byDay, dayKey, value);
    addFinanceBucket_(byService, appointment.servico_nome || appointment.servico_id || 'Serviço', value);
  });

  const total = attended.reduce((sum, appointment) => sum + Number(appointment.valor_aplicado || 0), 0);
  const futureTotal = future.reduce((sum, appointment) => sum + Number(appointment.valor_aplicado || 0), 0);

  return {
    total_atendido: total,
    total_previsto: futureTotal,
    quantidade_atendimentos: attended.length,
    ticket_medio: attended.length ? total / attended.length : 0,
    por_mes: financeBucketsToRows_(byMonth),
    por_dia: financeBucketsToRows_(byDay),
    por_servico: financeBucketsToRows_(byService),
  };
}

function addFinanceBucket_(buckets, key, value) {
  if (!buckets[key]) buckets[key] = { label: key, total: 0, quantidade: 0 };
  buckets[key].total += value;
  buckets[key].quantidade += 1;
}

function financeBucketsToRows_(buckets) {
  return Object.keys(buckets)
    .sort()
    .map((key) => buckets[key]);
}

function enrichCampaigns_(campaigns, recipients, clients) {
  const clientMap = indexById_(clients);
  const byCampaign = groupBy_(recipients, 'campanha_id');
  return campaigns.map((campaign) => Object.assign({}, campaign, {
    destinatarios: (byCampaign[campaign.id] || []).map((recipient) => {
      const client = clientMap[recipient.cliente_id] || {};
      const text = renderTemplateText_(campaign.mensagem, { client, service: {}, appointment: null, config: getConfig_() }, { campanha: campaign.titulo });
      return Object.assign({}, recipient, {
        cliente_nome: client.nome || '',
        cliente_telefone: client.telefone || '',
        whatsapp_url: buildWhatsAppUrl_(client.telefone, text),
        texto: text,
      });
    }),
  }));
}

function ensureDatabase_() {
  const spreadsheet = getSpreadsheet_();
  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
    ensureHeaders_(sheet, HEADERS[sheetName]);
  });

  ensureDefaultConfig_();
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  const hasHeaders = headers.every((header, index) => current[index] === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function ensureDefaultConfig_() {
  const defaults = {
    nome_clinica: APP.clinicName,
    link_avaliacao_google: '',
    calendario_padrao_id: '',
    admin_emails: APP.adminEmails.join(','),
    timezone: APP.timezone,
  };

  Object.keys(defaults).forEach((key) => {
    if (getConfigValue_(key) === '') {
      setConfigValue_(key, defaults[key]);
    }
  });
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error('Configure SPREADSHEET_ID nas Propriedades do script ou crie o Apps Script vinculado a uma planilha.');
}

function getCalendar_() {
  const calendarId = getConfigValue_('calendario_padrao_id');
  if (calendarId) {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) throw new Error('Calendário configurado não foi encontrado.');
    return calendar;
  }

  return CalendarApp.getDefaultCalendar();
}

function assertAdmin_() {
  const allowed = getAllowedAdminEmails_();
  if (!allowed.length) {
    throw new Error('Configure o email da administradora em ADMIN_EMAILS ou na configuração admin_emails.');
  }

  const user = getCurrentUser_();
  const active = String(user.activeEmail || '').toLowerCase();
  const effective = String(user.effectiveEmail || '').toLowerCase();
  if (allowed.indexOf(active) !== -1 || allowed.indexOf(effective) !== -1) return;

  throw new Error('Usuário não autorizado para acessar o painel.');
}

function getAllowedAdminEmails_() {
  const propertyEmails = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  const configEmails = getConfigValueSafe_('admin_emails');
  return (propertyEmails + ',' + configEmails + ',' + APP.adminEmails.join(','))
    .split(',')
    .map((email) => trim_(email).toLowerCase())
    .filter((email) => email && email.indexOf('troque-pelo-email') === -1)
    .filter((email, index, list) => list.indexOf(email) === index);
}

function getCurrentUser_() {
  return {
    activeEmail: Session.getActiveUser().getEmail(),
    effectiveEmail: Session.getEffectiveUser().getEmail(),
  };
}

function readRows_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  return values.slice(1)
    .map((row, index) => {
      const object = { _row: index + 2 };
      headers.forEach((header, columnIndex) => {
        if (header) object[header] = row[columnIndex];
      });
      return object;
    })
    .filter((row) => Object.keys(row).some((key) => key !== '_row' && row[key] !== ''));
}

function appendObject_(sheetName, object) {
  const sheet = getSheet_(sheetName);
  const headers = HEADERS[sheetName];
  sheet.appendRow(headers.map((header) => object[header] !== undefined ? object[header] : ''));
}

function updateRowById_(sheetName, id, object) {
  const sheet = getSheet_(sheetName);
  const headers = HEADERS[sheetName];
  const rows = readRows_(sheetName);
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error('Registro não encontrado para atualização.');

  sheet.getRange(row._row, 1, 1, headers.length).setValues([
    headers.map((header) => object[header] !== undefined ? object[header] : ''),
  ]);
}

function archiveRow_(sheetName, id, overrides) {
  const rows = readRows_(sheetName);
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error('Registro não encontrado.');
  updateRowById_(sheetName, id, Object.assign({}, row, overrides || {}, {
    atualizado_em: new Date(),
  }));
}

function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Aba não encontrada: ' + sheetName);
  return sheet;
}

function getConfig_() {
  return readRows_(APP.sheets.config).reduce((config, row) => {
    config[row.chave] = row.valor;
    return config;
  }, {});
}

function getConfigValue_(key) {
  const rows = readRows_(APP.sheets.config);
  const row = rows.find((item) => item.chave === key);
  return row ? row.valor : '';
}

function getConfigValueSafe_(key) {
  try {
    return getConfigValue_(key);
  } catch (error) {
    return '';
  }
}

function setConfigValue_(key, value) {
  const rows = readRows_(APP.sheets.config);
  const existing = rows.find((row) => row.chave === key);
  const object = { chave: key, valor: value };
  if (existing) {
    const sheet = getSheet_(APP.sheets.config);
    sheet.getRange(existing._row, 1, 1, 2).setValues([[key, value]]);
  } else {
    appendObject_(APP.sheets.config, object);
  }
}

function enrichAppointment_(appointment, clientMap, serviceMap) {
  const client = clientMap[appointment.cliente_id] || {};
  const service = serviceMap[appointment.servico_id] || {};
  return Object.assign({}, appointment, {
    cliente_nome: client.nome || '',
    cliente_telefone: client.telefone || '',
    servico_nome: service.nome || '',
  });
}

function enrichMessage_(message, clientMap, serviceMap, appointments) {
  const client = clientMap[message.cliente_id] || {};
  const appointment = appointments.find((item) => item.id === message.agendamento_id);
  const service = appointment ? serviceMap[appointment.servico_id] || {} : {};
  return Object.assign({}, message, {
    cliente_nome: client.nome || '',
    servico_nome: service.nome || '',
  });
}

function deleteCalendarEvent_(eventId) {
  try {
    const event = getCalendar_().getEventById(eventId);
    if (event) event.deleteEvent();
  } catch (error) {
    // A exclusão no Sheets não deve falhar se o evento já não existir no Calendar.
  }
}

function getLastMessageByClient_(messages) {
  return messages.reduce((map, message) => {
    const current = map[message.cliente_id];
    if (!current || compareDatesDesc_(message.data_envio, current.data_envio) < 0) {
      map[message.cliente_id] = message;
    }
    return map;
  }, {});
}

function buildCycleSet_(rows) {
  return rows.reduce((set, row) => {
    if (row.ciclo) set[row.ciclo] = true;
    return set;
  }, {});
}

function groupBy_(rows, key) {
  return rows.reduce((groups, row) => {
    const value = row[key] || '';
    if (!groups[value]) groups[value] = [];
    groups[value].push(row);
    return groups;
  }, {});
}

function indexById_(rows) {
  return rows.reduce((map, row) => {
    map[row.id] = row;
    return map;
  }, {});
}

function isCanceled_(appointment) {
  return String(appointment.status || '').toLowerCase() === 'cancelado';
}

function isTruthy_(value) {
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1' || value === '';
}

function isChecked_(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'on' || value === 1 || value === '1';
}

function normalizeForMatch_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function serializeObject_(object) {
  return Object.keys(object).reduce((serialized, key) => {
    if (key === '_row') return serialized;
    serialized[key] = serializeCell_(key, object[key]);
    return serialized;
  }, {});
}

function serializeCell_(key, value) {
  if (value instanceof Date) {
    return DATE_ONLY_FIELDS.indexOf(key) !== -1
      ? formatDate_(value, 'yyyy-MM-dd')
      : formatDate_(value, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value === undefined || value === null ? '' : value;
}

function formatDate_(date, pattern) {
  return Utilities.formatDate(asDate_(date), APP.timezone, pattern);
}

function asDate_(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseDateOnly_(value);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return parseLocalDateTime_(value);
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function parseDateOnlyOrDateTime_(value) {
  if (value instanceof Date) return value;
  return String(value).indexOf('T') !== -1 ? parseLocalDateTime_(value) : parseDateOnly_(value);
}

function parseDateOnly_(value) {
  const parts = String(value).slice(0, 10).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function parseLocalDateTime_(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error('Informe uma data e hora válidas.');

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0
  );
}

function compareDatesDesc_(left, right) {
  const leftTime = asDate_(left) ? asDate_(left).getTime() : 0;
  const rightTime = asDate_(right) ? asDate_(right).getTime() : 0;
  return rightTime - leftTime;
}

function compareDatesAsc_(left, right) {
  const leftTime = asDate_(left) ? asDate_(left).getTime() : 0;
  const rightTime = asDate_(right) ? asDate_(right).getTime() : 0;
  return leftTime - rightTime;
}

function renderTemplateText_(template, context, payload) {
  const appointmentDate = context.appointment ? asDate_(context.appointment.data_inicio) : null;
  const replacements = {
    nome: context.client.nome || '',
    data: appointmentDate ? formatDate_(appointmentDate, 'dd/MM/yyyy') : '',
    hora: appointmentDate ? formatDate_(appointmentDate, 'HH:mm') : '',
    servico: context.service.nome || 'atendimento',
    link_avaliacao_google: context.config.link_avaliacao_google || '[link de avaliação]',
    campanha: trim_(payload.campanha) || trim_(payload.titulo) || 'esta campanha',
  };

  return Object.keys(replacements).reduce((text, key) => {
    return text.replace(new RegExp('\\{' + key + '\\}', 'g'), replacements[key]);
  }, template || '');
}

function buildWhatsAppUrl_(phone, text) {
  const normalized = normalizePhone_(phone);
  return normalized ? 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(text) : '';
}

function normalizePhone_(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

function parseCurrency_(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error('Valor inválido.');
  return number;
}

function trim_(value) {
  return String(value || '').trim();
}

function requireField_(value, message) {
  if (!trim_(value)) throw new Error(message);
}

function createId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
