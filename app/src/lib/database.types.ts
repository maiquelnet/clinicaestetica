export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type GenericTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}

export type Database = {
  public: {
    Tables: Record<string, GenericTable>
    Views: Record<string, never>
    Functions: {
      salvar_agendamento: {
        Args: {
          p_agendamento_id: string | null
          p_clinica_id: string
          p_cliente_id: string
          p_servico_id: string | null
          p_profissional_id: string | null
          p_inicio_em: string
          p_fim_em: string
          p_valor_aplicado: number
          p_status: string
          p_observacoes: string | null
        }
        Returns: string
      }
      salvar_disponibilidade_semanal: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_periodos: Json
        }
        Returns: undefined
      }
      salvar_disponibilidade_excecao: {
        Args: {
          p_excecao_id: string | null
          p_clinica_id: string
          p_profissional_id: string
          p_data: string
          p_nao_atende: boolean
          p_observacao: string | null
          p_periodos: Json
        }
        Returns: string
      }
      calcular_capacidade_comercial_periodo: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_data_inicio: string
          p_data_fim: string
        }
        Returns: Array<{
          data: string
          profissional_id: string
          capacidade_minutos: number
          ocupado_minutos: number
          livre_minutos: number
          bloqueado_minutos: number
          ocupacao_percentual: number | null
          possui_capacidade: boolean
          periodos_livres: Json
          fonte_disponibilidade: string
        }>
      }
      calcular_radar_ocupacao_periodo: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_data_inicio: string
          p_data_fim: string
        }
        Returns: Array<{
          data: string
          profissional_id: string
          capacidade_minutos: number
          ocupado_minutos: number
          livre_minutos: number
          bloqueado_minutos: number
          ocupacao_percentual: number | null
          possui_capacidade: boolean
          periodos_livres: Json
          fonte_disponibilidade: string
          classificacao: string
          merece_atencao: boolean
        }>
      }
      calcular_oportunidades_comerciais_periodo: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_data_inicio: string
          p_data_fim: string
        }
        Returns: Array<{
          data: string
          profissional_id: string
          capacidade_minutos: number
          ocupado_minutos: number
          livre_minutos: number
          ocupacao_percentual: number | null
          possui_capacidade: boolean
          periodos_livres: Json
          fonte_disponibilidade: string
          classificacao: string
          merece_atencao: boolean
          oportunidades: Json
          total_oportunidades: number
          lista_espera_count: number
          retorno_count: number
          clientes_unicos_count: number
        }>
      }
      excluir_disponibilidade_excecao: {
        Args: {
          p_excecao_id: string
          p_clinica_id: string
          p_profissional_id: string
        }
        Returns: undefined
      }
      salvar_plano_tratamento_com_cronograma: {
        Args: {
          p_plano_id: string | null
          p_clinica_id: string
          p_cliente_id: string
          p_servico_id: string
          p_nome: string
          p_total_sessoes: number
          p_valor_total: number
          p_valor_sessao: number
          p_status: string
          p_inicio_em: string
          p_horario_preferencial: string
          p_frequencia: string
          p_intervalo_dias: number | null
          p_considerar_sabado: boolean
          p_considerar_domingo: boolean
          p_observacoes: string | null
          p_ocorrencias: Json
        }
        Returns: Json
      }
      confirmar_lista_espera: {
        Args: {
          p_lista_espera_id: string
          p_profissional_id: string | null
        }
        Returns: string
      }
      salvar_servico_com_preco: {
        Args: {
          p_servico_id: string | null
          p_clinica_id: string
          p_nome: string
          p_categoria: string | null
          p_descricao: string | null
          p_duracao_minutos: number
          p_intervalo_retorno_dias: number | null
          p_preco_sob_consulta: boolean
          p_observacao_preco: string | null
          p_ativo: boolean
          p_valor: number | null
          p_inicio_validade: string
        }
        Returns: string
      }
      salvar_campanha_com_destinatarios: {
        Args: {
          p_campanha_id: string | null
          p_clinica_id: string
          p_modelo_mensagem_id: string | null
          p_titulo: string
          p_mensagem: string
          p_publico: string
          p_status: string
          p_criado_por: string | null
          p_servicos_alvo: string[]
        }
        Returns: string
      }
      register_public_client_signup: {
        Args: {
          p_clinica_id: string
          p_nome: string
          p_telefone: string
          p_email: string | null
          p_data_nascimento: string | null
          p_servicos_interesse: string[]
        }
        Returns: Array<{ cliente_id: string; cadastro_atualizado: boolean }>
      }
      salvar_cliente_com_interesses: {
        Args: {
          p_cliente_id: string | null
          p_clinica_id: string
          p_nome: string
          p_telefone: string
          p_email: string | null
          p_data_nascimento: string | null
          p_cpf: string | null
          p_genero: string | null
          p_observacoes: string | null
          p_intervalo_retorno_dias: number | null
          p_parceira: boolean
          p_aceita_marketing: boolean
          p_whatsapp_opt_in_status: string
          p_whatsapp_opt_in_em: string | null
          p_whatsapp_opt_in_origem: string | null
          p_whatsapp_opt_in_versao: string | null
          p_whatsapp_opt_out_em: string | null
          p_ativo: boolean
          p_servicos_interesse: string[]
        }
        Returns: string
      }
      prever_publico_campanha: {
        Args: {
          p_clinica_id: string
          p_publico: string
          p_servicos_alvo: string[]
        }
        Returns: number
      }
      listar_secretaria_planos_acao_periodo: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_data_inicio: string
          p_data_fim: string
        }
        Returns: Json
      }
      buscar_secretaria_plano_acao: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
        }
        Returns: Json
      }
      preparar_secretaria_plano: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_data_alvo: string
        }
        Returns: string
      }
      revalidar_secretaria_plano: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
        }
        Returns: Json
      }
      atualizar_secretaria_plano: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
        }
        Returns: Json
      }
      remover_secretaria_plano_item: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
          p_item_id: string
        }
        Returns: Json
      }
      adicionar_secretaria_plano_item: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
          p_oportunidade_id: string
        }
        Returns: Json
      }
      aprovar_secretaria_plano: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
        }
        Returns: Json
      }
      cancelar_secretaria_plano: {
        Args: {
          p_clinica_id: string
          p_profissional_id: string
          p_plano_id: string
        }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
