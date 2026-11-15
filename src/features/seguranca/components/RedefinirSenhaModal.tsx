import { useState } from "react";
import { X, Key, Copy, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { redefinirSenhaAdmin, type UsuarioCompleto } from "../services/usuarioService";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface RedefinirSenhaModalProps {
  usuario: UsuarioCompleto;
  onConcluido: () => void;
  onFechar: () => void;
}

export function RedefinirSenhaModal({ usuario, onConcluido, onFechar }: RedefinirSenhaModalProps) {
  const [novaSenha, setNovaSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const gerarSenha = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!";
    let s = "";
    for (let i = 0; i < 12; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNovaSenha(s);
    toast.info("Nova senha gerada com sucesso!");
  };

  const copiarSenha = () => {
    if (!novaSenha) return;
    navigator.clipboard.writeText(novaSenha);
    setCopiado(true);
    toast.success("Senha copiada!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaSenha || novaSenha.length < 6) {
      toast.error("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      const res = await redefinirSenhaAdmin(usuario.id, novaSenha);
      if (res.success) {
        toast.success(res.message);
        onConcluido();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
        <div className="relative w-full max-w-md max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto my-auto rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4 sm:space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Redefinir Senha de Acesso
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Usuário:{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {usuario.nome}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nova Senha de Acesso *
                </label>
                <button
                  type="button"
                  onClick={gerarSenha}
                  className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Gerar Senha
                </button>
              </div>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                {novaSenha && (
                  <button
                    type="button"
                    onClick={copiarSenha}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                    title="Copiar"
                  >
                    {copiado ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onFechar}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {salvando ? "Alterando..." : "Confirmar Nova Senha"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
