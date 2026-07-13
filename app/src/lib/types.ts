export type Clinic = {
  id: string
  nome: string
  nome_publico: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
  complemento: string | null
  cep: string | null
  cidade: string | null
  estado: string | null
  fuso_horario: string
  link_google_avaliacao: string | null
  google_place_id: string | null
  ativo: boolean
}

export type Profile = {
  id: string
  nome: string
  email: string
  telefone: string | null
  ativo: boolean
}

export type ClinicMembership = {
  id: string
  clinica_id: string
  perfil_id: string
  papel: string
  ativo: boolean
  clinica: Clinic
}

export type Client = {
  id: string
  clinica_id: string
  nome: string
  telefone: string
  email: string | null
  data_nascimento: string | null
  cpf: string | null
  genero: string | null
  observacoes: string | null
  intervalo_retorno_dias: number | null
  parceira: boolean
  aceita_marketing: boolean
  ativo: boolean
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
}

export type ServicePrice = {
  id: string
  clinica_id: string
  servico_id: string
  valor: number
  inicio_validade: string
  fim_validade: string | null
  criado_em: string
}

export type Service = {
  id: string
  clinica_id: string
  nome: string
  categoria: string | null
  descricao: string | null
  duracao_minutos: number
  intervalo_retorno_dias: number | null
  preco_sob_consulta: boolean
  observacao_preco: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  precos_servicos?: ServicePrice[]
}

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'

export type Appointment = {
  id: string
  clinica_id: string
  cliente_id: string
  servico_id: string | null
  profissional_id: string | null
  inicio_em: string
  fim_em: string
  status: AppointmentStatus
  valor_aplicado: number
  google_event_id: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
  servicos?: Pick<Service, 'id' | 'nome' | 'categoria' | 'duracao_minutos'>
}

export type Supplier = {
  id: string
  clinica_id: string
  nome: string
  documento: string | null
  telefone: string | null
  email: string | null
  contato: string | null
  observacoes: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
}

export type Equipment = {
  id: string
  clinica_id: string
  fornecedor_id: string | null
  nome: string
  categoria: string | null
  sala_local: string | null
  valor_compra: number
  data_compra: string | null
  status: 'ativo' | 'manutencao' | 'inativo'
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  fornecedores?: Pick<Supplier, 'id' | 'nome'>
}

export type WaitlistStatus = 'em_espera' | 'confirmado' | 'cancelado'

export type WaitlistEntry = {
  id: string
  clinica_id: string
  cliente_id: string
  servico_id: string | null
  agendamento_id: string | null
  inicio_desejado_em: string
  fim_desejado_em: string
  status: WaitlistStatus
  prioridade: number
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
  servicos?: Pick<Service, 'id' | 'nome' | 'categoria' | 'duracao_minutos'>
}

export type TreatmentPlanStatus = 'em_andamento' | 'concluido' | 'cancelado'

export type TreatmentPlan = {
  id: string
  clinica_id: string
  cliente_id: string
  servico_id: string
  nome: string
  total_sessoes: number
  sessoes_realizadas: number
  valor_total: number
  valor_sessao: number
  status: TreatmentPlanStatus
  inicio_em: string | null
  fim_previsto_em: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
  servicos?: Pick<Service, 'id' | 'nome' | 'categoria' | 'duracao_minutos'>
}

export type FinancialMovement = {
  id: string
  clinica_id: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  vencimento_em: string | null
  pago_em: string | null
  status: 'pendente' | 'pago' | 'cancelado'
  categoria: string | null
  conta: string | null
  metodo_pagamento: string | null
  agendamento_id: string | null
  cliente_id: string | null
  observacao: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
}

export type StockItem = {
  id: string
  clinica_id: string
  fornecedor_id: string | null
  nome: string
  categoria: string | null
  unidade: string
  quantidade_atual: number
  estoque_minimo: number
  custo_unitario: number
  ativo: boolean
  observacoes: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  fornecedores?: Pick<Supplier, 'id' | 'nome'>
}

export type MessageTemplateType =
  | 'confirmacao_agendamento'
  | 'lembrete_agendamento'
  | 'pos_atendimento'
  | 'pedido_avaliacao'
  | 'aniversario'
  | 'lembrete_retorno'
  | 'promocao_campanha'
  | string

export type MessageRule = {
  id: string
  clinica_id: string
  modelo_mensagem_id: string
  gatilho: string
  quantidade: number | null
  unidade: 'horas' | 'dias' | string | null
  direcao: 'antes' | 'depois' | string | null
  janela_alerta_dias: number | null
  canal_padrao: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export type MessageTemplate = {
  id: string
  clinica_id: string
  tipo: MessageTemplateType
  nome: string
  texto: string
  ativo: boolean
  prioridade: number
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  regras_mensagens?: MessageRule[]
}

export type MessageLog = {
  id: string
  clinica_id: string
  cliente_id: string
  agendamento_id: string | null
  modelo_mensagem_id: string | null
  campanha_id: string | null
  canal: string
  texto: string
  ciclo: string | null
  status: string
  enviado_em: string | null
  observacao: string | null
  criado_em: string
}

export type Campaign = {
  id: string
  clinica_id: string
  modelo_mensagem_id: string | null
  titulo: string
  mensagem: string
  publico: string
  status: 'rascunho' | 'ativa' | 'pausada' | 'concluida' | 'cancelada'
  criado_por: string | null
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  modelos_mensagens?: Pick<MessageTemplate, 'id' | 'nome' | 'tipo'>
  destinatarios_campanhas?: CampaignRecipient[]
}

export type CampaignRecipient = {
  id: string
  clinica_id: string
  campanha_id: string
  cliente_id: string
  texto: string | null
  status: 'pendente' | 'enviado' | 'falha' | 'cancelado'
  enviado_em: string | null
  observacao: string | null
  criado_em: string
  atualizado_em: string
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
  campanhas?: Pick<Campaign, 'id' | 'titulo' | 'mensagem'>
}

export type ClientReview = {
  id: string
  clinica_id: string
  cliente_id: string | null
  agendamento_id: string | null
  origem: 'manual' | 'google' | string
  nota: number
  comentario: string | null
  link_externo: string | null
  avaliado_em: string
  criado_em: string
  atualizado_em: string
  arquivado_em: string | null
  clientes?: Pick<Client, 'id' | 'nome' | 'telefone'>
}

export type DismissedMessage = {
  id: string
  clinica_id: string
  cliente_id: string
  agendamento_id: string | null
  modelo_mensagem_id: string | null
  tipo: string | null
  ciclo: string
  motivo: string | null
  dispensado_em: string
  criado_em: string
}
