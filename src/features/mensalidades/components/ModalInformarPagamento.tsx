import { useState } from "react";
import {
  X,
  CheckCircle2,
  Upload,
  Calendar,
  FileText,
  Copy,
  Check,
  QrCode,
  DollarSign,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { APP_CHAVE_PIX_PADRAO, APP_NOME } from "@/shared/lib/version";
import {
  formatarCompetenciaMensalidade,
  formatarParcelaMensalidade,
  informarPagamentoCliente,
} from "../services/mensalidadeService";
import { calcularEncargosAtraso } from "../utils/encargosLegais";
import type { MensalidadeItem } from "../types";

interface ModalInformarPagamentoProps {
  mensalidade: MensalidadeItem;
  clienteNome?: string;
  onFechar: () => void;
  onSucesso: () => void;
}

export function ModalInformarPagamento({
  mensalidade,
  clienteNome,
  onFechar,
  onSucesso,
}: ModalInformarPagamentoProps) {
  const [dataPagamento, setDataPagamento] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [observacoes, setObservacoes] = useState("");
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiadoPix, setCopiadoPix] = useState(false);

  const isVencido = mensalidade.status === "vencido" && mensalidade.data_vencimento;
  const enc = isVencido
    ? calcularEncargosAtraso(Number(mensalidade.valor), mensalidade.data_vencimento)
    : null;
  const valorEfetivo = enc ? enc.valorTotalAtualizado : Number(mensalidade.valor);

  const isAdesao = mensalidade.mes_referencia === 0;
  const competenciaTexto = isAdesao
    ? `Taxa de Adesão (${mensalidade.ano_referencia})`
    : formatarCompetenciaMensalidade(mensalidade.mes_referencia, mensalidade.ano_referencia);
  const parcelaTexto = isAdesao
    ? ""
    : formatarParcelaMensalidade(mensalidade.numero_parcela, mensalidade.total_parcelas);

  const handleCopiarChavePix = () => {
    navigator.clipboard.writeText(APP_CHAVE_PIX_PADRAO);
    setCopiadoPix(true);
    toast.success("Chave PIX copiada para a área de transferência!");
    setTimeout(() => setCopiadoPix(false), 2500);
  };

  const handleArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("O arquivo excede o limite máximo permitido de 5MB.");
      return;
    }

    setNomeArquivo(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setArquivoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dataPagamento) {
      toast.error("Informe a data em que o pagamento foi realizado.");
      return;
    }

    setEnviando(true);
    try {
      const res = await informarPagamentoCliente({
        mensalidadeId: mensalidade.id,
        comprovanteUrl: arquivoBase64 || undefined,
        observacoes: observacoes.trim() || (nomeArquivo ? `Arquivo: ${nomeArquivo}` : undefined),
        dataPagamento,
        clienteNome: clienteNome || mensalidade.clientes?.nome_razao_social || "Cliente",
      });

      if (res.success) {
        toast.success(res.message);
        onSucesso();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao registrar informação de pagamento.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between border-b border-slate-300/60 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Informar Pagamento
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Avise a administração para conferência e baixa imediata
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              disabled={enviando}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Resumo da Fatura */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Referência:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>{competenciaTexto}</span>
                {parcelaTexto && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-mono text-[10px]">
                    Parcela {parcelaTexto}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Vencimento Original:</span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {mensalidade.data_vencimento
                  ? mensalidade.data_vencimento.split("-").reverse().join("/")
                  : "--/--/----"}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400 font-semibold">
                {enc ? "Valor Atualizado com Encargos:" : "Valor da Mensalidade:"}
              </span>
              <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                R$ {valorEfetivo.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>

          {/* Atalho PIX */}
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-2 text-xs">
            <div className="overflow-hidden">
              <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block">
                Chave PIX Oficial ({APP_NOME})
              </span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block text-[11px]">
                {APP_CHAVE_PIX_PADRAO}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopiarChavePix}
              className="shrink-0 px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
            >
              {copiadoPix ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span>{copiadoPix ? "Copiado!" : "Copiar"}</span>
            </button>
          </div>

          {/* Formulário de Envio */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            {/* Data do Pagamento */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span>Data em que o pagamento foi realizado *</span>
              </label>
              <input
                type="date"
                required
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Anexo de Comprovante */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Anexar Comprovante (Foto ou PDF)</span>
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleArquivoSelecionado}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-500/15 file:text-emerald-700 dark:file:text-emerald-300 hover:file:bg-emerald-500/25 cursor-pointer border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-2 bg-white/50 dark:bg-slate-950/50"
                />
              </div>
              {nomeArquivo && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  <span className="truncate">Comprovante selecionado: {nomeArquivo}</span>
                </div>
              )}
            </div>

            {/* Observações / Código de Transação */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                <span>Código de Transação / Observações (Opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Código E2E do PIX ou banco emissor"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Aviso */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                Ao confirmar, o SuperADM receberá uma notificação imediata via WhatsApp e no painel
                do sistema para validar o recebimento e confirmar a baixa.
              </span>
            </div>

            {/* Botões */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onFechar}
                disabled={enviando}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-md shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Confirmar Envio</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
