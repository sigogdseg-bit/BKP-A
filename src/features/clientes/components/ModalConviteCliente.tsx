import { useState, useEffect, useCallback } from "react";
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  UserCheck,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  Car,
  Phone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { APP_NOME } from "@/shared/lib/version";
import { formatarTelefone } from "@/shared/utils/mascaras";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import { gerarLinkConviteCliente } from "../services/conviteClienteService";

interface ModalConviteClienteProps {
  aberto: boolean;
  onFechar: () => void;
}

export function ModalConviteCliente({ aberto, onFechar }: ModalConviteClienteProps) {
  const [gerando, setGerando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [telefoneDestino, setTelefoneDestino] = useState("");
  const [transmitindoWhatsapp, setTransmitindoWhatsapp] = useState(false);

  const gerarNovoLink = useCallback(async () => {
    setGerando(true);
    setCopiado(false);
    try {
      const res = await gerarLinkConviteCliente(observacoes.trim() || undefined);
      if (res.success && res.link) {
        setLinkGerado(res.link);
        toast.success("Link de convite de uso único gerado com sucesso!");
      } else {
        toast.error(res.message);
      }
    } finally {
      setGerando(false);
    }
  }, [observacoes]);

  useEffect(() => {
    if (aberto && !linkGerado) {
      void gerarNovoLink();
    }
  }, [aberto, linkGerado, gerarNovoLink]);

  if (!aberto) return null;

  const copiarLink = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    toast.success("Link copiado para a área de transferência!");
    setTimeout(() => setCopiado(false), 2500);
  };

  const enviarWhatsApp = async () => {
    if (!linkGerado) return;
    const msgTexto = `Olá! Segue o seu link exclusivo para realizar o cadastro no ${APP_NOME} e informar os dados do(s) seu(s) veículo(s) para rastreamento:\n\n${linkGerado}\n\nAssim que você preencher, nossa equipe finalizará a configuração do seu plano e o agendamento da instalação.`;

    const telLimpo = telefoneDestino.replace(/\D/g, "");
    if (telLimpo.length >= 10) {
      setTransmitindoWhatsapp(true);
      try {
        const res = await enviarMensagemWhatsappOperador({
          telefone: telLimpo,
          mensagem: msgTexto,
        });
        if (res.sucesso) {
          toast.success("Convite enviado com sucesso via WhatsApp!");
          return;
        }
      } catch {
        // Fallback para abertura direta se o gateway offline
      } finally {
        setTransmitindoWhatsapp(false);
      }
    }

    const msg = encodeURIComponent(msgTexto);
    const targetUrl = telLimpo
      ? `https://api.whatsapp.com/send?phone=55${telLimpo}&text=${msg}`
      : `https://api.whatsapp.com/send?text=${msg}`;
    window.open(targetUrl, "_blank");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-4 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  Link de Cadastro para Cliente
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  O cliente preenche dados e veículos; operador aprova o plano e instalador
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Regras e Alertas */}
          <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/25 space-y-2 text-xs text-emerald-900 dark:text-orange-200">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span>Regras do Auto-Cadastro de Cliente:</span>
            </div>
            <ul className="text-[11px] space-y-1 list-disc list-inside text-orange-800 dark:text-orange-300">
              <li>
                <strong>Multi-Veículos:</strong> O cliente pode cadastrar 1 ou vários veículos pelo
                mesmo link.
              </li>
              <li>
                <strong>Governança Operacional:</strong> A solicitação entra com pendência para o
                Operador/ADM definir o plano, valor da mensalidade e designar qual instalador
                atenderá cada carro.
              </li>
              <li>
                <strong>Ordens Separadas:</strong> Cada veículo gera uma ordem de instalação
                individual para envio ao técnico.
              </li>
            </ul>
          </div>

          {/* Área do Link Gerado */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-orange-500" />
              <span>Link Exclusivo de Auto-Cadastro:</span>
            </label>

            {gerando ? (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 animate-pulse font-mono">
                Gerando link exclusivo de auto-cadastro...
              </div>
            ) : linkGerado ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    readOnly
                    value={linkGerado}
                    className="w-full bg-transparent text-xs font-mono text-slate-900 dark:text-slate-100 outline-none select-all truncate"
                  />
                  <button
                    onClick={copiarLink}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                      copiado
                        ? "bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20"
                        : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
                    }`}
                  >
                    {copiado ? (
                      <>
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Telefone Destino WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-emerald-500" />
                    <span>WhatsApp de Destino (Opcional):</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={telefoneDestino}
                    onChange={(e) => setTelefoneDestino(formatarTelefone(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={enviarWhatsApp}
                    disabled={transmitindoWhatsapp}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition shadow-sm"
                  >
                    {transmitindoWhatsapp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Transmitindo...</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4" />
                        <span>Enviar no WhatsApp</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => void gerarNovoLink()}
                    disabled={transmitindoWhatsapp}
                    className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition"
                  >
                    Gerar Outro
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Rodapé */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={onFechar}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
