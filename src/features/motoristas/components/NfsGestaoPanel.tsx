import React, { useState, useEffect, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  FileText,
  Download,
  Eye,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Search,
  RefreshCw,
  Fuel,
  Receipt,
  Car,
  User,
  Clock,
  X,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import {
  buscarTodasNfsCliente,
  downloadNF,
  excluirNFAposConfirmacao,
  registrarCienciaNF,
  gerarSignedUrl,
  type NfItemCompleto,
} from "../services/nfStorageService";

interface Props {
  clienteId?: string;
  onAtualizacao?: () => void;
}

export function NfsGestaoPanel({ clienteId, onAtualizacao }: Props) {
  const [itens, setItens] = useState<NfItemCompleto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "abastecimento" | "despesa">("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "pendentes" | "baixados" | "cientes">(
    "todos",
  );

  // Ações em andamento
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [baixandoLote, setBaixandoLote] = useState(false);

  // Modal de Preview de Imagem/PDF
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<NfItemCompleto | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await buscarTodasNfsCliente(clienteId);
      setItens(lista);
      if (onAtualizacao) onAtualizacao();
    } catch (err) {
      console.error("[NfsGestaoPanel] Erro ao carregar NFs:", err);
    } finally {
      setCarregando(false);
    }
  }, [clienteId, onAtualizacao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Download individual
  const handleDownload = async (item: NfItemCompleto) => {
    setAcaoId(item.id);
    try {
      await downloadNF(item.nf_foto_url, item.id, item.tipo);
      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                nf_baixado: true,
                nf_baixado_em: new Date().toISOString(),
                status: "baixado_pendente_exclusao",
              }
            : i,
        ),
      );
      if (onAtualizacao) onAtualizacao();
    } catch (err: any) {
      alert(`Erro no download: ${err.message}`);
    } finally {
      setAcaoId(null);
    }
  };

  // Download em Lote (de todas as pendentes)
  const handleBaixarTodasPendentes = async () => {
    const pendentes = itens.filter((i) => !i.nf_baixado && !i.nf_expirado);
    if (pendentes.length === 0) {
      alert("Não há comprovantes pendentes de download no momento.");
      return;
    }

    if (
      !confirm(
        `Deseja iniciar o download de ${pendentes.length} comprovante(s) pendente(s) sequencialmente?`,
      )
    ) {
      return;
    }

    setBaixandoLote(true);
    for (const item of pendentes) {
      try {
        await downloadNF(item.nf_foto_url, item.id, item.tipo);
        // Pequena pausa para o navegador disparar os downloads sem bloquear
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        console.error("Erro no download em lote:", e);
      }
    }
    setBaixandoLote(false);
    await carregar();
  };

  // Registrar ciência
  const handleCiencia = async (item: NfItemCompleto) => {
    setAcaoId(item.id);
    try {
      await registrarCienciaNF(item.id, item.tipo);
      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                nf_ciente_em: new Date().toISOString(),
                status: "aguardando_expiracao",
              }
            : i,
        ),
      );
      if (onAtualizacao) onAtualizacao();
    } catch (err: any) {
      alert(`Erro ao registrar ciência: ${err.message}`);
    } finally {
      setAcaoId(null);
    }
  };

  // Excluir comprovante do Storage
  const handleExcluir = async (item: NfItemCompleto) => {
    if (
      !confirm(
        `Confirma a exclusão definitiva do arquivo de comprovante da NF ${item.nf_numero || ""}? Esta ação removerá o arquivo do armazenamento com segurança.`,
      )
    ) {
      return;
    }

    setAcaoId(item.id);
    try {
      await excluirNFAposConfirmacao(item.nf_foto_url, item.id, item.tipo);
      setItens((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                nf_foto_url: "",
                nf_expirado: true,
                status: "expirado",
              }
            : i,
        ),
      );
      if (previewItem?.id === item.id) {
        setPreviewItem(null);
        setPreviewUrl(null);
      }
      if (onAtualizacao) onAtualizacao();
    } catch (err: any) {
      alert(`Erro ao excluir comprovante: ${err.message}`);
    } finally {
      setAcaoId(null);
    }
  };

  // Abrir preview
  const handleAbrirPreview = async (item: NfItemCompleto) => {
    setCarregandoPreview(true);
    setPreviewItem(item);
    try {
      const url = await gerarSignedUrl(item.nf_foto_url);
      setPreviewUrl(url);
    } catch (err: any) {
      alert(`Erro ao abrir visualização: ${err.message}`);
      setPreviewItem(null);
      setPreviewUrl(null);
    } finally {
      setCarregandoPreview(false);
    }
  };

  // Filtros aplicados
  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      // Filtro tipo
      if (filtroTipo !== "todos" && item.tipo !== filtroTipo) return false;

      // Filtro status
      if (filtroStatus === "pendentes" && (item.nf_baixado || item.nf_expirado)) return false;
      if (filtroStatus === "baixados" && (!item.nf_baixado || item.nf_expirado)) return false;
      if (filtroStatus === "cientes" && !item.nf_ciente_em) return false;

      // Filtro busca
      if (busca.trim()) {
        const q = busca.toLowerCase();
        const texto =
          `${item.motorista_nome} ${item.veiculo_placa} ${item.nf_numero || ""} ${item.detalhes || ""} ${item.observacoes || ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [itens, filtroTipo, filtroStatus, busca]);

  // Métricas
  const totalValor = useMemo(
    () => itens.reduce((acc, i) => acc + (Number(i.valor) || 0), 0),
    [itens],
  );
  const totalPendentes = useMemo(
    () => itens.filter((i) => !i.nf_baixado && !i.nf_expirado).length,
    [itens],
  );
  const totalBaixadas = useMemo(() => itens.filter((i) => i.nf_baixado).length, [itens]);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CARDS DE RESUMO OPERACIONAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Total de Comprovantes */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Total Inserido</span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">{itens.length}</div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Comprovantes e notas fiscais
          </p>
        </div>

        {/* Pendentes de Download */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Aguardando Download</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {totalPendentes}
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
            {totalPendentes > 0 ? "Ação recomendada" : "Tudo atualizado"}
          </p>
        </div>

        {/* Baixadas com Sucesso */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Baixados / Salvos</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {totalBaixadas}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Arquivos já descarregados</p>
        </div>

        {/* Valor Total dos Comprovantes */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Volume Financeiro</span>
            <Receipt className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white truncate">
            {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Total em abastecimentos e despesas
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BARRA DE FILTROS E AÇÕES EM LOTE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/70 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por motorista, placa, posto, NF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Filtro Tipo */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as any)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="todos">Todos os Tipos</option>
            <option value="abastecimento">Abastecimentos</option>
            <option value="despesa">Despesas</option>
          </select>

          {/* Filtro Status */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as any)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="todos">Todos os Status</option>
            <option value="pendentes">Apenas Pendentes de Download</option>
            <option value="baixados">Apenas Já Baixados</option>
            <option value="cientes">Com Ciência Registrada</option>
          </select>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBaixarTodasPendentes}
            disabled={baixandoLote || totalPendentes === 0}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition shadow-sm cursor-pointer"
            title="Baixar todos os comprovantes pendentes de uma vez"
          >
            <Download className={`h-3.5 w-3.5 ${baixandoLote ? "animate-bounce" : ""}`} />
            <span>{baixandoLote ? "Baixando..." : `Baixar Pendentes (${totalPendentes})`}</span>
          </button>

          <button
            onClick={carregar}
            disabled={carregando}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer shadow-2xs"
            title="Recarregar comprovantes"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* LISTAGEM DE COMPROVANTES E NOTAS FISCAIS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {carregando ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-3 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Carregando comprovantes enviados pelos motoristas...
          </p>
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-white/50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
          <Receipt className="h-10 w-10 text-slate-400 mb-2 opacity-50" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Nenhum comprovante encontrado
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-0.5">
            Quando os motoristas inserirem notas fiscais de abastecimento ou despesas pelo portal do
            motorista, elas aparecerão aqui para conferência e download.
          </p>
        </div>
      ) : (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Tipo / NF</th>
                  <th className="px-4 py-3">Motorista</th>
                  <th className="px-4 py-3">Veículo</th>
                  <th className="px-4 py-3">Data / Upload</th>
                  <th className="px-4 py-3">Detalhes</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                {itensFiltrados.map((item) => {
                  const dataRegFormatada = new Date(
                    item.data_registro + "T00:00:00",
                  ).toLocaleDateString("pt-BR");
                  const uploadHoraFormatada = item.nf_upload_em
                    ? new Date(item.nf_upload_em).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  const emProcessamento = acaoId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Tipo / NF */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              item.tipo === "abastecimento"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            }`}
                          >
                            {item.tipo === "abastecimento" ? (
                              <Fuel className="h-4 w-4" />
                            ) : (
                              <Receipt className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white capitalize block">
                              {item.tipo}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {item.nf_numero ? `NF: ${item.nf_numero}` : "Sem nº NF"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Motorista */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {item.motorista_nome}
                        </span>
                      </td>

                      {/* Veículo */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900 dark:text-white uppercase px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          {item.veiculo_placa}
                        </span>
                      </td>

                      {/* Data / Upload */}
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {dataRegFormatada}
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {uploadHoraFormatada}
                          </span>
                        </div>
                      </td>

                      {/* Detalhes */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <span
                          className="text-xs text-slate-600 dark:text-slate-300 block truncate"
                          title={item.detalhes}
                        >
                          {item.detalhes || "—"}
                        </span>
                        {item.observacoes && (
                          <span
                            className="text-[10px] text-slate-400 block truncate"
                            title={item.observacoes}
                          >
                            Obs: {item.observacoes}
                          </span>
                        )}
                      </td>

                      {/* Valor */}
                      <td className="px-4 py-3">
                        <span className="font-black text-slate-900 dark:text-white">
                          {Number(item.valor).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {item.nf_expirado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500 border border-slate-500/20">
                            Excluído / Expirado
                          </span>
                        ) : item.nf_baixado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="h-3 w-3" /> Baixado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="h-3 w-3" /> Pendente
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Visualizar Preview */}
                          {!item.nf_expirado && (
                            <button
                              onClick={() => handleAbrirPreview(item)}
                              disabled={emProcessamento}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                              title="Visualizar Comprovante"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Baixar Arquivo */}
                          {!item.nf_expirado && (
                            <button
                              onClick={() => handleDownload(item)}
                              disabled={emProcessamento}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                item.nf_baixado
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                              }`}
                              title={item.nf_baixado ? "Baixar novamente" : "Baixar comprovante"}
                            >
                              <Download
                                className={`h-3.5 w-3.5 ${emProcessamento ? "animate-spin" : ""}`}
                              />
                            </button>
                          )}

                          {/* Confirmar Ciência */}
                          {!item.nf_expirado && !item.nf_ciente_em && !item.nf_baixado && (
                            <button
                              onClick={() => handleCiencia(item)}
                              disabled={emProcessamento}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition cursor-pointer"
                              title="Confirmar ciência (inicia contagem de 24h para expiração)"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Excluir do Storage */}
                          {!item.nf_expirado && (
                            <button
                              onClick={() => handleExcluir(item)}
                              disabled={emProcessamento}
                              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                              title="Remover arquivo do armazenamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL DE PREVIEW / VISUALIZAÇÃO DE COMPROVANTE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {(previewItem || carregandoPreview) &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex justify-center items-center p-3 sm:p-6"
            onClick={() => {
              setPreviewItem(null);
              setPreviewUrl(null);
            }}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabeçalho do Modal */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                      {previewItem?.tipo === "abastecimento"
                        ? "Comprovante de Abastecimento"
                        : "Comprovante de Despesa"}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {previewItem?.motorista_nome} · Placa {previewItem?.veiculo_placa} ·{" "}
                      {previewItem?.valor.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {previewItem && (
                    <button
                      onClick={() => handleDownload(previewItem)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Baixar</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPreviewItem(null);
                      setPreviewUrl(null);
                    }}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Corpo da Visualização */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-center justify-center min-h-[300px] max-h-[calc(90vh-140px)] bg-slate-100/50 dark:bg-slate-950/50">
                {carregandoPreview ? (
                  <div className="flex flex-col items-center space-y-2 text-slate-400">
                    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-semibold">Carregando imagem do comprovante...</p>
                  </div>
                ) : previewUrl ? (
                  previewItem?.nf_foto_url?.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={previewUrl}
                      title="Comprovante PDF"
                      className="w-full h-[500px] rounded-xl border border-slate-300 dark:border-slate-700"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Comprovante da NF"
                      className="max-w-full max-h-[500px] object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800"
                    />
                  )
                ) : (
                  <p className="text-xs text-slate-400">
                    Não foi possível carregar a pré-visualização.
                  </p>
                )}
              </div>

              {/* Rodapé com Informações da NF */}
              <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                <span>
                  Enviado em:{" "}
                  {previewItem?.nf_upload_em
                    ? new Date(previewItem.nf_upload_em).toLocaleString("pt-BR")
                    : "—"}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {previewItem?.detalhes}
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
