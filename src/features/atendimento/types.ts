import type { StatusAtendimento, PrioridadeAtendimento } from "@/integrations/supabase/types";

export interface Atendimento {
  id: string;
  numero_protocolo: number;
  cliente_id: string;
  cliente_nome?: string;
  veiculo_id?: string | null;
  veiculo_placa?: string | null;
  tipo: string;
  prioridade: PrioridadeAtendimento;
  status: StatusAtendimento;
  titulo: string;
  descricao_inicial: string;
  solucao_conclusao?: string | null;
  aberto_por?: string | null;
  finalizado_por?: string | null;
  finalizado_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtendimentoProvidencia {
  id: string;
  atendimento_id: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_role: string;
  providencia: string;
  ip_address?: string | null;
  created_at: string;
}
