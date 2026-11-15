import { useState, useEffect } from "react";
import {
  X,
  QrCode,
  Copy,
  Check,
  Send,
  Download,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Loader2,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import type { ClienteInadimplente } from "../types";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { gerarMensagemWhatsAppInadimplente } from "../services/financeiroService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { APP_NOME, APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalPixCobrancaInadimplenteProps {
  cliente: ClienteInadimplente;
  chavePixPadrao?: string;
  onFechar: () => void;
  onLiquidar?: () => void;
}

export function ModalPixCobrancaInadimplente({
  cliente,
  chavePixPadrao = APP_CHAVE_PIX_PADRAO,
  onFechar,
  onLiquidar,
}: ModalPixCobrancaInadimplenteProps) {
  const [chavePix, setChavePix] = useState(chavePixPadrao);
  const [payloadPix, setPayloadPix] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [gerandoQr, setGerandoQr] = useState(true);
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [copiadoMensagem, setCopiadoMensagem] = useState(false);

  useEffect(() => {
    async function atualizarQr() {
      setGerandoQr(true);
      try {
        const chaveFinal = chavePix.trim() || APP_CHAVE_PIX_PADRAO;
        const rawId = cliente.cliente_id || "GUARDIAO";
        const txid = `FAT${rawId
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 10)
          .toUpperCase()}`;
        const payload = gerarPayloadPix({
          chavePix: chaveFinal,
          nomeRecebedor: APP_NOME,
          cidadeRecebedor: "BRASIL",
          valor: cliente.totalDevido,
          identificador: txid,
        });
        setPayloadPix(payload);

        const dataUrl = await gerarQrCodePixDataUrl(payload);
        setQrCodeDataUrl(dataUrl);
      } catch (err) {
        console.error("Erro ao gerar QR Code PIX:", err);
        toast.error("Falha ao gerar o QR Code do PIX.");
      } finally {
        setGerandoQr(false);
      }
    }

    atualizarQr();
  }, [cliente, chavePix]);

  const handleCopiarPix = async () => {
    if (!payloadPix) return;
    try {
      await navigator.clipboard.writeText(payloadPix);
      setCopiadoPix(true);
      toast.success("Código PIX Copia e Cola copiado com sucesso!");
      setTimeout(() => setCopiadoPix(false), 2500);
    } catch {
      toast.error("Não foi possível copiar o código PIX automaticamente.");
    }
  };

  const handleCopiarMensagem = async () => {
    const msg = gerarMensagemWhatsAppInadimplente(cliente, chavePix);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiadoMensagem(true);
      toast.success("Mensagem completa com PIX copiada!");
      setTimeout(() => setCopiadoMensagem(false), 2500);
    } catch {
      toast.error("Falha ao copiar mensagem.");
    }
  };

  const [enviandoNotificacao, setEnviandoNotificacao] = useState(false);

  const handleNotificarClienteImediato = async () => {
    const primeiroNome = cliente.nome_razao_social.split(" ")[0];
    try {
      setEnviandoNotificacao(true);
      toast.info(`Emitindo notificação imediata de vencimento para ${primeiroNome}...`);
      const ok = await enviarNotificacaoViaBd({
        destinatarioClienteId: cliente.cliente_id,
        titulo: `Fatura e Vencimento do Plano — ${APP_NOME}`,
        mensagem: `Olá, ${primeiroNome}. Sua fatura de R$ ${cliente.totalDevido.toFixed(2)} referente ao seu plano está disponível. Acesse o painel para visualizar o código PIX e regularizar seu rastreamento.`,
        tipo: "cobranca",
        url: "/faturas",
      });

      if (ok) {
        toast.success(`Notificação imediata enviada para ${primeiroNome} com sucesso!`);
      } else {
        toast.error(`Falha ao emitir notificação imediata para ${primeiroNome}.`);
      }
    } catch (err: any) {
      toast.error(`Erro ao disparar notificação: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setEnviandoNotificacao(false);
    }
  };

  const handleBaixarQrCode = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `pix-gd-rastreamento-${cliente.nome_razao_social.toLowerCase().replace(/\s+/g, "-")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download do QR Code iniciado!");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto transition-colors">
          {/* Header do Modal */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Quitação Instantânea via PIX
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Geração de QR Code oficial e código Copia e Cola
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Conteúdo com Scroll */}
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            {/* Alerta de Inadimplência */}
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold text-rose-700 dark:text-rose-300">
                  {cliente.nome_razao_social}
                </div>
                <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                  Consta(m){" "}
                  <strong className="text-rose-600 dark:text-rose-400">
                    {cliente.qtdMensalidadesAtrasadas}
                  </strong>{" "}
                  mensalidade(s) em atraso ({cliente.maiorAtrasoDias} dias de atraso).
                </div>
              </div>
            </div>

            {/* Destaque do Valor Total */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Valor Total Devido
                </span>
                <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  R$ {cliente.totalDevido.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="text-right text-xs font-mono text-slate-500 dark:text-slate-400">
                <div>Ref. mais antiga:</div>
                <div className="font-bold text-slate-800 dark:text-slate-200">
                  {cliente.mensalidadeMaisAntigaVencimento
                    ? cliente.mensalidadeMaisAntigaVencimento.split("-").reverse().join("/")
                    : "—"}
                </div>
              </div>
            </div>

            {/* Área do QR Code Oficial */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-950 border border-slate-300/60 dark:border-transparent shadow-inner">
              {gerandoQr ? (
                <div className="h-44 flex flex-col items-center justify-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-slate-600 font-mono">Gerando BR Code...</span>
                </div>
              ) : qrCodeDataUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Code Pix GD Rastreamento"
                    className="h-44 w-44 object-contain rounded-lg"
                  />
                  <span className="text-[11px] font-mono text-slate-700 font-semibold">
                    Escaneie pelo aplicativo de qualquer banco
                  </span>
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-rose-600">
                  Não foi possível renderizar o QR Code
                </div>
              )}
            </div>

            {/* Campo de Código PIX Copia e Cola */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Código PIX Copia e Cola
                </label>
                <button
                  onClick={handleCopiarPix}
                  className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold flex items-center gap-1 text-[11px] transition"
                >
                  {copiadoPix ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copiadoPix ? "Copiado!" : "Copiar Código"}</span>
                </button>
              </div>
              <div className="relative">
                <textarea
                  readOnly
                  value={payloadPix}
                  rows={3}
                  className="w-full text-[11px] font-mono p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-800 dark:text-slate-300 focus:outline-none select-all"
                />
              </div>
            </div>

            {/* Botões de Ação Rápida */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleBaixarQrCode}
                disabled={!qrCodeDataUrl}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-700 disabled:opacity-50 shadow-xs"
              >
                <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span>Baixar Imagem QR</span>
              </button>

              <button
                onClick={handleCopiarMensagem}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-700 shadow-xs"
              >
                {copiadoMensagem ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                )}
                <span>{copiadoMensagem ? "Texto Copiado!" : "Copiar Mensagem"}</span>
              </button>
            </div>
          </div>

          {/* Footer de Ações e Fechar */}
          <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/60 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
            <button
              onClick={onFechar}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 font-bold text-xs transition shadow-xs flex items-center justify-center"
            >
              Fechar
            </button>

            <button
              onClick={handleNotificarClienteImediato}
              disabled={enviandoNotificacao}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Emitir notificação imediata de cobrança para o dispositivo do cliente"
            >
              {enviandoNotificacao ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              <span>
                {enviandoNotificacao ? "Notificando..." : "Notificar Cliente Imediatamente"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
