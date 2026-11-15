import { useState, useMemo } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  ShoppingCart,
  DollarSign,
  Package,
  Calendar,
  FileText,
  Building2,
  Check,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { editarEntradaCompra, excluirMovimentacaoEstoque } from "../services/estoqueService";
import type { MovimentacaoEstoque, ItemEstoque, Fornecedor } from "../types";

interface EditarCompraModalProps {
  movimentacao: MovimentacaoEstoque;
  itens: ItemEstoque[];
  fornecedores: Fornecedor[];
  onSalvo: () => void;
  onFechar: () => void;
}

export function EditarCompraModal({
  movimentacao,
  itens,
  fornecedores,
  onSalvo,
  onFechar,
}: EditarCompraModalProps) {
  const itemVinculado = useMemo(() => {
    return (
      itens.find((i) => i.id === movimentacao.item_id) || {
        id: movimentacao.item_id,
        nome: movimentacao.item?.nome || "Material",
        codigo_sku: movimentacao.item?.codigo_sku || "SKU",
        unidade_medida: movimentacao.item?.unidade_medida || "unidade",
        categoria: movimentacao.item?.categoria || "Geral",
      }
    );
  }, [itens, movimentacao]);

  const [quantidade, setQuantidade] = useState<number>(movimentacao.quantidade);
  const [custoUnitario, setCustoUnitario] = useState<number>(movimentacao.custo_unitario);
  const [valorFrete, setValorFrete] = useState<number>(movimentacao.valor_frete || 0);
  const [fornecedorId, setFornecedorId] = useState(movimentacao.fornecedor_id || "");
  const [documentoFiscal, setDocumentoFiscal] = useState(movimentacao.documento_fiscal || "");
  const [dataPagamento, setDataPagamento] = useState(() => {
    if (movimentacao.data_movimento) {
      return movimentacao.data_movimento.split("T")[0];
    }
    return new Date().toISOString().split("T")[0];
  });
  const [observacoes, setObservacoes] = useState(movimentacao.observacao || "");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const subtotalItens = useMemo(() => {
    return Math.max(0, quantidade * custoUnitario);
  }, [quantidade, custoUnitario]);

  const valorTotal = useMemo(() => {
    return Math.max(0, subtotalItens + (Number(valorFrete) || 0));
  }, [subtotalItens, valorFrete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (quantidade <= 0) {
      toast.error("A quantidade comprada deve ser maior que zero.");
      return;
    }

    if (custoUnitario < 0) {
      toast.error("O custo unitário não pode ser negativo.");
      return;
    }

    setSalvando(true);
    try {
      const res = await editarEntradaCompra({
        movimentacaoId: movimentacao.id,
        quantidade,
        custoUnitario,
        valorFrete: Number(valorFrete) || 0,
        fornecedorId: fornecedorId || null,
        documentoFiscal: documentoFiscal.trim() || null,
        dataPagamento,
        observacoes: observacoes.trim() || null,
      });

      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro inesperado ao salvar alterações da compra.");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    const confirmou = window.confirm(
      `Deseja realmente estornar e excluir esta compra de ${movimentacao.quantidade} ${itemVinculado.unidade_medida} de "${itemVinculado.nome}"?\n\nO saldo em estoque será recalculado e o lançamento financeiro será removido.`,
    );

    if (!confirmou) return;

    setExcluindo(true);
    try {
      const res = await excluirMovimentacaoEstoque(movimentacao.id);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro ao estornar compra.");
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <div className="relative w-full max-w-2xl bg-[#eaf0f8] dark:bg-slate-900 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto transition-colors">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  Editar Compra de Material
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ajuste os dados da compra ou estorne a entrada no estoque
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formulário */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar"
          >
            {/* Card Resumo do Material Vinculado */}
            <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                <div>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                    {itemVinculado.codigo_sku}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {itemVinculado.nome}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Categoria: {itemVinculado.categoria}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 dark:text-slate-400">Unidade</span>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {itemVinculado.unidade_medida}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Fornecedor */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Fornecedor
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={fornecedorId}
                    onChange={(e) => setFornecedorId(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="">Sem fornecedor vinculado (Compra avulsa)</option>
                    {fornecedores.map((forn) => (
                      <option key={forn.id} value={forn.id}>
                        {forn.nome_fantasia} {forn.razao_social ? `(${forn.razao_social})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantidade */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Quantidade
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={quantidade || ""}
                    onChange={(e) => setQuantidade(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Custo Unitário */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Custo Unitário (R$)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={custoUnitario || ""}
                    onChange={(e) => setCustoUnitario(parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Valor do Frete */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Valor do Frete (R$)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorFrete || ""}
                    onChange={(e) => setValorFrete(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Data do Movimento / Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Data do Registro
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* NF ou Documento Fiscal */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Número da NF / Pedido
                </label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ex: NF-e 12345"
                    value={documentoFiscal}
                    onChange={(e) => setDocumentoFiscal(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Observações
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalhes ou justificativa da alteração..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                />
              </div>
            </div>

            {/* Card Totalizador */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                <span>Subtotal dos materiais:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    subtotalItens,
                  )}
                </span>
              </div>
              {valorFrete > 0 && (
                <div className="flex justify-between items-center text-xs text-orange-600 dark:text-orange-400">
                  <span>Frete:</span>
                  <span className="font-semibold">
                    +{" "}
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                      valorFrete,
                    )}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 dark:border-slate-700/60 pt-2 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Valor Total da Compra:
                </span>
                <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    valorTotal,
                  )}
                </span>
              </div>
            </div>
          </form>

          {/* Rodapé com Ações: Excluir / Salvar */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
            <button
              type="button"
              onClick={handleExcluir}
              disabled={excluindo || salvando}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs sm:text-sm font-bold transition-all disabled:opacity-50 min-h-[44px]"
              title="Estornar entrada no estoque e remover despesa financeira"
            >
              <Trash2 className="w-4 h-4" />
              <span>{excluindo ? "Estornando..." : "Excluir Compra"}</span>
            </button>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando || excluindo}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={salvando || excluindo}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 min-h-[44px]"
              >
                <Check className="w-4 h-4" />
                <span>{salvando ? "Salvando..." : "Salvar Alterações"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
