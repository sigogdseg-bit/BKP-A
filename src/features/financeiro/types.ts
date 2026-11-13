export type TipoTransacao = "entrada" | "saida";

export type StatusTransacao = "pendente" | "concluido" | "cancelado";

export type CategoriaTransacao =
  | "mensalidade"
  | "repasse_instalador"
  | "repasse_revendedor"
  | "repasse_vendedor"
  | "chips_conectividade"
  | "infraestrutura_servidores"
  | "aquisicao_equipamentos"
  | "material_consumo"
  | "despesa_administrativa"
  | "receita_avulsa"
  | "outros";

export type ModalidadeDespesa = "avulsa" | "parcelada" | "recorrente";
export type MoedaTransacao = "BRL" | "USD";
export type FontePagamentoTransacao = "caixa_empresa" | "operador_adm";
export type StatusRessarcimento = "nao_aplicavel" | "pendente" | "ressarcido";

export interface TransacaoFinanceira {
  id: string;
  tipo: TipoTransacao;
  categoria: CategoriaTransacao;
  descricao: string;
  valor: number;
  data_competencia: string;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  status: StatusTransacao;
  mensalidade_id?: string | null;
  instalacao_id?: string | null;
  cliente_id?: string | null;
  instalador_id?: string | null;
  revendedor_id?: string | null;
  vendedor_id?: string | null;
  comprovante_url?: string | null;
  observacoes?: string | null;
  recorrencia_id?: string | null;
  modalidade?: ModalidadeDespesa;
  parcela_atual?: number | null;
  total_parcelas?: number | null;
  recorrencia_ativa?: boolean;
  moeda?: MoedaTransacao;
  valor_moeda_original?: number | null;
  cotacao_moeda?: number | null;
  fonte_pagamento?: FontePagamentoTransacao;
  responsavel_pagamento_id?: string | null;
  responsavel_pagamento_nome?: string | null;
  status_ressarcimento?: StatusRessarcimento;
  data_ressarcimento?: string | null;
  liquidado_pelo_cliente?: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  clientes?: {
    nome_razao_social: string;
  } | null;
  instalador?: {
    nome: string;
  } | null;
  revendedores?: {
    id: string;
    nome: string;
    chave_pix?: string | null;
  } | null;
  vendedores?: {
    id: string;
    nome: string;
    chave_pix?: string | null;
  } | null;
}

export interface ResumoFluxoCaixa {
  saldoAtual: number;
  entradasRealizadas: number;
  entradasPrevistas: number;
  saidasRealizadas: number;
  saidasPrevistas: number;
  totalTransacoes: number;
  saldoAnteriorTransportado?: number;
  saldoProjetadoFinal?: number;
}

export interface DREOperacional {
  receitaBruta: number;
  custoInstalacoes: number;
  custoConectividade: number;
  despesasOperacionais: number;
  lucroOperacionalLiquido: number;
  margemOperacionalPercentual: number;
}

export interface NovaTransacaoInput {
  tipo: TipoTransacao;
  categoria: CategoriaTransacao;
  descricao: string;
  valor: number;
  data_competencia: string;
  data_vencimento?: string;
  status: StatusTransacao;
  observacoes?: string;
  modalidade?: ModalidadeDespesa;
  quantidadeParcelas?: number;
  tipoValor?: "parcela" | "total";
  moeda?: MoedaTransacao;
  valorMoedaOriginal?: number;
  cotacaoMoeda?: number;
  fonte_pagamento?: FontePagamentoTransacao;
  responsavel_pagamento_id?: string | null;
  responsavel_pagamento_nome?: string | null;
  status_ressarcimento?: StatusRessarcimento;
  data_ressarcimento?: string | null;
}

export interface ResumoRessarcimentoPorResponsavel {
  id: string;
  nome: string;
  totalPendente: number;
  totalRessarcido: number;
  totalGeral: number;
  quantidadePendente: number;
  quantidadeRessarcida: number;
}

export interface ResumoRessarcimento {
  totalPendente: number;
  totalRessarcido: number;
  totalGeral: number;
  quantidadePendente: number;
  quantidadeRessarcida: number;
  quantidadeTotal: number;
  porResponsavel: ResumoRessarcimentoPorResponsavel[];
}

export interface FiltrosFinanceiro {
  busca: string;
  periodo: "mes_atual" | "mes_proximo" | "ano_atual" | "todos" | "personalizado" | string;
  mes?: string;
  ano?: string;
  tipo: "todos" | "entrada" | "saida";
  categoria: string;
  status: string;
  fonte_pagamento?: "todas" | FontePagamentoTransacao;
  responsavel_pagamento_id?: string;
  status_ressarcimento?: "todos" | "pendente" | "ressarcido";
}

export interface MensalidadeInadimplente {
  id: string;
  mes_referencia: number;
  ano_referencia: number;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  valor: number;
  data_vencimento: string;
  diasAtraso: number;
  status: string;
}

export interface ClienteInadimplente {
  cliente_id: string;
  nome_razao_social: string;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  status_cliente: string;
  totalDevido: number;
  qtdMensalidadesAtrasadas: number;
  maiorAtrasoDias: number;
  mensalidadeMaisAntigaVencimento: string;
  mensalidades: MensalidadeInadimplente[];
}

export interface ResumoInadimplencia {
  totalInadimplente: number;
  totalClientesInadimplentes: number;
  totalMensalidadesVencidas: number;
  maiorAtrasoGeralDias: number;
}

export interface ProjecaoMensal {
  chaveMes: string;
  mesRotulo: string;
  ano: number;
  mes: number;
  caixaInicialTransportado: number;
  receitasRealizadas: number;
  receitasPrevistas: number;
  receitasTotal: number;
  despesasRealizadas: number;
  despesasPrevistas: number;
  despesasTotal: number;
  resultadoLiquidoMes: number;
  saldoFinalProjetado: number;
  isPassadoOuAtual: boolean;
}

export interface MetricasExecutivas {
  mrrAtual: number;
  arrProjetado: number;
  despesasRecorrentesFixas: number;
  lucroOperacionalProjetado: number;
  margemMediaProjetada: number;
  totalContratosAtivos: number;
}

export * from "./types/proposta";
