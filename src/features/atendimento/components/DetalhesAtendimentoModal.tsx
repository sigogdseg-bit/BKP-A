import { useState, useEffect, useCallback } from "react";
import {
  X,
  Clock,
  User,
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import type { Atendimento, AtendimentoProvidencia } from "../types";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  carregarProvidencias,
  adicionarProvidenciaComCarimbo,
  finalizarAtendimento,
} from "../services/atendimentoService";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { supabase } from "@/integrations/supabase/client";

interface DetalhesAtendimentoModalProps {
  atendimento: Atendimento;
  onFechar: () => void;
  onAtualizar: () => void;
}

export function DetalhesAtendimentoModal({
  atendimento,
  onFechar,
  onAtualizar,
}: DetalhesAtendimentoModalProps) {
  const { session } = useAuth();
  const [providencias, setProvidencias] = useState<AtendimentoProvidencia[]>([]);
  const [novaProvidencia, setNovaProvidencia] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Finalização
  const [modalFinalizar, setModalFinalizar] = useState(false);
  const [solucao, setSolucao] = useState("");
  const [finalizando, setFinalizando] = useState(false);

  const carregarHistorico = useCallback(() => {
    carregarProvidencias(atendimento.id).then(setProvidencias);
  }, [atendimento.id]);

  useEffect(() => {
    carregarHistorico();

    const canalChat = supabase
      .channel(`hunter_chat_atendimento_${atendimento.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "atendimento_providencias",
          filter: `atendimento_id=eq.${atendimento.id}`,
        },
        () => {
          carregarHistorico();
          onAtualizar();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalChat);
    };
  }, [carregarHistorico, atendimento.id, onAtualizar]);

  const handleAdicionarProvidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaProvidencia.trim()) return;

    setEnviando(true);
    try {
      const ok = await adicionarProvidenciaComCarimbo({
        atendimento_id: atendimento.id,
        providencia: novaProvidencia.trim(),
        usuario_id: session!.userId,
        usuario_nome: session!.nome,
        usuario_role: session!.role,
        cliente_id: atendimento.cliente_id,
        numero_protocolo: atendimento.numero_protocolo,
      });

      if (ok) {
        setNovaProvidencia("");
        toast.success("Providência registrada com sucesso!");
        carregarHistorico();
        onAtualizar();
      } else {
        toast.error("Erro ao registrar providência.");
      }
    } finally {
      setEnviando(false);
    }
  };

  const handleFinalizar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solucao.trim()) {
      toast.error("Informe a descrição da solução antes de finalizar.");
      return;
    }

    setFinalizando(true);
    try {
      const ok = await finalizarAtendimento({
        atendimento_id: atendimento.id,
        solucao_conclusao: solucao.trim(),
        finalizado_por: session!.userId,
        usuario_nome: session!.nome,
        usuario_role: session!.role,
        cliente_id: atendimento.cliente_id,
        numero_protocolo: atendimento.numero_protocolo,
      });

      if (ok) {
        toast.success("Atendimento FINALIZADO e resolvido com sucesso!");
        setModalFinalizar(false);
        carregarHistorico();
        onAtualizar();
      } else {
        toast.error("Erro ao finalizar atendimento.");
      }
    } finally {
      setFinalizando(false);
    }
  };

  const isResolvido = atendimento.status === "resolvido";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] flex flex-col shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden my-auto transition-colors">
          {/* Top Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs ${
                  isResolvido
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                }`}
              >
                #{atendimento.numero_protocolo}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {atendimento.titulo}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isResolvido
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {atendimento.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cliente:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {atendimento.cliente_nome}
                  </strong>
                  {atendimento.veiculo_placa ? ` · Veículo: ${atendimento.veiculo_placa}` : ""} ·
                  Prioridade:{" "}
                  <span className="capitalize font-semibold">{atendimento.prioridade}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* Relato Inicial */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/70 border border-slate-300/60 dark:border-slate-800 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                  Relato Inicial do Chamado
                </span>
                <span className="text-[11px] font-mono">
                  {new Date(atendimento.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                {atendimento.descricao_inicial}
              </p>
            </div>

            {/* Se estiver resolvido, mostra o parecer de conclusão */}
            {isResolvido && atendimento.solucao_conclusao && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Solução e Conclusão Técnica
                  </span>
                  <span className="text-[11px] font-mono">
                    {atendimento.finalizado_at &&
                      new Date(atendimento.finalizado_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-xs text-emerald-900 dark:text-emerald-200 whitespace-pre-wrap">
                  {atendimento.solucao_conclusao}
                </p>
              </div>
            )}

            {/* Linha do Tempo / Trilha de Providências */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Trilha de Providências e Ações (Registro Automático)
              </h3>

              {providencias.length === 0 ? (
                <div className="p-4 text-center rounded-2xl bg-white/60 dark:bg-slate-950/40 border border-slate-300/60 dark:border-slate-800/80 text-xs text-slate-500 shadow-xs">
                  Nenhuma providência registrada até o momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {providencias.map((prov) => (
                    <div
                      key={prov.id}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-950/50 border border-slate-300/60 dark:border-slate-800/90 text-xs space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                          <User className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
                          <span>{prov.usuario_nome}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700">
                            {prov.usuario_role}
                          </span>
                        </div>
                        <span className="text-slate-500 font-mono">
                          {new Date(prov.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 pl-4 border-l-2 border-emerald-500/40 whitespace-pre-wrap">
                        {prov.providencia}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inclusão de Nova Providência (se não estiver finalizado) */}
            {!isResolvido && (
              <form
                onSubmit={handleAdicionarProvidencia}
                className="space-y-2 pt-2 border-t border-slate-300/60 dark:border-slate-800"
              >
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Adicionar Providência / Atualização Técnica
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Descreva a ação tomada (ex: enviado comando STATUS#, cliente avisado)..."
                    value={novaProvidencia}
                    onChange={(e) => setNovaProvidencia(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={enviando || !novaProvidencia.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Registrar</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Footer com Botão de Finalizar */}
          <div className="p-4 border-t border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/60 flex items-center justify-between">
            <button
              onClick={onFechar}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 transition shadow-xs"
            >
              Fechar Janela
            </button>

            {!isResolvido && !session?.isCliente && (
              <button
                onClick={() => setModalFinalizar(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Finalizar e Resolver Problema</span>
              </button>
            )}
          </div>

          {/* Submodal de Finalização */}
          {modalFinalizar && (
            <div className="fixed inset-0 z-[999999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
              <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-300/60 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Conclusão do Atendimento #{atendimento.numero_protocolo}
                  </h3>
                  <button
                    onClick={() => setModalFinalizar(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleFinalizar} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Parecer Final da Solução Aplicada *
                    </label>
                    <textarea
                      rows={4}
                      value={solucao}
                      onChange={(e) => setSolucao(e.target.value)}
                      placeholder="Descreva exatamente como o problema foi solucionado..."
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setModalFinalizar(false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={finalizando}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-50"
                    >
                      {finalizando ? "Concluindo..." : "Confirmar Conclusão"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
