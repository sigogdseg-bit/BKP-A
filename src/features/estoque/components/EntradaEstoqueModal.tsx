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
} from "lucide-react";
import { toast } from "sonner";
import { registrarEntradaCompra } from "../services/estoqueService";
import type { ItemEstoque, Fornecedor, TemaEstoque } from "../types";

interface EntradaEstoqueModalProps {
  itens: ItemEstoque[];
  fornecedores: Fornecedor[];
  itemPreSelecionadoId?: string;
  tema?: TemaEstoque;
  onSalvo: () => void;
  onFechar: () => void;
}

export function EntradaEstoqueModal({
  itens,
  fornecedores,
  itemPreSelecionadoId,
  tema = "hunter_padrao",
  onSalvo,
  onFechar,
}: EntradaEstoqueModalProps) {
  const [itemId, setItemId] = useState(itemPreSelecionadoId || itens[0]?.id || "");
  const [quantidade, setQuantidade] = useState<number>(10);
  const [custoUnitario, setCustoUnitario] = useState<number>(() => {
    const it = itens.find((i) => i.id === (itemPreSelecionadoId || itens[0]?.id));
    return it ? it.custo_medio_unitario : 0;
  });
  const [fornecedorId, setFornecedorId] = useState(fornecedores[0]?.id || "");
  const [valorFrete, setValorFrete] = useState<number>(0);
  const [documentoFiscal, setDocumentoFiscal] = useState("");
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().split("T")[0]);
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const itemSelecionado = useMemo(() => itens.find((i) => i.id === itemId), [itens, itemId]);

  const subtotalItens = useMemo(() => {
    return Math.max(0, quantidade * custoUnitario);
  }, [quantidade, custoUnitario]);

  const valorTotal = useMemo(() => {
    return Math.max(0, subtotalItens + (Number(valorFrete) || 0));
  }, [subtotalItens, valorFrete]);

  const handleItemChange = (novoId: string) => {
    setItemId(novoId);
    const it = itens.find((i) => i.id === novoId);
    if (it && it.custo_medio_unitario > 0) {
      setCustoUnitario(it.custo_medio_unitario);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemId) {
      toast.error("Selecione o item de estoque a ser abastecido.");
      return;
    }

    if (quantidade <= 0) {
      toast.error("A quantidade a ser comprada deve ser maior que zero.");
      return;
    }

    if (custoUnitario <= 0) {
      toast.error("Informe um custo unitário válido para o material.");
      return;
    }

    setSalvando(true);
    try {
      const res = await registrarEntradaCompra({
        itemId,
        quantidade,
        custoUnitario,
        valorFrete: Number(valorFrete) || 0,
        fornecedorId: fornecedorId || undefined,
        documentoFiscal: documentoFiscal.trim() || undefined,
        dataPagamento,
        observacoes: observacoes.trim() || undefined,
      });

      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro inesperado ao registrar compra no estoque.");
    } finally {
      setSalvando(false);
    }
  };

  const isNeumorph = tema === "neumorphism_soft";
  const isStyleguide = tema === "product_styleguide";

  const modalContainerClass = isNeumorph
    ? "bg-[#fbf2e9] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[6px_6px_24px_#c3cfe2] dark:shadow-2xl border border-slate-300/70 dark:border-slate-800 rounded-[28px]"
    : isStyleguide
      ? "bg-[#FAFBFD] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-[#CBD5E1] dark:border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[28px]"
      : "bg-[#fbf2e9] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl rounded-3xl";

  const inputClass = isNeumorph
    ? "w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm shadow-xs border border-slate-300/70 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC]/30 focus:border-[#00CFCC] transition"
    : isStyleguide
      ? "w-full px-4 py-2.5 rounded-xl bg-[#F1F5F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm border border-[#CBD5E1] dark:border-slate-800 focus:border-[#00CFCC] focus:ring-2 focus:ring-[#00CFCC]/20 outline-none transition shadow-xs"
      : "w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm border border-slate-300/70 dark:border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-xs outline-none transition";

  const btnSubmitClass = isNeumorph
    ? "px-6 py-2.5 rounded-xl font-bold text-sm text-slate-900 bg-[#9EBCEE] hover:bg-[#00CFCC] hover:text-slate-950 shadow-xs transition-all flex items-center justify-center gap-2"
    : isStyleguide
      ? "px-6 py-2.5 rounded-xl font-black text-sm text-[#064E3B] bg-[#9EE5D4] hover:bg-[#86ddc7] shadow-[0_4px_12px_rgba(158,229,212,0.4)] border border-[#7ed7c0] active:scale-95 transition flex items-center justify-center gap-2"
      : "px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-500 transition flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <form
          onSubmit={handleSubmit}
          className={`relative w-full max-w-xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-hidden shadow-2xl ${modalContainerClass}`}
        >
          {/* Cabeçalho Fixo do Modal */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800/80 shrink-0 bg-white/70 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isNeumorph
                    ? "bg-[#fbf2e9] shadow-[2px_2px_5px_#c3cfe2] border border-slate-300/40 text-blue-600"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide">
                  Comprar Materiais (Entrada)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Abastecimento de estoque com lançamento automático no Financeiro
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="p-2 rounded-full hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corpo do Formulário com Rolagem Interna */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
            {/* Seleção do Item */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Material a Abastecer *
              </label>
              <select
                value={itemId}
                onChange={(e) => handleItemChange(e.target.value)}
                className={inputClass}
              >
                {itens.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.nome} (Saldo atual: {it.quantidade_atual} {it.unidade_medida})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantidade, Custo Unitário e Frete */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Quantidade Adquirida ({itemSelecionado?.unidade_medida || "unidade"}) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={quantidade}
                  onChange={(e) => setQuantidade(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Custo Unitário (R$) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={custoUnitario}
                  onChange={(e) => setCustoUnitario(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Valor do Frete (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorFrete || ""}
                  onChange={(e) => setValorFrete(Number(e.target.value))}
                  placeholder="0,00"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Card Resumo do Valor Total */}
            <div
              className={`p-4 rounded-2xl flex items-center justify-between ${
                isNeumorph
                  ? "bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 shadow-xs"
                  : isStyleguide
                    ? "bg-[#F1F5F9] dark:bg-slate-950 border border-[#CBD5E1] dark:border-slate-800 shadow-xs"
                    : "bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 shadow-xs"
              }`}
            >
              <div>
                <span className="text-xs uppercase tracking-wider block font-semibold text-slate-700 dark:text-slate-300">
                  Valor Total da Compra (com Frete)
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {quantidade} {itemSelecionado?.unidade_medida || "un"} x R${" "}
                  {custoUnitario.toFixed(2)} = R$ {subtotalItens.toFixed(2)}
                  {Number(valorFrete) > 0 && ` + Frete: R$ ${Number(valorFrete).toFixed(2)}`}
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  R${" "}
                  {valorTotal.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* Fornecedor */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Fornecedor do Material
              </label>
              <select
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
                className={inputClass}
              >
                <option value="">Fornecedor Avulso / Balcão</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome_fantasia} ({f.razao_social})
                  </option>
                ))}
              </select>
            </div>

            {/* NF e Data de Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Nota Fiscal / Pedido
                </label>
                <input
                  type="text"
                  value={documentoFiscal}
                  onChange={(e) => setDocumentoFiscal(e.target.value)}
                  placeholder="Ex: NF-e 45892"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Data do Lançamento
                </label>
                <input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Observações
              </label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Lote rastreadores Anatel, garantia 1 ano"
                className={inputClass}
              />
            </div>

            {/* Banner de Aviso da Integração Financeira */}
            <div className="p-3.5 rounded-2xl flex items-start gap-2.5 text-xs bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 shadow-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <span className="font-bold block text-slate-800 dark:text-slate-100">
                  Integração Financeira Automática Ativa
                </span>
                Ao confirmar esta compra, uma despesa operacional de R$ {valorTotal.toFixed(2)} será
                gerada imediatamente no módulo Financeiro e Fluxo de Caixa.
              </div>
            </div>
          </div>

          {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800/80 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs transition min-h-[44px] flex items-center justify-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className={`${btnSubmitClass} w-full sm:w-auto min-h-[44px]`}
            >
              {salvando ? (
                "Processando..."
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar Compra e Entrada</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
