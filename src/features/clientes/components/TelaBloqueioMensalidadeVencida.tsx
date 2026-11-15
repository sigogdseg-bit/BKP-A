import { useState, useEffect, useMemo } from "react";
import {
  ShieldAlert,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Phone,
  MessageSquare,
  LogOut,
  Clock,
  ExternalLink,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { calcularEncargosAtraso } from "@/features/mensalidades/utils/encargosLegais";
import { APP_NOME, APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import type { StatusFinanceiroCliente } from "@/features/mensalidades/services/mensalidadeService";

interface TelaBloqueioMensalidadeVencidaProps {
  statusFinanceiro: StatusFinanceiroCliente;
  onVerificarNovamente: () => Promise<void>;
}

export function TelaBloqueioMensalidadeVencida({
  statusFinanceiro,
  onVerificarNovamente,
}: TelaBloqueioMensalidadeVencidaProps) {
  const { session, logout } = useAuth();
  const [payloadPix, setPayloadPix] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [gerandoQr, setGerandoQr] = useState(true);
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [verificandoBaixa, setVerificandoBaixa] = useState(false);

  const fatura = statusFinanceiro.faturaVencidaMaisAntiga;
  const valorOriginal = statusFinanceiro.totalDevido || fatura?.valor || 79.9;

  const encargos = useMemo(() => {
    if (fatura?.dataVencimento && fatura?.valor) {
      return calcularEncargosAtraso(Number(fatura.valor), fatura.dataVencimento);
    }
    return null;
  }, [fatura]);

  const valorTotal = encargos ? encargos.valorTotalAtualizado : valorOriginal;

  useEffect(() => {
    async function gerarPix() {
      setGerandoQr(true);
      try {
        const chavePix = APP_CHAVE_PIX_PADRAO;
        const txid = `MENS${
          fatura?.id
            ?.replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 10)
            .toUpperCase() || "GUARDIAO"
        }`;
        const payload = gerarPayloadPix({
          chavePix,
          nomeRecebedor: APP_NOME,
          cidadeRecebedor: "BRASIL",
          valor: valorTotal,
          identificador: txid,
        });

        setPayloadPix(payload);
        const dataUrl = await gerarQrCodePixDataUrl(payload);
        setQrCodeDataUrl(dataUrl);
      } catch (err) {
        console.error("Erro ao gerar QR Code de bloqueio:", err);
      } finally {
        setGerandoQr(false);
      }
    }

    gerarPix();
  }, [fatura, valorTotal]);

  const handleCopiarPix = async () => {
    if (!payloadPix) return;
    try {
      await navigator.clipboard.writeText(payloadPix);
      setCopiadoPix(true);
      toast.success("Código PIX Copia e Cola copiado!");
      setTimeout(() => setCopiadoPix(false), 2500);
    } catch {
      toast.error("Não foi possível copiar o código automaticamente.");
    }
  };

  const handleChecarQuitacao = async () => {
    setVerificandoBaixa(true);
    try {
      await onVerificarNovamente();
      toast.info("Verificando se o pagamento já foi compensado no sistema...");
    } catch {
      toast.error("Erro ao consultar quitação. Tente novamente.");
    } finally {
      setVerificandoBaixa(false);
    }
  };

  const handleSuporte = () => {
    window.location.href = "tel:24992494030";
  };

  return (
    <div className="min-h-screen bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none animate-fadeIn">
      <div className="w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900/90 border border-rose-500/40 rounded-3xl p-5 sm:p-8 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-5 text-slate-800 dark:text-slate-100">
        {/* Header do Bloqueio */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/10">
            <Lock className="h-7 w-7" />
          </div>
          <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            Acesso Temporariamente Suspenso
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            Regularização Financeira
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            Olá, <strong className="text-slate-800 dark:text-slate-200">{session?.nome}</strong>.
            Para manter o rastreamento ativo e a proteção contínua dos seus veículos, regularize a
            sua mensalidade em aberto.
          </p>
        </div>

        {/* Detalhes do Débito com Encargos Legais */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Total Atualizado com Encargos:
            </span>
            <span className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">
              R$ {valorTotal.toFixed(2).replace(".", ",")}
            </span>
          </div>

          {encargos && encargos.diasAtraso > 0 && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Valor Original:</span>
                <span>R$ {encargos.valorOriginal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>Multa Moratória (2% - art. 52 CDC):</span>
                <span>+ R$ {encargos.valorMulta.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-600 dark:text-rose-400">
                <span>Juros Moratórios (1% a.m. pro rata die · {encargos.diasAtraso}d):</span>
                <span>+ R$ {encargos.valorJuros.toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-rose-500/20 font-sans">
                Cálculo legal automático atualizado na data de hoje.
              </div>
            </div>
          )}

          {fatura && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div>
                <span className="text-slate-500 block">Referência:</span>
                <strong className="text-slate-700 dark:text-slate-300">
                  {String(fatura.mes).padStart(2, "0")}/{fatura.ano}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Vencimento:</span>
                <strong className="text-rose-600 dark:text-rose-400">
                  {fatura.dataVencimento.split("-").reverse().join("/")} ({fatura.diasAtraso}d
                  atraso)
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* QR Code PIX */}
        <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-950 border border-slate-300/60 dark:border-transparent shadow-inner">
          {gerandoQr ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2">
              <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
              <span className="text-xs text-slate-600 font-mono">Gerando QR Code...</span>
            </div>
          ) : qrCodeDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={qrCodeDataUrl}
                alt={`QR Code PIX ${APP_NOME}`}
                className="h-44 w-44 object-contain rounded-lg"
              />
              <span className="text-[11px] font-mono font-semibold text-slate-700">
                Aponte a câmera do aplicativo do seu banco
              </span>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-rose-600">
              Falha ao carregar QR Code
            </div>
          )}
        </div>

        {/* Campo Copia e Cola */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-slate-700 dark:text-slate-300">
              PIX Copia e Cola
            </label>
            <button
              onClick={handleCopiarPix}
              className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-bold flex items-center gap-1 text-[11px] transition"
            >
              {copiadoPix ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiadoPix ? "Copiado!" : "Copiar Código"}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={payloadPix}
            rows={2}
            className="w-full text-[11px] font-mono p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-800 dark:text-slate-300 focus:outline-none select-all shadow-xs"
          />
        </div>

        {/* Ações: Verificar Baixa, Contatar Suporte e Sair */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleChecarQuitacao}
            disabled={verificandoBaixa}
            className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${verificandoBaixa ? "animate-spin" : ""}`} />
            <span>
              {verificandoBaixa ? "Consultando Baixa..." : "Já Paguei / Verificar Quitação"}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSuporte}
              className="py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-700 shadow-xs"
            >
              <Phone className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              <span>Contatar Suporte</span>
            </button>

            <button
              onClick={() => logout()}
              className="py-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-800 shadow-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
