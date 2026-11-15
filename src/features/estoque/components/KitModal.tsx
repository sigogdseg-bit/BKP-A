import { useState, useEffect, useMemo } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  Layers,
  Plus,
  Trash2,
  Check,
  Hash,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { salvarKitEstoque, excluirKitEstoque } from "../services/estoqueService";
import {
  PRESETS_MARKUP,
  calcularPrecoPorMarkup,
  analisarPrecoVenda,
} from "../utils/calculadoraMarkup";
import type { KitEstoque, ItemEstoque, TemaEstoque, SalvarKitInput } from "../types";

function calcularProximoCodigoSkuKit(kits: KitEstoque[] = []): string {
  let maiorNumero = 0;
  for (const k of kits) {
    const match = k.codigo_sku?.match(/^KIT-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maiorNumero) {
        maiorNumero = num;
      }
    }
  }
  const proximo = Math.max(maiorNumero + 1, kits.length + 1);
  return `KIT-${String(proximo).padStart(4, "0")}`;
}

interface KitModalProps {
  kitParaEdicao?: KitEstoque | null;
  kitsExistentes?: KitEstoque[];
  materiaisDisponiveis: ItemEstoque[];
  tema?: TemaEstoque;
  podeVerCustos?: boolean;
  onSalvo: () => void;
  onFechar: () => void;
}

export function KitModal({
  kitParaEdicao,
  kitsExistentes = [],
  materiaisDisponiveis,
  tema = "hunter_padrao",
  podeVerCustos = true,
  onSalvo,
  onFechar,
}: KitModalProps) {
  const [codigoSku, setCodigoSku] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [itensComposicao, setItensComposicao] = useState<{ itemId: string; quantidade: number }[]>(
    [],
  );
  const [custoMaoDeObra, setCustoMaoDeObra] = useState<number>(0);
  const [markupPercentual, setMarkupPercentual] = useState<number>(50);
  const [precoVenda, setPrecoVenda] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Calcula custo dos materiais somando (quantidade * custo_medio_unitario) de cada item
  const custoMateriaisCalculado = useMemo(() => {
    return itensComposicao.reduce((acc, comp) => {
      const mat = materiaisDisponiveis.find((m) => m.id === comp.itemId);
      const custoUnit = mat ? Number(mat.custo_medio_unitario || 0) : 0;
      return acc + comp.quantidade * custoUnit;
    }, 0);
  }, [itensComposicao, materiaisDisponiveis]);

  // Custo Total = Insumos/Materiais + Mão de Obra Técnica
  const custoTotalCalculado = useMemo(() => {
    return custoMateriaisCalculado + (Number(custoMaoDeObra) || 0);
  }, [custoMateriaisCalculado, custoMaoDeObra]);

  // Análise em tempo real de rentabilidade
  const analise = useMemo(() => {
    return analisarPrecoVenda(custoTotalCalculado, precoVenda);
  }, [custoTotalCalculado, precoVenda]);

  useEffect(() => {
    if (kitParaEdicao) {
      setCodigoSku(kitParaEdicao.codigo_sku);
      setNome(kitParaEdicao.nome);
      setDescricao(kitParaEdicao.descricao || "");
      setCustoMaoDeObra(Number(kitParaEdicao.custo_mao_de_obra || 0));
      setMarkupPercentual(kitParaEdicao.markup_percentual || 50);
      setPrecoVenda(kitParaEdicao.preco_venda || 0);

      const comps = kitParaEdicao.itens.map((it) => ({
        itemId: it.item_id,
        quantidade: it.quantidade,
      }));
      setItensComposicao(comps);
    } else {
      setCodigoSku(calcularProximoCodigoSkuKit(kitsExistentes));
      setNome("");
      setDescricao("");
      setCustoMaoDeObra(0);
      setMarkupPercentual(50);
      setPrecoVenda(0);
      setItensComposicao([]);
    }
  }, [kitParaEdicao, kitsExistentes]);

  // Recalcula preco de venda quando os itens e seus custos mudarem, se preco for 0
  const aplicarMarkupAutomatico = (markup: number) => {
    setMarkupPercentual(markup);
    const novoPreco = calcularPrecoPorMarkup(custoTotalCalculado, markup);
    setPrecoVenda(novoPreco);
  };

  // Ao alterar custo total de itens, atualiza o preco de venda sugerido caso usuario esteja usando markup padrão
  const handleItemQuantidadeChange = (itemId: string, qtd: number) => {
    setItensComposicao((prev) => {
      const index = prev.findIndex((i) => i.itemId === itemId);
      if (qtd <= 0) {
        return prev.filter((i) => i.itemId !== itemId);
      }
      if (index >= 0) {
        const cop = [...prev];
        cop[index] = { itemId, quantidade: qtd };
        return cop;
      } else {
        return [...prev, { itemId, quantidade: qtd }];
      }
    });
  };

  const handleExcluir = async () => {
    if (!kitParaEdicao) return;
    const confirmou = window.confirm(
      `Deseja realmente excluir o kit "${kitParaEdicao.nome}" (${kitParaEdicao.codigo_sku})?\n\nEsta ação removerá o kit do catálogo.`,
    );
    if (!confirmou) return;

    setExcluindo(true);
    try {
      const res = await excluirKitEstoque(kitParaEdicao.id);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro ao excluir o kit.");
    } finally {
      setExcluindo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!codigoSku.trim() || !nome.trim()) {
      toast.error("Preencha o código SKU e o nome do kit.");
      return;
    }

    if (itensComposicao.length === 0) {
      toast.error("Adicione ao menos um material para compor o kit.");
      return;
    }

    setSalvando(true);
    try {
      const payload: SalvarKitInput = {
        id: kitParaEdicao ? kitParaEdicao.id : undefined,
        codigo_sku: codigoSku,
        nome,
        descricao,
        custo_total: custoTotalCalculado,
        custo_mao_de_obra: custoMaoDeObra,
        preco_venda: precoVenda,
        markup_percentual: markupPercentual,
        itens: itensComposicao.map((i) => ({
          item_id: i.itemId,
          quantidade: i.quantidade,
        })),
      };

      const res = await salvarKitEstoque(payload);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro inesperado ao salvar kit de estoque.");
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
    ? "w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm shadow-xs border border-slate-300/70 dark:border-slate-800 outline-none focus:ring-2 focus:ring-teal-500/30 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    : isStyleguide
      ? "w-full px-4 py-2 rounded-xl bg-[#F1F5F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm border border-[#CBD5E1] dark:border-slate-800 focus:border-[#00CFCC] focus:ring-2 focus:ring-[#00CFCC]/20 outline-none transition shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      : "w-full px-4 py-2 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm border border-slate-300/70 dark:border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-xs outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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
          className={`relative w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-hidden shadow-2xl ${modalContainerClass}`}
        >
          {/* Cabeçalho Fixo do Modal */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800/80 shrink-0 bg-white/70 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isNeumorph
                    ? "bg-[#fbf2e9] shadow-[2px_2px_5px_#c3cfe2] border border-slate-300/40 text-teal-600"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                }`}
              >
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide">
                  {kitParaEdicao ? "Editar Kit de Instalação" : "Montar Novo Kit com Materiais"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Soma automática de custos de insumos e precificação com Markup Inteligente
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
            {/* Identificação do Kit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1">
                    <Hash className="w-3 h-3 text-teal-500" />
                    <span>Código SKU *</span>
                  </label>
                  {!kitParaEdicao && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/40">
                      AUTO
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={codigoSku}
                  onChange={(e) => setCodigoSku(e.target.value.toUpperCase())}
                  placeholder="Ex: KIT-0001"
                  className={`${inputClass} font-mono font-bold tracking-wider`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Nome do Kit de Instalação *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Kit Instalação Veicular J16 com Bloqueio"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Descrição / Aplicação do Kit
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Utilizado para carros de passeio com corte de combustível"
                className={inputClass}
              />
            </div>

            {/* Seleção e Composição dos Materiais do Kit */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-teal-500" />
                  <span>Materiais que Compõem o Kit</span>
                </label>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                  {itensComposicao.length} {itensComposicao.length === 1 ? "item" : "itens"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {materiaisDisponiveis.map((mat) => {
                  const comp = itensComposicao.find((i) => i.itemId === mat.id);
                  const qtd = comp ? comp.quantidade : 0;
                  const selecionado = qtd > 0;
                  const custo = Number(mat.custo_medio_unitario || 0);

                  return (
                    <div
                      key={mat.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                        selecionado
                          ? "bg-teal-500/10 border-teal-500/40 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-bold truncate text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{mat.nome}</span>
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {mat.codigo_sku}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-80 mt-0.5">
                          {podeVerCustos && (
                            <>
                              Custo Unit.:{" "}
                              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                                R$ {custo.toFixed(2)}
                              </span>{" "}
                              |{" "}
                            </>
                          )}
                          Almox.: {mat.quantidade_atual} {mat.unidade_medida}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleItemQuantidadeChange(mat.id, qtd - 1)}
                          disabled={qtd <= 0}
                          className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition disabled:opacity-40"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={qtd}
                          onChange={(e) =>
                            handleItemQuantidadeChange(mat.id, Math.max(0, Number(e.target.value)))
                          }
                          className="w-12 text-center py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-xs focus:border-teal-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleItemQuantidadeChange(mat.id, qtd + 1)}
                          className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custo da Mão de Obra Técnica */}
            {podeVerCustos && (
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    <Wrench className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>Custo da Mão de Obra do Kit (Instalação Técnica)</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    R$ {custoMaoDeObra.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Valor atribuído ao serviço ou custo de mão de obra técnica. Comporá o custo total
                  do kit junto aos insumos.
                </p>
                <div className="relative max-w-xs">
                  <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold select-none pointer-events-none">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={custoMaoDeObra || ""}
                    onChange={(e) => {
                      const valor = Math.max(0, Number(e.target.value));
                      setCustoMaoDeObra(valor);
                      const novoCustoTotal = custoMateriaisCalculado + valor;
                      setPrecoVenda(calcularPrecoPorMarkup(novoCustoTotal, markupPercentual));
                    }}
                    placeholder="0.00"
                    className={`${inputClass} pl-10 pr-3 font-mono font-bold text-slate-800 dark:text-slate-100`}
                  />
                </div>
              </div>
            )}

            {/* Engenharia de Preços e Markup Especialista */}
            {!podeVerCustos ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-80">
                    Preço de Venda do Kit (R$) *
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Catálogo comercial</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold select-none pointer-events-none">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={precoVenda}
                    onChange={(e) => setPrecoVenda(Number(e.target.value))}
                    className={`${inputClass} font-mono font-bold text-base text-emerald-700 dark:text-emerald-400 pl-10 pr-3`}
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-500/10 via-slate-50 to-emerald-500/10 dark:from-teal-950/20 dark:via-slate-900/60 dark:to-emerald-950/20 border border-teal-500/30 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                    <Sparkles className="w-4 h-4 text-teal-500" />
                    <span>Precificação com Markup Inteligente</span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700 pr-3">
                      <span>Materiais: </span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        R$ {custoMateriaisCalculado.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700 pr-3">
                      <span>Mão de Obra: </span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        R$ {custoMaoDeObra.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-semibold">
                        Custo Total Kit
                      </span>
                      <span className="font-mono font-black text-sm text-teal-700 dark:text-teal-300">
                        R$ {custoTotalCalculado.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Presets Rápidos de Markup Especialista */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">
                    Modelos de Markup Especialista (Sugerido para Insumos Veiculares):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {PRESETS_MARKUP.map((p) => {
                      const ativo = Math.abs(markupPercentual - p.markup) < 0.5;
                      return (
                        <button
                          key={p.markup}
                          type="button"
                          onClick={() => aplicarMarkupAutomatico(p.markup)}
                          className={`px-2 py-1.5 rounded-xl text-center text-xs transition border flex flex-col items-center justify-center ${
                            ativo
                              ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 border-teal-600 font-bold shadow-xs scale-[1.02]"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-teal-500/50"
                          }`}
                        >
                          <span className="font-black text-xs">+{p.markup}%</span>
                          <span className="text-[9px] opacity-80 truncate">{p.rotulo}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Inputs de Markup e Preço de Venda Final */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">
                      Markup sobre Custo (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={markupPercentual}
                        onChange={(e) => {
                          const mk = Number(e.target.value);
                          setMarkupPercentual(mk);
                          setPrecoVenda(calcularPrecoPorMarkup(custoTotalCalculado, mk));
                        }}
                        className={`${inputClass} pr-8 pl-3 font-mono font-bold`}
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold select-none pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold uppercase tracking-wider opacity-80">
                        Preço de Venda do Kit (R$) *
                      </label>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                        Editável livremente
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold select-none pointer-events-none">
                        R$
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={precoVenda}
                        onChange={(e) => {
                          const pv = Number(e.target.value);
                          setPrecoVenda(pv);
                          if (custoTotalCalculado > 0) {
                            const novoMk = ((pv - custoTotalCalculado) / custoTotalCalculado) * 100;
                            setMarkupPercentual(Number(novoMk.toFixed(2)));
                          }
                        }}
                        className={`${inputClass} font-mono font-bold text-base text-emerald-700 dark:text-emerald-400 pl-10 pr-3`}
                      />
                    </div>
                  </div>
                </div>

                {/* Badges de Análise de Rentabilidade */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-slate-500 dark:text-slate-400">Lucro Bruto no Kit:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {analise.lucroBruto.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Margem Bruta:</span>
                    <span
                      className={`font-mono font-bold px-1.5 py-0.2 rounded text-[11px] ${
                        analise.margemBrutaPercentual >= 30
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                          : analise.margemBrutaPercentual > 0
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {analise.margemBrutaPercentual.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800/80 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
            {kitParaEdicao ? (
              <button
                type="button"
                onClick={handleExcluir}
                disabled={excluindo || salvando}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition disabled:opacity-50 min-h-[44px]"
                title="Excluir este kit do catálogo"
              >
                <Trash2 className="w-4 h-4" />
                <span>{excluindo ? "Excluindo..." : "Excluir Kit"}</span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando || excluindo}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-500/10 border border-slate-300/60 dark:border-slate-700/60 transition min-h-[44px] flex items-center justify-center text-slate-700 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || excluindo}
                className={`${btnSubmitClass} w-full sm:w-auto min-h-[44px]`}
              >
                {salvando ? (
                  "Salvando..."
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{kitParaEdicao ? "Atualizar Kit" : "Salvar Kit no Estoque"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
