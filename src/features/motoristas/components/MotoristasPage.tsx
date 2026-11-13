import React, { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  AlertTriangle,
  Clock,
  ToggleLeft,
  ToggleRight,
  Search,
  RefreshCw,
  Building2,
  Receipt,
  FileText,
  Fuel,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  listarMotoristas,
  buscarAlertasCNH,
  alternarAcessoMapa,
} from "../services/motoristasService";
import { carregarClientes } from "@/features/clientes/services/clienteService";
import { useAuth } from "@/features/auth/context/AuthContext";
import { TiltCard } from "@/shared/components/TiltCard";
import { MotoristaModal } from "./MotoristaModal";
import { NfExpiracaoModal } from "./NfExpiracaoModal";
import { NfsGestaoPanel } from "./NfsGestaoPanel";
import type { Motorista, AlertaCNH } from "../types";
import type { Cliente } from "@/features/clientes/types";

interface Props {
  clienteId?: string;
}

// ============================================================================
// MotoristasPage — Gestão Canônica de Motoristas (Cliente, Operador e SuperADM)
// ============================================================================
export function MotoristasPage({ clienteId: clienteIdProp }: Props) {
  const { session } = useAuth();
  const isAdminOrOperador = Boolean(
    session?.isAdmin || session?.isSuperAdmin || session?.role === "operador",
  );

  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [alertasCnh, setAlertasCnh] = useState<AlertaCNH[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteFiltroId, setClienteFiltroId] = useState<string>(
    clienteIdProp || session?.clienteId || "",
  );
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalCadastro, setModalCadastro] = useState(false);
  const [motoristaSelecionado, setMotoristaSelecionado] = useState<Motorista | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"motoristas" | "nfs">("motoristas");
  const [filtroStatusMotorista, setFiltroStatusMotorista] = useState<
    "todos" | "ativos" | "vencidas" | "a_vencer"
  >("todos");

  // Detecta parâmetro ?aba=nfs da URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("aba") === "nfs") {
        setAbaAtiva("nfs");
      }
    }
  }, []);

  // Carregar lista de clientes para seleção de Admin/Operador
  useEffect(() => {
    if (isAdminOrOperador) {
      carregarClientes()
        .then((lista) => setClientes(lista || []))
        .catch((err) => console.error("[MotoristasPage] Erro ao carregar clientes:", err));
    }
  }, [isAdminOrOperador]);

  // Carregar motoristas e alertas
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Se for cliente comum, força o clienteId da sessão dele
      const clienteAlvo = isAdminOrOperador
        ? clienteFiltroId || undefined
        : clienteIdProp || session?.clienteId;

      const [mots, alertas] = await Promise.all([
        listarMotoristas(clienteAlvo),
        buscarAlertasCNH(clienteAlvo),
      ]);

      setMotoristas(mots);
      setAlertasCnh(alertas);
    } catch (e) {
      console.error("[MotoristasPage] Falha ao carregar motoristas:", e);
    } finally {
      setCarregando(false);
    }
  }, [isAdminOrOperador, clienteFiltroId, clienteIdProp, session?.clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleToggleMapa = async (mot: Motorista) => {
    setToggling(mot.id);
    try {
      await alternarAcessoMapa(mot.id, !mot.acesso_mapa);
      setMotoristas((prev) =>
        prev.map((m) => (m.id === mot.id ? { ...m, acesso_mapa: !m.acesso_mapa } : m)),
      );
    } catch (e: any) {
      alert(e.message || "Erro ao atualizar permissão de mapa");
    } finally {
      setToggling(null);
    }
  };

  const alertasVencidas = alertasCnh.filter((a) => a.status_cnh === "vencida");
  const alertasAVencer = alertasCnh.filter((a) => a.status_cnh === "a_vencer");

  const filtrados = motoristas.filter((m) => {
    const q = busca.toLowerCase();
    const matchBusca =
      m.nome.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.cpf ?? "").includes(q) ||
      (m.cnh_numero ?? "").toLowerCase().includes(q) ||
      (m.cliente_nome ?? "").toLowerCase().includes(q);

    if (!matchBusca) return false;

    if (filtroStatusMotorista === "ativos") return m.ativo;
    if (filtroStatusMotorista === "vencidas")
      return alertasVencidas.some((a) => a.motorista_id === m.id);
    if (filtroStatusMotorista === "a_vencer")
      return alertasAVencer.some((a) => a.motorista_id === m.id);

    return true;
  });

  return (
    <div id="motoristas-page" className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Modal bloqueante de NFs expiradas para o cliente titular */}
      {session?.clienteId && <NfExpiracaoModal clienteId={session.clienteId} />}

      {/* Topo / Cabeçalho */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 p-3 border border-blue-500/20">
            <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              Gestão de Motoristas
              {isAdminOrOperador && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Operação Central
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {motoristas.filter((m) => m.ativo).length} motorista(s) ativo(s) de{" "}
              {motoristas.length} cadastrado(s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-start sm:justify-end flex-wrap">
          {/* Seletor de Cliente para Administrador e Operador */}
          {isAdminOrOperador && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-2xs max-w-full">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                id="filtro-cliente-motoristas"
                value={clienteFiltroId}
                onChange={(e) => setClienteFiltroId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer max-w-[180px] sm:max-w-[200px] truncate"
              >
                <option value="">Todos os Clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome_razao_social}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            id="btn-recarregar-motoristas"
            onClick={carregar}
            disabled={carregando}
            className="p-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200/80 dark:border-slate-800 cursor-pointer shadow-2xs shrink-0"
            title="Recarregar lista"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </button>

          <Link
            to="/motorista?painel=abastecimento"
            id="btn-portal-abastecimento"
            className="flex items-center gap-2 text-xs sm:text-sm px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
            title="Lançar Abastecimento com Leitura de NF"
          >
            <Fuel className="h-4 w-4" />
            <span className="hidden sm:inline">Lançar Abastecimento</span>
            <span className="sm:hidden">Abastecer</span>
          </Link>

          {abaAtiva === "motoristas" && (
            <button
              id="btn-novo-motorista"
              onClick={() => setModalCadastro(true)}
              className="flex items-center gap-2 text-xs sm:text-sm px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              Novo Motorista
            </button>
          )}
        </div>
      </div>

      {/* SELETOR DE ABAS PRINCIPAIS */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setAbaAtiva("motoristas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            abaAtiva === "motoristas"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Motoristas Cadastrados</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              abaAtiva === "motoristas"
                ? "bg-white/20 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            {motoristas.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("nfs")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            abaAtiva === "nfs"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Receipt className="h-4 w-4" />
          <span>Comprovantes e Notas Fiscais</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            Gestão NF
          </span>
        </button>
      </div>

      {abaAtiva === "nfs" ? (
        <NfsGestaoPanel
          clienteId={
            isAdminOrOperador ? clienteFiltroId || undefined : clienteIdProp || session?.clienteId
          }
          onAtualizacao={carregar}
        />
      ) : (
        <>
          {/* BANNER DE INFRAESTRUTURA E INDICADORES BIDIRECIONAIS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. TOTAL */}
            <TiltCard
              onClick={() => setFiltroStatusMotorista("todos")}
              spotlightColor="rgba(59, 130, 246, 0.16)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatusMotorista === "todos"
                  ? "bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500"
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-blue-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Total Motoristas
                </span>
                <Users className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black mt-1">{motoristas.length}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Cadastrados no sistema</div>
            </TiltCard>

            {/* 2. ATIVOS */}
            <TiltCard
              onClick={() =>
                setFiltroStatusMotorista((prev) => (prev === "ativos" ? "todos" : "ativos"))
              }
              spotlightColor="rgba(16, 185, 129, 0.16)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatusMotorista === "ativos"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500"
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  Ativos
                </span>
                <Users className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black mt-1">
                {motoristas.filter((m) => m.ativo).length}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">Em operação regular</div>
            </TiltCard>

            {/* 3. CNH VENCIDA */}
            <TiltCard
              onClick={() =>
                setFiltroStatusMotorista((prev) => (prev === "vencidas" ? "todos" : "vencidas"))
              }
              spotlightColor="rgba(244, 63, 94, 0.18)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatusMotorista === "vencidas"
                  ? "bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500"
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-rose-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  CNH Vencida
                </span>
                <AlertTriangle className="h-4 w-4 text-rose-400" />
              </div>
              <div className="text-2xl font-black mt-1 text-rose-600 dark:text-rose-400 group-hover:text-white">
                {alertasVencidas.length}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">Renovação urgente</div>
            </TiltCard>

            {/* 4. CNH A VENCER */}
            <TiltCard
              onClick={() =>
                setFiltroStatusMotorista((prev) => (prev === "a_vencer" ? "todos" : "a_vencer"))
              }
              spotlightColor="rgba(245, 158, 11, 0.18)"
              className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none ${
                filtroStatusMotorista === "a_vencer"
                  ? "bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500"
                  : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                  CNH a Vencer
                </span>
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400 group-hover:text-white">
                {alertasAVencer.length}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">Vencendo em até 30 dias</div>
            </TiltCard>
          </div>

          {/* Barra de Busca */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="busca-motoristas"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, e-mail, cliente ou número de CNH…"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-2xs"
            />
          </div>

          {/* Lista de Motoristas */}
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Carregando motoristas...</span>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-2xs">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                <Users className="h-8 w-8 text-blue-500" />
              </div>
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                Nenhum motorista encontrado
              </p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {busca
                  ? "Nenhum resultado corresponde aos termos da pesquisa."
                  : "Cadastre o primeiro motorista com leitura automática da CNH."}
              </p>
              <button
                onClick={() => setModalCadastro(true)}
                className="mt-4 flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-md"
              >
                <Plus className="h-4 w-4" />
                Cadastrar Motorista
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtrados.map((mot) => (
                <CartaoMotorista
                  key={mot.id}
                  motorista={mot}
                  exibirCliente={isAdminOrOperador}
                  alertaCnh={alertasCnh.find((a) => a.motorista_id === mot.id)}
                  onToggleMapa={() => handleToggleMapa(mot)}
                  toggling={toggling === mot.id}
                  onClick={() => setMotoristaSelecionado(mot)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Unificado de Cadastro e Edição */}
      {(modalCadastro || motoristaSelecionado) && (
        <MotoristaModal
          clienteIdPadrao={clienteFiltroId || (session?.clienteId ?? "")}
          isAdminOrOperator={isAdminOrOperador}
          clientesDisponiveis={clientes}
          motoristaEmEdicao={motoristaSelecionado}
          onSucesso={() => {
            setModalCadastro(false);
            setMotoristaSelecionado(null);
            carregar();
          }}
          onFechar={() => {
            setModalCadastro(false);
            setMotoristaSelecionado(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CartaoMotorista
// ---------------------------------------------------------------------------
function CartaoMotorista({
  motorista: m,
  exibirCliente,
  alertaCnh,
  onToggleMapa,
  toggling,
  onClick,
}: {
  motorista: Motorista;
  exibirCliente: boolean;
  alertaCnh?: AlertaCNH;
  onToggleMapa: () => void;
  toggling: boolean;
  onClick: () => void;
}) {
  const statusCnh = alertaCnh?.status_cnh;
  const spotlight =
    statusCnh === "vencida"
      ? "rgba(244, 63, 94, 0.16)"
      : statusCnh === "a_vencer"
        ? "rgba(245, 158, 11, 0.16)"
        : m.ativo
          ? "rgba(59, 130, 246, 0.14)"
          : "rgba(148, 163, 184, 0.10)";

  return (
    <TiltCard
      id={`card-motorista-${m.id}`}
      spotlightColor={spotlight}
      className={`flex items-start justify-between gap-3 p-4 rounded-2xl border transition-all group ${
        !m.ativo
          ? "bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60"
          : "bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-400/50 dark:hover:border-blue-500/40"
      }`}
    >
      <div
        className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClick();
        }}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-black text-sm flex items-center justify-center shrink-0 border border-blue-500/20">
          {m.nome.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {m.nome}
            </span>

            {/* Tag do Cliente se exibido para Admin/Operador */}
            {exibirCliente && m.cliente_nome && (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[150px]">
                {m.cliente_nome}
              </span>
            )}

            {/* Alerta de CNH */}
            {statusCnh === "vencida" && (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                CNH Vencida
              </span>
            )}
            {statusCnh === "a_vencer" && (
              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Vence em {alertaCnh?.dias_para_vencer}d
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{m.email}</p>

          {/* Dados CNH */}
          {m.cnh_numero && (
            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 mt-2 font-mono flex-wrap">
              <span>CNH: {m.cnh_numero}</span>
              {m.cnh_categoria && (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                  Cat. {m.cnh_categoria}
                </span>
              )}
              {m.cnh_validade && (
                <span>
                  Val: {new Date(m.cnh_validade + "T00:00:00").toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Acesso ao Mapa Operacional */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 pl-2">
        <button
          id={`btn-toggle-mapa-${m.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMapa();
          }}
          disabled={toggling || !m.ativo}
          title={
            m.acesso_mapa
              ? "Acesso ao Mapa Liberado (clique para revogar)"
              : "Mapa Bloqueado (clique para liberar)"
          }
          className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
        >
          {m.acesso_mapa ? (
            <ToggleRight className="h-6 w-6 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-slate-400" />
          )}
        </button>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
          {m.acesso_mapa ? "Mapa ON" : "Mapa OFF"}
        </span>
        <span className="text-[9px] font-bold text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
          Editar ▸
        </span>
      </div>
    </TiltCard>
  );
}
