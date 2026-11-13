import { useState } from "react";
import { X, Key, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { useAuth } from "../context/AuthContext";

interface MudarMinhaSenhaModalProps {
  onFechar: () => void;
  forcarTroca?: boolean;
}

export function MudarMinhaSenhaModal({ onFechar, forcarTroca = false }: MudarMinhaSenhaModalProps) {
  const { recarregarSessao } = useAuth();
  const [novaSenha, setNovaSenha] = useState("");
  const [novaSenhaVisivel, setNovaSenhaVisivel] = useState(false);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novaSenha || novaSenha.length < 6) {
      toast.error("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });

      if (error) {
        toast.error(`Falha ao alterar senha: ${error.message}`);
        return;
      }

      if (forcarTroca) {
        try {
          await supabase.rpc("marcar_primeiro_acesso_concluido");
        } catch (rpcErr) {
          console.error("Erro na RPC marcar_primeiro_acesso_concluido:", rpcErr);
        }
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user?.id) {
            await supabase
              .from("profiles")
              .update({ primeiro_acesso: false })
              .eq("id", userData.user.id);
          }
        } catch (updErr) {
          console.error("Erro no update de fallback profiles:", updErr);
        }
        await recarregarSessao();
      }

      toast.success("Senha alterada com sucesso!");
      onFechar();
    } catch (err: any) {
      toast.error("Ocorreu um erro ao alterar sua senha.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="relative w-full max-w-md max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto my-auto rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-6 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-4 sm:space-y-5 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {forcarTroca ? "Troca de Senha Obrigatória" : "Alterar Minha Senha"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Defina uma nova senha de acesso segura.
                </p>
              </div>
            </div>
            {!forcarTroca && (
              <button
                onClick={onFechar}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nova Senha *
              </label>
              <div className="relative">
                <input
                  type={novaSenhaVisivel ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full h-10 pl-3 pr-10 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setNovaSenhaVisivel(!novaSenhaVisivel)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                  title={novaSenhaVisivel ? "Ocultar senha" : "Ver senha"}
                  aria-label={novaSenhaVisivel ? "Ocultar senha" : "Ver senha"}
                >
                  {novaSenhaVisivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirmar Nova Senha *
              </label>
              <div className="relative">
                <input
                  type={confirmarSenhaVisivel ? "text" : "password"}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Repita sua nova senha"
                  className="w-full h-10 pl-3 pr-10 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setConfirmarSenhaVisivel(!confirmarSenhaVisivel)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                  title={confirmarSenhaVisivel ? "Ocultar senha" : "Ver senha"}
                  aria-label={confirmarSenhaVisivel ? "Ocultar senha" : "Ver senha"}
                >
                  {confirmarSenhaVisivel ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando}
              className="w-full h-11 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? "Salvando..." : "Confirmar Alteração"}
            </button>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
