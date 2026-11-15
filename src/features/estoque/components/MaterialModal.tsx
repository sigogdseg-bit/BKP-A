import { useState, useEffect, useMemo } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { X, PackagePlus, Tag, Check, Hash, Trash2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { salvarItemEstoque, excluirItemEstoque } from "../services/estoqueService";
import {
  PRESETS_MARKUP,
  calcularPrecoPorMarkup,
  analisarPrecoVenda,
} from "../utils/calculadoraMarkup";
import type { ItemEstoque, TemaEstoque, NovoItemEstoqueInput } from "../types";

function calcularProximoCodigoSku(itens: ItemEstoque[] = []): string {
  let maiorNumero = 0;
  for (const item of itens) {
    const match = item.codigo_sku?.match(/^MAT-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maiorNumero) {
        maiorNumero = num;
      }
    }
  }
  const proximo = Math.max(maiorNumero + 1, itens.length + 1);
  return `MAT-${String(proximo).padStart(4, "0")}`;
}

interface MaterialModalProps {
  materialParaEdicao?: ItemEstoque | null;
  categoriasExistentes?: string[];
  itensExistentes?: ItemEstoque[];
  tema?: TemaEstoque;
  podeVerCustos?: boolean;
  onSalvo: () => void;
  onFechar: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORIAS_SUGERIDAS = [
  "Rastreadores",
  "Chips M2M",
  "Relés",
  "Fios e Chicotes",
  "Conectores e Fusíveis",
  "Insumos de Instalação",
  "Sensores",
  "Sirenes",
  "Acessórios",
];

const UNIDADES_SUGERIDAS = ["unidade", "metro", "kit", "pacote", "par", "rolo"];

export function MaterialModal({
  materialParaEdicao,
  categoriasExistentes = [],
  itensExistentes = [],
  tema = "hunter_padrao",
  podeVerCustos = true,
  onSalvo,
  onFechar,
}: MaterialModalProps) {
  const [codigoSku, setCodigoSku] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [unidadeMedida, setUnidadeMedida] = useState("unidade");
  const [quantidadeMinima, setQuantidadeMinima] = useState(5);
  const [localizacao, setLocalizacao] = useState("Almoxarifado Principal");
  const [custoMedioBase, setCustoMedioBase] = useState<number>(0);
  const [custoFrete, setCustoFrete] = useState<number>(0);
  const [markupPercentual, setMarkupPercentual] = useState<number>(50);
  const [precoVenda, setPrecoVenda] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Custo Total Unitário do Material = Custo Base + Custo do Frete
  const custoTotalUnitario = useMemo(() => {
    return Math.round((Number(custoMedioBase || 0) + Number(custoFrete || 0)) * 100) / 100;
  }, [custoMedioBase, custoFrete]);

  // Análise de rentabilidade em tempo real (sem margem de lucro sobre o frete)
  const analise = useMemo(() => {
    return analisarPrecoVenda(custoMedioBase, precoVenda, custoFrete);
  }, [custoMedioBase, precoVenda, custoFrete]);

  const aplicarMarkupAutomatico = (markup: number) => {
    setMarkupPercentual(markup);
    const novoPreco = calcularPrecoPorMarkup(custoMedioBase, markup, custoFrete);
    setPrecoVenda(novoPreco);
  };

  const handleExcluir = async () => {
    if (!materialParaEdicao) return;
    const confirmou = window.confirm(
      `Deseja realmente excluir o material "${materialParaEdicao.nome}" (${materialParaEdicao.codigo_sku}) do catálogo?\n\nEsta ação removerá o material e seu histórico.`,
    );
    if (!confirmou) return;

    setExcluindo(true);
    try {
      const res = await excluirItemEstoque(materialParaEdicao.id);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro ao excluir material do catálogo.");
    } finally {
      setExcluindo(false);
    }
  };

  useEffect(() => {
    if (materialParaEdicao) {
      setCodigoSku(materialParaEdicao.codigo_sku);
      setNome(materialParaEdicao.nome);
      setDescricao(materialParaEdicao.descricao || "");
      setCategoria(materialParaEdicao.categoria);
      setUnidadeMedida(materialParaEdicao.unidade_medida || "unidade");
      setQuantidadeMinima(materialParaEdicao.quantidade_minima);
      setLocalizacao(materialParaEdicao.localizacao || "Almoxarifado Principal");
      const frete = Number(materialParaEdicao.custo_frete || 0);
      setCustoFrete(frete);
      const base = Number(
        materialParaEdicao.custo_base !== undefined && materialParaEdicao.custo_base !== null
          ? materialParaEdicao.custo_base
          : Math.max(0, Number(materialParaEdicao.custo_medio_unitario || 0) - frete),
      );
      setCustoMedioBase(base);
      const mk = Number(materialParaEdicao.markup_percentual || 50);
      setMarkupPercentual(mk);
      const pv = Number(materialParaEdicao.preco_venda || 0);
      setPrecoVenda(pv > 0 ? pv : calcularPrecoPorMarkup(base, mk, frete));
    } else {
      const codigoIncremental = calcularProximoCodigoSku(itensExistentes);
      setCodigoSku(codigoIncremental);
      setNome("");
      setDescricao("");
      setCategoria("Rastreadores");
      setUnidadeMedida("unidade");
      setQuantidadeMinima(5);
      setLocalizacao("Almoxarifado Principal");
      setCustoMedioBase(0);
      setCustoFrete(0);
      setMarkupPercentual(50);
      setPrecoVenda(0);
    }
  }, [materialParaEdicao, itensExistentes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!codigoSku.trim() || !nome.trim() || !categoria.trim()) {
      toast.error("Preencha o código SKU, o nome e a categoria do material.");
      return;
    }

    setSalvando(true);
    try {
      const payload: NovoItemEstoqueInput = {
        id: materialParaEdicao ? materialParaEdicao.id : undefined,
        codigo_sku: codigoSku,
        nome,
        descricao,
        categoria,
        unidade_medida: unidadeMedida,
        quantidade_minima: Number(quantidadeMinima),
        localizacao,
        custo_base: custoMedioBase,
        custo_frete: custoFrete,
        custo_medio_unitario: custoTotalUnitario,
        preco_venda: precoVenda,
        markup_percentual: markupPercentual,
      };

      const res = await salvarItemEstoque(payload);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro inesperado ao salvar material no estoque.");
    } finally {
      setSalvando(false);
    }
  };

  const isNeumorph = tema === "neumorphism_soft";
  const isStyleguide = tema === "product_styleguide";

  const modalContainerClass = isNeumorph
    ? "bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[6px_6px_24px_#c3cfe2] dark:shadow-2xl border border-slate-300/70 dark:border-slate-800 rounded-[28px]"
    : isStyleguide
      ? "bg-[#FAFBFD] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-[#CBD5E1] dark:border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[28px]"
      : "bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl rounded-3xl";

  const inputClass = isNeumorph
    ? "w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm shadow-xs border border-slate-300/70 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC]/30 focus:border-[#00CFCC] transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    : isStyleguide
      ? "w-full px-4 py-2.5 rounded-xl bg-[#F1F5F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm border border-[#CBD5E1] dark:border-slate-800 focus:border-[#00CFCC] focus:ring-2 focus:ring-[#00CFCC]/20 outline-none transition shadow-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      : "w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm border border-slate-300/70 dark:border-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  const btnSubmitClass = isNeumorph
    ? "px-6 py-2.5 rounded-xl font-bold text-sm text-slate-900 bg-[#9EBCEE] hover:bg-[#00CFCC] hover:text-slate-950 shadow-xs transition-all flex items-center justify-center gap-2"
    : isStyleguide
      ? "px-6 py-2.5 rounded-xl font-black text-sm text-[#064E3B] bg-[#9EE5D4] hover:bg-[#86ddc7] shadow-[0_4px_12px_rgba(158,229,212,0.4)] border border-[#7ed7c0] active:scale-95 transition flex items-center justify-center gap-2"
      : "px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-orange-600 hover:bg-orange-500 transition flex items-center justify-center gap-2 shadow-md shadow-orange-500/20";

  // Lista combinada de categorias sugeridas e existentes
  const todasCategorias = Array.from(
    new Set([...CATEGORIAS_SUGERIDAS, ...categoriasExistentes]),
  ).filter(Boolean);

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
                    ? "bg-[#eaf0f8] shadow-[2px_2px_5px_#c3cfe2] border border-slate-300/40 text-teal-600"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                }`}
              >
                <PackagePlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide">
                  {materialParaEdicao ? "Editar Material de Estoque" : "Cadastrar Novo Material"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Categorias livres e dinâmicas para catalogação de insumos
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
            {/* Código SKU (Incremental Automático) e Nome */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1">
                    <Hash className="w-3 h-3 text-teal-500" />
                    <span>Código SKU *</span>
                  </label>
                  {!materialParaEdicao && (
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
                  placeholder="Ex: MAT-0001"
                  className={`${inputClass} font-mono font-bold tracking-wider`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Nome do Material / Insumo *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Rastreador J16 4G Homologado"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Categoria Livre e Dinâmica com Sugestões */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-orange-500" />
                  <span>Categoria (Livre e Dinâmica) *</span>
                </label>
                <span className="text-[10px] opacity-60">Escolha ou digite uma nova</span>
              </div>

              <input
                type="text"
                required
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Digite qualquer categoria ou clique nas sugestões abaixo..."
                className={inputClass}
              />

              {/* Chips de Sugestão de Categoria com Alto Contraste e Legibilidade */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {todasCategorias.map((catNome) => {
                  const selecionada = categoria.toLowerCase() === catNome.toLowerCase();
                  return (
                    <button
                      key={catNome}
                      type="button"
                      onClick={() => setCategoria(catNome)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                        selecionada
                          ? isStyleguide
                            ? "bg-[#9EE5D4] text-[#064E3B] border border-[#7ed7c0] shadow-sm font-black"
                            : "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 font-black shadow-sm ring-2 ring-teal-500/40"
                          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-950"
                      }`}
                    >
                      {selecionada && <Check className="w-3.5 h-3.5" />}
                      <span>{catNome}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unidade de Medida e Quantidade Mínima (2 Colunas) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Unidade de Medida *
                </label>
                <select
                  value={unidadeMedida}
                  onChange={(e) => setUnidadeMedida(e.target.value)}
                  className={inputClass}
                >
                  {UNIDADES_SUGERIDAS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Estoque Mínimo (Alerta) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={quantidadeMinima}
                  onChange={(e) => setQuantidadeMinima(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Localização Física em Linha Inteira (Anti-Corte) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Localização Física no Almoxarifado
              </label>
              <input
                type="text"
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                placeholder="Ex: Almoxarifado Principal - Prateleira 02"
                className={inputClass}
              />
            </div>

            {/* Descrição Detalhada */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                Descrição Técnica (Opcional)
              </label>
              <textarea
                rows={2}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Especificações, pinagem, compatibilidade do chicote..."
                className={inputClass}
              />
            </div>

            {/* Engenharia de Preços e Markup Especialista */}
            {!podeVerCustos ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider opacity-80">
                    Preço de Venda (R$)
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
                    value={precoVenda}
                    onChange={(e) => setPrecoVenda(Number(e.target.value))}
                    placeholder="0.00"
                    className={`${inputClass} font-mono font-bold text-base text-orange-700 dark:text-orange-400 pl-10 pr-3`}
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-500/10 via-slate-50 to-emerald-500/10 dark:from-teal-950/20 dark:via-slate-900/60 dark:to-emerald-950/20 border border-teal-500/30 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                    <Sparkles className="w-4 h-4 text-teal-500" />
                    <span>Precificação com Markup Inteligente</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Custo Médio Total
                    </span>
                    <span className="font-mono font-black text-sm text-teal-700 dark:text-teal-300">
                      R$ {custoTotalUnitario.toFixed(2)}
                    </span>
                    {custoFrete > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                        (Peça R$ {custoMedioBase.toFixed(2)} + Frete R$ {custoFrete.toFixed(2)})
                      </span>
                    )}
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

                {/* Inputs de Custo Base, Custo do Frete, Markup e Preço de Venda Final */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">
                      Custo Base (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold select-none pointer-events-none">
                        R$
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={custoMedioBase || ""}
                        onChange={(e) => {
                          const c = parseFloat(e.target.value) || 0;
                          setCustoMedioBase(c);
                          setPrecoVenda(calcularPrecoPorMarkup(c, markupPercentual, custoFrete));
                        }}
                        placeholder="0.00"
                        className={`${inputClass} pl-10 pr-3 font-mono font-bold`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold uppercase tracking-wider opacity-80">
                        Custo Frete (R$)
                      </label>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                        Sem lucro
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
                        value={custoFrete || ""}
                        onChange={(e) => {
                          const f = parseFloat(e.target.value) || 0;
                          setCustoFrete(f);
                          setPrecoVenda(
                            calcularPrecoPorMarkup(custoMedioBase, markupPercentual, f),
                          );
                        }}
                        placeholder="0.00"
                        className={`${inputClass} pl-10 pr-3 font-mono font-bold text-amber-700 dark:text-amber-400`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">
                      Markup s/ Base (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={markupPercentual}
                        onChange={(e) => {
                          const mk = parseFloat(e.target.value) || 0;
                          setMarkupPercentual(mk);
                          setPrecoVenda(calcularPrecoPorMarkup(custoMedioBase, mk, custoFrete));
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
                        Preço de Venda (R$) *
                      </label>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                        Livre edição
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
                        value={precoVenda || ""}
                        onChange={(e) => {
                          const pv = parseFloat(e.target.value) || 0;
                          setPrecoVenda(pv);
                          if (custoMedioBase > 0) {
                            const novoMk =
                              ((pv - custoFrete - custoMedioBase) / custoMedioBase) * 100;
                            setMarkupPercentual(Number(novoMk.toFixed(2)));
                          }
                        }}
                        className={`${inputClass} font-mono font-bold text-base text-orange-700 dark:text-orange-400 pl-10 pr-3`}
                      />
                    </div>
                  </div>
                </div>

                {/* Badges de Rentabilidade */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-slate-500 dark:text-slate-400">
                      Lucro Bruto Unitário:
                    </span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                      R$ {analise.lucroBruto.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Margem Bruta:</span>
                    <span
                      className={`font-mono font-bold px-1.5 py-0.2 rounded text-[11px] ${
                        analise.margemBrutaPercentual >= 30
                          ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30"
                          : analise.margemBrutaPercentual > 0
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {analise.margemBrutaPercentual.toFixed(1)}%
                    </span>
                  </div>

                  {custoFrete > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 dark:text-slate-400">Frete Rateado:</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        + R$ {custoFrete.toFixed(2)} (sem lucro)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800/80 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
            {materialParaEdicao ? (
              <button
                type="button"
                onClick={handleExcluir}
                disabled={excluindo || salvando}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition disabled:opacity-50 min-h-[44px]"
                title="Excluir este material do catálogo"
              >
                <Trash2 className="w-4 h-4" />
                <span>{excluindo ? "Excluindo..." : "Excluir Material"}</span>
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
                    <span>{materialParaEdicao ? "Atualizar Material" : "Cadastrar Material"}</span>
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
