import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Lock,
  Plus,
  Search,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Radio,
  Layers,
  Sparkles,
  LogOut,
  Wifi,
  Loader2,
  Link2,
  Power,
  Clock,
  Phone,
  Briefcase,
  UserCheck,
  CornerDownRight,
  Car,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { usePresence } from "../context/PresenceContext";
import { supabase } from "@/integrations/supabase/client";
import {
  type UsuarioCompleto,
  carregarUsuarios,
  excluirUsuarioAdmin,
  alternarStatusAtivoUsuario,
} from "../services/usuarioService";
import { UsuarioFormModal } from "./UsuarioFormModal";
import { RedefinirSenhaModal } from "./RedefinirSenhaModal";
import { NovoClienteModal } from "@/features/clientes/components/NovoClienteModal";
import { ModalConviteInstalador } from "./ModalConviteInstalador";
import { carregarClientes } from "@/features/clientes/services/clienteService";
import { TiltCard } from "@/shared/components/TiltCard";
import type { Cliente } from "@/features/clientes/types";

function formatarDataHora(iso?: string | null): string {
  if (!iso) return "Nunca acessou";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Data inválida";
    return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return "Data indisponível";
  }
}

export function UsuariosView() {
  const { session } = useAuth();
  const { totalOnline, usuariosOnline, isUsuarioOnline, forcarDeslogarUsuario } = usePresence();
  const [usuarios, setUsuarios] = useState<UsuarioCompleto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState<string>("todos");

  // Modais
  const [modalUsuarioAberto, setModalUsuarioAberto] = useState(false);
  const [modalConviteInstaladorAberto, setModalConviteInstaladorAberto] = useState(false);
  const [alternandoAtivoId, setAlternandoAtivoId] = useState<string | null>(null);
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<UsuarioCompleto | null>(null);
  const [usuarioSenha, setUsuarioSenha] = useState<UsuarioCompleto | null>(null);
  const [modalClienteAberto, setModalClienteAberto] = useState(false);
  const [clienteEmEdicao, setClienteEmEdicao] = useState<Cliente | null>(null);

  const carregar = async () => {
    setCarregando(true);
    const data = await carregarUsuarios();
    setUsuarios(data || []);
    setCarregando(false);
  };

  const isContaBlindadaSuperAdm = (email?: string) => {
    const em = (email || "").toLowerCase().trim();
    return em === "novaes@adm.28bpm.local" || em === "novaes@oficial.tec.br";
  };

  const handleAlternarAtivo = async (u: UsuarioCompleto, novoStatus: boolean) => {
    if (isContaBlindadaSuperAdm(u.email)) {
      toast.error("A conta de governança é blindada contra alteração de status.");
      return;
    }

    setAlternandoAtivoId(u.id);
    try {
      const res = await alternarStatusAtivoUsuario(u.id, novoStatus);
      if (res.success) {
        toast.success(res.message);
        await carregar();
      } else {
        toast.error(res.message);
      }
    } finally {
      setAlternandoAtivoId(null);
    }
  };

  useEffect(() => {
    carregar();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const carregarDebounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        carregar();
      }, 400);
    };

    const canal = supabase
      .channel("hunter_usuarios_realtime_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        carregarDebounced();
      })
      .on("broadcast", { event: "usuario_cadastrado" }, () => {
        carregarDebounced();
      })
      .on("broadcast", { event: "usuario_atualizado" }, () => {
        carregarDebounced();
      })
      .subscribe();

    const handleSync = () => {
      carregarDebounced();
    };
    window.addEventListener("hunter_usuarios_sync", handleSync);
    window.addEventListener("hunter_demonstracao_mudanca", handleSync);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(canal);
      window.removeEventListener("hunter_usuarios_sync", handleSync);
      window.removeEventListener("hunter_demonstracao_mudanca", handleSync);
    };
  }, []);

  // Mapeamento de subordinados (motoristas e funcionários) agrupados por cliente titular
  const subordinadosPorCliente = useMemo(() => {
    const mapPorId = new Map<string, UsuarioCompleto[]>();
    const mapPorNome = new Map<string, UsuarioCompleto[]>();

    for (const u of usuarios) {
      if (u.role === "motorista" || u.role === "funcionario") {
        if (u.cliente_id) {
          const list = mapPorId.get(u.cliente_id) || [];
          list.push(u);
          mapPorId.set(u.cliente_id, list);
        }
        if (u.cliente_nome) {
          const chave = u.cliente_nome.trim().toLowerCase();
          const list = mapPorNome.get(chave) || [];
          list.push(u);
          mapPorNome.set(chave, list);
        }
      }
    }

    return { mapPorId, mapPorNome };
  }, [usuarios]);

  const obterSubordinadosDoCliente = (clienteUser: UsuarioCompleto): UsuarioCompleto[] => {
    const subsSet = new Map<string, UsuarioCompleto>();

    // 1. Busca por cliente_id
    if (clienteUser.cliente_id) {
      const porId = subordinadosPorCliente.mapPorId.get(clienteUser.cliente_id) || [];
      for (const s of porId) subsSet.set(s.id, s);
    }
    // 2. Busca por nome da razão social / nome do cliente
    if (clienteUser.nome) {
      const porNome =
        subordinadosPorCliente.mapPorNome.get(clienteUser.nome.trim().toLowerCase()) || [];
      for (const s of porNome) subsSet.set(s.id, s);
    }
    // 3. Fallback: busca por id do user se bateu como cliente_id
    const porUserId = subordinadosPorCliente.mapPorId.get(clienteUser.id) || [];
    for (const s of porUserId) subsSet.set(s.id, s);

    return Array.from(subsSet.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const totais = useMemo(() => {
    return {
      total: usuarios.length,
      ativos: usuarios.filter((u) => u.ativo).length,
      admins: usuarios.filter((u) => u.role === "superadmin" || u.role === "adm").length,
      operadores: usuarios.filter((u) => u.role === "operador").length,
      clientes: usuarios.filter((u) => u.role === "cliente").length,
      motoristas: usuarios.filter((u) => u.role === "motorista").length,
      funcionarios: usuarios.filter((u) => u.role === "funcionario").length,
      instaladores: usuarios.filter((u) => u.role === "instalador").length,
    };
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = (busca || "").toLowerCase().trim();

    // Se temos filtro por role específica ou termo de busca, exibe todos os que batem diretamente
    if (filtroRole !== "todos" || termo) {
      return (usuarios || []).filter((u) => {
        const nomeStr = (u.nome || "").toLowerCase();
        const emailStr = (u.email || "").toLowerCase();
        const cliStr = (u.cliente_nome || "").toLowerCase();
        const cargoStr = (u.cargo || "").toLowerCase();

        const matchBusca =
          !termo ||
          nomeStr.includes(termo) ||
          emailStr.includes(termo) ||
          cliStr.includes(termo) ||
          cargoStr.includes(termo);

        const matchRole =
          filtroRole === "todos"
            ? true
            : filtroRole === "adm"
              ? u.role === "adm" || u.role === "superadmin"
              : u.role === filtroRole;

        return matchBusca && matchRole;
      });
    }

    // Na visão ampla ("todos" e sem busca textual):
    // Agrupamento hierárquico: motoristas e funcionários vinculados a um cliente presente na lista
    // serão renderizados subordinados logo abaixo do seu cliente titular correspondente.
    // Assim, removemos da raiz apenas aqueles que já têm cliente titular exibido na tela.
    const clientesIdsPresentes = new Set<string>();
    const clientesNomesPresentes = new Set<string>();

    for (const u of usuarios) {
      if (u.role === "cliente") {
        if (u.cliente_id) clientesIdsPresentes.add(u.cliente_id);
        clientesIdsPresentes.add(u.id);
        if (u.nome) clientesNomesPresentes.add(u.nome.trim().toLowerCase());
      }
    }

    return (usuarios || []).filter((u) => {
      if (u.role === "motorista" || u.role === "funcionario") {
        // Se este motorista/funcionário tem cliente correspondente presente na lista,
        // ele será aninhado hierarquicamente sob o card do cliente
        const temClientePresente =
          (u.cliente_id && clientesIdsPresentes.has(u.cliente_id)) ||
          (u.cliente_nome && clientesNomesPresentes.has(u.cliente_nome.trim().toLowerCase()));

        return !temClientePresente;
      }
      return true;
    });
  }, [usuarios, busca, filtroRole]);

  const handleExcluir = async (usuario: UsuarioCompleto) => {
    if (isContaBlindadaSuperAdm(usuario.email)) {
      toast.error("A conta de governança é imutável e blindada por trigger contra exclusão.");
      return;
    }

    if (
      !window.confirm(
        `Deseja realmente remover o usuário "${usuario.nome}" (${usuario.email})? Esta ação revoga todos os acessos.`,
      )
    ) {
      return;
    }

    setExcluindoId(usuario.id);
    setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));

    try {
      const res = await excluirUsuarioAdmin(usuario.id);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
        await carregar();
      }
    } catch {
      await carregar();
    } finally {
      setExcluindoId(null);
    }
  };

  const handleDeslogar = async (u: UsuarioCompleto) => {
    if (isContaBlindadaSuperAdm(u.email)) {
      toast.error("A conta de governança é imutável e blindada contra desconexão forçada.");
      return;
    }

    if (
      !window.confirm(
        `Deseja forçar a desconexão do usuário "${u.nome}" (${u.email})? A sessão remota será encerrada imediatamente.`,
      )
    ) {
      return;
    }

    const sucesso = await forcarDeslogarUsuario(u.id, u.email);
    if (sucesso) {
      setUsuarios((antigos) =>
        antigos.map((item) =>
          item.id === u.id
            ? { ...item, tem_sessao_ativa: false, ultimo_logout: new Date().toISOString() }
            : item,
        ),
      );
      toast.success(`Sessão de ${u.nome} encerrada com sucesso.`);
      await carregar();
    } else {
      toast.error("Falha ao enviar comando de desconexão.");
    }
  };

  const handleEditarUsuario = async (u: UsuarioCompleto) => {
    if (u.role === "cliente") {
      try {
        const todosClientes = await carregarClientes();
        const cli = todosClientes.find(
          (c) => c.user_id === u.id || (u.email && c.email === u.email),
        );
        if (cli) {
          setClienteEmEdicao(cli);
          setModalClienteAberto(true);
          return;
        }
      } catch (err) {
        console.error("Erro ao buscar ficha do cliente para edição:", err);
      }
    }

    setUsuarioEmEdicao(u);
    setModalUsuarioAberto(true);
  };

  const alternarFiltroRole = (role: string) => {
    setFiltroRole((prev) => (prev === role ? "todos" : role));
  };

  // Renderizador canônico do Card de Usuário (reutilizável tanto na raiz quanto na hierarquia subordinada)
  const renderUsuarioCard = (u: UsuarioCompleto, isSubordinado: boolean = false) => {
    const isNovaes = isContaBlindadaSuperAdm(u.email);
    const online = isUsuarioOnline(u.id, true);
    const presencaOnline = online ? usuariosOnline.find((uo) => uo.userId === u.id) : null;

    let statusSessao: "online" | "offline" | "deslogado" = "deslogado";
    if (online) {
      statusSessao = "online";
    } else if (u.tem_sessao_ativa) {
      statusSessao = "offline";
    } else {
      statusSessao = "deslogado";
    }

    const spotlight = isNovaes
      ? "rgba(16, 185, 129, 0.22)"
      : u.role === "cliente"
        ? "rgba(16, 185, 129, 0.16)"
        : u.role === "motorista"
          ? "rgba(59, 130, 246, 0.16)"
          : u.role === "funcionario"
            ? "rgba(79, 70, 229, 0.16)"
            : u.role === "adm"
              ? "rgba(245, 158, 11, 0.18)"
              : "rgba(100, 116, 139, 0.14)";

    return (
      <TiltCard
        key={u.id}
        spotlightColor={spotlight}
        className={`p-3.5 sm:p-4 rounded-3xl border transition-all duration-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isSubordinado
            ? "bg-white/80 dark:bg-slate-950/70 border-slate-300/50 dark:border-slate-800/80 shadow-[2px_2px_8px_#c3cfe2] dark:shadow-md hover:border-orange-500/40"
            : isNovaes
              ? "bg-orange-500/10 dark:bg-orange-950/20 border-orange-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[6px_6px_14px_#b8c6da] dark:hover:border-slate-700"
        }`}
      >
        {/* Dados Principais */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isSubordinado && (
              <span
                className="text-orange-500 dark:text-orange-400 font-mono text-sm font-black mr-0.5"
                title="Subordinado ao cliente"
              >
                ↳
              </span>
            )}

            <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              {u.nome || "Usuário"}
            </span>

            {/* Badge do Perfil com Distinção Total */}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                u.role === "superadmin"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40"
                  : u.role === "adm"
                    ? "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30"
                    : u.role === "operador"
                      ? "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30"
                      : u.role === "cliente"
                        ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"
                        : u.role === "motorista"
                          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                          : u.role === "funcionario"
                            ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
              }`}
            >
              {u.role === "superadmin" ? "SuperADM" : u.role || "usuario"}
            </span>

            {/* Badge de Vínculo com o Cliente Titular (para Motorista e Funcionário) */}
            {u.cliente_nome && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30 shadow-2xs"
                title={`Vinculado à conta do cliente ${u.cliente_nome}`}
              >
                <Link2 className="h-3 w-3 text-orange-500" />
                <span>
                  {u.role === "motorista" ? "Motorista de" : "Funcionário de"}: {u.cliente_nome}
                </span>
              </span>
            )}

            {/* Badge de Cargo (se funcionário) */}
            {u.cargo && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                <Briefcase className="h-3 w-3 text-indigo-500" />
                <span>{u.cargo}</span>
              </span>
            )}

            {/* Badge do Plano (se cliente) */}
            {u.plano && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Plano {u.plano}
              </span>
            )}

            {/* Blindagem do SuperADM */}
            {isNovaes && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40">
                <Lock className="h-3 w-3" />
                Imutável
              </span>
            )}

            {/* Status de Sessão */}
            {statusSessao === "online" && (
              <span
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                title="Usuário conectado e com tela ativa no sistema"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping inline-block" />
                <span>Logado (Online)</span>
              </span>
            )}

            {statusSessao === "offline" && (
              <span
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30"
                title="Sessão ativa salva no dispositivo (usuário não efetuou logout)"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500 inline-block" />
                <span>Logado (Offline)</span>
              </span>
            )}

            {statusSessao === "deslogado" && (
              <span
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                title={
                  u.ultimo_logout
                    ? `Sessão encerrada (Logout em ${formatarDataHora(u.ultimo_logout)})`
                    : "Sessão encerrada (Usuário deslogado)"
                }
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
                <span>Deslogado</span>
              </span>
            )}

            {/* Status Ativo/Inativo */}
            {u.ativo ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ativo
              </span>
            ) : u.role === "instalador" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                <XCircle className="h-3 w-3" />
                Aguardando Habilitação
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                <XCircle className="h-3.5 w-3.5" />
                Inativo
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono">{u.email || "Sem e-mail"}</span>
            {u.telefone && (
              <>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                  <Phone className="h-3 w-3 text-orange-500" />
                  <span>{u.telefone}</span>
                </span>
              </>
            )}
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-medium text-slate-600 dark:text-slate-300">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Último acesso:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {statusSessao === "online" ? (
                  <span className="text-orange-600 dark:text-orange-400 font-bold">
                    Online agora
                    {presencaOnline?.onlineAt && (
                      <span className="text-slate-400 dark:text-slate-500 font-normal text-[10px] ml-1">
                        (desde{" "}
                        {new Date(presencaOnline.onlineAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        )
                      </span>
                    )}
                  </span>
                ) : u.ultimo_acesso ? (
                  formatarDataHora(u.ultimo_acesso)
                ) : (
                  "Nunca acessou"
                )}
              </span>
            </span>
          </div>

          {/* Lista de Módulos Concedidos */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Módulos:
            </span>
            {u.role === "superadmin" || u.role === "adm" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                <CheckCircle2 className="h-3 w-3 text-orange-500" />
                Todos os Módulos Liberados (Acesso Total)
              </span>
            ) : !u.modulos || u.modulos.length === 0 ? (
              <span className="text-[11px] text-slate-400 italic">Nenhum módulo atribuído</span>
            ) : (
              (u.modulos || []).map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80"
                >
                  {m}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Ações Administrativas */}
        <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
          {!u.ativo && (session?.isAdmin || session?.isOperador) && (
            <button
              onClick={() => handleAlternarAtivo(u, true)}
              disabled={alternandoAtivoId === u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 transition shadow-sm disabled:opacity-50"
              title="Habilitar e ativar acesso da conta"
            >
              {alternandoAtivoId === u.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5 stroke-[2.5]" />
              )}
              <span>Habilitar</span>
            </button>
          )}

          {session?.isAdmin && (
            <>
              {/* Botão Editar */}
              <button
                onClick={() => handleEditarUsuario(u)}
                className="p-2.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-800 hover:bg-[#dfe8f5] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition min-h-[38px] min-w-[38px] flex items-center justify-center"
                title={
                  u.role === "cliente"
                    ? "Editar Ficha e Acesso do Cliente"
                    : "Editar Perfil e Módulos"
                }
                aria-label="Editar"
              >
                <Edit2 className="h-4 w-4" />
              </button>

              {/* Botão Redefinir Senha */}
              <button
                onClick={() => setUsuarioSenha(u)}
                className="p-2.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-800 hover:bg-amber-500/20 hover:text-amber-500 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition min-h-[38px] min-w-[38px] flex items-center justify-center"
                title="Redefinir Senha"
                aria-label="Redefinir Senha"
              >
                <Key className="h-4 w-4" />
              </button>

              {/* Botão Deslogar Usuário */}
              <button
                onClick={() => handleDeslogar(u)}
                disabled={isNovaes}
                className="p-2.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-800 hover:bg-rose-500/20 hover:text-rose-500 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition disabled:opacity-30 disabled:cursor-not-allowed min-h-[38px] min-w-[38px] flex items-center justify-center"
                title={
                  isNovaes
                    ? "Conta de governança blindada contra desconexão forçada"
                    : online
                      ? "Deslogar Usuário Online Agora"
                      : "Encerrar Sessão / Deslogar Usuário"
                }
                aria-label="Deslogar Usuário"
              >
                <LogOut className="h-4 w-4" />
              </button>

              {/* Botão Excluir */}
              <button
                onClick={() => handleExcluir(u)}
                disabled={isNovaes || excluindoId === u.id}
                className="p-2.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-800 hover:bg-rose-500/20 text-rose-500 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                title={isNovaes ? "Conta de governança não pode ser excluída" : "Excluir Usuário"}
                aria-label="Excluir Usuário"
              >
                {excluindoId === u.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </>
          )}
        </div>
      </TiltCard>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 select-none transition-all duration-300">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs">
            <Users className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              Gestão de Usuários e Acessos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Controle corporativo de perfis, hierarquia de clientes, motoristas e funcionários
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(session?.isAdmin || session?.isOperador) && (
            <button
              onClick={() => setModalConviteInstaladorAberto(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-sky-600 dark:text-sky-400 bg-[#eaf0f8] dark:bg-slate-800/80 hover:bg-sky-500/10 border border-sky-500/30 transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none min-h-[44px]"
              title="Gerar link de uso único para auto-cadastro do instalador"
            >
              <Link2 className="h-4 w-4 stroke-[2.5]" />
              <span>Convidar Instalador</span>
            </button>
          )}

          {session?.isAdmin && (
            <button
              onClick={() => {
                setUsuarioEmEdicao(null);
                setModalUsuarioAberto(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-950 bg-orange-500 hover:bg-orange-400 transition shadow-[2px_2px_8px_rgba(5,150,105,0.4)] min-h-[44px]"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              <span>Novo Usuário</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards de Métricas Rápidas com Filtro Bidirecional Interativo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <TiltCard
          onClick={() => setFiltroRole("todos")}
          spotlightColor="rgba(100, 116, 139, 0.16)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "todos"
              ? "bg-slate-300/40 dark:bg-slate-800 border-slate-400/80 dark:border-slate-700 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-slate-400"
          }`}
          title="Clique para alternar filtro de todos os usuários"
        >
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Total de Contas
          </span>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
            {totais.total}
          </div>
        </TiltCard>

        <TiltCard
          onClick={() => alternarFiltroRole("cliente")}
          spotlightColor="rgba(16, 185, 129, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "cliente"
              ? "bg-orange-500/20 border-orange-500/60 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-orange-400"
          }`}
          title="Filtrar clientes titulares"
        >
          <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
            Clientes Titulares
          </span>
          <div className="text-xl font-black font-mono text-orange-600 dark:text-orange-400 mt-0.5">
            {totais.clientes}
          </div>
        </TiltCard>

        <TiltCard
          onClick={() => alternarFiltroRole("motorista")}
          spotlightColor="rgba(59, 130, 246, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "motorista"
              ? "bg-blue-500/20 border-blue-500/60 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-blue-400"
          }`}
          title="Filtrar motoristas"
        >
          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            Motoristas
          </span>
          <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5">
            {totais.motoristas}
          </div>
        </TiltCard>

        <TiltCard
          onClick={() => alternarFiltroRole("funcionario")}
          spotlightColor="rgba(79, 70, 229, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "funcionario"
              ? "bg-indigo-500/20 border-indigo-500/60 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-indigo-400"
          }`}
          title="Filtrar funcionários de clientes"
        >
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
            Funcionários
          </span>
          <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
            {totais.funcionarios}
          </div>
        </TiltCard>

        <TiltCard
          onClick={() => alternarFiltroRole("adm")}
          spotlightColor="rgba(245, 158, 11, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "adm"
              ? "bg-amber-500/20 border-amber-500/60 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-amber-400"
          }`}
          title="Filtrar administradores"
        >
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Administradores
          </span>
          <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
            {totais.admins}
          </div>
        </TiltCard>

        <TiltCard
          onClick={() => alternarFiltroRole("instalador")}
          spotlightColor="rgba(6, 182, 212, 0.20)"
          className={`cursor-pointer p-4 rounded-2xl border transition ${
            filtroRole === "instalador"
              ? "bg-sky-500/20 border-sky-500/60 shadow-[inset_2px_2px_4px_#c8d4e4]"
              : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:border-sky-400"
          }`}
          title="Filtrar instaladores"
        >
          <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium">
            Instaladores
          </span>
          <div className="text-xl font-black font-mono text-sky-600 dark:text-sky-400 mt-0.5">
            {totais.instaladores}
          </div>
        </TiltCard>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800 p-3.5 rounded-2xl shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, cliente ou cargo..."
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none focus:ring-2 focus:ring-[#00CFCC] transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: "todos", label: "Todos" },
            { id: "adm", label: "Administrador" },
            { id: "operador", label: "Operador" },
            { id: "cliente", label: "Cliente" },
            { id: "motorista", label: "Motorista" },
            { id: "funcionario", label: "Funcionário" },
            { id: "instalador", label: "Instalador" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => alternarFiltroRole(f.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition min-h-[38px] ${
                filtroRole === f.id
                  ? "bg-orange-500 text-slate-950 shadow-[1px_1px_4px_rgba(5,150,105,0.4)]"
                  : "bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/50 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Usuários com Hierarquia Subordinada para Motoristas e Funcionários */}
      <div className="space-y-3">
        {carregando ? (
          <div className="py-16 text-center text-slate-500 text-xs font-mono">
            Carregando catálogo de usuários GD Rastreamento...
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            Nenhum usuário encontrado para os critérios selecionados.
          </div>
        ) : (
          usuariosFiltrados.map((u) => {
            const isCliente = u.role === "cliente";
            const subordinados = isCliente ? obterSubordinadosDoCliente(u) : [];
            const exibirSubordinados =
              isCliente &&
              subordinados.length > 0 &&
              (filtroRole === "todos" || filtroRole === "cliente") &&
              !busca;

            return (
              <div key={u.id} className="space-y-2">
                {/* Card Principal do Usuário */}
                {renderUsuarioCard(u, false)}

                {/* Subordinação Hierárquica: Motoristas e Funcionários do Cliente */}
                {exibirSubordinados && (
                  <div className="ml-4 sm:ml-8 pl-3.5 sm:pl-5 border-l-2 border-orange-500/40 dark:border-orange-500/30 space-y-2.5 mt-2 mb-3">
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                      <CornerDownRight className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      <span>
                        Equipe e Motoristas Subordinados a {u.nome} ({subordinados.length})
                      </span>
                    </div>

                    <div className="space-y-2">
                      {subordinados.map((sub) => renderUsuarioCard(sub, true))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modais Administrativos */}
      {modalUsuarioAberto && (
        <UsuarioFormModal
          usuario={usuarioEmEdicao}
          onSalvo={() => {
            setModalUsuarioAberto(false);
            setUsuarioEmEdicao(null);
            carregar();
          }}
          onFechar={() => {
            setModalUsuarioAberto(false);
            setUsuarioEmEdicao(null);
          }}
        />
      )}

      {usuarioSenha && (
        <RedefinirSenhaModal
          usuario={usuarioSenha}
          onConcluido={() => {
            setUsuarioSenha(null);
            carregar();
          }}
          onFechar={() => setUsuarioSenha(null)}
        />
      )}

      <ModalConviteInstalador
        aberto={modalConviteInstaladorAberto}
        onFechar={() => setModalConviteInstaladorAberto(false)}
      />

      {modalClienteAberto && clienteEmEdicao && (
        <NovoClienteModal
          clienteEdicao={clienteEmEdicao}
          onFechar={() => {
            setModalClienteAberto(false);
            setClienteEmEdicao(null);
          }}
          onSucesso={() => {
            carregar();
          }}
        />
      )}
    </div>
  );
}
