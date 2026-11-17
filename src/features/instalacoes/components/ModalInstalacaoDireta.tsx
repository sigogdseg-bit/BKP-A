import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Zap,
  Car,
  Cpu,
  User,
  Search,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  Phone,
  RotateCcw,
  UserPlus,
  ArrowUpRight,
  ShieldCheck,
  Check,
  Loader2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  carregarClientesParaInstalacao,
  registrarInstalacaoDireta,
} from "../services/instalacaoService";
import {
  listarEquipamentosHabilitadosInstalacao,
  type EquipamentoHabilitado,
} from "@/features/estoque/services/rastreadorChipService";

interface ModalInstalacaoDiretaProps {
  aberto: boolean;
  clientePreSelecionadoId?: string | null;
  clientesIniciais?: any[];
  onSalvo: () => void;
  onFechar: () => void;
}

const TIPOS_VEICULO = [
  { id: "carro", label: "Carro / Passeio" },
  { id: "moto", label: "Motocicleta" },
  { id: "moto_eletrica", label: "Moto Elétrica" },
  { id: "caminhao", label: "Caminhão" },
  { id: "van", label: "Van / Utilitário" },
  { id: "suv", label: "SUV" },
  { id: "camionete", label: "Camionete" },
  { id: "onibus", label: "Ônibus" },
  { id: "trator", label: "Trator" },
  { id: "maquina", label: "Máquina / Equipamento" },
  { id: "quadriciculo", label: "Quadriciclo" },
  { id: "outro", label: "Outro" },
];

export function ModalInstalacaoDireta({
  aberto,
  clientePreSelecionadoId,
  clientesIniciais,
  onSalvo,
  onFechar,
}: ModalInstalacaoDiretaProps) {
  const { session } = useAuth();
  const navigate = useNavigate();

  // Função auxiliar de normalização de cliente
  const normalizarCliente = (c: any) => ({
    id: c.id,
    nome: c.nome || c.nome_razao_social || "Cliente sem Nome",
    documento: c.documento || undefined,
    telefone: c.telefone || undefined,
    status: c.status || "ativo",
  });

  // Estados de Clientes
  const [clientes, setClientes] = useState<
    { id: string; nome: string; documento?: string; telefone?: string; status: string }[]
  >(() => {
    if (Array.isArray(clientesIniciais) && clientesIniciais.length > 0) {
      return clientesIniciais.map(normalizarCliente);
    }
    return [];
  });
  const [carregandoClientes, setCarregandoClientes] = useState(
    () => !Array.isArray(clientesIniciais) || clientesIniciais.length === 0,
  );
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<{
    id: string;
    nome: string;
    documento?: string;
    telefone?: string;
    status: string;
  } | null>(() => {
    if (clientePreSelecionadoId && Array.isArray(clientesIniciais)) {
      const achado = clientesIniciais.find((c) => c.id === clientePreSelecionadoId);
      if (achado) return normalizarCliente(achado);
    }
    return null;
  });

  // Estados do Veículo
  const [tipoVeiculo, setTipoVeiculo] = useState("carro");
  const [placa, setPlaca] = useState("");
  const [isSemPlaca, setIsSemPlaca] = useState(false);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [cor, setCor] = useState("");
  const [chassi, setChassi] = useState("");
  const [kmInstalacao, setKmInstalacao] = useState("0");
  const [horimetroInicial, setHorimetroInicial] = useState("0");
  const [bloqueadorInstalado, setBloqueadorInstalado] = useState(true);
  const [tipoBloqueador, setTipoBloqueador] = useState("rele_combustivel");
  const [bloqueadorDetalhes, setBloqueadorDetalhes] = useState("");

  // Estados dos Rastreadores em Estoque
  const [rastreadores, setRastreadores] = useState<EquipamentoHabilitado[]>([]);
  const [carregandoRastreadores, setCarregandoRastreadores] = useState(true);
  const [buscaRastreador, setBuscaRastreador] = useState("");
  const [rastreadorSelecionado, setRastreadorSelecionado] = useState<EquipamentoHabilitado | null>(
    null,
  );
  const [modoImeiManual, setModoImeiManual] = useState(false);
  const [imeiManual, setImeiManual] = useState("");
  const [modeloManual, setModeloManual] = useState("J16 4G");

  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Carrega clientes com fallback nos clientesIniciais
  const carregarClientes = useCallback(async () => {
    setCarregandoClientes((prev) => (clientes.length === 0 ? true : prev));
    try {
      const lista = await carregarClientesParaInstalacao();
      if (lista && lista.length > 0) {
        setClientes(lista);
        if (clientePreSelecionadoId) {
          const achado = lista.find((c) => c.id === clientePreSelecionadoId);
          if (achado) setClienteSelecionado(achado);
        }
      } else if (Array.isArray(clientesIniciais) && clientesIniciais.length > 0) {
        const mapeados = clientesIniciais.map(normalizarCliente);
        setClientes(mapeados);
        if (clientePreSelecionadoId) {
          const achado = mapeados.find((c) => c.id === clientePreSelecionadoId);
          if (achado) setClienteSelecionado(achado);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar clientes para instalação direta:", err);
      if (Array.isArray(clientesIniciais) && clientesIniciais.length > 0) {
        setClientes(clientesIniciais.map(normalizarCliente));
      }
    } finally {
      setCarregandoClientes(false);
    }
  }, [clientePreSelecionadoId, clientesIniciais, clientes.length]);

  // Carrega rastreadores disponíveis no estoque
  const carregarRastreadores = useCallback(async () => {
    setCarregandoRastreadores(true);
    try {
      const lista = await listarEquipamentosHabilitadosInstalacao();
      setRastreadores(lista);
      if (lista.length > 0 && !rastreadorSelecionado && !modoImeiManual) {
        setRastreadorSelecionado(lista[0]);
      }
    } catch (err) {
      console.error("Erro ao carregar rastreadores para instalação direta:", err);
    } finally {
      setCarregandoRastreadores(false);
    }
  }, [rastreadorSelecionado, modoImeiManual]);

  useEffect(() => {
    if (aberto) {
      carregarClientes();
      carregarRastreadores();
    }
  }, [aberto, carregarClientes, carregarRastreadores]);

  // Filtro de clientes
  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase();
    if (!q) return clientes;
    const qApenasDigitos = q.replace(/\D/g, "");
    return clientes.filter((c) => {
      const nomeStr = (c.nome || (c as any).nome_razao_social || "").toLowerCase();
      const docStr = (c.documento || "").toLowerCase();
      const telStr = (c.telefone || "").replace(/\D/g, "");
      return (
        nomeStr.includes(q) ||
        docStr.includes(q) ||
        (qApenasDigitos && telStr.includes(qApenasDigitos)) ||
        (c.telefone && c.telefone.toLowerCase().includes(q))
      );
    });
  }, [clientes, buscaCliente]);

  // Filtro de rastreadores disponíveis
  const rastreadoresFiltrados = useMemo(() => {
    const q = buscaRastreador.trim().toLowerCase();
    if (!q) return rastreadores;
    return rastreadores.filter(
      (r) =>
        r.imei.toLowerCase().includes(q) ||
        r.modelo.toLowerCase().includes(q) ||
        (r.linha && r.linha.includes(q)) ||
        (r.iccid && r.iccid.toLowerCase().includes(q)),
    );
  }, [rastreadores, buscaRastreador]);

  // Navegar para cadastro de cliente
  const irParaCadastroNovoCliente = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sigo_abrir_novo_cliente", "1");
    }
    onFechar();
    navigate({ to: "/clientes" });
  };

  const handleSubmeter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteSelecionado) {
      toast.error("Selecione o cliente proprietário do veículo.");
      return;
    }

    const rawChassi = chassi.trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFinal =
      placa.trim().toUpperCase() || (isSemPlaca ? sufixoChassi || "SEMPLACA" : "A DEFINIR");

    if (placaFinal === "A DEFINIR" && !isSemPlaca) {
      toast.error("Informe a placa do veículo.");
      return;
    }

    const imeiFinal = modoImeiManual
      ? imeiManual.trim()
      : rastreadorSelecionado?.imei?.trim() || "";

    if (!imeiFinal) {
      toast.error("Selecione um rastreador disponível em estoque ou informe o IMEI.");
      return;
    }

    setSalvando(true);

    try {
      const res = await registrarInstalacaoDireta({
        clienteId: clienteSelecionado.id,
        placa: placaFinal,
        marca: marca.trim() || "Veículo",
        modelo: modelo.trim() || "Padrão",
        ano: ano ? Number(ano) : null,
        cor: cor.trim() || null,
        tipoVeiculo,
        chassi: rawChassi || null,
        kmInstalacao: Number(kmInstalacao) || 0,
        horimetroInicial: Number(horimetroInicial) || 0,
        rastreadorId: modoImeiManual ? null : rastreadorSelecionado?.rastreador_id || null,
        rastreadorImei: imeiFinal,
        rastreadorModelo: modoImeiManual ? modeloManual : rastreadorSelecionado?.modelo || "J16 4G",
        chipIccid: modoImeiManual ? null : rastreadorSelecionado?.iccid || null,
        chipOperadora: modoImeiManual ? null : rastreadorSelecionado?.operadora || "Algar",
        chipLinha: modoImeiManual ? null : rastreadorSelecionado?.linha || null,
        bloqueadorInstalado,
        tipoBloqueador: bloqueadorInstalado ? tipoBloqueador : "sem_bloqueador",
        bloqueadorDetalhes: bloqueadorInstalado ? bloqueadorDetalhes.trim() || null : null,
        observacoes:
          observacoes.trim() ||
          "Instalação direta realizada pelo SuperADM (veículo previamente instalado).",
      });

      if (res.success) {
        toast.success(
          res.message ||
            "Instalação direta concluída com sucesso e veículo ativado no Monitor GPS!",
        );
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message || "Falha ao registrar instalação direta.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao registrar instalação direta.");
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="relative w-full max-w-4xl max-h-[90vh] my-auto bg-[#eaf0f8] dark:bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
          {/* Header Tático */}
          <div className="p-4 sm:p-5 border-b border-slate-300/70 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    Instalação Direta (Veículo Já Instalado)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    SuperADM
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ativação imediata no Monitor GPS com vínculo de rastreador disponível em estoque,
                  sem tramitação de instalador.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Scroll Interno */}
          <form onSubmit={handleSubmeter} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Card Explicativo das Regras Pétreas */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-xs text-emerald-950 dark:text-emerald-200 shadow-xs">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-extrabold text-emerald-700 dark:text-emerald-300">
                    Ativação Direta Instantânea pelo Administrador
                  </div>
                  <div>
                    Esta modalidade cadastra e ativa o veículo imediatamente na frota do cliente,
                    promove o rastreador de <strong>Estoque</strong> para <strong>Instalado</strong>{" "}
                    e encerra a ordem como concluída com{" "}
                    <strong>mão de obra isenta (R$ 0,00)</strong>, sem necessidade de agendamento
                    prévio, conferência física via aplicativo ou envio de fotos por técnicos
                    terceiros.
                  </div>
                </div>
              </div>

              {/* Seção 1: Seleção do Cliente */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-300/70 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    1. Cliente Proprietário do Veículo *
                  </label>

                  <div className="flex items-center gap-2">
                    {!clienteSelecionado && (
                      <button
                        type="button"
                        onClick={irParaCadastroNovoCliente}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 text-[11px] font-bold transition cursor-pointer"
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>Cadastrar Novo Cliente</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                    {clienteSelecionado && (
                      <button
                        type="button"
                        onClick={() => {
                          setClienteSelecionado(null);
                          setBuscaCliente("");
                        }}
                        className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                      >
                        Trocar Cliente
                      </button>
                    )}
                  </div>
                </div>

                {carregandoClientes ? (
                  <div className="text-xs text-slate-400 font-mono py-2">
                    Carregando base de clientes...
                  </div>
                ) : clienteSelecionado ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {clienteSelecionado.nome}
                        </span>
                        {clienteSelecionado.status === "aguardando_instalacao" ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30">
                            <Clock className="h-2.5 w-2.5" />
                            <span>Aguardando Instalação</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            <Check className="h-2.5 w-2.5" />
                            <span>Cliente Ativo</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {clienteSelecionado.documento && (
                          <span>Doc: {clienteSelecionado.documento}</span>
                        )}
                        {clienteSelecionado.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {clienteSelecionado.telefone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={buscaCliente}
                        onChange={(e) => setBuscaCliente(e.target.value)}
                        placeholder="Buscar cliente por nome, telefone ou CPF/CNPJ..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1 divide-y divide-slate-100 dark:divide-slate-800">
                      {carregandoClientes && clientes.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                          <span>Carregando clientes cadastrados...</span>
                        </div>
                      ) : clientesFiltrados.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          {buscaCliente.trim()
                            ? "Nenhum cliente localizado com os termos digitados."
                            : "Nenhum cliente cadastrado no sistema."}
                        </div>
                      ) : (
                        clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClienteSelecionado(c);
                              setBuscaCliente("");
                            }}
                            className="w-full text-left p-2.5 rounded-lg hover:bg-emerald-500/10 hover:border-emerald-500/30 transition flex items-center justify-between gap-2 group cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 truncate">
                                {c.nome}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {c.documento && `Doc: ${c.documento} · `}
                                {c.telefone && `Tel: ${c.telefone}`}
                              </div>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {c.status}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Seção 2: Dados do Veículo */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-300/70 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <Car className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  2. Dados do Veículo Instalado *
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Tipo de Veículo */}
                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      Tipo de Veículo *
                    </label>
                    <select
                      value={tipoVeiculo}
                      onChange={(e) => {
                        setTipoVeiculo(e.target.value);
                        if (
                          e.target.value === "maquina" ||
                          e.target.value === "trator" ||
                          e.target.value === "equipamento"
                        ) {
                          setIsSemPlaca(true);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-emerald-500"
                    >
                      {TIPOS_VEICULO.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Placa */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                        Placa do Veículo *
                      </label>
                      <label className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSemPlaca}
                          onChange={(e) => setIsSemPlaca(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-0"
                        />
                        <span>Máquina / Sem Placa</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      disabled={isSemPlaca}
                      value={isSemPlaca ? "SEMPLACA" : placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                      placeholder="Ex: ABC1D23"
                      maxLength={8}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-mono font-bold uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                    />
                  </div>

                  {/* Chassi */}
                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      Chassi (Opcional)
                    </label>
                    <input
                      type="text"
                      value={chassi}
                      onChange={(e) => setChassi(e.target.value.toUpperCase())}
                      placeholder="17 caracteres"
                      maxLength={17}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Marca */}
                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      Marca *
                    </label>
                    <input
                      type="text"
                      required
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      placeholder="Ex: Toyota, Honda, Volvo"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Modelo */}
                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      Modelo *
                    </label>
                    <input
                      type="text"
                      required
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      placeholder="Ex: Corolla, Civic, FH 540"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Ano e Cor */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                        Ano
                      </label>
                      <input
                        type="number"
                        value={ano}
                        onChange={(e) => setAno(e.target.value)}
                        placeholder="Ex: 2024"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                        Cor
                      </label>
                      <input
                        type="text"
                        value={cor}
                        onChange={(e) => setCor(e.target.value)}
                        placeholder="Ex: Branco"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Odômetro Inicial / KM */}
                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                      Odômetro Inicial (KM)
                    </label>
                    <input
                      type="number"
                      value={kmInstalacao}
                      onChange={(e) => setKmInstalacao(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Bloqueador / Relé de Corte */}
                  <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        Bloqueador / Relé de Corte Instalado?
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Indica se há relé de corte seguro conectado ao chicote do J16.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBloqueadorInstalado(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          bloqueadorInstalado
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        Com Bloqueador
                      </button>
                      <button
                        type="button"
                        onClick={() => setBloqueadorInstalado(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          !bloqueadorInstalado
                            ? "bg-slate-700 text-white shadow-xs"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        Sem Bloqueador
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 3: Rastreador Instalado (Dos Disponíveis em Estoque) */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-300/70 dark:border-slate-800 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      3. Rastreador Instalado (Dos Disponíveis em Estoque) *
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Selecione qual rastreador físico em estoque já foi instalado no veículo.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModoImeiManual(!modoImeiManual);
                        if (!modoImeiManual) setRastreadorSelecionado(null);
                      }}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                    >
                      {modoImeiManual ? "Ver Lista do Estoque" : "Digitar IMEI Manualmente"}
                    </button>
                    <button
                      type="button"
                      onClick={carregarRastreadores}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="Atualizar estoque"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {modoImeiManual ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                        IMEI do Rastreador *
                      </label>
                      <input
                        type="text"
                        required
                        value={imeiManual}
                        onChange={(e) => setImeiManual(e.target.value.trim())}
                        placeholder="Ex: 865893084742487"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                        Modelo do Rastreador
                      </label>
                      <input
                        type="text"
                        value={modeloManual}
                        onChange={(e) => setModeloManual(e.target.value)}
                        placeholder="Ex: J16 4G ou G900L"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          value={buscaRastreador}
                          onChange={(e) => setBuscaRastreador(e.target.value)}
                          placeholder="Buscar por IMEI, modelo ou linha M2M..."
                          className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {rastreadoresFiltrados.length} disponível(is)
                      </span>
                    </div>

                    {carregandoRastreadores ? (
                      <div className="text-xs text-slate-400 font-mono py-2">
                        Carregando rastreadores disponíveis no estoque...
                      </div>
                    ) : rastreadoresFiltrados.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
                        <div>Nenhum rastreador livre em estoque localizado no momento.</div>
                        <button
                          type="button"
                          onClick={() => setModoImeiManual(true)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                        >
                          Digitar IMEI Manualmente
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 overflow-hidden shadow-2xs">
                        {/* Cabeçalho da Listagem */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100/90 dark:bg-slate-800/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <div className="col-span-1 text-center">Sel.</div>
                          <div className="col-span-4 sm:col-span-3">IMEI</div>
                          <div className="col-span-3 sm:col-span-2">Modelo</div>
                          <div className="col-span-4 sm:col-span-4">Chip / Linha M2M</div>
                          <div className="hidden sm:block sm:col-span-2 text-right">Status</div>
                        </div>

                        {/* Linhas da Listagem */}
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                          {rastreadoresFiltrados.map((r) => {
                            const selecionado =
                              rastreadorSelecionado?.rastreador_id === r.rastreador_id ||
                              rastreadorSelecionado?.imei === r.imei;
                            return (
                              <button
                                key={r.rastreador_id || r.imei}
                                type="button"
                                onClick={() => setRastreadorSelecionado(r)}
                                className={`w-full grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-left transition cursor-pointer ${
                                  selecionado
                                    ? "bg-emerald-500/15 border-l-4 border-l-emerald-600 text-slate-900 dark:text-emerald-100"
                                    : "hover:bg-slate-100/80 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                                }`}
                              >
                                <div className="col-span-1 flex justify-center">
                                  {selecionado ? (
                                    <div className="h-4 w-4 rounded-full bg-emerald-600 dark:bg-emerald-500 flex items-center justify-center text-white shrink-0">
                                      <Check className="h-2.5 w-2.5" />
                                    </div>
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                                  )}
                                </div>

                                <div className="col-span-4 sm:col-span-3 font-mono font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                  {r.imei}
                                </div>

                                <div className="col-span-3 sm:col-span-2 text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate">
                                  {r.modelo || "G900L"}
                                </div>

                                <div className="col-span-4 sm:col-span-4 text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                                  {r.linha ? (
                                    <span>
                                      {r.operadora || "Algar"} · {r.linha}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Sem chip</span>
                                  )}
                                </div>

                                <div className="hidden sm:block sm:col-span-2 text-right">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                      selecionado
                                        ? "bg-emerald-600 text-white"
                                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    }`}
                                  >
                                    {selecionado ? "Selecionado" : "Disponível"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold block mb-1">
                  Observações da Instalação Direta (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: Veículo instalado anteriormente em oficina própria. Telemetria e sinal validados."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Rodapé com Botões de Ação */}
            <div className="p-4 sm:p-5 border-t border-slate-300/70 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md active:scale-98 transition disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>
                  {salvando ? "Ativando Veículo..." : "Concluir Instalação Direta e Ativar Veículo"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
