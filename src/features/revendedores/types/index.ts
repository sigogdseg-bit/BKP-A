// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Módulo Comercial: Revendedores e Vendedores (Types)
// ─────────────────────────────────────────────────────────────────────────────

export interface Revendedor {
  id: string;
  user_id?: string | null;
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  valor_base_sistema: number;
  chave_pix?: string | null;
  ativo: boolean;
  total_vendedores?: number;
  total_clientes?: number;
  faturamento_total_mensal?: number;
  cota_sistema_mensal?: number;
  margem_revendedor_mensal?: number;
  created_at: string;
  updated_at: string;
}

export interface Vendedor {
  id: string;
  revendedor_id: string;
  revendedor_nome?: string;
  user_id?: string | null;
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  valor_base_vendedor: number;
  valor_base_sistema?: number;
  chave_pix?: string | null;
  ativo: boolean;
  total_clientes?: number;
  faturamento_total_mensal?: number;
  comissao_vendedor_mensal?: number;
  repasse_revendedor_mensal?: number;
  cota_sistema_mensal?: number;
  created_at: string;
  updated_at: string;
}

export type TipoConviteComercial = "revendedor" | "vendedor" | "instalador" | "cliente";

export interface ConviteComercial {
  id: string;
  token: string;
  tipo_convite: TipoConviteComercial;
  criado_por?: string | null;
  criado_por_nome?: string | null;
  revendedor_id?: string | null;
  revendedor_nome?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  valor_mensalidade_proposta?: number | null;
  taxa_instalacao_proposta?: number | null;
  usado: boolean;
  usado_em?: string | null;
  expira_em: string;
  observacoes?: string | null;
  created_at: string;
}

export interface EtapasOnboardingCliente {
  id: string;
  cliente_id: string;
  cliente_nome?: string;
  etapa_atual: number; // 1 a 6
  taxa_paga: boolean;
  taxa_paga_em?: string | null;
  valor_taxa_instalacao?: number;
  instalador_atribuido_id?: string | null;
  instalador_nome?: string | null;
  instalador_telefone?: string | null;
  instalacao_concluida: boolean;
  instalacao_concluida_em?: string | null;
  contrato_assinado: boolean;
  contrato_assinado_em?: string | null;
  ativacao_operador_concluida: boolean;
  ativado_por_user_id?: string | null;
  ativado_em?: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SplitVendaCliente {
  cliente_id: string;
  cliente_nome: string;
  valor_mensalidade: number;
  taxa_instalacao: number;
  revendedor_id?: string | null;
  revendedor_nome?: string | null;
  vendedor_id?: string | null;
  vendedor_nome?: string | null;
  base_sistema: number;
  base_vendedor?: number | null;
  parte_sistema: number;
  parte_revendedor: number;
  parte_vendedor: number;
  destinatario_taxa_instalacao: "revendedor" | "vendedor" | "sistema";
  repasse_instalador_status: "pendente" | "pago" | "isento";
  valor_repasse_instalador: number;
}
