import { useState, useEffect, useMemo } from "react";
import {
  Headphones,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  ChevronRight,
} from "lucide-react";
import type { Atendimento } from "../types";
import { carregarAtendimentos } from "../services/atendimentoService";
import { NovoAtendimentoModal } from "./NovoAtendimentoModal";
import { DetalhesAtendimentoModal } from "./DetalhesAtendimentoModal";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { tocarAlertaSonoroTatico } from "@/shared/lib/notificacoesBdService";
import { TiltCard } from "@/shared/components/TiltCard";
import { toast } from "sonner";

export function AtendimentoView() {
  const { session } = useAuth();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [modalNovo, setModalNovo] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<Atendimento | null>(null);

  const recarregar = () => {
    setCarregando(true);
    carregarAtendimentos().then((dados) => {
      setAtendimentos(dados);
      setCarregando(false);
    });
  };

  useEffect(() => {
    recarregar();

    const canal = supabase
      .channel("hunter_atendimento_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "atendimento_providencias" },
        (payload) => {
          tocarAlertaSonoroTatico("alerta");
          const msg = (payload.new as any)?.providencia;
          const autor = (payload.new as any)?.usuario_nome || "Novo registro";
          toast.info(`💬 Nova mensagem no atendimento: ${autor}`, {
            description: typeof msg === "string" ? msg.slice(0, 80) : undefined,
          });
          carregarAtendimentos().then(setAtendimentos);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => {
        carregarAtendimentos().then(setAtendimentos);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const filtrados = useMemo(() => {
    return atendimentos.filter((a) => {
      const matchBusca =
        !busca ||
        a.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        a.descricao_inicial.toLowerCase().includes(busca.toLowerCase()) ||
        (a.cliente_nome && a.cliente_nome.toLowerCase().includes(busca.toLowerCase())) ||
        (a.veiculo_placa && a.veiculo_placa.toLowerCase().includes(busca.toLowerCase())) ||
        String(a.numero_protocolo).includes(busca);

      const matchStatus = filtroStatus === "todos" || a.status === filtroStatus;
      return matchBusca && matchStatus;
    });
  }, [atendimentos, busca, filtroStatus]);

  const totais = useMemo(() => {
    return {
      total: atendimentos.length,
      abertos: atendimentos.filter((a) => a.status === "aberto").length,
      emAndamento: atendimentos.filter((a) => a.status === "em_andamento").length,
      resolvidos: atendimentos.filter((a) => a.status === "resolvido").length,
    };
  }, [atendimentos]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none">
      {/* 1. Header do Módulo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Atendimento ao Cliente e Suporte
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Registro de chamados, providências com registro automático e encerramento técnico
            </p>
          </div>
        </div>

        <button
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-lg shadow-orange-500/20"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Atendimento</span>
        </button>
      </div>

      {/* 2. Infográficos Ativos (Filtros Interativos ao Clique) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => setFiltroStatus("todos")}
          title="Clique para ver todos os atendimentos"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("todos")}
          className={`rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border ${
            filtroStatus === "todos"
              ? "bg-orange-500/15 border-orange-500/80 ring-2 ring-orange-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg"
              : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-slate-400 dark:hover:border-slate-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
          }`}
        >
          <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold uppercase flex items-center justify-center gap-1">
            <span>Total</span>
            {filtroStatus === "todos" && (
              <span className="text-[9px] text-orange-600 dark:text-orange-400 font-bold">
                (Ativo)
              </span>
            )}
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
            {totais.total}
          </div>
        </TiltCard>

        {/* Abertos */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(245, 158, 11, 0.35)"
          onClick={() => setFiltroStatus((s) => (s === "aberto" ? "todos" : "aberto"))}
          title="Clique para filtrar chamados abertos"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("aberto")}
          className={`rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border ${
            filtroStatus === "aberto"
              ? "bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg"
              : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
          }`}
        >
          <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase flex items-center justify-center gap-1">
            <span>Abertos</span>
            {filtroStatus === "aberto" && (
              <span className="text-[9px] text-amber-600 dark:text-amber-300 font-bold">
                (Ativo)
              </span>
            )}
          </div>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
            {totais.abertos}
          </div>
        </TiltCard>

        {/* Em Andamento */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(14, 165, 233, 0.35)"
          onClick={() => setFiltroStatus((s) => (s === "em_andamento" ? "todos" : "em_andamento"))}
          title="Clique para filtrar chamados em andamento"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("em_andamento")}
          className={`rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border ${
            filtroStatus === "em_andamento"
              ? "bg-sky-500/15 border-sky-500/80 ring-2 ring-sky-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg"
              : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-sky-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
          }`}
        >
          <div className="text-xs text-sky-600 dark:text-sky-400 font-semibold uppercase flex items-center justify-center gap-1">
            <span>Em Andamento</span>
            {filtroStatus === "em_andamento" && (
              <span className="text-[9px] text-sky-600 dark:text-sky-300 font-bold">(Ativo)</span>
            )}
          </div>
          <div className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-1">
            {totais.emAndamento}
          </div>
        </TiltCard>

        {/* Resolvidos */}
        <TiltCard
          maxTilt={6}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => setFiltroStatus((s) => (s === "resolvido" ? "todos" : "resolvido"))}
          title="Clique para filtrar chamados resolvidos"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("resolvido")}
          className={`rounded-2xl p-3.5 sm:p-4 text-center cursor-pointer transition-all duration-200 hover:-translate-y-0.5 border ${
            filtroStatus === "resolvido"
              ? "bg-orange-500/15 border-orange-500/80 ring-2 ring-orange-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg"
              : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-orange-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
          }`}
        >
          <div className="text-xs text-orange-600 dark:text-orange-400 font-semibold uppercase flex items-center justify-center gap-1">
            <span>Resolvidos</span>
            {filtroStatus === "resolvido" && (
              <span className="text-[9px] text-orange-600 dark:text-orange-300 font-bold">
                (Ativo)
              </span>
            )}
          </div>
          <div className="text-2xl font-black font-mono text-orange-600 dark:text-orange-400 mt-1">
            {totais.resolvidos}
          </div>
        </TiltCard>
      </div>

      {/* 3. Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/40 border border-slate-300/60 dark:border-slate-800/80 p-3 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por protocolo, título, cliente, placa..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto text-xs">
          {["todos", "aberto", "em_andamento", "resolvido"].map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`px-3 py-1.5 rounded-xl font-medium capitalize transition ${
                filtroStatus === st
                  ? "bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-500/30 font-bold shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Lista de Chamados */}
      <div className="space-y-2">
        {carregando ? (
          <div className="py-12 text-center text-slate-500 text-xs">Carregando atendimentos...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
            Nenhum atendimento encontrado.
          </div>
        ) : (
          filtrados.map((a) => {
            const isResolvido = a.status === "resolvido";
            const isAberto = a.status === "aberto";

            return (
              <button
                key={a.id}
                onClick={() => setAtendimentoSelecionado(a)}
                className="w-full text-left p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] dark:hover:border-slate-700 transition flex items-center justify-between gap-4 group cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs font-mono shrink-0 border ${
                      isResolvido
                        ? "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-400 shadow-xs"
                        : isAberto
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400 shadow-xs"
                          : "bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-400 shadow-xs"
                    }`}
                  >
                    #{a.numero_protocolo}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition">
                        {a.titulo}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isResolvido
                            ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30"
                            : isAberto
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                              : "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                        }`}
                      >
                        {a.status.replace("_", " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700 shadow-xs">
                        {a.tipo}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                      Cliente:{" "}
                      <span className="text-slate-800 dark:text-slate-200">{a.cliente_nome}</span>
                      {a.veiculo_placa && (
                        <>
                          {" "}
                          · Veículo:{" "}
                          <span className="font-mono text-orange-600 dark:text-orange-400">
                            {a.veiculo_placa}
                          </span>
                        </>
                      )}{" "}
                      · Abertura: {new Date(a.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`hidden sm:inline text-xs font-semibold uppercase ${
                      a.prioridade === "urgente"
                        ? "text-rose-400"
                        : a.prioridade === "alta"
                          ? "text-amber-400"
                          : "text-slate-400"
                    }`}
                  >
                    {a.prioridade}
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-slate-200 transition" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Modais */}
      {modalNovo && (
        <NovoAtendimentoModal
          onFechar={() => setModalNovo(false)}
          onSucesso={() => {
            setModalNovo(false);
            recarregar();
          }}
        />
      )}

      {atendimentoSelecionado && (
        <DetalhesAtendimentoModal
          atendimento={atendimentoSelecionado}
          onFechar={() => setAtendimentoSelecionado(null)}
          onAtualizar={() => {
            recarregar();
          }}
        />
      )}
    </div>
  );
}
