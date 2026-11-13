import type { PlanoCliente, StatusCliente } from "@/integrations/supabase/types";
export type { PlanoCliente, StatusCliente };

export type TipoRenovacaoContrato =
  "mesma_vigencia" | "tempo_personalizado" | "mensal_ate_cancelamento";

export type StatusBloqueioManual = "automatico" | "bloqueado" | "liberado";

export interface Cliente {
  id: string;
  user_id?: string | null;
  nome_razao_social: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  status: StatusCliente;
  plano: PlanoCliente;
  dias_historico_plano: number;
  dias_retencao_banco: number;
  dia_vencimento: number;
  valor_mensalidade: number;
  veiculos_count?: number;
  instalador_id?: string | null;
  data_agendamento?: string | null;
  hora_agendamento?: string | null;
  status_agendamento?: string | null;
  instalador_nome?: string | null;
  instalador_endereco?: string | null;
  instalador_telefone?: string | null;
  meses_contrato?: number;
  data_inicio_contrato?: string;
  data_fim_contrato?: string | null;
  tipo_renovacao?: TipoRenovacaoContrato;
  meses_renovacao?: number | null;
  foro_comarca?: string;
  taxa_instalacao?: number;
  pago_direto_instalador?: boolean;
  status_taxa_instalacao?: "pago" | "pendente" | "parcial";
  data_pagamento_instalacao?: string | null;
  contrato_emitido_em?: string | null;
  privacidade_localizacao?: boolean;
  regra_horimetro?: "pos_chave" | "ignicao_ligada";
  tem_fidelidade?: boolean;
  status_bloqueio_localizacao?: StatusBloqueioManual;
  status_bloqueio_acesso?: StatusBloqueioManual;
  motivo_bloqueio_manual?: string | null;
  bloqueio_atualizado_em?: string | null;
  bloqueio_atualizado_por?: string | null;
  pendente_configuracao_operador?: boolean;
  veiculos_resumo?: VeiculoResumoCliente[];
  created_at: string;
  updated_at: string;
}

export interface VeiculoResumoCliente {
  id: string;
  placa: string;
  modelo: string;
  tipo_veiculo?: string;
  status_bloqueio?: string;
  pendente_aprovacao_operador?: boolean;
}

export interface InstaladorResumo {
  id: string;
  nome: string;
  telefone?: string | null;
  endereco_instalacao?: string | null;
  chave_pix?: string | null;
  valor_por_instalacao?: number | null;
  valor_instalacao_sem_bloqueador?: number | null;
  valor_instalacao_com_bloqueador?: number | null;
}

export interface AgendamentoClienteInfo {
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone?: string | null;
  status_cliente: StatusCliente;
  status_agendamento: string;
  data_agendamento?: string | null;
  hora_agendamento?: string | null;
  instalador_id?: string | null;
  instalador_nome?: string | null;
  instalador_endereco?: string | null;
  instalador_telefone?: string | null;
}

export type CategoriaHistoricoCliente =
  | "todos"
  | "pagamento"
  | "atraso"
  | "chamado"
  | "instalacao"
  | "agendamento"
  | "bloqueio_seguranca";

export type SeveridadeHistorico = "info" | "sucesso" | "alerta" | "perigo";

export interface ItemHistoricoCliente {
  id: string;
  data: string; // ISO string
  categoria:
    "pagamento" | "atraso" | "chamado" | "instalacao" | "agendamento" | "bloqueio_seguranca";
  titulo: string;
  descricao: string;
  detalhes?: {
    valor?: number;
    diasAtraso?: number;
    protocolo?: number | string;
    veiculo?: string;
    placa?: string;
    status?: string;
    prioridade?: string;
    responsavel?: string;
    comprovante_url?: string;
    mesReferencia?: number;
    anoReferencia?: number;
    dataAgendamento?: string;
    horaAgendamento?: string;
    localTipo?: string;
    endereco?: string;
  };
  severidade: SeveridadeHistorico;
}

export interface ResumoHistoricoCliente {
  totalPagamentosRealizados: number;
  totalValorPago: number;
  totalMensalidadesAtrasadas: number;
  totalValorEmAtraso: number;
  maiorAtrasoDias: number;
  totalChamadosAtendimento: number;
  chamadosAbertos: number;
  totalInstalacoes: number;
  instalacoesConcluidas: number;
  totalAgendamentos: number;
  totalSolicitacoesEndereco: number;
  bloqueiosAtivos: number;
  statusAcessoCliente: StatusCliente;
}

export interface HistoricoClienteCompleto {
  cliente: Cliente;
  itens: ItemHistoricoCliente[];
  resumo: ResumoHistoricoCliente;
}
