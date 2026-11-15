import { useState, useEffect, useMemo, useCallback } from "react";
import {
  UserCheck,
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Briefcase,
  MapPin,
  ShieldCheck,
  Sparkles,
  Layers,
  Loader2,
  Building2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  type FuncionarioCliente,
  MODULOS_DELEGAVEIS_CLIENTE,
  listarFuncionariosCliente,
  excluirFuncionario,
  obterClientesParaSelecao,
} from "../services/funcionarioService";
import { FuncionarioModal } from "./FuncionarioModal";
import { TiltCard } from "@/shared/components/TiltCard";

export function FuncionariosView() {
  const { session } = useAuth();
  const isGestorGlobal = Boolean(session?.isSuperAdmin || session?.isAdmin);

  const [clienteIdEfetivo, setClienteIdEfetivo] = useState(session?.clienteId || "");
  const [clientes, setClientes] = useState<Array<{ id: string; nome_razao_social: string }>>([]);
  const [clienteFiltroId, setClienteFiltroId] = useState<string>("");

  const [funcionarios, setFuncionarios] = useState<FuncionarioCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "mapa" | "inativos">(
    "todos",
  );

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [funcionarioEmEdicao, setFuncionarioEmEdicao] = useState<FuncionarioCliente | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // 1. Resolução segura de clienteId para cliente comum caso a sessão demore a hidratar
  useEffect(() => {
    if (!isGestorGlobal) {
      if (session?.clienteId) {
        setClienteIdEfetivo(session.clienteId);
      } else if (session?.userId) {
        // Fallback de consulta direta
        supabase
          .from("clientes")
          .select("id")
          .eq("user_id", session.userId)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.id) {
              setClienteIdEfetivo(data.id);
            }
          });
      }
    }
  }, [session, isGestorGlobal]);

  // 2. Se for gestor global (Admin/SuperADM), carrega lista de clientes cadastrados
  useEffect(() => {
    if (isGestorGlobal) {
      obterClientesParaSelecao().then((lista) => {
        setClientes(lista);
      });
    }
  }, [isGestorGlobal]);

  // 3. Carregamento dos funcionários
  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const targetClienteId = isGestorGlobal ? clienteFiltroId || undefined : clienteIdEfetivo;
      const data = await listarFuncionariosCliente(targetClienteId);
      setFuncionarios(data);
    } catch (err: any) {
      console.error("[HUNTER-FUNCIONARIOS] Erro ao carregar:", err);
      const rawMsg = (err?.message || "").toLowerCase();
      if (!rawMsg.includes("schema cache") && !rawMsg.includes("could not find the table")) {
        toast.error("Erro ao carregar colaboradores da equipe.");
      }
    } finally {
      setCarregando(false);
    }
  }, [isGestorGlobal, clienteFiltroId, clienteIdEfetivo]);

  useEffect(() => {
    carregar();

    // Inscrição reativa Realtime
    const targetClienteId = isGestorGlobal ? clienteFiltroId || undefined : clienteIdEfetivo;
    const filter = targetClienteId ? `cliente_id=eq.${targetClienteId}` : undefined;

    const canal = supabase
      .channel(`hunter_funcionarios_realtime_${targetClienteId || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "funcionarios_cliente",
          ...(filter ? { filter } : {}),
        },
        () => {
          carregar();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar, isGestorGlobal, clienteFiltroId, clienteIdEfetivo]);

  // Filtros bidirecionais
  const funcionariosFiltrados = useMemo(() => {
    const termo = (busca || "").toLowerCase().trim();
    return funcionarios.filter((f) => {
      const matchBusca =
        !termo ||
        f.nome.toLowerCase().includes(termo) ||
        f.email.toLowerCase().includes(termo) ||
        (f.cargo && f.cargo.toLowerCase().includes(termo)) ||
        (f.cliente_nome && f.cliente_nome.toLowerCase().includes(termo));

      if (!matchBusca) return false;

      if (filtroStatus === "ativos") return f.ativo;
      if (filtroStatus === "inativos") return !f.ativo;
      if (filtroStatus === "mapa") {
        return f.ativo && (f.modulos_permitidos || []).includes("monitor-gps");
      }
      return true;
    });
  }, [funcionarios, busca, filtroStatus]);

  // Métricas para os cartões de filtro
  const totais = useMemo(() => {
    return {
      total: funcionarios.length,
      ativos: funcionarios.filter((f) => f.ativo).length,
      mapa: funcionarios.filter(
        (f) => f.ativo && (f.modulos_permitidos || []).includes("monitor-gps"),
      ).length,
      inativos: funcionarios.filter((f) => !f.ativo).length,
    };
  }, [funcionarios]);

  const handleExcluir = async (f: FuncionarioCliente) => {
    if (
      !window.confirm(
        `Deseja realmente remover o colaborador "${f.nome}" (${f.email})? O acesso dele ao sistema será revogado imediatamente.`,
      )
    ) {
      return;
    }

    setExcluindoId(f.id);
    setFuncionarios((prev) => prev.filter((item) => item.id !== f.id));

    try {
      const res = await excluirFuncionario(f.id);
      toast.success(res.mensagem || "Colaborador removido com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover colaborador.");
      await carregar();
    } finally {
      setExcluindoId(null);
    }
  };

  const getNomeModulo = (id: string) => {
    const m = MODULOS_DELEGAVEIS_CLIENTE.find((item) => item.id === id);
    return m ? m.nome : id;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 select-none transition-all duration-300">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
            <UserCheck className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              Gestão de Funcionários
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isGestorGlobal
                ? "Controle global de colaboradores vinculados às contas de clientes"
                : "Crie usuários com acesso restrito e personalizado exclusivamente à sua frota"}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setFuncionarioEmEdicao(null);
            setModalAberto(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-[2px_2px_8px_rgba(79,70,229,0.35)] min-h-[44px]"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>Novo Funcionário</span>
        </button>
      </div>

      {/* Seletor de Cliente para Administrador e SuperADM */}
      {isGestorGlobal && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-indigo-500/30 shadow-[3px_3px_10px_#c3cfe2] dark:shadow-xl">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Visão por Cliente Titular (Administração)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecione um cliente para filtrar ou criar novos funcionários vinculados
              </p>
            </div>
          </div>
          <div className="w-full sm:w-72">
            <select
              value={clienteFiltroId}
              onChange={(e) => setClienteFiltroId(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-xl border border-indigo-400/50 dark:border-indigo-500/50 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="">Todos os Clientes ({clientes.length})</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome_razao_social}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Cartão de Informação de Segurança */}
      <div className="p-4 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3.5 shadow-sm">
        <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
          <p className="font-bold text-indigo-900 dark:text-indigo-200">
            Acesso Restrito e Troca de Senha Obrigatória no 1º Login
          </p>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            Diferente dos motoristas (focados no lançamento de notas fiscais e abastecimentos), os
            funcionários acessam a plataforma operacional web e visualizam apenas os módulos
            autorizados. O funcionário nunca visualiza outros clientes, faturas financeiras ou
            ferramentas de governança do sistema.
          </p>
        </div>
      </div>

      {/* Cards de Métricas / Filtros Bidirecionais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <TiltCard
          onClick={() => setFiltroStatus("todos")}
          spotlightColor="rgba(79, 70, 229, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 select-none ${
            filtroStatus === "todos"
              ? "bg-indigo-600 text-white border-indigo-700 shadow-[3px_3px_10px_rgba(79,70,229,0.35)] scale-[1.02]"
              : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-400 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
              Total Colaboradores
            </span>
            <Users className="h-4 w-4 opacity-80" />
          </div>
          <p className="text-2xl sm:text-3xl font-black mt-2">{totais.total}</p>
        </TiltCard>

        <TiltCard
          onClick={() => setFiltroStatus(filtroStatus === "ativos" ? "todos" : "ativos")}
          spotlightColor="rgba(16, 185, 129, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 select-none ${
            filtroStatus === "ativos"
              ? "bg-emerald-600 text-white border-emerald-700 shadow-[3px_3px_10px_rgba(16,185,129,0.35)] scale-[1.02]"
              : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-emerald-400 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
              Ativos
            </span>
            <CheckCircle2
              className={`h-4 w-4 ${filtroStatus === "ativos" ? "text-white" : "text-emerald-500 opacity-80"}`}
            />
          </div>
          <p
            className={`text-2xl sm:text-3xl font-black mt-2 ${
              filtroStatus === "ativos" ? "text-white" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {totais.ativos}
          </p>
        </TiltCard>

        <TiltCard
          onClick={() => setFiltroStatus(filtroStatus === "mapa" ? "todos" : "mapa")}
          spotlightColor="rgba(6, 182, 212, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 select-none ${
            filtroStatus === "mapa"
              ? "bg-cyan-600 text-white border-cyan-700 shadow-[3px_3px_10px_rgba(6,182,212,0.35)] scale-[1.02]"
              : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-cyan-400 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
              Com Acesso ao Mapa
            </span>
            <MapPin
              className={`h-4 w-4 ${filtroStatus === "mapa" ? "text-white" : "text-cyan-500 opacity-80"}`}
            />
          </div>
          <p
            className={`text-2xl sm:text-3xl font-black mt-2 ${
              filtroStatus === "mapa" ? "text-white" : "text-cyan-600 dark:text-cyan-400"
            }`}
          >
            {totais.mapa}
          </p>
        </TiltCard>

        <TiltCard
          onClick={() => setFiltroStatus(filtroStatus === "inativos" ? "todos" : "inativos")}
          spotlightColor="rgba(244, 63, 94, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 select-none ${
            filtroStatus === "inativos"
              ? "bg-rose-600 text-white border-rose-700 shadow-[3px_3px_10px_rgba(244,63,94,0.35)] scale-[1.02]"
              : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-rose-400 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
              Inativos
            </span>
            <XCircle
              className={`h-4 w-4 ${filtroStatus === "inativos" ? "text-white" : "text-rose-500 opacity-80"}`}
            />
          </div>
          <p
            className={`text-2xl sm:text-3xl font-black mt-2 ${
              filtroStatus === "inativos" ? "text-white" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {totais.inativos}
          </p>
        </TiltCard>
      </div>

      {/* Barra de Pesquisa */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={
            isGestorGlobal
              ? "Buscar por nome, e-mail, cargo ou empresa/cliente..."
              : "Buscar por nome, e-mail ou cargo..."
          }
          className="w-full h-11 pl-10 pr-4 text-xs sm:text-sm rounded-2xl border border-slate-300/70 dark:border-slate-800 bg-[#fbf2e9] dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 shadow-[inset_2px_2px_5px_#c3cfe2] dark:shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      </div>

      {/* Listagem de Colaboradores */}
      {carregando ? (
        <div className="p-12 text-center rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600 dark:text-indigo-400 mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
            Carregando equipe de colaboradores...
          </p>
        </div>
      ) : funcionariosFiltrados.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-sm space-y-3">
          <Users className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-700" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Nenhum colaborador encontrado
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {busca || filtroStatus !== "todos"
              ? "Tente ajustar os filtros de busca para encontrar o colaborador."
              : "Cadastre funcionários para delegar o gerenciamento da sua frota de forma segura."}
          </p>
          {!busca && filtroStatus === "todos" && (
            <button
              onClick={() => {
                setFuncionarioEmEdicao(null);
                setModalAberto(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Cadastrar Primeiro Funcionário</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {funcionariosFiltrados.map((f) => {
            const spotlight = f.ativo ? "rgba(79, 70, 229, 0.16)" : "rgba(244, 63, 94, 0.14)";
            return (
              <TiltCard
                key={f.id}
                spotlightColor={spotlight}
                className="p-4 sm:p-5 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-xl hover:border-indigo-400/50 transition-all duration-200 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Topo do card: Nome, Status e Cargo */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 font-black text-sm">
                        {f.nome
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>{f.nome}</span>
                          {f.cargo && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                              {f.cargo}
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {f.email}
                          </span>
                          {f.telefone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {f.telefone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                        f.ativo
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {f.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  {/* Identificação da empresa / cliente (para administradores) */}
                  {f.cliente_nome && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Cliente: {f.cliente_nome}</span>
                    </div>
                  )}

                  {/* Módulos Permitidos */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Módulos Liberados:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(f.modulos_permitidos || []).length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">
                          Nenhum módulo operacional liberado
                        </span>
                      ) : (
                        f.modulos_permitidos.map((modId) => (
                          <span
                            key={modId}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                          >
                            {getNomeModulo(modId)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Rodapé do Card com Ações */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400">
                    Criado em {new Date(f.created_at).toLocaleDateString("pt-BR")}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setFuncionarioEmEdicao(f);
                        setModalAberto(true);
                      }}
                      className="p-2 rounded-xl bg-[#fbf2e9] dark:bg-slate-800 hover:bg-indigo-500/10 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 transition flex items-center justify-center min-h-[38px] min-w-[38px]"
                      title="Editar colaborador"
                      aria-label="Editar"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleExcluir(f)}
                      disabled={excluindoId === f.id}
                      className="p-2 rounded-xl bg-[#fbf2e9] dark:bg-slate-800 hover:bg-rose-500/10 text-rose-600 border border-slate-300/50 dark:border-slate-700 transition flex items-center justify-center min-h-[38px] min-w-[38px] disabled:opacity-50"
                      title="Remover colaborador"
                      aria-label="Excluir"
                    >
                      {excluindoId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </TiltCard>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro / Edição */}
      <FuncionarioModal
        aberto={modalAberto}
        onFechar={() => {
          setModalAberto(false);
          setFuncionarioEmEdicao(null);
        }}
        clienteId={isGestorGlobal ? clienteFiltroId : clienteIdEfetivo}
        clientes={clientes}
        isGestorGlobal={isGestorGlobal}
        funcionarioEmEdicao={funcionarioEmEdicao}
        onSucesso={() => carregar()}
      />
    </div>
  );
}
