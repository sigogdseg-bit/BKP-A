import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Boxes,
  Package,
  PackagePlus,
  Plus,
  ShoppingCart,
  Building2,
  History,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Palette,
  Search,
  Filter,
  Sparkles,
  Layers,
  Shield,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Radio,
  Cpu,
  RefreshCw,
  Edit3,
  ShieldAlert,
  FileUp,
  LayoutGrid,
  List,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TiltCard } from "@/shared/components/TiltCard";
import {
  listarItensEstoque,
  listarFornecedores,
  listarMovimentacoesEstoque,
  excluirItemEstoque,
  excluirFornecedor,
  excluirMovimentacaoEstoque,
  listarKitsEstoque,
  excluirKitEstoque,
} from "../services/estoqueService";
import type {
  ItemEstoque,
  Fornecedor,
  MovimentacaoEstoque,
  TemaEstoque,
  CategoriaItemEstoque,
  KitEstoque,
} from "../types";
import { EntradaEstoqueModal } from "./EntradaEstoqueModal";
import { FornecedorModal, CATEGORIAS_SUGERIDAS } from "./FornecedorModal";
import { MaterialModal } from "./MaterialModal";
import { LeitorPdfModal } from "./LeitorPdfModal";
import { EditarCompraModal } from "./EditarCompraModal";
import { KitModal } from "./KitModal";
import { AbaRastreadoresChipsEstoque } from "./AbaRastreadoresChipsEstoque";
import { useCardTheme } from "@/shared/lib/card-theme";

export function EstoqueView() {
  const { session } = useAuth();

  const cardTheme = useCardTheme(session?.userId);
  const isNeumorph = (cardTheme.variant ?? "neumorphic") === "neumorphic";
  const isStyleguide = false;
  const tema: TemaEstoque = isNeumorph ? "neumorphism_soft" : "hunter_padrao";

  const podeVerCustosEFornecedores = Boolean(session?.isSuperAdmin || session?.isAdmin);

  const [abaAtiva, setAbaAtiva] = useState<
    "itens" | "kits" | "rastreadores" | "fornecedores" | "movimentacoes"
  >("itens");

  useEffect(() => {
    if (!podeVerCustosEFornecedores && abaAtiva === "fornecedores") {
      setAbaAtiva("itens");
    }
  }, [podeVerCustosEFornecedores, abaAtiva]);
  const [carregando, setCarregando] = useState(true);

  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [kits, setKits] = useState<KitEstoque[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);

  // Modais
  const [modalCompraAberto, setModalCompraAberto] = useState(false);
  const [itemCompraPreSelecionado, setItemCompraPreSelecionado] = useState<string | undefined>();
  const [modalFornecedorAberto, setModalFornecedorAberto] = useState(false);
  const [fornecedorEdicao, setFornecedorEdicao] = useState<Fornecedor | null>(null);
  const [modalMaterialAberto, setModalMaterialAberto] = useState(false);
  const [materialEdicao, setMaterialEdicao] = useState<ItemEstoque | null>(null);
  const [modalKitAberto, setModalKitAberto] = useState(false);
  const [kitEdicao, setKitEdicao] = useState<KitEstoque | null>(null);
  const [modalLeitorPdfAberto, setModalLeitorPdfAberto] = useState(false);
  const [modalEditarCompraAberto, setModalEditarCompraAberto] = useState(false);
  const [movimentacaoEdicao, setMovimentacaoEdicao] = useState<MovimentacaoEstoque | null>(null);
  const [modoVisualizacaoMateriais, setModoVisualizacaoMateriais] = useState<"cards" | "lista">(
    () => {
      if (typeof window !== "undefined") {
        const salvo = localStorage.getItem("hunter_estoque_modo_visualizacao");
        if (salvo === "cards" || salvo === "lista") return salvo;
      }
      return "cards";
    },
  );

  const alternarModoVisualizacao = (modo: "cards" | "lista") => {
    setModoVisualizacaoMateriais(modo);
    if (typeof window !== "undefined") {
      localStorage.setItem("hunter_estoque_modo_visualizacao", modo);
    }
  };

  // Filtros
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [filtroAlerta, setFiltroAlerta] = useState(false);
  const [fornecedorBusca, setFornecedorBusca] = useState("");
  const [fornecedorCategoriaFiltro, setFornecedorCategoriaFiltro] = useState<string>("todas");

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaItens, listaKits, listaForn, listaMov] = await Promise.all([
        listarItensEstoque(),
        listarKitsEstoque(),
        listarFornecedores(),
        listarMovimentacoesEstoque({ limit: 100 }),
      ]);
      setItens(listaItens);
      setKits(listaKits);
      setFornecedores(listaForn);
      setMovimentacoes(listaMov);
    } catch {
      toast.error("Não foi possível carregar os dados do estoque.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();

    // Reatividade Realtime via WebSockets do Supabase
    const canal = supabase
      .channel("hunter_estoque_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque_itens" }, () => {
        carregarDados();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque_kits" }, () => {
        carregarDados();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "estoque_movimentacoes" },
        () => {
          carregarDados();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregarDados]);

  const handleExcluirKit = async (kit: KitEstoque) => {
    const confirmou = window.confirm(
      `Deseja realmente excluir o kit "${kit.nome}" (${kit.codigo_sku})?\n\nEsta ação removerá o kit do catálogo.`,
    );
    if (!confirmou) return;

    try {
      const res = await excluirKitEstoque(kit.id);
      if (res.success) {
        toast.success(res.message);
        carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Erro ao excluir kit.");
    }
  };

  const handleExcluirMaterial = async (item: ItemEstoque) => {
    const confirmou = window.confirm(
      `Deseja realmente excluir o material "${item.nome}" (${item.codigo_sku}) do catálogo?\n\nEsta ação removerá o material e seu histórico.`,
    );
    if (!confirmou) return;

    try {
      const res = await excluirItemEstoque(item.id);
      if (res.success) {
        toast.success(res.message);
        carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Falha ao excluir material.");
    }
  };

  const handleExcluirFornecedor = async (forn: Fornecedor) => {
    const confirmou = window.confirm(
      `Deseja realmente remover o parceiro "${forn.nome_fantasia}" da lista de fornecedores?`,
    );
    if (!confirmou) return;

    try {
      const res = await excluirFornecedor(forn.id);
      if (res.success) {
        toast.success(res.message);
        carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Falha ao remover fornecedor.");
    }
  };

  const handleExcluirMovimentacao = async (mov: MovimentacaoEstoque) => {
    const nomeItem = mov.item?.nome || "Material";
    const tipoTexto = mov.tipo === "entrada_compra" ? "compra" : "movimentação";
    const confirmou = window.confirm(
      `Deseja realmente estornar e excluir esta ${tipoTexto} de ${mov.quantidade} un de "${nomeItem}"?\n\nO saldo em estoque será recalculado e o lançamento financeiro vinculado será removido.`,
    );
    if (!confirmou) return;

    try {
      const res = await excluirMovimentacaoEstoque(mov.id);
      if (res.success) {
        toast.success(res.message);
        carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Falha ao excluir movimentação.");
    }
  };

  // Métricas de Resumo
  const resumo = useMemo(() => {
    const totalItens = itens.length;
    const valorPatrimonial = itens.reduce(
      (acc, item) => acc + item.quantidade_atual * item.custo_medio_unitario,
      0,
    );
    const itensEmAlerta = itens.filter(
      (item) => item.quantidade_atual <= item.quantidade_minima,
    ).length;
    const totalFornecedores = fornecedores.filter((f) => f.ativo).length;

    return { totalItens, valorPatrimonial, itensEmAlerta, totalFornecedores };
  }, [itens, fornecedores]);

  // Categorias dinâmicas extraídas dos itens cadastrados
  const categoriasDinamicas = useMemo(() => {
    const cats = Array.from(new Set(itens.map((it) => it.categoria).filter(Boolean)));
    return cats.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  // Itens filtrados com filtro bidirecional de reposição
  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      const matchesBusca =
        item.nome.toLowerCase().includes(busca.toLowerCase()) ||
        item.codigo_sku.toLowerCase().includes(busca.toLowerCase());
      const matchesCat = categoriaFiltro === "todas" || item.categoria === categoriaFiltro;
      const matchesAlerta = !filtroAlerta || item.quantidade_atual <= item.quantidade_minima;
      return matchesBusca && matchesCat && matchesAlerta;
    });
  }, [itens, busca, categoriaFiltro, filtroAlerta]);

  // Fornecedores filtrados com suporte a multi-categoria e busca ampla
  const fornecedoresFiltrados = useMemo(() => {
    return fornecedores.filter((forn) => {
      const termo = fornecedorBusca.toLowerCase().trim();
      const matchesBusca =
        !termo ||
        forn.nome_fantasia.toLowerCase().includes(termo) ||
        (forn.razao_social && forn.razao_social.toLowerCase().includes(termo)) ||
        (forn.cnpj_cpf && forn.cnpj_cpf.toLowerCase().includes(termo)) ||
        (forn.contato_nome && forn.contato_nome.toLowerCase().includes(termo)) ||
        (forn.telefone && forn.telefone.toLowerCase().includes(termo)) ||
        (forn.chave_pix && forn.chave_pix.toLowerCase().includes(termo));

      if (!matchesBusca) return false;

      if (fornecedorCategoriaFiltro === "todas") return true;

      // Suporte a múltiplas categorias: verifica se a categoria selecionada está nas categorias do fornecedor
      const cats = (forn.categoria || "")
        .toLowerCase()
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      return cats.some(
        (c) =>
          c === fornecedorCategoriaFiltro.toLowerCase() ||
          c.includes(fornecedorCategoriaFiltro.toLowerCase()),
      );
    });
  }, [fornecedores, fornecedorBusca, fornecedorCategoriaFiltro]);

  // Categorias de fornecedores unificadas (sugestões canônicas + dinâmicas do banco)
  const categoriasFornecedoresUnificadas = useMemo(() => {
    const catsDoBanco = fornecedores.flatMap((f) =>
      (f.categoria || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    );
    return Array.from(new Set([...CATEGORIAS_SUGERIDAS, ...catsDoBanco])).filter(Boolean);
  }, [fornecedores]);

  // Estilos de container e cards por tema
  const pageContainerClass = isNeumorph
    ? "bg-[#fbf2e9] dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-2.5 sm:p-6 lg:p-8 rounded-3xl min-h-[85vh] transition-all duration-300 border border-slate-300/40 dark:border-slate-800/80"
    : "space-y-6 max-w-7xl mx-auto transition-all duration-300";

  const cardMetricClass = isNeumorph
    ? "p-5 rounded-[22px] bg-[#fbf2e9] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] border border-slate-300/60 dark:border-slate-800 transition-transform hover:-translate-y-0.5"
    : "p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-transform hover:-translate-y-0.5";

  const cardTableClass = isNeumorph
    ? "rounded-[24px] bg-[#fbf2e9] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-[4px_4px_14px_rgba(0,0,0,0.5)] border border-slate-300/60 dark:border-slate-800 overflow-hidden"
    : "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden";

  const inputSearchClass = isNeumorph
    ? "w-full pl-10 pr-4 py-2.5 rounded-full bg-[#fbf2e9] dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] border border-slate-300/50 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC] transition"
    : "w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm border border-slate-300 dark:border-slate-800 focus:border-emerald-500 outline-none transition";

  // Regra Inegociável DJR-NEW: Instalador não cadastra nada no estoque, não vê fornecedor, não cadastra fornecedor e não compra material
  if (session?.isInstalador) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 bg-white dark:bg-slate-900 border border-rose-500/30 rounded-3xl text-center space-y-4 shadow-lg">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
          Acesso Restrito ao Estoque
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          O perfil de Instalador tem acesso exclusivo às suas Ordens de Instalação e execução de
          serviços em campo. O gerenciamento de materiais, compras de suprimentos e fornecedores é
          restrito à administração.
        </p>
      </div>
    );
  }

  return (
    <div className={pageContainerClass}>
      {/* Topo: Título e Ações Rápidas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-700/20">
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-2xl shrink-0 ${
                isNeumorph
                  ? "bg-[#fbf2e9] dark:bg-slate-900 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-800 text-teal-600 dark:text-teal-400"
                  : "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
              }`}
            >
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-wide">
                  Estoque e Suprimentos
                </h1>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isNeumorph
                      ? "bg-[#9EBCEE] dark:bg-teal-900/60 text-slate-800 dark:text-teal-300 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none border dark:border-teal-700/50"
                      : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  INTEGRADO
                </span>
              </div>
              <p className="text-xs opacity-75">
                Chips M2M, fios, conectores, relés 12V 40A, rastreadores e baixas automáticas na
                instalação
              </p>
            </div>
          </div>
        </div>

        {/* Lado Direito: Ações Rápidas Padronizadas com Grade Responsiva para Mobile */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => {
              setMaterialEdicao(null);
              setModalMaterialAberto(true);
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
              isNeumorph
                ? "bg-[#fbf2e9] dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)] border border-slate-300/50 dark:border-slate-800 hover:text-slate-950 dark:hover:text-white"
                : isStyleguide
                  ? "bg-[#F1F5F9] text-slate-700 hover:bg-[#E2E8F0] border border-[#CBD5E1] shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <PackagePlus className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Novo Material</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setKitEdicao(null);
              setModalKitAberto(true);
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
              isNeumorph
                ? "bg-[#fbf2e9] dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)] border border-teal-300/50 dark:border-teal-800 hover:text-teal-950 dark:hover:text-teal-300"
                : isStyleguide
                  ? "bg-[#F1F5F9] text-teal-700 hover:bg-[#E2E8F0] border border-teal-300 shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                  : "bg-teal-500/15 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/25 border border-teal-500/30"
            }`}
            title="Montar kit com materiais, soma de custos e markup inteligente"
          >
            <Layers className="w-4 h-4 text-teal-500 shrink-0" />
            <span>Montar Kit</span>
          </button>

          {podeVerCustosEFornecedores && (
            <>
              <button
                type="button"
                onClick={() => {
                  setFornecedorEdicao(null);
                  setModalFornecedorAberto(true);
                }}
                className={`min-h-[44px] px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                  isNeumorph
                    ? "bg-[#fbf2e9] dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)] border border-slate-300/50 dark:border-slate-800 hover:text-slate-950 dark:hover:text-white"
                    : isStyleguide
                      ? "bg-[#F1F5F9] text-slate-700 hover:bg-[#E2E8F0] border border-[#CBD5E1] shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Fornecedor</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setItemCompraPreSelecionado(undefined);
                  setModalCompraAberto(true);
                }}
                className={`min-h-[44px] px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                  isNeumorph
                    ? "bg-[#fbf2e9] dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)] border border-slate-300/50 dark:border-slate-800 hover:text-slate-950 dark:hover:text-white"
                    : isStyleguide
                      ? "bg-[#F1F5F9] text-slate-700 hover:bg-[#E2E8F0] border border-[#CBD5E1] shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                <ShoppingCart className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Comprar</span>
              </button>

              <button
                type="button"
                onClick={() => setModalLeitorPdfAberto(true)}
                className={`col-span-2 sm:col-span-1 min-h-[44px] px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                  isNeumorph
                    ? "bg-[#fbf2e9] dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)] border border-teal-300/60 dark:border-teal-800 hover:text-teal-950 dark:hover:text-teal-300"
                    : isStyleguide
                      ? "bg-[#F1F5F9] text-teal-700 hover:bg-[#E2E8F0] border border-teal-300 shadow-[0_2px_4px_rgba(0,0,0,0.04)]"
                      : "bg-teal-500/10 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 border border-teal-500/30"
                }`}
                title="Importar e extrair dados de Nota Fiscal ou Comprovante PDF"
              >
                <FileUp className="w-4 h-4 text-teal-500 shrink-0" />
                <span>Importar PDF / NF-e</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cards de Resumo Operacional com Tipografia Padronizada pelo Tema e Filtro Bidirecional */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        {/* Card 1: Total de Itens */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => {
            setAbaAtiva("itens");
            setFiltroAlerta(false);
            setCategoriaFiltro("todas");
          }}
          className={`${cardMetricClass} cursor-pointer transition-all ${
            abaAtiva === "itens" && !filtroAlerta && categoriaFiltro === "todas"
              ? "ring-2 ring-emerald-500 shadow-[4px_4px_12px_#b8c7db]"
              : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
              Itens no Catálogo
            </span>
            <Package className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {resumo.totalItens}
            </span>
            <span className="text-xs opacity-60">materiais ativos</span>
          </div>
        </TiltCard>

        {/* Card 2: Valor Patrimonial (Restrito à Administração) ou Total de Itens para Operador */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => {
            setAbaAtiva("itens");
            setFiltroAlerta(false);
          }}
          className={`${cardMetricClass} cursor-pointer transition-all`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
              {podeVerCustosEFornecedores ? "Patrimônio em Estoque" : "Total de Itens"}
            </span>
            {podeVerCustosEFornecedores ? (
              <DollarSign className="w-4 h-4 text-emerald-500" />
            ) : (
              <Boxes className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {podeVerCustosEFornecedores ? (
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                R${" "}
                {resumo.valorPatrimonial.toLocaleString("pt-BR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            ) : (
              <>
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {resumo.totalItens}
                </span>
                <span className="text-xs opacity-60">materiais cadastrados</span>
              </>
            )}
          </div>
        </TiltCard>

        {/* Card 3: Itens em Alerta de Estoque Mínimo (Filtro Bidirecional) */}
        <TiltCard
          maxTilt={6}
          spotlightColor={
            resumo.itensEmAlerta > 0 ? "rgba(244, 63, 94, 0.35)" : "rgba(16, 185, 129, 0.35)"
          }
          onClick={() => {
            setAbaAtiva("itens");
            setFiltroAlerta((prev) => !prev);
          }}
          className={`${cardMetricClass} cursor-pointer transition-all ${
            filtroAlerta ? "ring-2 ring-rose-500 shadow-[4px_4px_12px_rgba(244,63,94,0.3)]" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
              Em Nível de Reposição
            </span>
            <AlertTriangle
              className={`w-4 h-4 ${resumo.itensEmAlerta > 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono ${
                resumo.itensEmAlerta > 0
                  ? "text-rose-500"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {resumo.itensEmAlerta}
            </span>
            <span className="text-xs opacity-60">
              {resumo.itensEmAlerta > 0 ? "precisam de compra" : "estoque regular"}
            </span>
          </div>
        </TiltCard>

        {/* Card 4: Fornecedores Ativos (Restrito à Administração) */}
        {podeVerCustosEFornecedores && (
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(14, 165, 233, 0.35)"
            onClick={() => setAbaAtiva("fornecedores")}
            className={`${cardMetricClass} cursor-pointer transition-all ${
              abaAtiva === "fornecedores" ? "ring-2 ring-sky-500 shadow-[4px_4px_12px_#b8c7db]" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold opacity-70">
                Fornecedores Ativos
              </span>
              <Building2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                {resumo.totalFornecedores}
              </span>
              <span className="text-xs opacity-60">parceiros homologados</span>
            </div>
          </TiltCard>
        )}
      </div>

      {/* Navegação entre Abas Responsiva Sem Rolagem Horizontal */}
      <div
        className={
          isStyleguide
            ? `grid ${podeVerCustosEFornecedores ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"} gap-1.5 p-1.5 rounded-3xl bg-[#F1F5F9] border border-[#CBD5E1] shadow-[inset_1px_1px_3px_rgba(0,0,0,0.05)] mb-6 w-full`
            : `grid ${podeVerCustosEFornecedores ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"} gap-2 mb-6 border-b border-slate-700/20 pb-3 w-full`
        }
      >
        <button
          onClick={() => setAbaAtiva("itens")}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-center w-full ${
            abaAtiva === "itens"
              ? isNeumorph
                ? "bg-[#9EBCEE] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[0_2px_8px_rgba(20,184,166,0.3)] font-black"
                : isStyleguide
                  ? "bg-[#9EE5D4] text-[#064E3B] shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-black"
                  : "bg-emerald-500 text-slate-950 shadow"
              : isStyleguide
                ? "text-slate-600 hover:text-slate-900 font-semibold"
                : "opacity-60 hover:opacity-100"
          }`}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Materiais e Saldo</span>
          <span className="sm:hidden">Materiais</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/20 shrink-0">
            {itens.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("kits")}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-center w-full ${
            abaAtiva === "kits"
              ? isNeumorph
                ? "bg-[#9EBCEE] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[0_2px_8px_rgba(20,184,166,0.3)] font-black"
                : isStyleguide
                  ? "bg-[#9EE5D4] text-[#064E3B] shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-black"
                  : "bg-emerald-500 text-slate-950 shadow"
              : isStyleguide
                ? "text-slate-600 hover:text-slate-900 font-semibold"
                : "opacity-60 hover:opacity-100"
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Kits</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/20 shrink-0">
            {kits.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("rastreadores")}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-center w-full ${
            abaAtiva === "rastreadores"
              ? isNeumorph
                ? "bg-[#9EBCEE] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[0_2px_8px_rgba(20,184,166,0.3)] font-black"
                : isStyleguide
                  ? "bg-[#9EE5D4] text-[#064E3B] shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-black"
                  : "bg-emerald-500 text-slate-950 shadow"
              : isStyleguide
                ? "text-slate-600 hover:text-slate-900 font-semibold"
                : "opacity-60 hover:opacity-100"
          }`}
        >
          <Cpu className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Rastreadores e Chips</span>
          <span className="sm:hidden">Seriais</span>
        </button>

        {podeVerCustosEFornecedores && (
          <button
            onClick={() => setAbaAtiva("fornecedores")}
            className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-center w-full ${
              abaAtiva === "fornecedores"
                ? isNeumorph
                  ? "bg-[#9EBCEE] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[0_2px_8px_rgba(20,184,166,0.3)] font-black"
                  : isStyleguide
                    ? "bg-[#9EE5D4] text-[#064E3B] shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-black"
                    : "bg-emerald-500 text-slate-950 shadow"
                : isStyleguide
                  ? "text-slate-600 hover:text-slate-900 font-semibold"
                  : "opacity-60 hover:opacity-100"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Fornecedores</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/20 shrink-0">
              {fornecedores.length}
            </span>
          </button>
        )}

        <button
          onClick={() => setAbaAtiva("movimentacoes")}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-center w-full ${
            abaAtiva === "movimentacoes"
              ? isNeumorph
                ? "bg-[#9EBCEE] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[0_2px_8px_rgba(20,184,166,0.3)] font-black"
                : isStyleguide
                  ? "bg-[#9EE5D4] text-[#064E3B] shadow-[0_2px_6px_rgba(0,0,0,0.08)] font-black"
                  : "bg-emerald-500 text-slate-950 shadow"
              : isStyleguide
                ? "text-slate-600 hover:text-slate-900 font-semibold"
                : "opacity-60 hover:opacity-100"
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Histórico / Extrato</span>
          <span className="sm:hidden">Extrato</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/20 shrink-0">
            {movimentacoes.length}
          </span>
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: ITENS E SALDO */}
      {abaAtiva === "itens" && (
        <div className="space-y-4">
          {/* Barra de Filtro, Busca e Alternância de Modo */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou SKU..."
                  className={inputSearchClass}
                />
              </div>

              {/* Seletor de Modo: Cards vs Lista */}
              <div
                className={`p-1 rounded-full flex items-center shrink-0 ${
                  isNeumorph
                    ? "bg-[#fbf2e9] dark:bg-slate-900 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.5)] border border-slate-300/40 dark:border-slate-800"
                    : isStyleguide
                      ? "bg-[#F1F5F9] border border-[#CBD5E1]"
                      : "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <button
                  type="button"
                  onClick={() => alternarModoVisualizacao("cards")}
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                    modoVisualizacaoMateriais === "cards"
                      ? isNeumorph
                        ? "bg-[#00CFCC] text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                        : isStyleguide
                          ? "bg-[#9EE5D4] text-[#064E3B] border border-[#7ed7c0] shadow-sm font-black"
                          : "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="Exibir em Grade / Cards"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>

                <button
                  type="button"
                  onClick={() => alternarModoVisualizacao("lista")}
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                    modoVisualizacaoMateriais === "lista"
                      ? isNeumorph
                        ? "bg-[#00CFCC] text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                        : isStyleguide
                          ? "bg-[#9EE5D4] text-[#064E3B] border border-[#7ed7c0] shadow-sm font-black"
                          : "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title="Exibir em Lista / Tabela"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Lista</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              <span className="text-xs opacity-60 font-semibold uppercase tracking-wider shrink-0">
                Categoria:
              </span>
              <button
                onClick={() => setCategoriaFiltro("todas")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  categoriaFiltro === "todas"
                    ? isNeumorph
                      ? "bg-[#00CFCC] text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                      : isStyleguide
                        ? "bg-[#9EE5D4] text-[#064E3B] border border-[#7ed7c0] shadow-sm font-black"
                        : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : isStyleguide
                      ? "bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] hover:bg-[#E2E8F0] font-semibold"
                      : "opacity-60 hover:opacity-100"
                }`}
              >
                Todas
              </button>

              {categoriasDinamicas.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap capitalize transition ${
                    categoriaFiltro === cat
                      ? isNeumorph
                        ? "bg-[#00CFCC] text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                        : isStyleguide
                          ? "bg-[#9EE5D4] text-[#064E3B] border border-[#7ed7c0] shadow-sm font-black"
                          : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : isStyleguide
                        ? "bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] hover:bg-[#E2E8F0] font-semibold"
                        : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {cat.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Estado Vazio Total (Quando todos os fictícios foram apagados) */}
          {itens.length === 0 ? (
            <div
              className={`p-12 text-center rounded-[28px] ${
                isNeumorph
                  ? "bg-[#fbf2e9] dark:bg-slate-900 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-800"
                  : isStyleguide
                    ? "bg-white border border-[#CBD5E1] shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              }`}
            >
              <div
                className={`w-16 h-16 mx-auto rounded-3xl flex items-center justify-center mb-4 ${
                  isNeumorph
                    ? "bg-[#fbf2e9] dark:bg-slate-950 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none text-teal-600 dark:text-teal-400 border border-slate-300/40 dark:border-slate-800"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                }`}
              >
                <Boxes className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black tracking-wide">
                Estoque Pronto para Cadastros Reais
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
                Todos os dados de teste foram completamente erradicados. Cadastre seus materiais
                reais (chips M2M, relés, chicotes, rastreadores J16 ou novas categorias livres).
              </p>
              <button
                onClick={() => {
                  setMaterialEdicao(null);
                  setModalMaterialAberto(true);
                }}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition inline-flex items-center gap-2 ${
                  isNeumorph
                    ? "bg-[#9EBCEEC] dark:bg-emerald-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none hover:bg-[#00CFCC]"
                    : isStyleguide
                      ? "bg-[#9EE5D4] hover:bg-[#86ddc7] text-[#064E3B] font-black border border-[#7ed7c0] shadow-[0_2px_8px_rgba(158,229,212,0.4)]"
                      : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>+ Cadastrar Primeiro Material</span>
              </button>
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs opacity-60">
              Nenhum material encontrado com o filtro ou busca informada.
            </div>
          ) : /* Modo de Visualização Selecionado: Cards ou Lista */
          modoVisualizacaoMateriais === "cards" ? (
            /* Grid de Materiais (Modo Cards) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {itensFiltrados.map((item) => {
                const emAlerta = item.quantidade_atual <= item.quantidade_minima;
                const percentual = Math.min(
                  100,
                  (item.quantidade_atual / (item.quantidade_minima * 3)) * 100,
                );

                return (
                  <TiltCard
                    key={item.id}
                    maxTilt={5}
                    spotlightColor={
                      emAlerta ? "rgba(244, 63, 94, 0.22)" : "rgba(16, 185, 129, 0.2)"
                    }
                    className={`p-5 flex flex-col justify-between ${
                      isNeumorph
                        ? "rounded-[22px] bg-[#fbf2e9] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-[4px_4px_12px_rgba(0,0,0,0.5)] border border-slate-300/60 dark:border-slate-800"
                        : isStyleguide
                          ? "rounded-[26px] bg-white border border-[#E2E8F0] shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:shadow-[0_10px_24px_rgba(0,0,0,0.08)] transition-all"
                          : "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm"
                    }`}
                  >
                    <div>
                      {/* Header do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">
                              {item.codigo_sku}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold bg-slate-500/10 opacity-75">
                              {item.categoria}
                            </span>
                          </div>
                          <h3 className="font-bold text-base mt-0.5 leading-snug">{item.nome}</h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setMaterialEdicao(item);
                              setModalMaterialAberto(true);
                            }}
                            className="p-1.5 rounded-full hover:bg-slate-500/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                            title="Editar material"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleExcluirMaterial(item)}
                            className="p-1.5 rounded-full hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition"
                            title="Excluir material do catálogo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              emAlerta
                                ? isStyleguide
                                  ? "bg-[#FEF08A] text-[#713F12] border border-[#FDE047] font-bold"
                                  : "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                                : isStyleguide
                                  ? "bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0] font-bold"
                                  : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            {emAlerta ? "Reposição" : "Regular"}
                          </span>
                        </div>
                      </div>

                      {item.descricao && (
                        <p className="text-xs opacity-70 mt-2 line-clamp-2">{item.descricao}</p>
                      )}

                      {/* Barra de Nível de Estoque */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="opacity-60">Saldo em Estoque</span>
                          <span className="font-bold font-mono">
                            {item.quantidade_atual} {item.unidade_medida} (mín:{" "}
                            {item.quantidade_minima})
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              emAlerta
                                ? "bg-rose-500"
                                : isNeumorph || isStyleguide
                                  ? "bg-[#00CFCC]"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${percentual}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Rodapé do Card: Custo Médio e Botão Comprar (Restrito à Administração) */}
                    {podeVerCustosEFornecedores && (
                      <div className="mt-5 pt-4 border-t border-slate-700/20 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block opacity-60">
                            Custo Médio Unitário
                          </span>
                          <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                            R$ {Number(item.custo_medio_unitario || 0).toFixed(2)}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            setItemCompraPreSelecionado(item.id);
                            setModalCompraAberto(true);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                            isNeumorph
                              ? "bg-[#9EBCEEC] dark:bg-emerald-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:bg-[#00CFCC]"
                              : isStyleguide
                                ? "bg-[#9EE5D4] hover:bg-[#86ddc7] text-[#064E3B] font-bold border border-[#7ed7c0] shadow-[0_2px_8px_rgba(158,229,212,0.4)] active:scale-95"
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                          }`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Abastecer</span>
                        </button>
                      </div>
                    )}
                  </TiltCard>
                );
              })}
            </div>
          ) : (
            /* Tabela de Materiais (Modo Lista) */
            <div className={cardTableClass}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-500/5 uppercase font-semibold text-[10px] tracking-wider opacity-70">
                    <tr>
                      <th className="py-3.5 px-4">SKU / Código</th>
                      <th className="py-3.5 px-4">Material / Descrição</th>
                      <th className="py-3.5 px-4">Categoria</th>
                      <th className="py-3.5 px-4">Saldo em Estoque</th>
                      {podeVerCustosEFornecedores && (
                        <th className="py-3.5 px-4">Custo Médio Unitário</th>
                      )}
                      {podeVerCustosEFornecedores && (
                        <th className="py-3.5 px-4">Total em Estoque</th>
                      )}
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/20">
                    {itensFiltrados.map((item) => {
                      const emAlerta = item.quantidade_atual <= item.quantidade_minima;
                      const totalPatrimonialItem =
                        item.quantidade_atual * item.custo_medio_unitario;

                      return (
                        <tr key={item.id} className="hover:bg-slate-500/5 transition">
                          <td className="py-3.5 px-4 font-mono font-bold text-xs opacity-80 whitespace-nowrap">
                            {item.codigo_sku}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-sm leading-snug">{item.nome}</div>
                            {item.descricao && (
                              <div className="text-[11px] opacity-60 line-clamp-1 mt-0.5">
                                {item.descricao}
                              </div>
                            )}
                            {item.localizacao && (
                              <div className="text-[10px] opacity-40 font-mono mt-0.5">
                                Local: {item.localizacao}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full uppercase font-bold bg-slate-500/10 opacity-75">
                              {item.categoria}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono font-black text-sm ${
                                  emAlerta
                                    ? "text-rose-500"
                                    : "text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {item.quantidade_atual} {item.unidade_medida}
                              </span>
                              {emAlerta ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-rose-500/20 text-rose-500 border border-rose-500/30">
                                  Reposição (mín: {item.quantidade_minima})
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                  Regular (mín: {item.quantidade_minima})
                                </span>
                              )}
                            </div>
                          </td>
                          {podeVerCustosEFornecedores && (
                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              R$ {Number(item.custo_medio_unitario || 0).toFixed(2)}
                            </td>
                          )}
                          {podeVerCustosEFornecedores && (
                            <td className="py-3.5 px-4 font-mono opacity-80 whitespace-nowrap">
                              R$ {Number(totalPatrimonialItem || 0).toFixed(2)}
                            </td>
                          )}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {podeVerCustosEFornecedores && (
                                <button
                                  onClick={() => {
                                    setItemCompraPreSelecionado(item.id);
                                    setModalCompraAberto(true);
                                  }}
                                  className={`px-3 py-1 rounded-full text-xs font-bold transition inline-flex items-center gap-1 ${
                                    isNeumorph
                                      ? "bg-[#9EBCEEC] dark:bg-emerald-600 text-slate-900 dark:text-slate-950 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none hover:bg-[#00CFCC]"
                                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                                  }`}
                                  title="Abastecer / Comprar este material"
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  <span>Abastecer</span>
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setMaterialEdicao(item);
                                  setModalMaterialAberto(true);
                                }}
                                className="p-1.5 rounded-full hover:bg-slate-500/15 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                title="Editar Material"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleExcluirMaterial(item)}
                                className="p-1.5 rounded-full hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 transition"
                                title="Excluir Material"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA DE KITS DE INSTALAÇÃO */}
      {abaAtiva === "kits" && (
        <div className="space-y-4">
          {/* Cabeçalho da Aba de Kits */}
          <div className="p-4 rounded-3xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-500" />
                <span>Kits de Instalação e Pacotes Padronizados</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Composição de insumos com soma de custos em tempo real e cálculo inteligente de
                markup para instaladores
              </p>
            </div>

            <button
              onClick={() => {
                setKitEdicao(null);
                setModalKitAberto(true);
              }}
              className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                isNeumorph
                  ? "bg-[#9EBCEEC] dark:bg-teal-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:bg-[#00CFCC]"
                  : "bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md shadow-teal-500/20"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Montar Novo Kit</span>
            </button>
          </div>

          {/* Listagem de Kits */}
          {kits.length === 0 ? (
            <div className="text-center py-12 p-6 rounded-3xl bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-3">
                <Layers className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Nenhum kit de instalação montado
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                Monte pacotes combinando rastreador, chip, relés e chicotes com soma automática de
                custos e markup especialista.
              </p>
              <button
                onClick={() => {
                  setKitEdicao(null);
                  setModalKitAberto(true);
                }}
                className="px-4 py-2 rounded-full bg-teal-600 text-white text-xs font-bold hover:bg-teal-500 transition shadow-sm"
              >
                Montar Primeiro Kit
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kits.map((kit) => {
                // Calcula quantos kits completos podem ser montados agora com o estoque atual dos componentes
                const itensDoKit = Array.isArray(kit.itens) ? kit.itens : [];
                let maxMontaveis = Infinity;
                if (itensDoKit.length === 0) {
                  maxMontaveis = 0;
                } else {
                  itensDoKit.forEach((it) => {
                    const mat = itens.find((m) => m.id === it.item_id);
                    const saldoAtual = mat ? Number(mat.quantidade_atual || 0) : 0;
                    const qtdNecessaria = Number(it.quantidade || 1);
                    const possiveisComEsse = Math.floor(saldoAtual / qtdNecessaria);
                    if (possiveisComEsse < maxMontaveis) {
                      maxMontaveis = possiveisComEsse;
                    }
                  });
                }
                if (maxMontaveis === Infinity) maxMontaveis = 0;

                const kitPrecoVenda = Number(kit.preco_venda || 0);
                const kitCustoTotal = Number(kit.custo_total || 0);
                const lucroBruto = Math.max(0, kitPrecoVenda - kitCustoTotal);
                const margemBruta = kitPrecoVenda > 0 ? (lucroBruto / kitPrecoVenda) * 100 : 0;

                return (
                  <div
                    key={kit.id}
                    className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition space-y-4"
                  >
                    <div>
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                              {kit.codigo_sku}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                maxMontaveis > 0
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                              }`}
                            >
                              {maxMontaveis > 0
                                ? `${maxMontaveis} kits montáveis`
                                : "Insumos em falta"}
                            </span>
                          </div>
                          <h4 className="font-black text-sm text-slate-900 dark:text-slate-100 mt-2">
                            {kit.nome}
                          </h4>
                          {kit.descricao && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {kit.descricao}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Lista de Insumos da Composição */}
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Composição de Insumos ({itensDoKit.length}):
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {itensDoKit.map((it) => {
                            const mat = itens.find((m) => m.id === it.item_id);
                            const saldo = mat ? Number(mat.quantidade_atual || 0) : 0;
                            const semSaldo = saldo < it.quantidade;

                            return (
                              <div
                                key={it.id || it.item_id}
                                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800"
                              >
                                <span className="truncate mr-2 font-medium text-slate-700 dark:text-slate-300">
                                  {it.material?.nome || mat?.nome || "Material do Kit"}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                                    {it.quantidade} un.
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono ${
                                      semSaldo ? "text-rose-500 font-bold" : "text-slate-400"
                                    }`}
                                    title={`Saldo em estoque: ${saldo}`}
                                  >
                                    (almox: {saldo})
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Resumo Financeiro e Ações */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      <div
                        className={`grid ${podeVerCustosEFornecedores ? "grid-cols-2" : "grid-cols-1"} gap-2 text-xs`}
                      >
                        {podeVerCustosEFornecedores && (
                          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                            <span className="text-[10px] text-slate-400 block">
                              Custo Total Insumos
                            </span>
                            <span className="font-mono font-black text-slate-700 dark:text-slate-300">
                              R$ {Number(kit.custo_total || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-teal-700 dark:text-teal-300 font-bold">
                              Preço de Venda
                            </span>
                            {podeVerCustosEFornecedores && (
                              <span className="text-[9px] font-mono font-bold text-teal-600 dark:text-teal-400">
                                +{kit.markup_percentual}%
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-black text-teal-800 dark:text-teal-200 text-sm">
                            R$ {Number(kit.preco_venda || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {podeVerCustosEFornecedores && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Margem Bruta:{" "}
                            <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                              {margemBruta.toFixed(1)}%
                            </strong>
                          </span>
                          <span>
                            Lucro:{" "}
                            <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                              R$ {lucroBruto.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          onClick={() => {
                            setKitEdicao(kit);
                            setModalKitAberto(true);
                          }}
                          className="px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
                          title="Editar Kit de Instalação"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleExcluirKit(kit)}
                          className="p-1.5 rounded-full border border-rose-300/40 text-rose-500 hover:bg-rose-500/10 transition"
                          title="Excluir Kit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA: RASTREADORES E CHIPS */}
      {abaAtiva === "rastreadores" && <AbaRastreadoresChipsEstoque />}

      {/* CONTEÚDO DA ABA: FORNECEDORES */}
      {abaAtiva === "fornecedores" && (
        <div className={cardTableClass}>
          {/* Barra de Filtros e Busca de Fornecedores */}
          <div className="p-4 border-b border-slate-700/20 space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
                <input
                  type="text"
                  placeholder="Buscar por nome, razão social, CNPJ/CPF, telefone ou PIX..."
                  value={fornecedorBusca}
                  onChange={(e) => setFornecedorBusca(e.target.value)}
                  className={inputSearchClass}
                />
              </div>

              <button
                onClick={() => {
                  setFornecedorEdicao(null);
                  setModalFornecedorAberto(true);
                }}
                className={`px-4 py-2.5 rounded-xl sm:rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 shrink-0 ${
                  isNeumorph
                    ? "bg-[#9EBCEEC] dark:bg-emerald-600 text-slate-900 dark:text-slate-950 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:bg-[#00CFCC]"
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-sm"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Novo Fornecedor</span>
              </button>
            </div>

            {/* Pílulas de Filtro por Categoria */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold opacity-60 flex items-center gap-1 mr-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                Filtrar:
              </span>
              <button
                type="button"
                onClick={() => setFornecedorCategoriaFiltro("todas")}
                className={`px-3 py-1 rounded-full text-xs font-bold transition shrink-0 ${
                  fornecedorCategoriaFiltro === "todas"
                    ? isNeumorph
                      ? "bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4)]"
                      : "bg-emerald-500 text-slate-950 font-black shadow-sm"
                    : "bg-slate-500/10 hover:bg-slate-500/20 opacity-80"
                }`}
              >
                Todas ({fornecedores.length})
              </button>
              {categoriasFornecedoresUnificadas.map((catNome) => {
                const count = fornecedores.filter((f) =>
                  (f.categoria || "")
                    .toLowerCase()
                    .split(",")
                    .map((c) => c.trim())
                    .some((c) => c === catNome.toLowerCase() || c.includes(catNome.toLowerCase())),
                ).length;

                return (
                  <button
                    key={catNome}
                    type="button"
                    onClick={() => setFornecedorCategoriaFiltro(catNome)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                      fornecedorCategoriaFiltro.toLowerCase() === catNome.toLowerCase()
                        ? isNeumorph
                          ? "bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4)]"
                          : "bg-emerald-500 text-slate-950 font-black shadow-sm"
                        : "bg-slate-500/10 hover:bg-slate-500/20 opacity-80"
                    }`}
                  >
                    <span>{catNome}</span>
                    <span className="text-[10px] opacity-75 font-mono">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-500/5 uppercase font-semibold text-[10px] tracking-wider opacity-70">
                <tr>
                  <th className="py-3 px-4">Nome Fantasia / Razão Social</th>
                  <th className="py-3 px-4">Categorias</th>
                  <th className="py-3 px-4">CNPJ / CPF</th>
                  <th className="py-3 px-4">Contato / Telefone</th>
                  <th className="py-3 px-4">Chave PIX</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/20">
                {fornecedoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center opacity-60">
                      Nenhum fornecedor encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  fornecedoresFiltrados.map((forn) => (
                    <tr key={forn.id} className="hover:bg-slate-500/5 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm">{forn.nome_fantasia}</div>
                        <div className="text-[11px] opacity-60">{forn.razao_social}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(forn.categoria || "Geral")
                            .split(",")
                            .map((c) => c.trim())
                            .filter(Boolean)
                            .map((cat, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              >
                                {cat}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono opacity-80">{forn.cnpj_cpf || "—"}</td>
                      <td className="py-3.5 px-4">
                        <div>{forn.contato_nome || "—"}</div>
                        <div className="font-mono text-[11px] opacity-60">
                          {forn.telefone || forn.email || ""}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono opacity-80">{forn.chave_pix || "—"}</td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setFornecedorEdicao(forn);
                              setModalFornecedorAberto(true);
                            }}
                            className="p-1.5 rounded-full hover:bg-slate-500/15 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                            title="Editar Fornecedor"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleExcluirFornecedor(forn)}
                            className="p-1.5 rounded-full hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 transition"
                            title="Excluir Fornecedor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: MOVIMENTAÇÕES AUDITÁVEIS */}
      {abaAtiva === "movimentacoes" && (
        <div className={cardTableClass}>
          <div className="p-4 border-b border-slate-700/20 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm">Extrato Auditável de Movimentações</h2>
              <p className="text-xs opacity-60">
                Rastreabilidade de compras integradas ao Financeiro e baixas técnicas por instalação
              </p>
            </div>
            <button
              onClick={carregarDados}
              className="p-2 rounded-full hover:bg-slate-500/10 opacity-70 hover:opacity-100 transition"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-500/5 uppercase font-semibold text-[10px] tracking-wider opacity-70">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Material</th>
                  <th className="py-3 px-4">Quantidade</th>
                  {podeVerCustosEFornecedores && (
                    <>
                      <th className="py-3 px-4">Custo Unitário</th>
                      <th className="py-3 px-4">Total</th>
                    </>
                  )}
                  <th className="py-3 px-4">Saldos (Ant → Post)</th>
                  <th className="py-3 px-4">
                    {podeVerCustosEFornecedores ? "Origem / Vínculo" : "Destino / Vínculo"}
                  </th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/20">
                {movimentacoes.map((mov) => {
                  const isEntrada = mov.tipo === "entrada_compra";
                  return (
                    <tr key={mov.id} className="hover:bg-slate-500/5 transition">
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap opacity-80">
                        {new Date(mov.data_movimento).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isEntrada
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {isEntrada ? (
                            <>
                              <ArrowDownRight className="w-3 h-3" />
                              <span>Compra</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3" />
                              <span>Instalação</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold">{mov.item?.nome || "Material"}</div>
                        <div className="text-[10px] font-mono opacity-60">
                          {mov.item?.codigo_sku || ""}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        {isEntrada ? `+${mov.quantidade}` : `-${mov.quantidade}`}{" "}
                        {mov.item?.unidade_medida || "un"}
                      </td>
                      {podeVerCustosEFornecedores && (
                        <>
                          <td className="py-3.5 px-4 font-mono">
                            R$ {Number(mov.custo_unitario || 0).toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold">
                            R$ {Number(mov.valor_total || 0).toFixed(2)}
                          </td>
                        </>
                      )}
                      <td className="py-3.5 px-4 font-mono text-[11px] opacity-75">
                        {mov.saldo_anterior} → {mov.saldo_posterior}
                      </td>
                      <td className="py-3.5 px-4">
                        {isEntrada ? (
                          <div>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold block">
                              Entrada de Compra
                            </span>
                            {podeVerCustosEFornecedores && (
                              <span className="text-[10px] opacity-70">
                                {mov.fornecedor?.nome_fantasia || "Fornecedor Avulso"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-amber-600 dark:text-amber-400 font-semibold block">
                              Instalação Concluída
                            </span>
                            <span className="text-[10px] font-mono opacity-70">
                              {mov.instalacao?.placa || mov.observacao || "Veículo"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isEntrada && podeVerCustosEFornecedores && (
                            <button
                              onClick={() => {
                                setMovimentacaoEdicao(mov);
                                setModalEditarCompraAberto(true);
                              }}
                              className="p-1.5 rounded-full hover:bg-blue-500/15 text-slate-400 hover:text-blue-500 transition"
                              title="Editar dados da compra"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {podeVerCustosEFornecedores && (
                            <button
                              onClick={() => handleExcluirMovimentacao(mov)}
                              className="p-1.5 rounded-full hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 transition"
                              title={
                                isEntrada ? "Estornar e excluir compra" : "Excluir movimentação"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Compra e Entrada de Estoque */}
      {modalCompraAberto && (
        <EntradaEstoqueModal
          itens={itens}
          fornecedores={fornecedores}
          itemPreSelecionadoId={itemCompraPreSelecionado}
          tema={tema}
          onSalvo={carregarDados}
          onFechar={() => setModalCompraAberto(false)}
        />
      )}

      {/* Modal de Cadastro de Fornecedor */}
      {modalFornecedorAberto && (
        <FornecedorModal
          fornecedorParaEdicao={fornecedorEdicao}
          tema={tema}
          onSalvo={carregarDados}
          onFechar={() => setModalFornecedorAberto(false)}
        />
      )}

      {/* Modal de Cadastro e Edição de Material */}
      {modalMaterialAberto && (
        <MaterialModal
          materialParaEdicao={materialEdicao}
          categoriasExistentes={categoriasDinamicas}
          itensExistentes={itens}
          tema={tema}
          podeVerCustos={podeVerCustosEFornecedores}
          onSalvo={carregarDados}
          onFechar={() => setModalMaterialAberto(false)}
        />
      )}

      {/* Modal de Montagem e Edição de Kit */}
      {modalKitAberto && (
        <KitModal
          kitParaEdicao={kitEdicao}
          kitsExistentes={kits}
          materiaisDisponiveis={itens}
          tema={tema}
          podeVerCustos={podeVerCustosEFornecedores}
          onSalvo={carregarDados}
          onFechar={() => {
            setModalKitAberto(false);
            setKitEdicao(null);
          }}
        />
      )}

      {/* Modal Leitor e Importador de PDF / NF-e */}
      {modalLeitorPdfAberto && (
        <LeitorPdfModal
          itensExistentes={itens}
          fornecedoresExistentes={fornecedores}
          tema={tema}
          onConcluido={carregarDados}
          onFechar={() => setModalLeitorPdfAberto(false)}
        />
      )}

      {/* Modal de Edição e Estorno de Compra */}
      {modalEditarCompraAberto && movimentacaoEdicao && (
        <EditarCompraModal
          movimentacao={movimentacaoEdicao}
          itens={itens}
          fornecedores={fornecedores}
          onSalvo={carregarDados}
          onFechar={() => {
            setModalEditarCompraAberto(false);
            setMovimentacaoEdicao(null);
          }}
        />
      )}
    </div>
  );
}
