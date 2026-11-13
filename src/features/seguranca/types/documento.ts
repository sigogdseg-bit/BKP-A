export interface DocumentoEmitido {
  id: string;
  nome_arquivo: string;
  hash_sha256: string;
  tipo_documento: string;
  descricao: string;
  emissor_nome: string;
  emissor_email: string;
  emissor_user_id?: string | null;
  emissor_role?: string | null;
  tamanho_bytes?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RegistrarDocumentoInput {
  nome_arquivo: string;
  hash_sha256: string;
  tipo_documento: string;
  descricao: string;
  emissor_nome?: string;
  emissor_email?: string;
  emissor_user_id?: string | null;
  emissor_role?: string;
  tamanho_bytes?: number;
  metadata?: Record<string, any>;
}

export interface ResultadoVerificacaoDocumento {
  integro: boolean;
  documento?: DocumentoEmitido;
  hashCalculado: string;
  nomeArquivoEnviado?: string;
  tamanhoArquivoEnviado?: number;
  mensagem: string;
}
