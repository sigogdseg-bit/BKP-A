// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Tipos Canônicos do Módulo Demonstração (Sandbox Virtual)
// ─────────────────────────────────────────────────────────────────────────────

export type TipoJornadaDemonstracao = "cliente" | "instalador";

export interface ClienteFantasma {
  id: string;
  nome_razao_social: string;
  documento: string;
  email: string;
  telefone: string;
  plano: string;
  valor_plano: number;
  dia_vencimento: number;
  veiculos: Array<{
    id: string;
    placa: string;
    marca_modelo: string;
    cor: string;
    ano: number;
    tipo_veiculo: string;
    rastreador_id?: string;
    rastreador_imei?: string;
  }>;
}

export interface InstaladorFantasma {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  telefone: string;
  chave_pix: string;
  endereco_instalacao: string;
  valor_sem_bloqueador: string;
  valor_com_bloqueador: string;
  ativo: boolean;
}

export interface KitFantasma {
  id: string;
  rastreador_id: string;
  imei: string;
  modelo: string;
  serial: string;
  chip_id: string;
  chip_linha: string;
  chip_operadora: string;
  chip_iccid: string;
}

export interface OrdemServicoFantasma {
  id: string;
  numero_os: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  veiculo_id: string;
  veiculo_placa: string;
  veiculo_modelo: string;
  veiculo_cor: string;
  veiculo_ano: number;
  instalador_id: string;
  instalador_nome: string;
  rastreador_imei: string;
  chip_linha: string;
  chip_operadora: string;
  data_agendamento: string;
  horario_agendamento: string;
  endereco_instalacao: string;
  status: "agendado" | "em_andamento" | "concluido";
  com_bloqueador: boolean;
  observacoes?: string;
  fotos?: string[];
  assinatura_cliente?: string;
  concluido_em?: string;
  kit_confirmado_instalador?: boolean;
  kit_confirmado_em?: string | null;
  imei_confirmado?: string | null;
}

export interface EstadoDemonstracao {
  ativo: boolean;
  jornadaAtual: TipoJornadaDemonstracao | null;
  etapaAtual: number;
  iniciadoEm: string;
  cliente: ClienteFantasma;
  instalador: InstaladorFantasma;
  kit: KitFantasma;
  ordemServico: OrdemServicoFantasma;
  etapasConcluidas: string[];
}
