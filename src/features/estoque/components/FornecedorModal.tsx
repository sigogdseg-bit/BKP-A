import { useState } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  Building2,
  Phone,
  Mail,
  FileText,
  Check,
  ShieldCheck,
  DollarSign,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { salvarFornecedor, excluirFornecedor } from "../services/estoqueService";
import { formatarTelefone, formatarCpfCnpj } from "../utils/mascaras";
import { CATEGORIAS_SUGERIDAS } from "./MaterialModal";
import type { Fornecedor, TemaEstoque } from "../types";

export { CATEGORIAS_SUGERIDAS };

export const OPCOES_CATEGORIAS_FORNECEDOR = CATEGORIAS_SUGERIDAS.map((c) => ({
  id: c,
  label: c,
  badge: c,
  desc: c,
}));

interface FornecedorModalProps {
  fornecedorParaEdicao?: Fornecedor | null;
  tema?: TemaEstoque;
  onSalvo: () => void;
  onFechar: () => void;
}

export function FornecedorModal({
  fornecedorParaEdicao,
  tema = "hunter_padrao",
  onSalvo,
  onFechar,
}: FornecedorModalProps) {
  const isEdicao = !!fornecedorParaEdicao;

  const [razaoSocial, setRazaoSocial] = useState(fornecedorParaEdicao?.razao_social || "");
  const [nomeFantasia, setNomeFantasia] = useState(fornecedorParaEdicao?.nome_fantasia || "");
  const [cnpjCpf, setCnpjCpf] = useState(formatarCpfCnpj(fornecedorParaEdicao?.cnpj_cpf || ""));
  const [contatoNome, setContatoNome] = useState(fornecedorParaEdicao?.contato_nome || "");
  const [telefone, setTelefone] = useState(formatarTelefone(fornecedorParaEdicao?.telefone || ""));
  const [email, setEmail] = useState(fornecedorParaEdicao?.email || "");

  // Multi-categoria com modelo dinâmico livre igual ao Novo Material
  const categoriasIniciais = fornecedorParaEdicao?.categoria
    ? fornecedorParaEdicao.categoria
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : ["Rastreadores"];

  const [categorias, setCategorias] = useState<string[]>(
    categoriasIniciais.length > 0 ? categoriasIniciais : ["Rastreadores"],
  );
  const [categoriaTexto, setCategoriaTexto] = useState<string>(categoriasIniciais.join(", "));
  const [chavePix, setChavePix] = useState(fornecedorParaEdicao?.chave_pix || "");
  const [observacoes, setObservacoes] = useState(fornecedorParaEdicao?.observacoes || "");

  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const handleExcluir = async () => {
    if (!fornecedorParaEdicao) return;
    const confirmou = window.confirm(
      `Deseja realmente remover o parceiro "${fornecedorParaEdicao.nome_fantasia}" da lista de fornecedores?`,
    );
    if (!confirmou) return;

    setExcluindo(true);
    try {
      const res = await excluirFornecedor(fornecedorParaEdicao.id);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Falha ao remover fornecedor.");
    } finally {
      setExcluindo(false);
    }
  };

  const toggleCategoria = (catNome: string) => {
    setCategorias((prev) => {
      const existe = prev.some((c) => c.toLowerCase() === catNome.toLowerCase());
      let nova: string[];
      if (existe) {
        nova = prev.filter((c) => c.toLowerCase() !== catNome.toLowerCase());
        if (nova.length === 0) nova = [catNome];
      } else {
        nova = [...prev, catNome];
      }
      setCategoriaTexto(nova.join(", "));
      return nova;
    });
  };

  const handleTextoCategoriasChange = (texto: string) => {
    setCategoriaTexto(texto);
    const parsed = texto
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    setCategorias(parsed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!razaoSocial.trim() || !nomeFantasia.trim()) {
      toast.error("Preencha a Razão Social e o Nome Fantasia do fornecedor.");
      return;
    }

    if (categorias.length === 0) {
      toast.error("Selecione ao menos uma categoria de fornecimento.");
      return;
    }

    setSalvando(true);
    try {
      const res = await salvarFornecedor(
        {
          razaoSocial: razaoSocial.trim(),
          nomeFantasia: nomeFantasia.trim(),
          cnpjCpf: cnpjCpf.trim() || undefined,
          contatoNome: contatoNome.trim() || undefined,
          telefone: telefone.trim() || undefined,
          email: email.trim() || undefined,
          categoria: categorias.join(", "),
          chavePix: chavePix.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        },
        fornecedorParaEdicao?.id,
      );

      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Falha inesperada ao registrar fornecedor.");
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
                    ? "bg-[#eaf0f8] shadow-[2px_2px_5px_#c3cfe2] border border-slate-300/40 text-teal-600"
                    : isStyleguide
                      ? "bg-[#9EE5D4]/40 text-[#064E3B] border border-[#9EE5D4]"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-wide">
                  {isEdicao ? "Editar Fornecedor" : "Novo Fornecedor"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cadastro para compra de insumos e integração financeira
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Nome Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Concox Brasil"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Razão Social *
                </label>
                <input
                  type="text"
                  required
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Ex: Concox Wireless Solutions Ltda"
                  className={inputClass}
                />
              </div>
            </div>

            {/* CNPJ / CPF com formatação dinâmica */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                CNPJ ou CPF (Formatação Automática)
              </label>
              <input
                type="text"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(formatarCpfCnpj(e.target.value))}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                maxLength={18}
                className={inputClass}
              />
            </div>

            {/* Categorias de Fornecimento Livre e Dinâmica (Modelo Novo Material) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Categorias de Fornecimento (Livre e Dinâmica) *</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] opacity-60">Escolha ou digite novas</span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/40">
                    {categorias.length} {categorias.length === 1 ? "selecionada" : "selecionadas"}
                  </span>
                </div>
              </div>

              <input
                type="text"
                required
                value={categoriaTexto}
                onChange={(e) => handleTextoCategoriasChange(e.target.value)}
                placeholder="Ex: Rastreadores, Chips M2M, Relés (separados por vírgula)..."
                className={inputClass}
              />

              {/* Chips de Sugestão de Categorias idênticos ao Modelo Novo Material */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {CATEGORIAS_SUGERIDAS.map((catNome) => {
                  const selecionada = categorias.some(
                    (c) => c.toLowerCase() === catNome.toLowerCase(),
                  );
                  return (
                    <button
                      key={catNome}
                      type="button"
                      onClick={() => toggleCategoria(catNome)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                        selecionada
                          ? "bg-teal-600 text-white shadow-xs font-black"
                          : "bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {selecionada && <Check className="w-3 h-3 stroke-[3]" />}
                      <span>{catNome}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  value={contatoNome}
                  onChange={(e) => setContatoNome(e.target.value)}
                  placeholder="Ex: Vendas / Carlos"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Telefone / Celular
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@fornecedor.com.br"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Chave PIX para Pagamento
                </label>
                <input
                  type="text"
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  placeholder="E-mail, CNPJ ou Telefone PIX"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                  Observações Adicionais
                </label>
                <input
                  type="text"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Prazo de entrega, garantia, etc."
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
          <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800/80 shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
            {isEdicao ? (
              <button
                type="button"
                onClick={handleExcluir}
                disabled={excluindo || salvando}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-bold transition disabled:opacity-50 min-h-[44px]"
                title="Remover este fornecedor"
              >
                <Trash2 className="w-4 h-4" />
                <span>{excluindo ? "Removendo..." : "Excluir Fornecedor"}</span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando || excluindo}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs transition min-h-[44px] flex items-center justify-center"
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
                    <span>{isEdicao ? "Atualizar Fornecedor" : "Salvar Fornecedor"}</span>
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
