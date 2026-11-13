import type { StatusMensalidade } from "@/integrations/supabase/types";

export type { StatusMensalidade };

export interface MensalidadeItem {
  id: string;
  cliente_id: string;
  mes_referencia: number;
  ano_referencia: number;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  valor: number;
  data_vencimento: string;
  status: StatusMensalidade;
  data_pagamento?: string | null;
  comprovante_url?: string | null;
  pagamento_informado_em?: string | null;
  pagamento_informado_obs?: string | null;
  created_at: string;
  updated_at: string;
  clientes?: {
    id: string;
    nome_razao_social: string;
    documento?: string | null;
    telefone?: string | null;
    email?: string | null;
  } | null;
}

export interface ResumoFinanceiroMensalidades {
  totalPrevisto: number;
  totalRecebido: number;
  totalPendente: number;
  totalVencido: number;
  qtdTotal: number;
  qtdRecebido: number;
  qtdPendente: number;
  qtdVencido: number;
}

export interface NovaMensalidadeInput {
  cliente_id: string;
  mes_referencia: number;
  ano_referencia: number;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  valor: number;
  data_vencimento: string;
  status?: StatusMensalidade;
}
