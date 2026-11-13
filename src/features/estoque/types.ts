export type CategoriaItemEstoque = string;

export type UnidadeMedidaEstoque = string;

export type TipoMovimentacaoEstoque =
  "entrada_compra" | "saida_instalacao" | "saida_manutencao" | "ajuste_inventario" | "devolucao";

export type CategoriaFornecedor = string;

export type TemaEstoque = "hunter_padrao" | "neumorphism_soft" | "product_styleguide";

export interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj_cpf: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  categoria: string;
  chave_pix: string | null;
  dados_bancarios: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ItemEstoque {
  id: string;
  codigo_sku: string;
  nome: string;
  descricao: string | null;
  categoria: CategoriaItemEstoque;
  quantidade_atual: number;
  quantidade_minima: number;
  unidade_medida: UnidadeMedidaEstoque;
  custo_medio_unitario: number;
  custo_base?: number;
  custo_frete?: number;
  preco_venda?: number;
  markup_percentual?: number;
  localizacao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MovimentacaoEstoque {
  id: string;
  item_id: string;
  tipo: TipoMovimentacaoEstoque;
  quantidade: number;
  custo_unitario: number;
  valor_total: number;
  valor_frete?: number;
  saldo_anterior: number;
  saldo_posterior: number;
  fornecedor_id: string | null;
  instalacao_id: string | null;
  veiculo_id: string | null;
  instalador_id: string | null;
  despesa_id: string | null;
  documento_fiscal: string | null;
  observacao: string | null;
  data_movimento: string;
  created_at: string;
  item?: {
    nome: string;
    codigo_sku: string;
    unidade_medida: string;
    categoria: string;
  } | null;
  fornecedor?: {
    nome_fantasia: string;
    razao_social: string;
  } | null;
  instalacao?: {
    placa: string;
    modelo: string;
  } | null;
}

export interface EntradaEstoqueInput {
  itemId: string;
  quantidade: number;
  custoUnitario: number;
  valorFrete?: number;
  fornecedorId?: string;
  documentoFiscal?: string;
  dataPagamento?: string;
  observacoes?: string;
}

export interface NovoFornecedorInput {
  razaoSocial: string;
  nomeFantasia: string;
  cnpjCpf?: string;
  contatoNome?: string;
  telefone?: string;
  email?: string;
  categoria: CategoriaFornecedor;
  chavePix?: string;
  dadosBancarios?: string;
  observacoes?: string;
}

export interface ItemBaixaInstalacao {
  itemId: string;
  quantidade: number;
  observacao?: string;
}

export interface NovoItemEstoqueInput {
  id?: string;
  codigo_sku: string;
  nome: string;
  descricao?: string | null;
  categoria: string;
  quantidade_minima?: number;
  unidade_medida?: string;
  localizacao?: string | null;
  custo_medio_unitario?: number;
  custo_base?: number;
  custo_frete?: number;
  preco_venda?: number;
  markup_percentual?: number;
}

export interface EditarCompraInput {
  movimentacaoId: string;
  quantidade: number;
  custoUnitario: number;
  valorFrete?: number;
  fornecedorId?: string | null;
  documentoFiscal?: string | null;
  dataPagamento?: string;
  observacoes?: string | null;
}

export interface KitItemComposicao {
  id?: string;
  kit_id?: string;
  item_id: string;
  quantidade: number;
  item?: ItemEstoque;
  material?: ItemEstoque;
}

export interface KitEstoque {
  id: string;
  codigo_sku: string;
  nome: string;
  descricao?: string | null;
  custo_total: number;
  custo_mao_de_obra?: number;
  preco_venda: number;
  markup_percentual: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  itens: KitItemComposicao[];
}

export interface SalvarKitInput {
  id?: string;
  codigoSku?: string;
  codigo_sku?: string;
  nome: string;
  descricao?: string | null;
  custoTotal?: number;
  custo_total?: number;
  custo_mao_de_obra?: number;
  custoMaoDeObra?: number;
  precoVenda?: number;
  preco_venda?: number;
  markupPercentual?: number;
  markup_percentual?: number;
  itens: { itemId?: string; item_id?: string; quantidade: number }[];
}
