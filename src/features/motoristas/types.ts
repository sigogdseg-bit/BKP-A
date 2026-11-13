// ============================================================================
// MÓDULO MOTORISTAS — Tipos Canônicos
// Projeto: Hunter · Diretrizes: DJR-NEW · Zero Mock · RLS Estrito
// ============================================================================

// ---------------------------------------------------------------------------
// CNH
// ---------------------------------------------------------------------------
export type CategoriaCNH = "A" | "B" | "AB" | "C" | "D" | "E" | "ACC";

export type StatusCNH = "ok" | "a_vencer" | "vencida" | "sem_data";

// ---------------------------------------------------------------------------
// Motorista
// ---------------------------------------------------------------------------
export interface Motorista {
  id: string;
  cliente_id: string;
  user_id?: string | null;

  // Dados pessoais
  nome: string;
  cpf?: string | null;
  data_nascimento?: string | null; // ISO date
  telefone?: string | null;
  email: string;

  // CNH
  cnh_numero?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null; // ISO date
  cnh_primeira_habilitacao?: string | null; // ISO date
  cnh_renach?: string | null;
  cnh_observacoes?: string | null;
  cnh_foto_url?: string | null;

  // Permissões
  acesso_mapa: boolean;

  // Status
  ativo: boolean;

  // Auditoria
  created_at: string;
  updated_at: string;

  // Campos computados (join)
  cliente_nome?: string | null;
  status_cnh?: StatusCNH;
  dias_para_vencer?: number | null;
}

export interface MotoristaForm {
  nome: string;
  email: string;
  senha: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
  cnh_primeira_habilitacao: string;
  cnh_renach: string;
  cnh_observacoes: string;
  acesso_mapa: boolean;
}

// ---------------------------------------------------------------------------
// Vínculo Motorista ↔ Veículo
// ---------------------------------------------------------------------------
export interface MotoristaVeiculo {
  id: string;
  motorista_id: string;
  veiculo_id: string;
  ativo: boolean;
  created_at: string;
  // Join
  veiculo_placa?: string;
  veiculo_modelo?: string;
  veiculo_cor?: string;
  odometro_km?: number | string | null;
}

// ---------------------------------------------------------------------------
// NF — Ciclo de vida do arquivo em Storage (bucket: nfs-temp)
// ---------------------------------------------------------------------------
export interface NfCicloVida {
  nf_foto_url?: string | null;
  nf_upload_em?: string | null; // TIMESTAMPTZ ISO
  nf_baixado: boolean;
  nf_baixado_em?: string | null;
  nf_ciente_em?: string | null; // quando cliente clicou "Estou ciente"
  nf_expirado: boolean;
}

export type StatusNF =
  | "sem_arquivo" // nunca teve arquivo
  | "disponivel" // upload recente, dentro das 24h iniciais
  | "aguardando_ciencia" // passou 24h do upload, aguarda "Estou ciente"
  | "aguardando_expiracao" // cliente deu ciência, aguarda mais 24h p/ deletar
  | "baixado_pendente_exclusao" // cliente baixou, mas ainda não apagou do Storage
  | "baixado" // cliente baixou (arquivo deletado do Storage)
  | "expirado"; // prazo passou, arquivo deletado

export function calcularStatusNF(nf: NfCicloVida): StatusNF {
  if (!nf.nf_foto_url && !nf.nf_expirado && !nf.nf_baixado) return "sem_arquivo";
  // Se baixado e sem arquivo -> fluxo completo antigo
  if (nf.nf_baixado && !nf.nf_foto_url) return "baixado";
  // Se baixado mas a foto ainda existe -> aguardando confirmar
  if (nf.nf_baixado && nf.nf_foto_url) return "baixado_pendente_exclusao";
  if (nf.nf_expirado) return "expirado";
  if (!nf.nf_foto_url) return "sem_arquivo";

  const agora = Date.now();
  const uploadMs = nf.nf_upload_em ? new Date(nf.nf_upload_em).getTime() : 0;
  const VINTE_QUATRO_H = 24 * 60 * 60 * 1000;

  if (nf.nf_ciente_em) {
    const cienMs = new Date(nf.nf_ciente_em).getTime();
    if (agora >= cienMs + VINTE_QUATRO_H) return "expirado"; // cleanup pendente
    return "aguardando_expiracao";
  }

  if (uploadMs && agora >= uploadMs + VINTE_QUATRO_H) return "aguardando_ciencia";
  return "disponivel";
}

// ---------------------------------------------------------------------------
// Abastecimento
// ---------------------------------------------------------------------------
export type TipoCombustivel =
  "gasolina" | "gasolina_aditivada" | "etanol" | "diesel" | "diesel_s10" | "gnv" | "eletrico";

export interface Abastecimento extends NfCicloVida {
  id: string;
  motorista_id: string;
  veiculo_id: string;
  cliente_id: string;

  data_abastecimento: string; // ISO date
  km_atual?: number | null;
  litros: number;
  valor_total: number;
  valor_por_litro?: number | null;
  combustivel: TipoCombustivel;
  posto_nome?: string | null;
  posto_cidade?: string | null;
  nf_numero?: string | null;
  observacoes?: string | null;

  created_at: string;
  updated_at: string;

  // Join
  motorista_nome?: string;
  veiculo_placa?: string;
}

export interface AbastecimentoForm {
  veiculo_id: string;
  data_abastecimento: string;
  km_atual: string;
  litros: string;
  valor_total: string;
  valor_por_litro: string;
  combustivel: TipoCombustivel;
  posto_nome: string;
  posto_cidade: string;
  nf_numero: string;
  observacoes: string;
}

// ---------------------------------------------------------------------------
// Despesa
// ---------------------------------------------------------------------------
export type CategoriaDespesa =
  "pedagio" | "estacionamento" | "lavagem" | "multa" | "refeicao" | "hospedagem" | "outro";

export interface Despesa extends NfCicloVida {
  id: string;
  motorista_id: string;
  veiculo_id: string;
  cliente_id: string;

  data_despesa: string; // ISO date
  categoria: CategoriaDespesa;
  descricao: string;
  valor: number;
  km_atual?: number | null;
  nf_numero?: string | null;
  observacoes?: string | null;

  created_at: string;
  updated_at: string;

  // Join
  motorista_nome?: string;
  veiculo_placa?: string;
}

export interface DespesaForm {
  veiculo_id: string;
  data_despesa: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valor: string;
  km_atual: string;
  nf_numero: string;
  observacoes: string;
}

// ---------------------------------------------------------------------------
// Alerta CNH (view alertas_cnh_motoristas)
// ---------------------------------------------------------------------------
export interface AlertaCNH {
  motorista_id: string;
  cliente_id: string;
  nome: string;
  email: string;
  cnh_numero?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  status_cnh: StatusCNH;
  dias_para_vencer?: number | null;
}

// ---------------------------------------------------------------------------
// Alerta pendente de NF (para modal bloqueante do cliente)
// ---------------------------------------------------------------------------
export interface NfPendenteAlerta {
  id: string;
  tipo: "abastecimento" | "despesa";
  motorista_nome: string;
  veiculo_placa: string;
  data_registro: string;
  valor: number;
  nf_upload_em: string;
  nf_ciente_em?: string | null;
  status: StatusNF;
  /** path no storage para download */
  nf_foto_url: string;
}

// ---------------------------------------------------------------------------
// Perfil do motorista (retorno do RPC get_meu_perfil_motorista)
// ---------------------------------------------------------------------------
export interface PerfilMotorista {
  id: string;
  nome: string;
  email: string;
  cpf?: string | null;
  telefone?: string | null;
  cnh_numero?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  cnh_foto_url?: string | null;
  acesso_mapa: boolean;
  cliente_id: string;
  cliente_nome: string;
}

// ---------------------------------------------------------------------------
// OCR CNH
// ---------------------------------------------------------------------------
export interface OcrCnhResultado {
  nome?: string;
  cpf?: string;
  data_nascimento?: string;
  cnh_numero?: string;
  cnh_categoria?: string;
  cnh_validade?: string;
  cnh_primeira_habilitacao?: string;
  cnh_renach?: string;
  cnh_observacoes?: string;
  confianca: "alta" | "media" | "baixa";
  campos_extraidos: string[];
}
