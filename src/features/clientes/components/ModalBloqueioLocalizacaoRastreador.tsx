import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Lock,
  Phone,
  QrCode,
  Copy,
  Check,
  Building2,
  RefreshCw,
  X,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { calcularEncargosAtraso } from "@/features/mensalidades/utils/encargosLegais";
import { APP_NOME, APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import type { StatusFinanceiroCliente } from "@/features/mensalidades/services/mensalidadeService";

interface ModalBloqueioLocalizacaoRastreadorProps {
  aberto: boolean;
  onFechar: () => void;
  isMotorista?: boolean;
  statusFinanceiro?: StatusFinanceiroCliente | null;
  onVerificarNovamente?: () => Promise<void>;
}

export function ModalBloqueioLocalizacaoRastreador({
  aberto,
  onFechar,
  isMotorista = false,
  statusFinanceiro,
  onVerificarNovamente,
}: ModalBloqueioLocalizacaoRastreadorProps) {
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [payloadPix, setPayloadPix] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [gerandoQr, setGerandoQr] = useState(false);

  const fatura = statusFinanceiro?.faturaVencidaMaisAntiga;
  const valorOriginal = statusFinanceiro?.totalDevido || fatura?.valor || 79.9;

  const encargos = useMemo(() => {
    if (!isMotorista && fatura?.dataVencimento && fatura?.valor) {
      return calcularEncargosAtraso(Number(fatura.valor), fatura.dataVencimento);
    }
    return null;
  }, [isMotorista, fatura]);

  const valorTotal = encargos ? encargos.valorTotalAtualizado : valorOriginal;

  useEffect(() => {
    if (!aberto || isMotorista) return;

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
        console.error("Erro ao gerar QR Code:", err);
      } finally {
        setGerandoQr(false);
      }
    }

    gerarPix();
  }, [aberto, isMotorista, fatura, valorTotal]);

  const handleCopiarPix = async () => {
    if (!payloadPix) return;
    try {
      await navigator.clipboard.writeText(payloadPix);
      setCopiadoPix(true);
      toast.success("Código PIX Copia e Cola copiado!");
      setTimeout(() => setCopiadoPix(false), 2500);
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  const handleVerificar = async () => {
    if (!onVerificarNovamente) return;
    setVerificando(true);
    try {
      await onVerificarNovamente();
      toast.info("Verificando se o bloqueio de localização foi liberado...");
    } catch {
      toast.error("Erro ao consultar quitação.");
    } finally {
      setVerificando(false);
    }
  };

  const handleSuporte = () => {
    window.location.href = "tel:24992494030";
  };

  if (!aberto) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto bg-slate-950/85 backdrop-blur-md animate-fadeIn select-none">
      <div className="w-full max-w-md bg-[#eaf0f8] dark:bg-slate-900 border border-rose-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-y-auto text-slate-800 dark:text-slate-100 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                Modo Privado Ativo
              </span>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
                {isMotorista
                  ? "Localização da Frota Suspensa"
                  : "Localização em Tempo Real Bloqueada"}
              </h2>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo diferenciado Motorista vs Cliente */}
        {isMotorista ? (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 flex items-center gap-3.5 shadow-xs">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="space-y-0.5 text-left">
                <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100 block">
                  Aviso Operacional
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  A visualização do mapa e telemetria dos veículos está temporariamente suspensa
                  para a frota. Contate o administrador da sua empresa para liberação.
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition shadow-md"
            >
              Entendido
            </button>
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-left">
              A visualização da localização dos seus rastreadores entrou em modo restrito por
              pendência financeira. Regularize sua mensalidade ou entre em contato com o{" "}
              <strong>{APP_NOME}</strong> para liberação imediata.
            </p>

            {/* Total Atualizado */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 text-left space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Valor Atualizado com Encargos:</span>
                <span className="text-base font-black font-mono text-rose-600 dark:text-rose-400">
                  R$ {valorTotal.toFixed(2).replace(".", ",")}
                </span>
              </div>
              {fatura && (
                <div className="text-[11px] font-mono text-slate-500 flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span>Vencimento Original:</span>
                  <span className="text-rose-600 font-bold">
                    {fatura.dataVencimento.split("-").reverse().join("/")} ({fatura.diasAtraso}d
                    atraso)
                  </span>
                </div>
              )}
            </div>

            {/* QR Code PIX Pequeno */}
            <div className="flex items-center justify-center p-3 rounded-2xl bg-white text-slate-950 border border-slate-300/60 shadow-inner">
              {gerandoQr ? (
                <div className="h-32 flex items-center justify-center gap-2">
                  <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-slate-500 font-mono">Gerando QR Code...</span>
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code PIX ${APP_NOME}`}
                  className="h-32 w-32 object-contain rounded-lg"
                />
              ) : null}
            </div>

            {/* PIX Copia e Cola */}
            {payloadPix && (
              <div className="space-y-1 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    PIX Copia e Cola
                  </span>
                  <button
                    onClick={handleCopiarPix}
                    className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-bold flex items-center gap-1 text-[11px] transition"
                  >
                    {copiadoPix ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiadoPix ? "Copiado!" : "Copiar"}</span>
                  </button>
                </div>
                <input
                  readOnly
                  value={payloadPix}
                  className="w-full text-[11px] font-mono p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-800 dark:text-slate-300 select-all shadow-xs"
                />
              </div>
            )}

            {/* Botões de Ação */}
            <div className="space-y-2 pt-1">
              {onVerificarNovamente && (
                <button
                  onClick={handleVerificar}
                  disabled={verificando}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${verificando ? "animate-spin" : ""}`} />
                  <span>{verificando ? "Verificando..." : "Já Paguei / Checar Liberação"}</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSuporte}
                  className="py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-700 shadow-xs"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Contatar GD Rastreamento</span>
                </button>

                <button
                  onClick={onFechar}
                  className="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-semibold text-xs transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
