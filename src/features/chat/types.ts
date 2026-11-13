// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Tipos do Chat Interativo em Tempo Real
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMensagem {
  id: string;
  remetente_id: string;
  remetente_nome?: string;
  destinatario_id: string;
  mensagem: string;
  lida: boolean;
  lida_at?: string | null;
  created_at: string;
}

export interface ConversaRealizada {
  interlocutorId: string;
  interlocutorNome: string;
  interlocutorRole: string;
  interlocutorOnline?: boolean;
  ultimaMensagem: string;
  ultimaData: string;
  totalMensagens: number;
}

export interface ChatPresenca {
  user_id: string;
  nome: string;
  role: string;
  cliente_id?: string | null;
  online: boolean;
  ultimo_heartbeat?: string;
  updated_at?: string;
}

export interface ContatoOnline {
  userId: string;
  nome: string;
  role: string;
  email?: string;
  online?: boolean;
  visivelNoChat?: boolean;
  clienteId?: string | null;
  ultimaMensagem?: string;
  ultimaMensagemAt?: string;
  naoLidas: number;
}
