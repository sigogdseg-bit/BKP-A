import { useState, useRef } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  FileUp,
  FileText,
  Building2,
  Package,
  ShoppingCart,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles,
  DollarSign,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  extrairDadosNfeDePdf,
  type DadosNfeExtraidos,
  type ItemNfeExtraido,
} from "../utils/pdfNfeParser";
import {
  salvarFornecedor,
  salvarItemEstoque,
  registrarEntradaCompra,
} from "../services/estoqueService";
import { CATEGORIAS_SUGERIDAS } from "./MaterialModal";
import { formatarCpfCnpj, formatarTelefone } from "../utils/mascaras";
import type { ItemEstoque, Fornecedor, TemaEstoque } from "../types";

interface LeitorPdfModalProps {
  itensExistentes: ItemEstoque[];
  fornecedoresExistentes: Fornecedor[];
  tema?: TemaEstoque;
  onConcluido: () => void;
  onFechar: () => void;
}

export function LeitorPdfModal({
  itensExistentes,
  fornecedoresExistentes,
  tema = "hunter_padrao",
  onConcluido,
  onFechar,
}: LeitorPdfModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [analisando, setAnalisando] = useState(false);
  const [processandoAcoes, setProcessandoAcoes] = useState(false);
  const [dadosExtraidos, setDadosExtraidos] = useState<DadosNfeExtraidos | null>(null);

  // Estados editáveis do Fornecedor
  const [fornecedorAtivo, setFornecedorAtivo] = useState(true);
  const [fornecedorRazaoSocial, setFornecedorRazaoSocial] = useState("");
  const [fornecedorNomeFantasia, setFornecedorNomeFantasia] = useState("");
  const [fornecedorCnpj, setFornecedorCnpj] = useState("");
  const [fornecedorTelefone, setFornecedorTelefone] = useState("");
  const [fornecedorCategorias, setFornecedorCategorias] = useState<string>("Rastreadores");

  // Estados editáveis da Compra / Nota Fiscal
  const [compraAtiva, setCompraAtiva] = useState(true);
  const [numeroNf, setNumeroNf] = useState("");
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().split("T")[0]);
  const [valorFrete, setValorFrete] = useState<number>(0);
  const [observacoesCompra, setObservacoesCompra] = useState("");

  // Estados editáveis dos Itens
  const [itens, setItens] = useState<ItemNfeExtraido[]>([]);

  const isNeumorph = tema === "neumorphism_soft";
  const isStyleguide = tema === "product_styleguide";

  const modalContainerClass = isNeumorph
    ? "bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[6px_6px_24px_#c3cfe2] dark:shadow-2xl border border-slate-300/70 dark:border-slate-800 rounded-[28px]"
    : isStyleguide
      ? "bg-[#FAFBFD] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-[#CBD5E1] dark:border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.18)] rounded-[28px]"
      : "bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl rounded-3xl";

  const cardSectionClass = isNeumorph
    ? "p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/70 border border-slate-300/70 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-xs space-y-3"
    : isStyleguide
      ? "p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-950/80 border border-[#CBD5E1] dark:border-slate-800 shadow-xs space-y-3"
      : "p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 shadow-xs space-y-3";

  const inputClass = isNeumorph
    ? "w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs shadow-xs border border-slate-300/70 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC]/30 focus:border-[#00CFCC] transition"
    : isStyleguide
      ? "w-full px-3.5 py-2 rounded-xl bg-[#F1F5F9] dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs border border-[#CBD5E1] dark:border-slate-800 focus:border-[#00CFCC] focus:ring-2 focus:ring-[#00CFCC]/20 outline-none transition shadow-xs"
      : "w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs border border-slate-300/70 dark:border-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs outline-none transition";

  const handleProcessarArquivo = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Por favor, selecione um arquivo no formato PDF.");
      return;
    }

    setArquivoNome(file.name);
    setAnalisando(true);
    try {
      const extraidos = await extrairDadosNfeDePdf(file, file.name);
      setDadosExtraidos(extraidos);

      if (extraidos.sucesso) {
        toast.success("PDF analisado com sucesso! Revise e confirme os cadastros.");

        // Detecta se o CNPJ extraído já pertence a um fornecedor cadastrado
        const cnpjLimpo = (extraidos.fornecedor.cnpjCpf || "").replace(/\D/g, "");
        const fornecedorJaCadastrado = fornecedoresExistentes.find(
          (f) => (f.cnpj_cpf || "").replace(/\D/g, "") === cnpjLimpo && cnpjLimpo.length >= 11,
        );

        const razaoFinal =
          fornecedorJaCadastrado?.razao_social ||
          (extraidos.fornecedor.razaoSocial.toUpperCase() === "LTDA" && fornecedorJaCadastrado
            ? fornecedorJaCadastrado.razao_social
            : extraidos.fornecedor.razaoSocial);

        const fantasiaFinal =
          fornecedorJaCadastrado?.nome_fantasia ||
          (extraidos.fornecedor.nomeFantasia.toUpperCase() === "LTDA" && fornecedorJaCadastrado
            ? fornecedorJaCadastrado.nome_fantasia
            : extraidos.fornecedor.nomeFantasia);

        const categoriasFinais =
          fornecedorJaCadastrado?.categoria || extraidos.fornecedor.categoria || "Chips M2M";

        const telefoneFinal =
          fornecedorJaCadastrado?.telefone || extraidos.fornecedor.telefone || "";

        // Preenche fornecedor
        setFornecedorAtivo(true);
        setFornecedorRazaoSocial(razaoFinal);
        setFornecedorNomeFantasia(fantasiaFinal);
        setFornecedorCnpj(formatarCpfCnpj(extraidos.fornecedor.cnpjCpf));
        setFornecedorTelefone(formatarTelefone(telefoneFinal));
        setFornecedorCategorias(categoriasFinais);

        // Preenche compra
        setCompraAtiva(true);
        setNumeroNf(extraidos.compra.numeroNf);
        setDataPagamento(extraidos.compra.dataEmissao || new Date().toISOString().split("T")[0]);
        setValorFrete(extraidos.compra.valorFrete || 0);
        setObservacoesCompra(extraidos.compra.observacoes || `Importado via PDF: ${file.name}`);

        // Preenche itens (com garantia de nunca ficar zerado)
        if (!extraidos.itens || extraidos.itens.length === 0) {
          const itemSugerido: ItemNfeExtraido = {
            idTemp: `nfe-item-sug-${Date.now()}`,
            selecionado: true,
            codigo: extraidos.compra.numeroNf ? `MAT-${extraidos.compra.numeroNf}` : "MAT-01",
            descricao: file.name.toLowerCase().includes("chip")
              ? "Chip M2M Multi-Operadora"
              : file.name.toLowerCase().includes("rastreador")
                ? "Rastreador GPS Veicular"
                : "Material / Insumo Importado",
            quantidade: 1,
            unidadeMedida: "unidade",
            custoUnitario: extraidos.compra.valorTotalNf || 0,
            valorTotal: extraidos.compra.valorTotalNf || 0,
            categoriaSugerida: file.name.toLowerCase().includes("chip")
              ? "Chips M2M"
              : "Rastreadores",
          };
          setItens([itemSugerido]);
        } else {
          setItens(extraidos.itens);
        }
      } else {
        toast.error(extraidos.mensagem);
      }
    } catch (err: any) {
      toast.error("Falha ao analisar o PDF da nota fiscal: " + (err?.message || ""));
    } finally {
      setAnalisando(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessarArquivo(e.dataTransfer.files[0]);
    }
  };

  const alternarItem = (idTemp: string) => {
    setItens((prev) =>
      prev.map((it) => (it.idTemp === idTemp ? { ...it, selecionado: !it.selecionado } : it)),
    );
  };

  const atualizarItem = (idTemp: string, campo: keyof ItemNfeExtraido, valor: any) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.idTemp === idTemp) {
          const atualizado = { ...it, [campo]: valor };
          if (campo === "quantidade" || campo === "custoUnitario") {
            atualizado.valorTotal = Number(
              (atualizado.quantidade * atualizado.custoUnitario).toFixed(2),
            );
          }
          return atualizado;
        }
        return it;
      }),
    );
  };

  const removerItem = (idTemp: string) => {
    setItens((prev) => prev.filter((it) => it.idTemp !== idTemp));
  };

  const adicionarItemManual = () => {
    const novo: ItemNfeExtraido = {
      idTemp: `manual-${Date.now()}`,
      selecionado: true,
      codigo: `MAT-00${itens.length + 1}`,
      descricao: "Novo Item Adicionado Manualmente",
      quantidade: 1,
      unidadeMedida: "unidade",
      custoUnitario: 50.0,
      valorTotal: 50.0,
      categoriaSugerida: "Insumos de Instalação",
    };
    setItens((prev) => [...prev, novo]);
  };

  // Verifica se fornecedor já existe pelo CNPJ
  const fornecedorExistente = fornecedoresExistentes.find(
    (f) =>
      f.cnpj_cpf &&
      fornecedorCnpj &&
      f.cnpj_cpf.replace(/\D/g, "") === fornecedorCnpj.replace(/\D/g, ""),
  );

  // Executa os cadastros selecionados pelo usuário
  const handleConfirmarCadastros = async () => {
    setProcessandoAcoes(true);
    let cadastrosRealizados = 0;
    let fornecedorFinalId: string | undefined = fornecedorExistente?.id;

    try {
      // 1. Cadastrar ou Atualizar Fornecedor se selecionado
      if (fornecedorAtivo && fornecedorNomeFantasia.trim()) {
        const resForn = await salvarFornecedor(
          {
            razaoSocial: fornecedorRazaoSocial || fornecedorNomeFantasia,
            nomeFantasia: fornecedorNomeFantasia,
            cnpjCpf: fornecedorCnpj || undefined,
            telefone: fornecedorTelefone || undefined,
            categoria: fornecedorCategorias || "Rastreadores",
          },
          fornecedorExistente?.id,
        );

        if (resForn.success) {
          if (resForn.id) fornecedorFinalId = resForn.id;
          cadastrosRealizados++;
        }
      }

      // 2. Processar materiais selecionados
      const itensSelecionados = itens.filter((it) => it.selecionado);

      if (itensSelecionados.length === 0 && !fornecedorAtivo) {
        toast.error("Nenhum item ou fornecedor foi marcado para cadastro.");
        setProcessandoAcoes(false);
        return;
      }

      const freteRateadoPorItem =
        itensSelecionados.length > 0
          ? Number((valorFrete / itensSelecionados.length).toFixed(2))
          : 0;

      for (const item of itensSelecionados) {
        let itemIdDestino = item.vincularItemIdExistente;

        // Se não vinculou a um existente, cadastra novo material no catálogo
        if (!itemIdDestino) {
          const resMaterial = await salvarItemEstoque({
            codigo_sku: item.codigo.trim() || `MAT-${Date.now().toString().slice(-4)}`,
            nome: item.descricao.trim(),
            categoria: item.categoriaSugerida || "Rastreadores",
            unidade_medida: item.unidadeMedida || "unidade",
            quantidade_minima: 5,
            localizacao: "Almoxarifado Principal",
          });

          if (resMaterial.success && resMaterial.item?.id) {
            itemIdDestino = resMaterial.item.id;
            cadastrosRealizados++;
          }
        }

        // Se marcada a opção de compra, lança a entrada no estoque e financeiro
        if (compraAtiva && itemIdDestino) {
          await registrarEntradaCompra({
            itemId: itemIdDestino,
            quantidade: Number(item.quantidade),
            custoUnitario: Number(item.custoUnitario),
            valorFrete: freteRateadoPorItem,
            fornecedorId: fornecedorFinalId,
            documentoFiscal: numeroNf || undefined,
            dataPagamento,
            observacoes: observacoesCompra || `Entrada gerada por leitor PDF NF ${numeroNf}`,
          });
          cadastrosRealizados++;
        }
      }

      toast.success(
        `Importação concluída com sucesso! ${cadastrosRealizados} operação(ões) registrada(s).`,
      );
      onConcluido();
      onFechar();
    } catch (err: any) {
      toast.error("Erro durante a gravação dos cadastros: " + (err?.message || ""));
    } finally {
      setProcessandoAcoes(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <div
          className={`relative w-full max-w-4xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-hidden shadow-2xl rounded-3xl ${modalContainerClass}`}
        >
          {/* Cabeçalho Fixo do Modal */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800/80 shrink-0 bg-white/70 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isNeumorph
                    ? "bg-[#eaf0f8] shadow-[2px_2px_5px_#c3cfe2] border border-slate-300/40 text-orange-600"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                }`}
              >
                <FileUp className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-wide">
                    Leitor de PDF de Compras e NF-e
                  </h2>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                    OCR / TEXTO
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Extração automática com sugestão e autonomia total para selecionar e editar cada
                  cadastro
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

          {/* Corpo Rolável do Modal */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
            {/* Área de Upload / Dropzone */}
            {!dadosExtraidos && (
              <div className="my-3">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all hover:border-[#00CFCC] ${
                    isNeumorph
                      ? "bg-[#eaf0f8] border-slate-300/80 shadow-[inset_2px_2px_6px_#c3cfe2]"
                      : "bg-slate-500/5 border-slate-400/30 hover:bg-slate-500/10"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleProcessarArquivo(e.target.files[0]);
                      }
                    }}
                  />
                  {analisando ? (
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <RefreshCw className="w-10 h-10 text-orange-500 animate-spin" />
                      <span className="text-sm font-bold">
                        Lendo e estruturando dados do PDF...
                      </span>
                      <span className="text-xs opacity-60">
                        Localizando fornecedor, itens, custos, frete e número da NF
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base">
                          Clique para escolher o PDF da NF-e / Pedido de Compra
                        </h3>
                        <p className="text-xs opacity-70 mt-1">
                          ou arraste o arquivo PDF diretamente nesta área (DANFE, Fatura ou Pedido
                          de Compra)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Conteúdo Extraído com Poder Total de Edição */}
            {dadosExtraidos && (
              <div className="my-5 space-y-5">
                {/* Aviso Superior do Arquivo */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span className="font-bold font-mono">{arquivoNome}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDadosExtraidos(null);
                      setArquivoNome("");
                    }}
                    className="text-orange-700 dark:text-orange-300 font-bold hover:underline"
                  >
                    Trocar arquivo PDF
                  </button>
                </div>

                {/* SEÇÃO 1: FORNECEDOR */}
                <div className={cardSectionClass}>
                  <div className="flex items-center justify-between border-b border-slate-700/20 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fornecedorAtivo}
                        onChange={(e) => setFornecedorAtivo(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                      />
                      <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide">
                        <Building2 className="w-4 h-4 text-orange-500" />
                        <span>1. Dados do Fornecedor / Emitente</span>
                      </div>
                    </label>
                    {fornecedorExistente && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                        Já Cadastrado: {fornecedorExistente.nome_fantasia}
                      </span>
                    )}
                  </div>

                  {fornecedorAtivo && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Nome Fantasia *
                        </label>
                        <input
                          type="text"
                          value={fornecedorNomeFantasia}
                          onChange={(e) => setFornecedorNomeFantasia(e.target.value)}
                          className={inputClass}
                          placeholder="Ex: Voxter"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Razão Social
                        </label>
                        <input
                          type="text"
                          value={fornecedorRazaoSocial}
                          onChange={(e) => setFornecedorRazaoSocial(e.target.value)}
                          className={inputClass}
                          placeholder="Ex: Voxter do Brasil Ltda"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          CNPJ / CPF
                        </label>
                        <input
                          type="text"
                          value={fornecedorCnpj}
                          onChange={(e) => setFornecedorCnpj(formatarCpfCnpj(e.target.value))}
                          className={inputClass}
                          placeholder="00.000.000/0001-00"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Telefone / Celular
                        </label>
                        <input
                          type="text"
                          value={fornecedorTelefone}
                          onChange={(e) => setFornecedorTelefone(formatarTelefone(e.target.value))}
                          className={inputClass}
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Categorias de Fornecimento
                        </label>
                        <input
                          type="text"
                          value={fornecedorCategorias}
                          onChange={(e) => setFornecedorCategorias(e.target.value)}
                          className={inputClass}
                          placeholder="Ex: Rastreadores, Chips M2M, Relés"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 2: DADOS DA COMPRA / NOTA FISCAL */}
                <div className={cardSectionClass}>
                  <div className="flex items-center justify-between border-b border-slate-700/20 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={compraAtiva}
                        onChange={(e) => setCompraAtiva(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                      />
                      <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide">
                        <ShoppingCart className="w-4 h-4 text-orange-500" />
                        <span>2. Lançar Compra / Entrada com Frete e NF</span>
                      </div>
                    </label>
                    <span className="text-[10px] opacity-60">Integração Financeira Automática</span>
                  </div>

                  {compraAtiva && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Número da NF / Pedido
                        </label>
                        <input
                          type="text"
                          value={numeroNf}
                          onChange={(e) => setNumeroNf(e.target.value)}
                          className={inputClass}
                          placeholder="Ex: NF-12345"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Data da Compra / Pagamento
                        </label>
                        <input
                          type="date"
                          value={dataPagamento}
                          onChange={(e) => setDataPagamento(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Valor do Frete (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={valorFrete || ""}
                          onChange={(e) => setValorFrete(Number(e.target.value))}
                          className={inputClass}
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold opacity-80 mb-1">
                          Observações da Compra
                        </label>
                        <input
                          type="text"
                          value={observacoesCompra}
                          onChange={(e) => setObservacoesCompra(e.target.value)}
                          className={inputClass}
                          placeholder="Observações da NF..."
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 3: MATERIAIS / ITENS IDENTIFICADOS */}
                <div className={cardSectionClass}>
                  <div className="flex items-center justify-between border-b border-slate-700/20 pb-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide">
                      <Package className="w-4 h-4 text-orange-500" />
                      <span>3. Materiais Identificados no PDF ({itens.length})</span>
                    </div>
                    <button
                      type="button"
                      onClick={adicionarItemManual}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 transition flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Item Manual</span>
                    </button>
                  </div>

                  {itens.length === 0 ? (
                    <div className="p-6 text-center text-xs opacity-60">
                      Nenhum item detectado automaticamente. Clique em "Adicionar Item Manual".
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {itens.map((it, idx) => (
                        <div
                          key={it.idTemp}
                          className={`p-3 rounded-2xl border transition-all ${
                            it.selecionado
                              ? "bg-slate-500/5 border-orange-500/40"
                              : "opacity-50 border-slate-500/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                              <input
                                type="checkbox"
                                checked={it.selecionado}
                                onChange={() => alternarItem(it.idTemp)}
                                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                              />
                              <span>
                                Item {idx + 1}: {it.descricao}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => removerItem(it.idTemp)}
                              className="p-1 hover:text-rose-500 transition"
                              title="Remover este item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {it.selecionado && (
                            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 pt-1 text-xs">
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] opacity-75 mb-0.5">
                                  Descrição / Nome do Material *
                                </label>
                                <input
                                  type="text"
                                  value={it.descricao}
                                  onChange={(e) =>
                                    atualizarItem(it.idTemp, "descricao", e.target.value)
                                  }
                                  className={inputClass}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] opacity-75 mb-0.5">
                                  Código SKU *
                                </label>
                                <input
                                  type="text"
                                  value={it.codigo}
                                  onChange={(e) =>
                                    atualizarItem(it.idTemp, "codigo", e.target.value)
                                  }
                                  className={inputClass}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] opacity-75 mb-0.5">
                                  Quantidade *
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  value={it.quantidade}
                                  onChange={(e) =>
                                    atualizarItem(it.idTemp, "quantidade", Number(e.target.value))
                                  }
                                  className={inputClass}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] opacity-75 mb-0.5">
                                  Custo Unit. (R$) *
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={it.custoUnitario}
                                  onChange={(e) =>
                                    atualizarItem(
                                      it.idTemp,
                                      "custoUnitario",
                                      Number(e.target.value),
                                    )
                                  }
                                  className={inputClass}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] opacity-75 mb-0.5">
                                  Categoria
                                </label>
                                <select
                                  value={it.categoriaSugerida}
                                  onChange={(e) =>
                                    atualizarItem(it.idTemp, "categoriaSugerida", e.target.value)
                                  }
                                  className={inputClass}
                                >
                                  {CATEGORIAS_SUGERIDAS.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Seletor opcional para vincular a um item que já existe no almoxarifado */}
                              <div className="sm:col-span-6 flex items-center justify-between text-[11px] pt-1 border-t border-slate-700/10">
                                <span className="opacity-70">
                                  Subtotal deste item: R$ {it.valorTotal.toFixed(2)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="opacity-70">
                                    Vincular a material já existente?
                                  </span>
                                  <select
                                    value={it.vincularItemIdExistente || ""}
                                    onChange={(e) =>
                                      atualizarItem(
                                        it.idTemp,
                                        "vincularItemIdExistente",
                                        e.target.value || undefined,
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg text-xs bg-slate-500/10 border border-slate-300/40 dark:border-slate-800"
                                  >
                                    <option value="">Não (Criar Novo Material no Catálogo)</option>
                                    {itensExistentes.map((mat) => (
                                      <option key={mat.id} value={mat.id}>
                                        Vincular ao: [{mat.codigo_sku}] {mat.nome}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800/80 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
            <div>
              {dadosExtraidos && (
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  {itens.filter((it) => it.selecionado).length} item(ns) selecionado(s) para
                  gravação
                </span>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onFechar}
                disabled={processandoAcoes}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs transition min-h-[44px] flex items-center justify-center"
              >
                Cancelar
              </button>
              {dadosExtraidos && (
                <button
                  type="button"
                  onClick={handleConfirmarCadastros}
                  disabled={processandoAcoes}
                  className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-orange-600 hover:bg-orange-500 shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2 min-h-[44px] ${
                    processandoAcoes ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {processandoAcoes ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gravando Cadastros...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Confirmar e Cadastrar Selecionados</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
