export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      integracao_configuracao: {
        Row: {
          ativa: boolean
          criado_em: string
          dias_importacao_inicial: number
          id: string
          intervalo_minutos: number
          ultima_sincronizacao: string | null
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          dias_importacao_inicial?: number
          id?: string
          intervalo_minutos?: number
          ultima_sincronizacao?: string | null
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          dias_importacao_inicial?: number
          id?: string
          intervalo_minutos?: number
          ultima_sincronizacao?: string | null
        }
        Relationships: []
      }
      integracao_logs: {
        Row: {
          duracao_ms: number | null
          erro_detalhes: string | null
          executado_em: string
          id: string
          paginas_processadas: number | null
          status: string
          tipo: string
          total_atualizados: number | null
          total_erros: number | null
          total_ignorados: number | null
          total_inseridos: number | null
          total_recebidos: number | null
        }
        Insert: {
          duracao_ms?: number | null
          erro_detalhes?: string | null
          executado_em?: string
          id?: string
          paginas_processadas?: number | null
          status?: string
          tipo?: string
          total_atualizados?: number | null
          total_erros?: number | null
          total_ignorados?: number | null
          total_inseridos?: number | null
          total_recebidos?: number | null
        }
        Update: {
          duracao_ms?: number | null
          erro_detalhes?: string | null
          executado_em?: string
          id?: string
          paginas_processadas?: number | null
          status?: string
          tipo?: string
          total_atualizados?: number | null
          total_erros?: number | null
          total_ignorados?: number | null
          total_inseridos?: number | null
          total_recebidos?: number | null
        }
        Relationships: []
      }
      op_etapas: {
        Row: {
          concluido_em: string | null
          id: string
          iniciado_em: string | null
          motivo_rejeicao: string | null
          nome_etapa: string
          observacao: string | null
          operador_id: string | null
          ordem_id: string
          ordem_sequencia: number
          pipeline_etapa_id: string | null
          status: Database["public"]["Enums"]["status_op_etapa"]
        }
        Insert: {
          concluido_em?: string | null
          id?: string
          iniciado_em?: string | null
          motivo_rejeicao?: string | null
          nome_etapa: string
          observacao?: string | null
          operador_id?: string | null
          ordem_id: string
          ordem_sequencia?: number
          pipeline_etapa_id?: string | null
          status?: Database["public"]["Enums"]["status_op_etapa"]
        }
        Update: {
          concluido_em?: string | null
          id?: string
          iniciado_em?: string | null
          motivo_rejeicao?: string | null
          nome_etapa?: string
          observacao?: string | null
          operador_id?: string | null
          ordem_id?: string
          ordem_sequencia?: number
          pipeline_etapa_id?: string | null
          status?: Database["public"]["Enums"]["status_op_etapa"]
        }
        Relationships: [
          {
            foreignKeyName: "op_etapas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_etapas_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_etapas_pipeline_etapa_id_fkey"
            columns: ["pipeline_etapa_id"]
            isOneToOne: false
            referencedRelation: "pipeline_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          aprovado_em: string | null
          criado_em: string
          id: string
          observacao: string | null
          pedido_id: string
          pipeline_id: string
          sequencia: number
          status: Database["public"]["Enums"]["status_ordem"]
          supervisor_id: string | null
          tipo_produto: string | null
        }
        Insert: {
          aprovado_em?: string | null
          criado_em?: string
          id?: string
          observacao?: string | null
          pedido_id: string
          pipeline_id: string
          sequencia?: number
          status?: Database["public"]["Enums"]["status_ordem"]
          supervisor_id?: string | null
          tipo_produto?: string | null
        }
        Update: {
          aprovado_em?: string | null
          criado_em?: string
          id?: string
          observacao?: string | null
          pedido_id?: string
          pipeline_id?: string
          sequencia?: number
          status?: Database["public"]["Enums"]["status_ordem"]
          supervisor_id?: string | null
          tipo_produto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_financeiro: {
        Row: {
          confirmado_por: string | null
          criado_em: string
          data_confirmacao: string | null
          forma_pagamento_confirmada: string | null
          id: string
          motivo_bloqueio: string | null
          observacao: string | null
          pagamento_confirmado: boolean
          pedido_id: string
        }
        Insert: {
          confirmado_por?: string | null
          criado_em?: string
          data_confirmacao?: string | null
          forma_pagamento_confirmada?: string | null
          id?: string
          motivo_bloqueio?: string | null
          observacao?: string | null
          pagamento_confirmado?: boolean
          pedido_id: string
        }
        Update: {
          confirmado_por?: string | null
          criado_em?: string
          data_confirmacao?: string | null
          forma_pagamento_confirmada?: string | null
          id?: string
          motivo_bloqueio?: string | null
          observacao?: string | null
          pagamento_confirmado?: boolean
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_financeiro_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_financeiro_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_historico: {
        Row: {
          criado_em: string
          id: string
          observacao: string | null
          pedido_id: string
          status_anterior: string | null
          status_novo: string | null
          tipo_acao: Database["public"]["Enums"]["tipo_acao_historico"]
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          id?: string
          observacao?: string | null
          pedido_id: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo_acao: Database["public"]["Enums"]["tipo_acao_historico"]
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          observacao?: string | null
          pedido_id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo_acao?: Database["public"]["Enums"]["tipo_acao_historico"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          api_item_id: string | null
          categoria_produto: string | null
          conferido: boolean
          descricao_produto: string
          disponivel: boolean | null
          id: string
          item_faltante_tipo: string | null
          observacao_producao: string | null
          pedido_id: string
          produto_api_id: string | null
          quantidade: number
          referencia_produto: string | null
          unidade_medida: string | null
          valor_total: number
          valor_unitario: number
          valor_unitario_liquido: number | null
        }
        Insert: {
          api_item_id?: string | null
          categoria_produto?: string | null
          conferido?: boolean
          descricao_produto: string
          disponivel?: boolean | null
          id?: string
          item_faltante_tipo?: string | null
          observacao_producao?: string | null
          pedido_id: string
          produto_api_id?: string | null
          quantidade?: number
          referencia_produto?: string | null
          unidade_medida?: string | null
          valor_total?: number
          valor_unitario?: number
          valor_unitario_liquido?: number | null
        }
        Update: {
          api_item_id?: string | null
          categoria_produto?: string | null
          conferido?: boolean
          descricao_produto?: string
          disponivel?: boolean | null
          id?: string
          item_faltante_tipo?: string | null
          observacao_producao?: string | null
          pedido_id?: string
          produto_api_id?: string | null
          quantidade?: number
          referencia_produto?: string | null
          unidade_medida?: string | null
          valor_total?: number
          valor_unitario?: number
          valor_unitario_liquido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_logistica: {
        Row: {
          codigo_rastreio: string | null
          criado_em: string
          data_entrega_confirmada: string | null
          data_envio: string | null
          id: string
          observacao: string | null
          pedido_id: string
          responsavel_envio_id: string | null
          transportadora: string | null
        }
        Insert: {
          codigo_rastreio?: string | null
          criado_em?: string
          data_entrega_confirmada?: string | null
          data_envio?: string | null
          id?: string
          observacao?: string | null
          pedido_id: string
          responsavel_envio_id?: string | null
          transportadora?: string | null
        }
        Update: {
          codigo_rastreio?: string | null
          criado_em?: string
          data_entrega_confirmada?: string | null
          data_envio?: string | null
          id?: string
          observacao?: string | null
          pedido_id?: string
          responsavel_envio_id?: string | null
          transportadora?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_logistica_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: true
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_logistica_responsavel_envio_id_fkey"
            columns: ["responsavel_envio_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          api_cliente_id: string | null
          api_venda_id: string | null
          atualizado_em: string
          canal_venda: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_nome: string
          cliente_telefone: string | null
          codigo_rastreio: string | null
          criado_em: string
          data_entrega: string | null
          data_entrega_api: string | null
          data_envio: string | null
          data_pagamento_confirmado: string | null
          data_previsao_entrega: string | null
          data_venda_api: string | null
          forma_envio: string | null
          forma_pagamento: string | null
          id: string
          numero_pedido: string
          observacao_api: string | null
          observacao_comercial: string | null
          observacao_financeiro: string | null
          observacao_interna_api: string | null
          observacao_logistica: string | null
          pagamento_confirmado: boolean
          sincronizacao_bloqueada: boolean
          status_api: string | null
          status_atual: Database["public"]["Enums"]["status_pedido"]
          subtipo_pronta_entrega: string | null
          tipo_fluxo: string | null
          usuario_responsavel_id: string | null
          valor_acrescimo: number | null
          valor_bruto: number
          valor_desconto: number
          valor_frete: number | null
          valor_liquido: number
          valor_produtos: number | null
          vendedor_codigo: string | null
          vendedor_nome: string | null
        }
        Insert: {
          api_cliente_id?: string | null
          api_venda_id?: string | null
          atualizado_em?: string
          canal_venda?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          codigo_rastreio?: string | null
          criado_em?: string
          data_entrega?: string | null
          data_entrega_api?: string | null
          data_envio?: string | null
          data_pagamento_confirmado?: string | null
          data_previsao_entrega?: string | null
          data_venda_api?: string | null
          forma_envio?: string | null
          forma_pagamento?: string | null
          id?: string
          numero_pedido: string
          observacao_api?: string | null
          observacao_comercial?: string | null
          observacao_financeiro?: string | null
          observacao_interna_api?: string | null
          observacao_logistica?: string | null
          pagamento_confirmado?: boolean
          sincronizacao_bloqueada?: boolean
          status_api?: string | null
          status_atual?: Database["public"]["Enums"]["status_pedido"]
          subtipo_pronta_entrega?: string | null
          tipo_fluxo?: string | null
          usuario_responsavel_id?: string | null
          valor_acrescimo?: number | null
          valor_bruto?: number
          valor_desconto?: number
          valor_frete?: number | null
          valor_liquido?: number
          valor_produtos?: number | null
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          api_cliente_id?: string | null
          api_venda_id?: string | null
          atualizado_em?: string
          canal_venda?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          codigo_rastreio?: string | null
          criado_em?: string
          data_entrega?: string | null
          data_entrega_api?: string | null
          data_envio?: string | null
          data_pagamento_confirmado?: string | null
          data_previsao_entrega?: string | null
          data_venda_api?: string | null
          forma_envio?: string | null
          forma_pagamento?: string | null
          id?: string
          numero_pedido?: string
          observacao_api?: string | null
          observacao_comercial?: string | null
          observacao_financeiro?: string | null
          observacao_interna_api?: string | null
          observacao_logistica?: string | null
          pagamento_confirmado?: boolean
          sincronizacao_bloqueada?: boolean
          status_api?: string | null
          status_atual?: Database["public"]["Enums"]["status_pedido"]
          subtipo_pronta_entrega?: string | null
          tipo_fluxo?: string | null
          usuario_responsavel_id?: string | null
          valor_acrescimo?: number | null
          valor_bruto?: number
          valor_desconto?: number
          valor_frete?: number | null
          valor_liquido?: number
          valor_produtos?: number | null
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_usuario_responsavel_id_fkey"
            columns: ["usuario_responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_etapas: {
        Row: {
          avanco_automatico: boolean
          campos_obrigatorios: Json | null
          id: string
          nome: string
          ordem: number
          pipeline_id: string
          requer_supervisor: boolean
          setor_responsavel: string | null
        }
        Insert: {
          avanco_automatico?: boolean
          campos_obrigatorios?: Json | null
          id?: string
          nome: string
          ordem?: number
          pipeline_id: string
          requer_supervisor?: boolean
          setor_responsavel?: string | null
        }
        Update: {
          avanco_automatico?: boolean
          campos_obrigatorios?: Json | null
          id?: string
          nome?: string
          ordem?: number
          pipeline_id?: string
          requer_supervisor?: boolean
          setor_responsavel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_etapas_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_producao: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          padrao: boolean
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          padrao?: boolean
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          padrao?: boolean
        }
        Relationships: []
      }
      solicitacoes_almoxarifado: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          criado_em: string
          descricao: string
          id: string
          pedido_id: string
          pedido_item_id: string | null
          quantidade: number
          solicitado_por: string | null
          status: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          criado_em?: string
          descricao: string
          id?: string
          pedido_id: string
          pedido_item_id?: string | null
          quantidade?: number
          solicitado_por?: string | null
          status?: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          criado_em?: string
          descricao?: string
          id?: string
          pedido_id?: string
          pedido_item_id?: string | null
          quantidade?: number
          solicitado_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_almoxarifado_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_almoxarifado_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_almoxarifado_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_almoxarifado_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          criado_em: string
          email: string
          id: string
          nome: string
          perfil: Database["public"]["Enums"]["perfil_usuario"]
          setor: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          email: string
          id: string
          nome: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          setor?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          perfil?: Database["public"]["Enums"]["perfil_usuario"]
          setor?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_perfil: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      perfil_usuario:
        | "admin"
        | "gestor"
        | "supervisor_producao"
        | "operador_producao"
        | "comercial"
        | "financeiro"
        | "logistica"
        | "loja"
      status_op_etapa: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "REJEITADA"
      status_ordem:
        | "AGUARDANDO"
        | "EM_ANDAMENTO"
        | "CONCLUIDA"
        | "REJEITADA"
        | "CANCELADA"
      status_pedido:
        | "AGUARDANDO_PRODUCAO"
        | "EM_PRODUCAO"
        | "PRODUCAO_CONCLUIDA"
        | "AGUARDANDO_COMERCIAL"
        | "VALIDADO_COMERCIAL"
        | "AGUARDANDO_FINANCEIRO"
        | "LIBERADO_LOGISTICA"
        | "EM_SEPARACAO"
        | "ENVIADO"
        | "ENTREGUE"
        | "BLOQUEADO"
        | "CANCELADO"
        | "AGUARDANDO_LOJA"
        | "LOJA_VERIFICANDO"
        | "AGUARDANDO_OP_COMPLEMENTAR"
        | "AGUARDANDO_ALMOXARIFADO"
        | "LOJA_OK"
        | "VALIDADO_FINANCEIRO"
        | "FINALIZADO_SIMPLIFICA"
      tipo_acao_historico:
        | "TRANSICAO"
        | "EDICAO"
        | "COMENTARIO"
        | "REJEICAO"
        | "APROVACAO"
        | "ALTERACAO_ITENS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      perfil_usuario: [
        "admin",
        "gestor",
        "supervisor_producao",
        "operador_producao",
        "comercial",
        "financeiro",
        "logistica",
        "loja",
      ],
      status_op_etapa: ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "REJEITADA"],
      status_ordem: [
        "AGUARDANDO",
        "EM_ANDAMENTO",
        "CONCLUIDA",
        "REJEITADA",
        "CANCELADA",
      ],
      status_pedido: [
        "AGUARDANDO_PRODUCAO",
        "EM_PRODUCAO",
        "PRODUCAO_CONCLUIDA",
        "AGUARDANDO_COMERCIAL",
        "VALIDADO_COMERCIAL",
        "AGUARDANDO_FINANCEIRO",
        "LIBERADO_LOGISTICA",
        "EM_SEPARACAO",
        "ENVIADO",
        "ENTREGUE",
        "BLOQUEADO",
        "CANCELADO",
        "AGUARDANDO_LOJA",
        "LOJA_VERIFICANDO",
        "AGUARDANDO_OP_COMPLEMENTAR",
        "AGUARDANDO_ALMOXARIFADO",
        "LOJA_OK",
        "VALIDADO_FINANCEIRO",
        "FINALIZADO_SIMPLIFICA",
      ],
      tipo_acao_historico: [
        "TRANSICAO",
        "EDICAO",
        "COMENTARIO",
        "REJEICAO",
        "APROVACAO",
        "ALTERACAO_ITENS",
      ],
    },
  },
} as const
