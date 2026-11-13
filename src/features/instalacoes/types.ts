import type { StatusInstalacao, StatusPagamentoInstalacao } from "@/integrations/supabase/types";

export type { StatusInstalacao, StatusPagamentoInstalacao };

export interface Instalacao {
  id: string;
  instalador_id: string;
  instalador_nome?: string;
  instalador_role?: string | null;
  instalador_chave_pix?: string | null;
  cliente_id: string;
  cliente_nome?: string;
  cliente_documento?: string;
  cliente_telefone?: string;
  veiculo_id?: string | null;
  placa: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  cor?: string | null;
  km_instalacao: number;
  rastreador_imei: string;
  rastreador_modelo: string;
  chip_iccid?: string | null;
  chip_operadora?: string | null;
  posicao_instalacao?: string | null;
  status: StatusInstalacao;
  motivo_pendencia_recusa?: string | null;
  observacoes?: string | null;
  valor_instalacao: number;
  status_pagamento: StatusPagamentoInstalacao;
  pago_direto_cliente?: boolean;
  pago_em?: string | null;
  pago_por?: string | null;
  comprovante_pagamento?: string | null;
  bloqueador_instalado?: boolean;
  com_bloqueador?: boolean;
  tipo_bloqueador?: "rele_combustivel" | "outro" | "sem_bloqueador" | null;
  bloqueador_detalhes?: string | null;
  horimetro_inicial?: number;
  tipo_veiculo?: string;
  instalador_valor_com_bloqueador?: number | null;
  instalador_valor_sem_bloqueador?: number | null;
  cliente_plano?: string;
  cliente_tem_fidelidade?: boolean;
  cliente_regra_horimetro?: string;
  tipo_servico?: "instalacao" | "retirada";
  ordem_vinculada_id?: string | null;
  rastreador_id?: string | null;
  rele_chicote_do_estoque?: boolean;
  kit_determinado_em?: string | null;
  kit_confirmado_instalador?: boolean;
  kit_confirmado_em?: string | null;
  imei_confirmado?: string | null;
  foto_placa_url?: string | null;
  foto_rastreador_url?: string | null;
  foto_local_instalacao_url?: string | null;
  foto_bloqueador_url?: string | null;
  fotos_instalacao?: {
    placa?: string;
    rastreador?: string;
    local_instalacao?: string;
    bloqueador?: string;
  } | null;
  data_agendamento?: string | null;
  hora_agendamento?: string | null;
  local_tipo?: "oficina" | "domicilio" | "local_veiculo";
  local_endereco?: string | null;
  solicita_endereco_cliente?: boolean;
  endereco_cliente_informado?: string | null;
  endereco_cliente_informado_em?: string | null;
  solicitado_endereco_em?: string | null;
  created_at: string;
  updated_at: string;
  concluida_at?: string | null;
}

export interface InstalacaoHistorico {
  id: string;
  instalacao_id: string;
  instalador_id: string;
  instalador_nome?: string;
  status_atendimento: string;
  motivo?: string | null;
  observacoes?: string | null;
  km_no_atendimento: number;
  created_at: string;
}

export interface SalvarInstalacaoPayload {
  instalacaoId?: string;
  clienteId?: string;
  placa: string;
  marca: string;
  modelo: string;
  ano?: number;
  cor?: string;
  chassi?: string;
  kmInstalacao: number;
  horimetroInicial?: number;
  tipoVeiculo?: string;
  rastreadorImei: string;
  rastreadorModelo?: string;
  chipIccid?: string;
  chipOperadora?: string;
  posicaoInstalacao?: string;
  bloqueadorInstalado?: boolean;
  comBloqueador?: boolean;
  tipoBloqueador?: "rele_combustivel" | "outro" | "sem_bloqueador";
  bloqueadorDetalhes?: string;
  kitConfirmadoInstalador?: boolean;
  imeiConfirmado?: string;
  status: StatusInstalacao;
  motivo?: string;
  observacoes?: string;
  releChicoteDoEstoque?: boolean;
}

export interface ConcluirInstalacaoAtendimentoPayload {
  instalacaoId: string;
  imeiConferido: string;
  comBloqueador: boolean;
  posicaoInstalacao: string;
  placa: string;
  chassi?: string;
  marca: string;
  modelo: string;
  ano?: number;
  cor?: string;
  tipoVeiculo?: string;
  kmInstalacao?: number;
  horimetroInicial?: number;
  observacoes?: string;
  releChicoteDoEstoque?: boolean;
}

export interface ResumoRepasseFinanceiro {
  totalInstalacoes: number;
  totalConcluidas: number;
  totalPendencias: number;
  totalNaoInstaladas: number;
  totalAgendadas?: number;
  valorTotalDevido: number;
  valorTotalPendente: number;
  valorTotalPago: number;
  valorPrevistoAgendadas?: number;
  // Campos canônicos do painel do instalador
  aReceber?: number;
  recebido?: number;
  agendadosQtd?: number;
  aAgendarQtd?: number;
  valorPrevistoAgendados?: number;
}

export interface SolicitarRetiradaPayload {
  veiculoId: string;
  instaladorId: string;
  valorRetirada?: number;
  motivo?: string;
  observacoes?: string;
}

export type TipoServicoInstalacao = "instalacao" | "retirada";

export interface SolicitarRemanejamentoPayload {
  veiculoOrigemId: string;
  clienteDestinoId?: string;
  novoVeiculoPlaca: string;
  novoVeiculoMarca: string;
  novoVeiculoModelo: string;
  novoVeiculoAno?: number;
  novoVeiculoCor?: string;
  instaladorId?: string;
  valorRetirada?: number;
  valorInstalacao?: number;
  motivo?: string;
  observacoes?: string;
}
