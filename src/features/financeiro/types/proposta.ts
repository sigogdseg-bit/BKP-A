export type StatusProposta = "pendente" | "enviada" | "aceita" | "recusada" | "expirada";

export type TipoProposta = "individual" | "frota";

export interface FaixaFrota {
  chave: "ate_4" | "5_a_9" | "10_a_14" | "acima_15";
  rotulo: string;
  min: number;
  max: number | null;
  instalacao_com_fidelidade: number;
  mensalidade_com_fidelidade: number;
  instalacao_sem_fidelidade: number;
  mensalidade_sem_fidelidade: number;
}

export interface HistoricoContraproposta {
  data: string;
  operador?: string | null;
  motivo?: string | null;
  resumo_alteracoes?: string | null;
}

export interface PropostaComercial {
  id: string;
  numero_proposta: string;
  tipo_proposta?: TipoProposta;
  cliente_nome: string;
  cliente_telefone: string;
  veiculo_marca?: string | null;
  veiculo_modelo?: string | null;
  veiculo_ano?: string | null;
  com_fidelidade_meses: number;
  com_fidelidade_instalacao_cheia?: number;
  com_fidelidade_mensalidade_cheia?: number;
  com_fidelidade_instalacao: number;
  com_fidelidade_mensalidade: number;
  sem_fidelidade_instalacao_cheia?: number;
  sem_fidelidade_mensalidade_cheia?: number;
  sem_fidelidade_instalacao: number;
  sem_fidelidade_mensalidade: number;
  aplicar_promocao?: boolean;
  faixas_frota?: FaixaFrota[] | null;
  historico_contrapropostas?: HistoricoContraproposta[] | null;
  status: StatusProposta;
  observacoes?: string | null;
  hash_sha256?: string | null;
  created_by?: string | null;
  revendedor_id?: string | null;
  vendedor_id?: string | null;
  quantidade_veiculos?: number;
  origem_emissao?: "web" | "whatsapp";
  valor_base_repasse?: number;
  created_at: string;
  updated_at: string;
}

export interface NovaPropostaInput {
  tipo_proposta?: TipoProposta;
  cliente_nome: string;
  cliente_telefone: string;
  veiculo_marca?: string;
  veiculo_modelo?: string;
  veiculo_ano?: string;
  com_fidelidade_meses: number;
  com_fidelidade_instalacao_cheia?: number;
  com_fidelidade_mensalidade_cheia?: number;
  com_fidelidade_instalacao: number;
  com_fidelidade_mensalidade: number;
  sem_fidelidade_instalacao_cheia?: number;
  sem_fidelidade_mensalidade_cheia?: number;
  sem_fidelidade_instalacao: number;
  sem_fidelidade_mensalidade: number;
  aplicar_promocao?: boolean;
  faixas_frota?: FaixaFrota[];
  observacoes?: string;
  revendedor_id?: string | null;
  vendedor_id?: string | null;
  quantidade_veiculos?: number;
  origem_emissao?: "web" | "whatsapp";
  valor_base_repasse?: number;
}

export interface EditarPropostaInput {
  cliente_nome: string;
  cliente_telefone: string;
  tipo_proposta: TipoProposta;
  veiculo_marca?: string;
  veiculo_modelo?: string;
  veiculo_ano?: string;
  com_fidelidade_meses: number;
  com_fidelidade_instalacao_cheia?: number;
  com_fidelidade_mensalidade_cheia?: number;
  com_fidelidade_instalacao: number;
  com_fidelidade_mensalidade: number;
  sem_fidelidade_instalacao_cheia?: number;
  sem_fidelidade_mensalidade_cheia?: number;
  sem_fidelidade_instalacao: number;
  sem_fidelidade_mensalidade: number;
  aplicar_promocao?: boolean;
  faixas_frota?: FaixaFrota[];
  status?: StatusProposta;
  observacoes?: string;
  motivo_contraproposta?: string;
  revendedor_id?: string | null;
  vendedor_id?: string | null;
  quantidade_veiculos?: number;
  origem_emissao?: "web" | "whatsapp";
  valor_base_repasse?: number;
}

export interface MetricasPropostas {
  total: number;
  pendentes: number;
  aceitas: number;
  recusadas: number;
  expiradas: number;
  taxaConversao: number;
}

export interface FiltrosPropostas {
  busca: string;
  status: "todos" | StatusProposta;
  tipo: "todos" | TipoProposta;
}

// Configuração padrão das 4 faixas de frota
export const FAIXAS_FROTA_PADRAO: FaixaFrota[] = [
  {
    chave: "ate_4",
    rotulo: "Até 4 veículos",
    min: 1,
    max: 4,
    instalacao_com_fidelidade: 140,
    mensalidade_com_fidelidade: 69.9,
    instalacao_sem_fidelidade: 240,
    mensalidade_sem_fidelidade: 89.9,
  },
  {
    chave: "5_a_9",
    rotulo: "De 5 a 9 veículos",
    min: 5,
    max: 9,
    instalacao_com_fidelidade: 120,
    mensalidade_com_fidelidade: 64.9,
    instalacao_sem_fidelidade: 210,
    mensalidade_sem_fidelidade: 84.9,
  },
  {
    chave: "10_a_14",
    rotulo: "De 10 a 14 veículos",
    min: 10,
    max: 14,
    instalacao_com_fidelidade: 100,
    mensalidade_com_fidelidade: 59.9,
    instalacao_sem_fidelidade: 180,
    mensalidade_sem_fidelidade: 79.9,
  },
  {
    chave: "acima_15",
    rotulo: "Acima de 15 veículos",
    min: 15,
    max: null,
    instalacao_com_fidelidade: 80,
    mensalidade_com_fidelidade: 54.9,
    instalacao_sem_fidelidade: 150,
    mensalidade_sem_fidelidade: 74.9,
  },
];

// Valores Padrão Oficiais do Hunter (Diretrizes Comerciais: Cheio "De:" vs Promocional "Por:")
export const VALORES_PADRAO_PROPOSTA = {
  com_fidelidade_meses: 12,
  com_fidelidade_instalacao_cheia: 380,
  com_fidelidade_mensalidade_cheia: 120,
  com_fidelidade_instalacao: 150,
  com_fidelidade_mensalidade: 69.9,
  sem_fidelidade_instalacao_cheia: 420,
  sem_fidelidade_mensalidade_cheia: 160,
  sem_fidelidade_instalacao: 250,
  sem_fidelidade_mensalidade: 89.9,
  aplicar_promocao: true,
};
