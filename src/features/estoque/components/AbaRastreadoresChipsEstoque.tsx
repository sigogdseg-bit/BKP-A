import { useState, useEffect, useMemo } from "react";
import {
  Cpu,
  Radio,
  ScanLine,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Link,
  Edit2,
  Check,
  RefreshCw,
  ExternalLink,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  listarTodosDispositivosEstoque,
  excluirRastreadorEstoque,
  excluirChipAvulsoEstoque,
  type DispositivoEstoqueCompleto,
  type ChipDisponivel,
  type TotaisDispositivosEstoque,
} from "../services/rastreadorChipService";
import { ModalSerialRastreadorChip } from "./ModalSerialRastreadorChip";
import { ModalCadastroChipAvulso } from "./ModalCadastroChipAvulso";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";

export function AbaRastreadoresChipsEstoque() {
  const [rastreadores, setRastreadores] = useState<DispositivoEstoqueCompleto[]>([]);
  const [chipsDisponiveis, setChipsDisponiveis] = useState<ChipDisponivel[]>([]);
  const [totais, setTotais] = useState<TotaisDispositivosEstoque>({
    total_rastreadores: 0,
    rastreadores_em_estoque: 0,
    total_chips: 0,
    chips_disponiveis: 0,
    liberados_para_instalacao: 0,
    pendentes_vinculo: 0,
  });
  const [carregando, setCarregando] = useState(true);

  // Filtros e busca
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "liberados" | "pendentes" | "em_uso" | "chips_livres"
  >("todos");

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalNovoChipAberto, setModalNovoChipAberto] = useState(false);
  const [dispositivoEdicao, setDispositivoEdicao] = useState<DispositivoEstoqueCompleto | null>(
    null,
  );
  const [scannerCameraAberto, setScannerCameraAberto] = useState(false);
  const [rastreadorParaExcluir, setRastreadorParaExcluir] =
    useState<DispositivoEstoqueCompleto | null>(null);
  const [chipParaExcluir, setChipParaExcluir] = useState<ChipDisponivel | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const handleConfirmarExclusaoChip = async () => {
    if (!chipParaExcluir) return;
    setExcluindo(true);
    try {
      const res = await excluirChipAvulsoEstoque(chipParaExcluir.id, chipParaExcluir.iccid);
      if (res.success) {
        toast.success(res.message);
        setChipParaExcluir(null);
        await carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir chip.");
    } finally {
      setExcluindo(false);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!rastreadorParaExcluir) return;
    setExcluindo(true);
    try {
      const res = await excluirRastreadorEstoque(
        rastreadorParaExcluir.id,
        rastreadorParaExcluir.imei,
      );
      if (res.success) {
        toast.success(res.message);
        setRastreadorParaExcluir(null);
        await carregarDados();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir equipamento.");
    } finally {
      setExcluindo(false);
    }
  };

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const res = await listarTodosDispositivosEstoque();
      setRastreadores(res.rastreadores);
      setChipsDisponiveis(res.chips_disponiveis);
      setTotais(res.totais);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Filtragem local
  const rastreadoresFiltrados = useMemo(() => {
    return rastreadores.filter((r) => {
      // Filtro por status
      if (filtroStatus === "liberados" && !r.liberado_instalacao) return false;
      if (filtroStatus === "pendentes" && (Boolean(r.chip_id) || r.status !== "estoque"))
        return false;
      if (filtroStatus === "em_uso" && r.status === "estoque" && !r.em_instalacao_ativa)
        return false;

      // Busca textual
      if (!busca.trim()) return true;
      const b = busca.trim().toLowerCase();
      const matchImei = r.imei.toLowerCase().includes(b);
      const matchIccid = (r.iccid || "").toLowerCase().includes(b);
      const matchModelo = (r.modelo || "").toLowerCase().includes(b);
      const matchOperadora = (r.operadora || "").toLowerCase().includes(b);
      return matchImei || matchIccid || matchModelo || matchOperadora;
    });
  }, [rastreadores, filtroStatus, busca]);

  // Filtragem local de chips livres
  const chipsLivresFiltrados = useMemo(() => {
    if (!busca.trim()) return chipsDisponiveis;
    const b = busca.trim().toLowerCase();
    return chipsDisponiveis.filter(
      (c) =>
        c.iccid.toLowerCase().includes(b) ||
        (c.operadora || "").toLowerCase().includes(b) ||
        (c.linha || "").toLowerCase().includes(b),
    );
  }, [chipsDisponiveis, busca]);

  return (
    <div className="space-y-4">
      {/* 1. Indicadores Superiores de Estoque de Seriais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Liberados para Instalação (Destaque Principal) */}
        <div
          onClick={() => setFiltroStatus(filtroStatus === "liberados" ? "todos" : "liberados")}
          className={`p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            filtroStatus === "liberados"
              ? "bg-emerald-500/15 border-emerald-500/40 ring-2 ring-emerald-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Liberados para Instalação
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {totais.liberados_para_instalacao}
            </span>
            <span className="text-[10px] font-bold text-slate-400">IMEI + ICCID prontos</span>
          </div>
        </div>

        {/* Pendentes de Vínculo */}
        <div
          onClick={() => setFiltroStatus(filtroStatus === "pendentes" ? "todos" : "pendentes")}
          className={`p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            filtroStatus === "pendentes"
              ? "bg-amber-500/15 border-amber-500/40 ring-2 ring-amber-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Sem Chip Vinculado
            </span>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {totais.pendentes_vinculo}
            </span>
            <span className="text-[10px] font-bold text-slate-400">Em estoque</span>
          </div>
        </div>

        {/* Chips Disponíveis Livres */}
        <div
          onClick={() =>
            setFiltroStatus(filtroStatus === "chips_livres" ? "todos" : "chips_livres")
          }
          className={`p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            filtroStatus === "chips_livres"
              ? "bg-sky-500/15 border-sky-500/40 ring-2 ring-sky-500/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-500/30"
          }`}
          title="Clique para ver os chips livres disponíveis no estoque"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Chips M2M Livres
            </span>
            <Radio className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400 font-mono">
              {totais.chips_disponiveis}
            </span>
            <span className="text-[10px] font-bold text-slate-400">de {totais.total_chips}</span>
          </div>
        </div>

        {/* Total Geral de Rastreadores */}
        <div
          onClick={() => setFiltroStatus("todos")}
          className={`p-4 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
            filtroStatus === "todos"
              ? "bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Total Rastreadores
            </span>
            <Cpu className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {totais.total_rastreadores}
            </span>
            <span className="text-[10px] font-bold text-slate-400">físicos</span>
          </div>
        </div>
      </div>

      {/* 2. Barra de Ações: Busca, Scanner de Câmera e Novo Equipamento */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por IMEI, ICCID do Chip, Modelo ou Operadora..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Câmera para Leitura Rápida de Código de Barras */}
          <button
            onClick={() => setScannerCameraAberto(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition border border-slate-200 dark:border-slate-700 shadow-xs"
            title="Apontar a câmera para o código de barras da caixa ou aparelho para localizar rapidamente"
          >
            <ScanLine className="h-4 w-4 text-amber-500" />
            <span className="hidden sm:inline">Ler Código</span>
          </button>

          {/* Botão para Cadastrar Novo Chip M2M Avulso */}
          <button
            onClick={() => setModalNovoChipAberto(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-sky-500/20 shrink-0"
            title="Cadastrar chip M2M avulso da operadora diretamente no estoque de chips livres"
          >
            <Radio className="h-4 w-4" />
            <span>+ Novo Chip M2M</span>
          </button>

          {/* Botão para Cadastrar Novo Rastreador e Vínculo */}
          <button
            onClick={() => {
              setDispositivoEdicao(null);
              setModalNovoAberto(true);
            }}
            className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-amber-500/20 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Cadastrar Serial / Kit</span>
          </button>
        </div>
      </div>

      {/* 3. Tabela de Equipamentos ou Chips Livres */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
        {filtroStatus === "chips_livres" ? (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Radio className="h-4 w-4 text-sky-500" />
                  <span>Chips M2M Livres em Estoque (Disponíveis para Instalação)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Estes chips não estão vinculados a nenhum rastreador e podem ser atribuídos a
                  novos equipamentos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalNovoChipAberto(true)}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Cadastrar Chip</span>
                </button>
                <button
                  onClick={() => setFiltroStatus("todos")}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
                >
                  Ver Rastreadores
                </button>
                <button
                  onClick={carregarDados}
                  disabled={carregando}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  title="Atualizar dados"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${carregando ? "animate-spin text-sky-500" : ""}`}
                  />
                </button>
              </div>
            </div>

            {carregando ? (
              <div className="text-center py-12 text-xs text-slate-500 font-mono">
                Carregando chips livres em estoque...
              </div>
            ) : chipsLivresFiltrados.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                <p>Nenhum chip livre disponível no momento.</p>
                <button
                  onClick={() => setModalNovoChipAberto(true)}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition"
                >
                  <Plus className="h-4 w-4" />
                  <span>Cadastrar Primeiro Chip</span>
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">Chip M2M (ICCID)</th>
                    <th className="py-2.5 px-3">Operadora</th>
                    <th className="py-2.5 px-3">Linha / Telefone</th>
                    <th className="py-2.5 px-3 text-center">Status no Estoque</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {chipsLivresFiltrados.map((chip) => (
                    <tr
                      key={chip.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Radio className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-sky-500/10 dark:bg-sky-950/40 px-2 py-0.5 rounded-lg border border-sky-500/20 text-sky-700 dark:text-sky-300">
                            {chip.iccid}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-semibold">
                        {chip.operadora || "Vivo"}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono">
                        {chip.linha || "—"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center justify-center gap-1 w-fit mx-auto">
                          <Check className="h-3 w-3" />
                          <span>Livre no Estoque</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setChipParaExcluir(chip)}
                          className="p-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center justify-center border border-rose-200/80 dark:border-rose-900/50 ml-auto"
                          title={`Excluir Chip ${chip.iccid}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-amber-500" />
                  <span>Rastreadores Físicos e Vínculo de Chips M2M</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Apenas os equipamentos com IMEI e ICCID vinculados aparecem habilitados para o
                  operador compor os kits de instalação.
                </p>
              </div>

              <button
                onClick={carregarDados}
                disabled={carregando}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Atualizar dados"
              >
                <RefreshCw
                  className={`h-4 w-4 ${carregando ? "animate-spin text-amber-500" : ""}`}
                />
              </button>
            </div>

            {carregando ? (
              <div className="text-center py-12 text-xs text-slate-500 font-mono">
                Carregando seriais de rastreadores e chips...
              </div>
            ) : rastreadoresFiltrados.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                Nenhum equipamento localizado com os filtros selecionados.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 px-3">IMEI do Rastreador</th>
                    <th className="py-2.5 px-3">Modelo</th>
                    <th className="py-2.5 px-3">Chip M2M (ICCID)</th>
                    <th className="py-2.5 px-3">Operadora</th>
                    <th className="py-2.5 px-3 text-center">Status Liberação</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                  {rastreadoresFiltrados.map((item) => {
                    const liberado = item.liberado_instalacao;
                    const emUso = item.status !== "estoque";

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition group"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              {item.imei}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-medium">
                          {item.modelo || "J16 4G"}
                        </td>

                        <td className="py-3 px-3">
                          {item.iccid ? (
                            <div className="font-mono text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1.5">
                              <Link className="h-3 w-3 text-sky-500 shrink-0" />
                              <span>{item.iccid}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              Pendente de Chip
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          {item.operadora ? (
                            <span className="font-semibold">{item.operadora}</span>
                          ) : (
                            "—"
                          )}
                          {item.linha && (
                            <span className="block text-[10px] font-mono text-slate-400">
                              {item.linha}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {emUso ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {item.status === "em_instalacao" ? "Em Instalação" : item.status}
                            </span>
                          ) : !item.chip_id ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 w-fit mx-auto block">
                              Falta Chip
                            </span>
                          ) : item.em_instalacao_ativa ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center justify-center gap-1 w-fit mx-auto">
                              <Check className="h-3 w-3" />
                              <span>Kit Agendado</span>
                            </span>
                          ) : liberado ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1 w-fit mx-auto">
                              <Check className="h-3 w-3" />
                              <span>Liberado para Instalação</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 w-fit mx-auto block">
                              Falta Chip
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setDispositivoEdicao(item);
                                setModalNovoAberto(true);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1"
                              title="Editar Serial e Vínculo de Chip"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Editar</span>
                            </button>

                            <button
                              onClick={() => setRastreadorParaExcluir(item)}
                              className="p-1 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center justify-center border border-rose-200/80 dark:border-rose-900/50"
                              title={`Excluir Rastreador ${item.imei}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal de Cadastro/Edição de Serial e Chip */}
      {modalNovoAberto && (
        <ModalSerialRastreadorChip
          open={modalNovoAberto}
          onClose={() => {
            setModalNovoAberto(false);
            setDispositivoEdicao(null);
          }}
          onSalvo={carregarDados}
          dispositivoEdicao={dispositivoEdicao}
          chipsDisponiveis={chipsDisponiveis}
        />
      )}

      {/* Leitor de Código de Barras por Câmera para Busca Instantânea */}
      {scannerCameraAberto && (
        <CameraBarcodeScannerModal
          open={scannerCameraAberto}
          onClose={() => setScannerCameraAberto(false)}
          titulo="Buscar Equipamento por Código de Barras"
          subtitulo="Aponte a câmera para o código de barras contendo o IMEI do rastreador."
          onScanSucesso={(codigo) => {
            setBusca(codigo);
            toast.success(`Filtro aplicado para o IMEI ${codigo}`);
          }}
        />
      )}

      {/* Modal Canônico de Confirmação de Exclusão de Dispositivo */}
      {rastreadorParaExcluir && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Cabeçalho */}
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Confirmar Exclusão de Dispositivo
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Esta ação removerá o cadastro do rastreador do sistema.
                  </p>
                </div>
              </div>

              {/* Corpo com Informações */}
              <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">IMEI:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {rastreadorParaExcluir.imei}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Modelo:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {rastreadorParaExcluir.modelo || "J16 4G"}
                    </span>
                  </div>
                  {rastreadorParaExcluir.iccid && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Chip Vinculado:</span>
                      <span className="font-mono text-sky-600 dark:text-sky-400 font-semibold">
                        {rastreadorParaExcluir.iccid}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    {rastreadorParaExcluir.iccid
                      ? "O chip M2M vinculado será automaticamente liberado de volta ao estoque de chips livres."
                      : "O dispositivo será removido do estoque."}
                  </p>
                </div>
              </div>

              {/* Rodapé de Ações */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/50">
                <button
                  type="button"
                  onClick={() => setRastreadorParaExcluir(null)}
                  disabled={excluindo}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusao}
                  disabled={excluindo}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{excluindo ? "Excluindo..." : "Excluir Definitivamente"}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {/* Modal de Cadastro de Chip M2M Avulso */}
      {modalNovoChipAberto && (
        <ModalCadastroChipAvulso
          open={modalNovoChipAberto}
          onClose={() => setModalNovoChipAberto(false)}
          onSalvo={carregarDados}
        />
      )}

      {/* Modal de Confirmação de Exclusão de Chip Avulso */}
      {chipParaExcluir && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabeçalho */}
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/20">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Excluir Chip do Estoque
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Confirmação de exclusão definitiva do chip M2M
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setChipParaExcluir(null)}
                  disabled={excluindo}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Informações */}
              <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">ICCID:</span>
                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                      {chipParaExcluir.iccid}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Operadora:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {chipParaExcluir.operadora || "Vivo"}
                    </span>
                  </div>
                  {chipParaExcluir.linha && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Linha / Telefone:</span>
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {chipParaExcluir.linha}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    O chip será removido definitivamente do estoque de chips livres.
                  </p>
                </div>
              </div>

              {/* Rodapé */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-950/50">
                <button
                  type="button"
                  onClick={() => setChipParaExcluir(null)}
                  disabled={excluindo}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusaoChip}
                  disabled={excluindo}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{excluindo ? "Excluindo..." : "Excluir Chip"}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
