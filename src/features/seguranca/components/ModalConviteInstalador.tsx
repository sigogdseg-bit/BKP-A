import { useState, useEffect, useCallback } from "react";
import {
  X,
  Link as LinkIcon,
  Copy,
  Check,
  Wrench,
  ShieldCheck,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { gerarLinkConviteInstalador } from "../services/conviteInstaladorService";

interface ModalConviteInstaladorProps {
  aberto: boolean;
  onFechar: () => void;
}

export function ModalConviteInstalador({ aberto, onFechar }: ModalConviteInstaladorProps) {
  const [gerando, setGerando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [observacoes, setObservacoes] = useState("");

  const gerarNovoLink = useCallback(async () => {
    setGerando(true);
    setCopiado(false);
    try {
      const res = await gerarLinkConviteInstalador(observacoes.trim() || undefined);
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

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 space-y-4 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  Link de Convite para Instalador
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Uso único com aprovação obrigatória da administração
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
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Regras de Segurança do Convite:</span>
            </div>
            <ul className="text-[11px] space-y-1 list-disc list-inside text-amber-800 dark:text-amber-300">
              <li>
                <strong>Uso Único:</strong> O link perde a validade imediatamente após o técnico
                enviar o cadastro.
              </li>
              <li>
                <strong>Conta Inativa por Padrão:</strong> O técnico não conseguirá acessar o
                sistema até que você ou outro operador habilite a conta manualmente.
              </li>
              <li>
                <strong>Dados Recolhidos:</strong> Nome, login, senha, chave PIX e endereço da
                oficina.
              </li>
            </ul>
          </div>

          {/* Link Gerado */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Link de Auto-Cadastro</span>
              <button
                type="button"
                onClick={gerarNovoLink}
                disabled={gerando}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline disabled:opacity-50"
              >
                {gerando ? "Gerando..." : "Gerar Outro Link"}
              </button>
            </label>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={linkGerado || "Gerando link de convite..."}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={copiarLink}
                disabled={!linkGerado || gerando}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1 shrink-0 disabled:opacity-40"
                title="Copiar Link"
              >
                {copiado ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Ações de Compartilhamento */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <button
              type="button"
              onClick={copiarLink}
              disabled={!linkGerado || gerando}
              className="w-full sm:flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiado ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Link Copiado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar Link de Convite</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onFechar}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
