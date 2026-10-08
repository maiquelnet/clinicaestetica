import { supabase } from './supabase'
import type { Database } from './database.types'
import { normalizeCapacityDay, normalizeOpportunityDay, normalizeRadarDay, type CapacityRpcRow, type CommercialCapacityDay, type OpportunityDay, type OpportunityRpcRow, type RadarDay } from './capacity'
import { normalizeActionPlan, normalizePlanApproval, normalizePlanSummaries, normalizePlanUpdate, normalizePlanValidation, type ActionPlan, type ActionPlanSummary, type PlanApprovalResult, type PlanUpdateResult, type PlanValidationResult } from './secretaria'

type RpcName = keyof Database['public']['Functions']
type RpcArgs<Name extends RpcName> = Database['public']['Functions'][Name]['Args']

export async function saveAppointment(args: RpcArgs<'salvar_agendamento'>) {
  const { error } = await supabase.rpc('salvar_agendamento', args)
  if (error) throw error
}

export async function saveWeeklyAvailability(args: RpcArgs<'salvar_disponibilidade_semanal'>) {
  const { error } = await supabase.rpc('salvar_disponibilidade_semanal', args)
  if (error) throw error
}

export async function saveAvailabilityException(args: RpcArgs<'salvar_disponibilidade_excecao'>) {
  const { data, error } = await supabase.rpc('salvar_disponibilidade_excecao', args)
  if (error) throw error
  return data
}

export async function deleteAvailabilityException(args: RpcArgs<'excluir_disponibilidade_excecao'>) {
  const { error } = await supabase.rpc('excluir_disponibilidade_excecao', args)
  if (error) throw error
}

export async function fetchCommercialCapacityPeriod(args: RpcArgs<'calcular_capacidade_comercial_periodo'>): Promise<CommercialCapacityDay[]> {
  const { data, error } = await supabase.rpc('calcular_capacidade_comercial_periodo', args)
  if (error) throw error
  return ((data || []) as unknown as CapacityRpcRow[]).map(normalizeCapacityDay)
}

export async function fetchOccupancyRadarPeriod(args: RpcArgs<'calcular_radar_ocupacao_periodo'>): Promise<RadarDay[]> {
  const { data, error } = await supabase.rpc('calcular_radar_ocupacao_periodo', args)
  if (error) throw error
  return ((data || []) as unknown as CapacityRpcRow[]).map(normalizeRadarDay)
}

export async function fetchCommercialOpportunitiesPeriod(args: RpcArgs<'calcular_oportunidades_comerciais_periodo'>): Promise<OpportunityDay[]> {
  const { data, error } = await supabase.rpc('calcular_oportunidades_comerciais_periodo', args)
  if (error) throw error
  return ((data || []) as unknown as OpportunityRpcRow[]).map(normalizeOpportunityDay)
}

export async function listSecretaryActionPlansPeriod(args: RpcArgs<'listar_secretaria_planos_acao_periodo'>): Promise<ActionPlanSummary[]> {
  const { data, error } = await supabase.rpc('listar_secretaria_planos_acao_periodo', args)
  if (error) throw error
  return normalizePlanSummaries(data)
}

export async function fetchSecretaryActionPlan(args: RpcArgs<'buscar_secretaria_plano_acao'>): Promise<ActionPlan> {
  const { data, error } = await supabase.rpc('buscar_secretaria_plano_acao', args)
  if (error) throw error
  return normalizeActionPlan(data)
}

export async function prepareSecretaryActionPlan(args: RpcArgs<'preparar_secretaria_plano'>): Promise<string> {
  const { data, error } = await supabase.rpc('preparar_secretaria_plano', args)
  if (error) throw error
  if (typeof data !== 'string' || !data) throw new Error('Contrato inválido: id do plano.')
  return data
}

export async function revalidateSecretaryActionPlan(args: RpcArgs<'revalidar_secretaria_plano'>): Promise<PlanValidationResult> {
  const { data, error } = await supabase.rpc('revalidar_secretaria_plano', args)
  if (error) throw error
  return normalizePlanValidation(data)
}

export async function updateSecretaryActionPlan(args: RpcArgs<'atualizar_secretaria_plano'>): Promise<PlanUpdateResult> {
  const { data, error } = await supabase.rpc('atualizar_secretaria_plano', args)
  if (error) throw error
  return normalizePlanUpdate(data)
}

export async function removeSecretaryActionPlanItem(args: RpcArgs<'remover_secretaria_plano_item'>): Promise<ActionPlan> {
  const { data, error } = await supabase.rpc('remover_secretaria_plano_item', args)
  if (error) throw error
  return normalizeActionPlan(data)
}

export async function addSecretaryActionPlanItem(args: RpcArgs<'adicionar_secretaria_plano_item'>): Promise<ActionPlan> {
  const { data, error } = await supabase.rpc('adicionar_secretaria_plano_item', args)
  if (error) throw error
  return normalizeActionPlan(data)
}

export async function approveSecretaryActionPlan(args: RpcArgs<'aprovar_secretaria_plano'>): Promise<PlanApprovalResult> {
  const { data, error } = await supabase.rpc('aprovar_secretaria_plano', args)
  if (error) throw error
  return normalizePlanApproval(data)
}

export async function cancelSecretaryActionPlan(args: RpcArgs<'cancelar_secretaria_plano'>): Promise<ActionPlan> {
  const { data, error } = await supabase.rpc('cancelar_secretaria_plano', args)
  if (error) throw error
  return normalizeActionPlan(data)
}

export async function confirmWaitlistEntry(args: RpcArgs<'confirmar_lista_espera'>) {
  const { error } = await supabase.rpc('confirmar_lista_espera', args)
  if (error) throw error
}

export async function saveServiceWithPrice(args: RpcArgs<'salvar_servico_com_preco'>) {
  const { error } = await supabase.rpc('salvar_servico_com_preco', args)
  if (error) throw error
}

export async function saveCampaignWithRecipients(args: RpcArgs<'salvar_campanha_com_destinatarios'>) {
  const { error } = await supabase.rpc('salvar_campanha_com_destinatarios', args)
  if (error) throw error
}

export async function registerPublicClientSignup(args: RpcArgs<'register_public_client_signup'>) {
  const { data, error } = await supabase.rpc('register_public_client_signup', args)
  if (error) throw error
  return data
}

export async function saveClientWithInterests(args: RpcArgs<'salvar_cliente_com_interesses'>) {
  const { data, error } = await supabase.rpc('salvar_cliente_com_interesses', args)
  if (error) throw error
  return data
}
