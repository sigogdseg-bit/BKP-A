import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wrench,
  X,
  Plus,
  Car,
  Layers,
  Calendar,
  Clock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Package,
  MapPin,
  Building,
  Cpu,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { Vehicle3DGraphic } from "@/features/monitor-gps/components/Vehicle3DGraphic";
import { obterRotuloTipoVeiculo } from "@/features/monitor-gps/utils/vehicle3dIcons";
import {
  carregarVeiculosComInstalacaoDoCliente,
  carregarInstaladoresAtivos,
  cadastrarVeiculoParaCliente,
  salvarDistribuicaoInstalacoesCliente,
  ehVeiculoComInstalacaoConcluida,
  type VeiculoComInstalacao,
  type ItemDistribuicaoVeiculoInstalacao,
} from "../services/clienteService";
import {
  listarEquipamentosHabilitadosInstalacao,
  type EquipamentoHabilitado,
} from "@/features/estoque/services/rastreadorChipService";
import { toast } from "sonner";

interface ModalDistribuirInstalacoesVeiculosProps {
  clienteId: string;
  clienteNome: string;
  instaladorPadraoId?: string | null;
  aberto: boolean;
  onFechar: () => void;
  onSucesso: () => void;
}

export function ModalDistribuirInstalacoesVeiculos({
  clienteId,
  clienteNome,
  instaladorPadraoId,
  aberto,
  onFechar,
  onSucesso,
}: ModalDistribuirInstalacoesVeiculosProps) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [veiculos, setVeiculos] = useState<VeiculoComInstalacao[]>([]);
  const [instaladores, setInstaladores] = useState<
    { id: string; nome: string; endereco_instalacao?: string | null }[]
  >([]);
  const [kitsDisponiveis, setKitsDisponiveis] = useState<EquipamentoHabilitado[]>([]);

  // Mapa de configuração individual por veículo
  const [distribuicaoMap, setDistribuicaoMap] = useState<
    Record<string, ItemDistribuicaoVeiculoInstalacao>
  >({});

  // Atribuição em massa
  const [instaladorEmMassa, setInstaladorEmMassa] = useState<string>("");

  // Painel de adicionar veículo
  const [novoVeiculoAberto, setNovoVeiculoAberto] = useState(false);
  const [instaladorPreencheVeiculo, setInstaladorPreencheVeiculo] = useState(true);
  const [novoTipo, setNovoTipo] = useState("carro");
  const [novaPlaca, setNovaPlaca] = useState("");
  const [novoChassi, setNovoChassi] = useState("");
  const [novoSemPlaca, setNovoSemPlaca] = useState(false);
  const [novoMarcaModelo, setNovoMarcaModelo] = useState("");
  const [novoAno, setNovoAno] = useState<string>("");
  const [novoCor, setNovoCor] = useState("");
  const [salvandoNovoVeiculo, setSalvandoNovoVeiculo] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [veics, insts, kits] = await Promise.all([
        carregarVeiculosComInstalacaoDoCliente(clienteId),
        carregarInstaladoresAtivos(),
        listarEquipamentosHabilitadosInstalacao(),
      ]);

      setVeiculos(veics);
      setInstaladores(insts);

      // Garante que kits vinculados apenas aos veículos PENDENTES também estejam na lista (nunca expõe kit já instalado)
      const mapaKits = new Map<string, EquipamentoHabilitado>();
      kits.forEach((k) => mapaKits.set(k.rastreador_id, k));

      veics.forEach((v) => {
        if (!ehVeiculoComInstalacaoConcluida(v) && v.kit_id && !mapaKits.has(v.kit_id)) {
          mapaKits.set(v.kit_id, {
            rastreador_id: v.kit_id,
            imei: v.kit_imei || "CADASTRADO",
            modelo: v.kit_modelo || "J16 4G",
            chip_id: "",
            iccid: v.chip_iccid || "VINCULADO",
            operadora: v.chip_operadora || "Vivo",
            status: "estoque",
            liberado_instalacao: true,
            created_at: new Date().toISOString(),
          });
        }
      });

      const todosKits = Array.from(mapaKits.values());
      setKitsDisponiveis(todosKits);

      // Se todos os veículos atuais já possuem instalação concluída, abre automaticamente o formulário de novo veículo
      if (veics.length > 0 && veics.every((v) => ehVeiculoComInstalacaoConcluida(v))) {
        setNovoVeiculoAberto(true);
      }

      // Preenche o mapa de distribuição inicial
      const novoMap: Record<string, ItemDistribuicaoVeiculoInstalacao> = {};

      veics.forEach((v) => {
        const kitJaAtribuido = todosKits.find((k) => k.rastreador_id === v.kit_id);

        novoMap[v.id] = {
          instalacaoId: v.instalacao_id || null,
          veiculoId: v.id,
          instaladorId: v.instalador_id || "",
          kitId: v.kit_id || null,
          imei: v.kit_imei || kitJaAtribuido?.imei || null,
          modelo: v.kit_modelo || kitJaAtribuido?.modelo || "J16 4G",
          iccid: v.chip_iccid || kitJaAtribuido?.iccid || null,
          operadora: v.chip_operadora || kitJaAtribuido?.operadora || "Vivo",
          linha: v.chip_linha || kitJaAtribuido?.linha || null,
          releChicoteDoEstoque: Boolean(v.rele_chicote_do_estoque),
          dataAgendamento: v.data_agendamento || null,
          horaAgendamento: v.hora_agendamento || null,
          observacoes: v.observacoes || null,
        };
      });

      setDistribuicaoMap(novoMap);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar dados de veículos e estoque.");
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    if (aberto && clienteId) {
      carregarDados();
    }
  }, [aberto, clienteId, carregarDados]);

  const veiculosPendentes = useMemo(
    () => veiculos.filter((v) => !ehVeiculoComInstalacaoConcluida(v)),
    [veiculos],
  );
  const veiculosConcluidos = useMemo(
    () => veiculos.filter((v) => ehVeiculoComInstalacaoConcluida(v)),
    [veiculos],
  );

  // Aplicação do mesmo instalador em massa apenas para veículos novos ou pendentes de instalação
  const handleAplicarInstaladorTodos = () => {
    if (!instaladorEmMassa) {
      toast.error("Selecione um instalador ou a opção de desvincular.");
      return;
    }

    if (veiculosPendentes.length === 0) {
      toast.info(
        "Todos os veículos atuais já estão instalados. Adicione um novo veículo à frota primeiro.",
      );
      setNovoVeiculoAberto(true);
      return;
    }

    const novoId = instaladorEmMassa === "nenhum" ? "" : instaladorEmMassa;
    const idsPendentes = new Set(veiculosPendentes.map((v) => v.id));

    setDistribuicaoMap((prev) => {
      const atualizado: Record<string, ItemDistribuicaoVeiculoInstalacao> = { ...prev };
      Object.keys(prev).forEach((vId) => {
        if (idsPendentes.has(vId)) {
          atualizado[vId] = {
            ...prev[vId],
            instaladorId: novoId,
          };
        }
      });
      return atualizado;
    });

    if (instaladorEmMassa === "nenhum") {
      toast.success("Instalador desvinculado de todos os veículos pendentes!");
    } else {
      const instNome =
        instaladores.find((i) => i.id === instaladorEmMassa)?.nome || "Técnico selecionado";
      toast.success(`Instalador "${instNome}" aplicado aos veículos pendentes da frota!`);
    }
  };

  // Alteração de instalador por veículo
  const handleAlterarInstaladorVeiculo = (veiculoId: string, instId: string) => {
    setDistribuicaoMap((prev) => ({
      ...prev,
      [veiculoId]: {
        ...(prev[veiculoId] || { veiculoId, instaladorId: instId }),
        instaladorId: instId,
      },
    }));
  };

  // Alteração de Kit de rastreador por veículo
  const handleAlterarKitVeiculo = (veiculoId: string, kitIdSelecionado: string) => {
    if (!kitIdSelecionado) {
      setDistribuicaoMap((prev) => ({
        ...prev,
        [veiculoId]: {
          ...(prev[veiculoId] || { veiculoId, instaladorId: "" }),
          kitId: null,
          imei: null,
          modelo: null,
          iccid: null,
          operadora: null,
          linha: null,
        },
      }));
      return;
    }

    const kitObj = kitsDisponiveis.find((k) => k.rastreador_id === kitIdSelecionado);
    if (!kitObj) return;

    setDistribuicaoMap((prev) => ({
      ...prev,
      [veiculoId]: {
        ...(prev[veiculoId] || { veiculoId, instaladorId: "" }),
        kitId: kitObj.rastreador_id,
        imei: kitObj.imei,
        modelo: kitObj.modelo || "J16 4G",
        iccid: kitObj.iccid || null,
        operadora: kitObj.operadora || "Vivo",
        linha: kitObj.linha || null,
      },
    }));
  };

  // Alteração de data e hora de agendamento por veículo
  const handleAlterarDataHoraVeiculo = (
    veiculoId: string,
    campo: "dataAgendamento" | "horaAgendamento" | "observacoes",
    valor: string,
  ) => {
    setDistribuicaoMap((prev) => ({
      ...prev,
      [veiculoId]: {
        ...(prev[veiculoId] || { veiculoId, instaladorId: "" }),
        [campo]: valor || null,
      },
    }));
  };

  // Alteração de local de atendimento por veículo (Oficina do Instalador vs Local do Cliente)
  const handleAlterarLocalTipoVeiculo = (veiculoId: string, tipo: "oficina" | "local_veiculo") => {
    setDistribuicaoMap((prev) => ({
      ...prev,
      [veiculoId]: {
        ...(prev[veiculoId] || { veiculoId, instaladorId: "" }),
        localTipo: tipo,
        solicitaEnderecoCliente: tipo === "local_veiculo",
      },
    }));
  };

  // Alteração de fornecimento de relé e chicote (Instalador fornece vs Estoque Hunter)
  const handleAlterarReleChicoteEstoque = (veiculoId: string, doEstoque: boolean) => {
    setDistribuicaoMap((prev) => ({
      ...prev,
      [veiculoId]: {
        ...(prev[veiculoId] || { veiculoId, instaladorId: "" }),
        releChicoteDoEstoque: doEstoque,
      },
    }));
  };

  // Cadastro de novo veículo diretamente pelo modal
  const handleCadastrarNovoVeiculo = async (e: React.FormEvent) => {
    e.preventDefault();

    const isSemPlaca =
      novoTipo === "maquina" ||
      novoTipo === "trator" ||
      novoTipo === "equipamento" ||
      novoTipo === "moto_eletrica";

    const rawChassi = instaladorPreencheVeiculo ? "" : novoChassi.trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFinal = instaladorPreencheVeiculo
      ? isSemPlaca
        ? "SEMPLACA"
        : "A DEFINIR"
      : novoSemPlaca
        ? sufixoChassi || "SEMPLACA"
        : novaPlaca.trim().toUpperCase() || (isSemPlaca ? sufixoChassi || "SEMPLACA" : "A DEFINIR");

    const marcaModeloFinal = instaladorPreencheVeiculo
      ? undefined
      : novoMarcaModelo.trim() || undefined;

    setSalvandoNovoVeiculo(true);
    try {
      const res = await cadastrarVeiculoParaCliente(clienteId, {
        tipo_veiculo: novoTipo,
        placa: placaFinal,
        chassi: rawChassi || null,
        marca_modelo: marcaModeloFinal,
        ano: instaladorPreencheVeiculo ? null : novoAno ? Number(novoAno) : null,
        cor: instaladorPreencheVeiculo ? null : novoCor.trim() || null,
      });

      if (res.success) {
        toast.success(
          instaladorPreencheVeiculo
            ? "Tipo de veículo incluído na frota! Escolha o instalador e atribua o rastreador disponível abaixo."
            : res.message,
        );
        setNovoVeiculoAberto(false);
        setNovaPlaca("");
        setNovoChassi("");
        setNovoMarcaModelo("");
        setNovoAno("");
        setNovoCor("");
        setNovoSemPlaca(false);
        await carregarDados();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSalvandoNovoVeiculo(false);
    }
  };

  // Salvar a distribuição apenas para veículos novos/pendentes (nunca altera OS já concluída)
  const handleSalvarDistribuicao = async () => {
    if (veiculos.length === 0) {
      toast.error("Nenhum veículo disponível para distribuição.");
      return;
    }

    if (veiculosPendentes.length === 0) {
      toast.error(
        "Os veículos atuais já possuem instalação concluída e preservada. Clique em 'Adicionar Veículo à Frota' e inclua o novo veículo antes de gerar a OS.",
      );
      setNovoVeiculoAberto(true);
      return;
    }

    // Validação de unicidade estrita de kits: nenhum kit pode estar em dois veículos pendentes
    const kitsUsados = new Map<string, string>();
    for (const v of veiculosPendentes) {
      const kId = distribuicaoMap[v.id]?.kitId;
      if (kId) {
        if (kitsUsados.has(kId)) {
          const placaAnterior = kitsUsados.get(kId);
          toast.error(
            `Conflito: o mesmo kit em estoque não pode ser atribuído a dois veículos (${placaAnterior} e ${v.placa}). Escolha kits distintos.`,
          );
          return;
        }
        kitsUsados.set(kId, v.placa);
      }
    }

    setSalvando(true);
    try {
      const listaParaSalvar: ItemDistribuicaoVeiculoInstalacao[] = veiculosPendentes.map((v) => {
        const item = distribuicaoMap[v.id];
        return {
          instalacaoId: item?.instalacaoId || v.instalacao_id || null,
          veiculoId: v.id,
          instaladorId: item?.instaladorId || "",
          kitId: item?.kitId || null,
          imei: item?.imei || null,
          modelo: item?.modelo || null,
          iccid: item?.iccid || null,
          operadora: item?.operadora || null,
          linha: item?.linha || null,
          dataAgendamento: item?.dataAgendamento || null,
          horaAgendamento: item?.horaAgendamento || null,
          observacoes: item?.observacoes || null,
          localTipo: item?.localTipo || "oficina",
          solicitaEnderecoCliente: item?.localTipo === "local_veiculo",
          releChicoteDoEstoque: Boolean(item?.releChicoteDoEstoque),
        };
      });

      const res = await salvarDistribuicaoInstalacoesCliente(clienteId, listaParaSalvar);

      if (res.success) {
        toast.success(res.message);
        onSucesso();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao salvar distribuição.");
    } finally {
      setSalvando(false);
    }
  };

  // Contadores para o resumo (separa pendentes dos já instalados)
  const resumo = useMemo(() => {
    let comKit = 0;
    let semKit = 0;
    veiculosPendentes.forEach((v) => {
      const item = distribuicaoMap[v.id];
      if (item?.kitId && item?.imei) {
        comKit++;
      } else {
        semKit++;
      }
    });
    return {
      comKit,
      semKit,
      pendentes: veiculosPendentes.length,
      concluidos: veiculosConcluidos.length,
      total: veiculos.length,
    };
  }, [veiculos.length, veiculosPendentes, veiculosConcluidos.length, distribuicaoMap]);

  // Filtro de Kits disponíveis exclusivo por veículo (evita listagem duplicada)
  const obterKitsDisponiveisParaVeiculo = useCallback(
    (veiculoId: string, kitAtualDoVeiculo: string | null) => {
      // Coleta todos os kits selecionados por outros veículos desta tela
      const kitsEmUsoOutros = new Set(
        Object.entries(distribuicaoMap)
          .filter(([vId, item]) => vId !== veiculoId && Boolean(item.kitId))
          .map(([_, item]) => item.kitId as string),
      );

      // O veículo pode escolher kits livres ou o seu próprio kit atual
      return kitsDisponiveis.filter(
        (k) => k.rastreador_id === kitAtualDoVeiculo || !kitsEmUsoOutros.has(k.rastreador_id),
      );
    },
    [kitsDisponiveis, distribuicaoMap],
  );

  if (!aberto) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-hidden text-slate-800 dark:text-slate-100">
          {/* Cabeçalho Fixo Cockpit */}
          <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
                    Distribuição e Ordens de Serviço da Frota
                  </h2>
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 uppercase tracking-wider">
                    Gestão Integrada
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Cliente:{" "}
                  <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                    {clienteNome}
                  </strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="h-10 w-10 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Conteúdo com Rolagem */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
            {/* Cockpit de Indicadores da Frota */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-xs">
                <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0">
                  <Car className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider block">
                    Total na Frota
                  </span>
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                    {resumo.total} {resumo.total === 1 ? "veículo" : "veículos"}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/70 border border-orange-500/20 dark:border-orange-500/30 flex items-center gap-3 shadow-xs">
                <div className="h-9 w-9 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold uppercase tracking-wider block">
                    OSs Prontas (Com Kit)
                  </span>
                  <span className="text-lg font-black font-mono text-orange-700 dark:text-orange-400">
                    {resumo.comKit}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900/70 border border-amber-500/20 dark:border-amber-500/30 flex items-center gap-3 shadow-xs">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider block">
                    Aguardando Agendamento
                  </span>
                  <span className="text-lg font-black font-mono text-amber-700 dark:text-amber-400">
                    {resumo.semKit}
                  </span>
                </div>
              </div>
            </div>

            {/* Barra de Ações Rápidas no Topo */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Atribuição Rápida de Instalador a Todos */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                    <span>Aplicar instalador para todos:</span>
                  </span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select
                      value={instaladorEmMassa}
                      onChange={(e) => setInstaladorEmMassa(e.target.value)}
                      className="flex-1 min-w-0 max-w-md h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 truncate"
                    >
                      <option value="">Selecione o Instalador...</option>
                      <option value="nenhum">[ Sem instalador / Desvincular de todos ]</option>
                      {instaladores.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.nome}{" "}
                          {inst.endereco_instalacao ? `(${inst.endereco_instalacao})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAplicarInstaladorTodos}
                      className="h-10 px-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-md shadow-orange-600/20 shrink-0 flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-98"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Aplicar a Todos</span>
                    </button>
                  </div>
                </div>

                {/* Botão de Adicionar Novo Veículo */}
                <div className="shrink-0 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setNovoVeiculoAberto((prev) => !prev)}
                    className="w-full sm:w-auto h-10 px-3.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-500/30 text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer whitespace-nowrap active:scale-98"
                  >
                    <Plus className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span>
                      {novoVeiculoAberto ? "Fechar Formulário" : "Adicionar Veículo à Frota"}
                    </span>
                    {novoVeiculoAberto ? (
                      <ChevronUp className="h-3.5 w-3.5 text-orange-600" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-orange-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Formulário Compacto de Novo Veículo */}
              {novoVeiculoAberto && (
                <form
                  onSubmit={handleCadastrarNovoVeiculo}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-orange-500/30 space-y-3 animate-fadeIn"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700 dark:text-orange-400">
                      <Car className="h-4 w-4" />
                      <span>Cadastrar Novo Veículo para o Cliente</span>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer bg-orange-500/10 border border-orange-500/25 px-2.5 py-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={instaladorPreencheVeiculo}
                        onChange={(e) => setInstaladorPreencheVeiculo(e.target.checked)}
                        className="rounded border-orange-400 text-orange-600 focus:ring-orange-500"
                      />
                      <span>Instalador preencherá placa, marca e modelo no atendimento</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div className={instaladorPreencheVeiculo ? "sm:col-span-2" : ""}>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                        Tipo de Veículo *
                      </label>
                      <select
                        value={novoTipo}
                        onChange={(e) => setNovoTipo(e.target.value)}
                        className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                      >
                        <option value="carro">Carro de Passeio</option>
                        <option value="moto">Moto</option>
                        <option value="moto_eletrica">🛵 Moto Elétrica / E-Bike</option>
                        <option value="caminhao">Caminhão</option>
                        <option value="van">Van / Utilitário</option>
                        <option value="onibus">Ônibus</option>
                        <option value="maquina">Máquina Agrícola / Trator</option>
                        <option value="jetski">Jet Ski / Náutico</option>
                        <option value="quadriciculo">Quadriciclo</option>
                      </select>
                    </div>

                    {instaladorPreencheVeiculo ? (
                      <div className="sm:col-span-2 flex items-end justify-between gap-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          Placa e modelo ficarão como <strong>A DEFINIR</strong> para preenchimento
                          do instalador após você escolher o rastreador disponível abaixo.
                        </span>
                        <button
                          type="submit"
                          disabled={salvandoNovoVeiculo}
                          className="h-9 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{salvandoNovoVeiculo ? "Incluindo..." : "Incluir na Frota"}</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold">
                              Placa (Opcional)
                            </label>
                            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={novoSemPlaca}
                                onChange={(e) => setNovoSemPlaca(e.target.checked)}
                                className="rounded border-slate-300 text-orange-600"
                              />
                              <span>Sem Placa</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            disabled={novoSemPlaca}
                            placeholder={novoSemPlaca ? "SEMPLACA" : "A DEFINIR (ou ABC-1234)"}
                            value={novoSemPlaca ? "" : novaPlaca}
                            onChange={(e) => setNovaPlaca(e.target.value)}
                            className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono uppercase text-slate-800 dark:text-slate-100 disabled:opacity-50 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                            Chassi{" "}
                            {(novoTipo === "moto_eletrica" || novoTipo === "maquina") &&
                              "(6 dígitos p/ mapa)"}
                          </label>
                          <input
                            type="text"
                            maxLength={25}
                            placeholder="6 últimos dígitos p/ mapa"
                            value={novoChassi}
                            onChange={(e) => setNovoChassi(e.target.value.toUpperCase())}
                            className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono uppercase text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                            Marca e Modelo (Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Opcional — Instalador preenche se vazio"
                            value={novoMarcaModelo}
                            onChange={(e) => setNovoMarcaModelo(e.target.value)}
                            className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                            Ano
                          </label>
                          <input
                            type="number"
                            placeholder="Ex: 2024"
                            value={novoAno}
                            onChange={(e) => setNovoAno(e.target.value)}
                            className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-0.5">
                            Cor
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Prata"
                            value={novoCor}
                            onChange={(e) => setNovoCor(e.target.value)}
                            className="w-full h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        <div className="sm:col-span-2 flex items-end justify-end">
                          <button
                            type="submit"
                            disabled={salvandoNovoVeiculo}
                            className="w-full sm:w-auto h-9 px-4 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>
                              {salvandoNovoVeiculo ? "Cadastrando..." : "Incluir na Frota"}
                            </span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* Lista dos Veículos para Distribuição */}
            {carregando ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Carregando veículos e equipamentos em estoque...
              </div>
            ) : veiculos.length === 0 ? (
              <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <Car className="h-10 w-10 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Nenhum veículo cadastrado para este cliente
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Clique no botão acima "Adicionar Veículo à Frota" para cadastrar os veículos do
                  cliente.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...veiculosPendentes, ...veiculosConcluidos].map((v) => {
                  const jaConcluido = ehVeiculoComInstalacaoConcluida(v);
                  const item = distribuicaoMap[v.id] || {
                    veiculoId: v.id,
                    instaladorId: "",
                  };
                  const temKitAtribuido = Boolean(item.kitId && item.imei);

                  // Obtém os kits elegíveis estritamente para este veículo
                  const kitsParaEsteVeiculo = obterKitsDisponiveisParaVeiculo(v.id, item.kitId);

                  return (
                    <div
                      key={v.id}
                      className={`p-4 rounded-2xl border space-y-3 shadow-xs transition ${
                        jaConcluido
                          ? "bg-slate-50/90 dark:bg-slate-900/50 border-orange-500/25 opacity-90"
                          : "bg-white dark:bg-slate-900/90 border-slate-200/90 dark:border-slate-800 hover:border-orange-500/50 hover:shadow-md"
                      }`}
                    >
                      {/* Topo do Veículo (Cockpit) */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                          <Vehicle3DGraphic tipo={v.tipo_veiculo} size={32} />
                          <span className="px-2.5 py-1 rounded-lg font-mono font-black text-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs tracking-wider shrink-0">
                            {v.placa}
                          </span>
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {v.marca_modelo}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                            {obterRotuloTipoVeiculo(v.tipo_veiculo)}
                          </span>
                          {v.ano || v.cor ? (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                              ({[v.ano, v.cor].filter(Boolean).join(" • ")})
                            </span>
                          ) : null}
                        </div>

                        {/* Status da Ordem de Serviço / Agendamento */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {jaConcluido ? (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1.5 shadow-xs">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Instalação Concluída • Preservada</span>
                            </span>
                          ) : temKitAtribuido ? (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1.5 shadow-xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                              </span>
                              <CheckCircle2 className="h-3 w-3" />
                              <span>OS Pronta • Kit Atribuído</span>
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5 shadow-xs">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Aguardando Agendamento (Sem Kit)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {jaConcluido ? (
                        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-800 dark:text-orange-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span>
                            Veículo ativo em operação com instalação já concluída. Este registro
                            fica preservado e não receberá nova OS ao distribuir novos veículos.
                          </span>
                          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0 text-orange-700 dark:text-orange-300 font-bold">
                            {v.kit_imei || v.rastreador_imei ? (
                              <span>IMEI: {v.kit_imei || v.rastreador_imei}</span>
                            ) : null}
                            {v.instalador_nome ? <span>• {v.instalador_nome}</span> : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Configuração de Instalador e Kit de Rastreador */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {/* Seletor do Instalador Técnico Credenciado */}
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Wrench className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                                <span>Instalador Técnico Designado</span>
                              </label>
                              <select
                                value={item.instaladorId || ""}
                                onChange={(e) =>
                                  handleAlterarInstaladorVeiculo(v.id, e.target.value)
                                }
                                className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs cursor-pointer"
                              >
                                <option value="">[ Sem instalador / Não definir agora ]</option>
                                {instaladores.map((inst) => (
                                  <option key={inst.id} value={inst.id}>
                                    {inst.nome}{" "}
                                    {inst.endereco_instalacao
                                      ? `(${inst.endereco_instalacao})`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Seletor do Kit em Estoque (Rastreador + Chip) */}
                            <div className="space-y-1">
                              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <Radio className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                                  <span>Kit de Comodato em Estoque (Rastreador e Chip)</span>
                                </span>
                                {kitsParaEsteVeiculo.length > 0 && (
                                  <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                                    {kitsParaEsteVeiculo.length}{" "}
                                    {kitsParaEsteVeiculo.length === 1
                                      ? "disponível"
                                      : "disponíveis"}
                                  </span>
                                )}
                              </label>
                              <select
                                value={item.kitId || ""}
                                onChange={(e) => handleAlterarKitVeiculo(v.id, e.target.value)}
                                className={`w-full h-10 px-3 bg-slate-50 dark:bg-slate-950 border rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs cursor-pointer ${
                                  temKitAtribuido
                                    ? "border-orange-500/40 bg-orange-500/5"
                                    : "border-slate-300 dark:border-slate-700"
                                }`}
                              >
                                <option value="">
                                  [ Nenhum kit disponível / Não agendar agora ]
                                </option>
                                {kitsParaEsteVeiculo.map((k) => {
                                  const ehOKitDesteVeiculo = k.rastreador_id === v.kit_id;
                                  return (
                                    <option key={k.rastreador_id} value={k.rastreador_id}>
                                      IMEI: {k.imei} ({k.modelo}) • SIM: {k.iccid || "Sem chip"} (
                                      {k.operadora})
                                      {ehOKitDesteVeiculo
                                        ? " ★ [Kit já atribuído a este veículo]"
                                        : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>

                          {/* Seletor de Origem do Relé e Chicote (Bloqueador) */}
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Cpu className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Origem do Relé e Chicote (Bloqueador) *</span>
                              </label>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {item.releChicoteDoEstoque
                                  ? "Baixará 1 Relé e 1 Chicote do estoque do GD Rastreamento"
                                  : "Fornecido pelo instalador (não consome estoque do GD Rastreamento)"}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleAlterarReleChicoteEstoque(v.id, false)}
                                className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                                  !item.releChicoteDoEstoque
                                    ? "bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-400 font-bold shadow-xs"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <Wrench className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span>Instalador Fornece (Padrão)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAlterarReleChicoteEstoque(v.id, true)}
                                className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                                  item.releChicoteDoEstoque
                                    ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 font-bold shadow-xs"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span>Do Estoque GD Rastreamento (Fará Baixa)</span>
                              </button>
                            </div>
                          </div>

                          {/* Seletor do Local de Atendimento: Oficina do Instalador vs Local do Cliente */}
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                                <span>Local de Realização da Instalação *</span>
                              </label>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                {item.localTipo === "local_veiculo"
                                  ? "O cliente informará o endereço onde o veículo estará"
                                  : "Endereço cadastrado na oficina do instalador"}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleAlterarLocalTipoVeiculo(v.id, "oficina")}
                                className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                                  item.localTipo !== "local_veiculo"
                                    ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-400 font-bold shadow-xs"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <Building className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                                <span>Oficina do Instalador (Padrão)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAlterarLocalTipoVeiculo(v.id, "local_veiculo")}
                                className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                                  item.localTipo === "local_veiculo"
                                    ? "bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-400 font-bold shadow-xs"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <MapPin className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                <span>No Local do Cliente (A Domicílio)</span>
                              </button>
                            </div>
                          </div>

                          {/* Campos Adicionais: Data, Hora e Instruções */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                <span>Data do Agendamento (Opcional)</span>
                              </label>
                              <input
                                type="date"
                                value={item.dataAgendamento || ""}
                                onChange={(e) =>
                                  handleAlterarDataHoraVeiculo(
                                    v.id,
                                    "dataAgendamento",
                                    e.target.value,
                                  )
                                }
                                className="w-full h-9 px-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span>Horário (Opcional)</span>
                              </label>
                              <input
                                type="time"
                                value={item.horaAgendamento || ""}
                                onChange={(e) =>
                                  handleAlterarDataHoraVeiculo(
                                    v.id,
                                    "horaAgendamento",
                                    e.target.value,
                                  )
                                }
                                className="w-full h-9 px-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-semibold mb-1">
                                Instruções / Observações da OS
                              </label>
                              <input
                                type="text"
                                placeholder="Ex: Instalar sob o painel, testar pós-chave..."
                                value={item.observacoes || ""}
                                onChange={(e) =>
                                  handleAlterarDataHoraVeiculo(v.id, "observacoes", e.target.value)
                                }
                                className="w-full h-9 px-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé Fixo com Resumo e Ação de Gravação */}
          <div className="p-4 sm:p-5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            {/* Indicadores do Resumo */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                Frota:{" "}
                <strong className="text-slate-900 dark:text-slate-100 font-mono">
                  {resumo.total} {resumo.total === 1 ? "veículo" : "veículos"}
                </strong>
              </span>
              {resumo.concluidos > 0 && (
                <span className="px-2.5 py-1 rounded-md font-bold text-[11px] bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700">
                  {resumo.concluidos} Já Instalado(s)
                </span>
              )}
              <span className="px-2.5 py-1 rounded-md font-bold text-[11px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30">
                {resumo.comKit} com Kit (OS Pronta)
              </span>
              {resumo.semKit > 0 && (
                <span className="px-2.5 py-1 rounded-md font-bold text-[11px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  {resumo.semKit} Sem Kit
                </span>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="h-10 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvando || veiculosPendentes.length === 0}
                onClick={handleSalvarDistribuicao}
                className="h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-lg shadow-orange-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {salvando
                    ? "Gerando Ordens de Serviço..."
                    : "Salvar e Gerar Ordens de Serviço (OS)"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
