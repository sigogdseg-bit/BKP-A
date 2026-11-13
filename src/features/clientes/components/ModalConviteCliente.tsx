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
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
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

  const enviarWhatsApp = () => {
    if (!linkGerado) return;
    const msg = encodeURIComponent(
      `Olá! Segue o seu link exclusivo para realizar o cadastro no SIGO Guardião e informar os dados do(s) seu(s) veículo(s) para rastreamento:\n\n${linkGerado}\n\nAssim que você preencher, nossa equipe finalizará a configuração do seu plano e o agendamento da instalação.`,
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-4 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
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
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2 text-xs text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Regras do Auto-Cadastro de Cliente:</span>
            </div>
            <ul className="text-[11px] space-y-1 list-disc list-inside text-emerald-800 dark:text-emerald-300">
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
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-emerald-500" />
              <span>Link Exclusivo de Auto-Cadastro:</span>
            </label>

            {gerando ? (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 animate-pulse font-mono">
                Gerando link exclusivo de auto-cadastro...
              </div>
            ) : linkGerado ? (
              <div className="space-y-2">
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
                        ? "bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20"
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={enviarWhatsApp}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Enviar no WhatsApp</span>
                  </button>

                  <button
                    onClick={() => void gerarNovoLink()}
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
