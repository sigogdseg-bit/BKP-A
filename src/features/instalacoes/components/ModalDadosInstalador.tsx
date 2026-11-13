import { useState, useEffect } from "react";
import { X, Wrench, CreditCard, MapPin, Phone, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { atualizarDadosProprioInstalador } from "../services/instalacaoService";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalDadosInstaladorProps {
  open: boolean;
  onClose: () => void;
  instaladorId: string;
  onDadosAtualizados?: () => void;
}

export function ModalDadosInstalador({
  open,
  onClose,
  instaladorId,
  onDadosAtualizados,
}: ModalDadosInstaladorProps) {
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [enderecoInstalacao, setEnderecoInstalacao] = useState("");

  useEffect(() => {
    if (!open || !instaladorId) return;

    let ativo = true;
    setCarregando(true);

    async function buscarPerfil() {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("nome, email, telefone, celular, chave_pix, endereco_instalacao")
          .eq("id", instaladorId)
          .maybeSingle();

        if (ativo && data && !error) {
          setNome(data.nome || "");
          setEmail(data.email || "");
          setTelefone(data.telefone || data.celular || "");
          setChavePix(data.chave_pix || "");
          setEnderecoInstalacao(data.endereco_instalacao || "");
        }
      } catch (err) {
        console.error("Erro ao carregar dados do perfil do instalador:", err);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    buscarPerfil();

    return () => {
      ativo = false;
    };
  }, [open, instaladorId]);

  if (!open) return null;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instaladorId) return;

    setSalvando(true);
    try {
      const res = await atualizarDadosProprioInstalador(instaladorId, {
        telefone: telefone.trim(),
        chavePix: chavePix.trim(),
        enderecoInstalacao: enderecoInstalacao.trim(),
      });

      if (res.success) {
        toast.success(res.message);
        if (onDadosAtualizados) onDadosAtualizados();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao salvar dados.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <div className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto transition-colors">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/80">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  Meus Dados de Instalação
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Endereço da sua oficina e chave PIX para repasses
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo */}
          {carregando ? (
            <div className="p-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Carregando dados cadastrais...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSalvar} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              {/* Identificação (Somente Leitura) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl text-xs shadow-xs">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block">
                    Instalador Credenciado
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {nome || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block">E-mail de Acesso</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {email || "—"}
                  </span>
                </div>
              </div>

              {/* Celular / WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Celular / WhatsApp (Para Notificações)
                </label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: (24) 99123-4567"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-inner"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Número para recebimento automático de novas demandas, agendamentos e avisos de kit
                  via WhatsApp.
                </p>
              </div>

              {/* Chave PIX */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Chave PIX para Recebimento de Repasses
                </label>
                <input
                  type="text"
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  placeholder="Ex: CPF, CNPJ, E-mail, Celular ou Chave Aleatória"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-inner"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Esta chave será utilizada pelo financeiro para efetuar os repasses dos serviços
                  concluídos.
                </p>
              </div>

              {/* Endereço de Instalação / Oficina */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-amber-500" />
                  Endereço da Oficina / Ponto de Atendimento
                </label>
                <textarea
                  rows={3}
                  value={enderecoInstalacao}
                  onChange={(e) => setEnderecoInstalacao(e.target.value)}
                  placeholder="Ex: Rua das Flores, 120, Galpão B, Bairro Industrial, Volta Redonda/RJ"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none shadow-inner"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Endereço físico onde os clientes comparecem para a realização da instalação do
                  rastreador.
                </p>
              </div>

              {/* Rodapé / Ações */}
              <div className="pt-3.5 sm:pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={salvando}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Salvar Dados
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
