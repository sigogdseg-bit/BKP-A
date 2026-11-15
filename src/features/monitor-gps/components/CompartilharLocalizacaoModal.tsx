import { useState, useEffect, useCallback } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  Clock,
  Trash2,
  QrCode,
  ExternalLink,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Route as RouteIcon,
  ChevronDown,
  ChevronUp,
  Globe,
  MapPin,
  History,
  Navigation,
} from "lucide-react";
import QRCode from "qrcode";
import type { VeiculoGps } from "../types";
import {
  criarCompartilhamentoTemporario,
  carregarCompartilhamentosAtivos,
  carregarTodosCompartilhamentos,
  carregarAcessosCompartilhamento,
  revogarCompartilhamento,
  alternarModoStealth,
  type CompartilhamentoTemporario,
  type CompartilhamentoAcesso,
} from "../services/compartilhamentoService";
import { TrajetoVisualizadoModal } from "./TrajetoVisualizadoModal";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { toast } from "sonner";

interface CompartilharLocalizacaoModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
}

export function CompartilharLocalizacaoModal({
  veiculo,
  onFechar,
}: CompartilharLocalizacaoModalProps) {
  const [duracaoHoras, setDuracaoHoras] = useState<number | null>(2);
  const [gerando, setGerando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [compartilhamentos, setCompartilhamentos] = useState<CompartilhamentoTemporario[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);

  // Estados de auditoria de acessos e visualização do trajeto
  const [filtroTipo, setFiltroTipo] = useState<"ativos" | "todos">("ativos");
  const [acessosPorLink, setAcessosPorLink] = useState<Record<string, CompartilhamentoAcesso[]>>(
    {},
  );
  const [carregandoAcessos, setCarregandoAcessos] = useState<Record<string, boolean>>({});
  const [linksExpandidos, setLinksExpandidos] = useState<Record<string, boolean>>({});
  const [acessoParaTrajeto, setAcessoParaTrajeto] = useState<CompartilhamentoAcesso | null>(null);

  const formatarDuracao = (segundos: number) => {
    if (!segundos || segundos <= 0) return "Menos de 1 min";
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const carregarAcessosDoLink = useCallback(async (compId: string, token: string) => {
    setCarregandoAcessos((prev) => ({ ...prev, [compId]: true }));
    try {
      const res = await carregarAcessosCompartilhamento(compId, token);
      setAcessosPorLink((prev) => ({ ...prev, [compId]: res }));
    } catch {
      setAcessosPorLink((prev) => ({ ...prev, [compId]: [] }));
    } finally {
      setCarregandoAcessos((prev) => ({ ...prev, [compId]: false }));
    }
  }, []);

  const handleToggleExpandir = (compId: string, token: string) => {
    setLinksExpandidos((prev) => {
      const novo = !prev[compId];
      if (novo) {
        carregarAcessosDoLink(compId, token);
      }
      return { ...prev, [compId]: novo };
    });
  };

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const res =
        filtroTipo === "todos"
          ? await carregarTodosCompartilhamentos(veiculo.id)
          : await carregarCompartilhamentosAtivos(veiculo.id);
      setCompartilhamentos(res);

      // Carrega acessos dos links em segundo plano para badges informativas
      for (const item of res) {
        carregarAcessosCompartilhamento(item.id, item.token).then((acessos) => {
          setAcessosPorLink((prev) => ({ ...prev, [item.id]: acessos }));
        });
      }
    } catch {
      setCompartilhamentos([]);
    } finally {
      setCarregandoLista(false);
    }
  }, [veiculo.id, filtroTipo]);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const handleGerarLink = async () => {
    setGerando(true);
    try {
      const res = await criarCompartilhamentoTemporario({
        veiculoId: veiculo.id,
        clienteId: veiculo.cliente_id,
        duracaoHoras,
        semExpiracao: duracaoHoras === null,
      });

      if (res.sucesso && res.link) {
        setLinkGerado(res.link);
        const qr = await QRCode.toDataURL(res.link, { width: 200, margin: 1 });
        setQrCodeDataUrl(qr);
        toast.success(
          duracaoHoras === null
            ? "Link de compartilhamento sem tempo limite gerado!"
            : `Link de compartilhamento válido por ${duracaoHoras}h gerado!`,
        );
        carregarLista();
      } else {
        toast.error(res.mensagem || "Erro ao gerar link de compartilhamento.");
      }
    } catch {
      toast.error("Falha ao criar link de compartilhamento.");
    } finally {
      setGerando(false);
    }
  };

  const handleCopiar = () => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado);
    setCopiado(true);
    toast.success("Link copiado para a área de transferência!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const [alternandoStealthToken, setAlternandoStealthToken] = useState<string | null>(null);

  const handleAlternarStealth = async (token: string, atualAtivo: boolean) => {
    setAlternandoStealthToken(token);
    try {
      const res = await alternarModoStealth(token, !atualAtivo);
      if (res.sucesso) {
        toast.success(
          !atualAtivo
            ? "Modo Stealth ativado: posição deste link congelada com sucesso!"
            : "Modo Stealth desativado: este link voltou a transmitir em tempo real.",
        );
        carregarLista();
      } else {
        toast.error(res.mensagem || "Falha ao alternar Modo Stealth.");
      }
    } catch {
      toast.error("Erro ao comunicar com o servidor.");
    } finally {
      setAlternandoStealthToken(null);
    }
  };

  const handleRevogar = async (token: string) => {
    if (window.confirm("Deseja revogar este link imediatamente? O acesso será bloqueado.")) {
      const ok = await revogarCompartilhamento(token);
      if (ok) {
        toast.success("Compartilhamento revogado com sucesso!");
        if (linkGerado?.includes(token)) {
          setLinkGerado(null);
          setQrCodeDataUrl(null);
        }
        carregarLista();
      } else {
        toast.error("Erro ao revogar compartilhamento.");
      }
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 pb-safe">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Compartilhar Localização
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acesso temporário e revogável somente para visualização
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* Alerta de Segurança e Privacidade */}
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                O link gerado permite **apenas visualizar** a posição ao vivo deste veículo. Não
                permite acesso à conta, bloqueio ou dados pessoais.
              </div>
            </div>

            {/* Gerador de Link */}
            <div className="space-y-3">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                Tempo de Validade do Link
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { valor: 1, rotulo: "1h" },
                  { valor: 2, rotulo: "2h" },
                  { valor: 4, rotulo: "4h" },
                  { valor: 8, rotulo: "8h" },
                  { valor: 24, rotulo: "24h" },
                  { valor: null, rotulo: "Manual" },
                ].map((item) => (
                  <button
                    key={item.rotulo}
                    type="button"
                    onClick={() => setDuracaoHoras(item.valor)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition text-center ${
                      duracaoHoras === item.valor
                        ? "bg-orange-500 text-slate-950 font-black shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {item.rotulo}
                  </button>
                ))}
              </div>

              <button
                onClick={handleGerarLink}
                disabled={gerando}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {gerando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                <span>
                  {gerando
                    ? "Gerando Link Seguro..."
                    : duracaoHoras === null
                      ? "Gerar Link sem Tempo Limite (Manual)"
                      : `Gerar Link Válido por ${duracaoHoras}h`}
                </span>
              </button>
            </div>

            {/* Exibição do Link Gerado e QR Code */}
            {linkGerado && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in zoom-in-95">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Link Pronto para Envio
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={linkGerado}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
                  />
                  <button
                    onClick={handleCopiar}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-orange-500 hover:text-slate-950 transition flex items-center gap-1.5 shrink-0"
                  >
                    {copiado ? (
                      <Check className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>{copiado ? "Copiado!" : "Copiar"}</span>
                  </button>
                </div>

                {qrCodeDataUrl && (
                  <div className="flex flex-col items-center justify-center pt-2">
                    <div className="p-2 bg-white rounded-2xl shadow-xs">
                      <img src={qrCodeDataUrl} alt="QR Code" className="w-36 h-36" />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      Escaneie para abrir no celular
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Seletor de Links Ativos / Todos os Links */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Links Emitidos</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-800 font-mono">
                    {compartilhamentos.length}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setFiltroTipo("ativos")}
                    className={`px-2 py-0.5 rounded-md font-bold transition ${
                      filtroTipo === "ativos"
                        ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    Ativos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroTipo("todos")}
                    className={`px-2 py-0.5 rounded-md font-bold transition ${
                      filtroTipo === "todos"
                        ? "bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    Todos
                  </button>
                </div>
              </div>

              {carregandoLista ? (
                <div className="text-center py-4 text-slate-400 text-xs">Carregando links...</div>
              ) : compartilhamentos.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-xs">
                  {filtroTipo === "ativos"
                    ? "Nenhum link ativo no momento."
                    : "Nenhum link emitido até o momento."}
                </div>
              ) : (
                <div className="space-y-3">
                  {compartilhamentos.map((c) => {
                    const isStealth = !!c.stealth_ativo;
                    const isCarregandoStealth = alternandoStealthToken === c.token;
                    const fullLink = `${typeof window !== "undefined" ? window.location.origin : ""}/compartilhar/${c.token}`;
                    const acessos = acessosPorLink[c.id] || [];
                    const isExpandido = !!linksExpandidos[c.id];
                    const isCarregandoAcessos = !!carregandoAcessos[c.id];
                    const temAlguemOnline = acessos.some(
                      (a) =>
                        !a.finalizado_em &&
                        Date.now() - new Date(a.ultimo_ping_em).getTime() < 40000,
                    );
                    const isExpirado =
                      c.revogado || (c.expira_em && new Date(c.expira_em).getTime() < Date.now());

                    return (
                      <div
                        key={c.id}
                        className={`p-3 rounded-2xl border transition flex flex-col gap-2.5 ${
                          isStealth
                            ? "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30"
                            : isExpirado
                              ? "bg-slate-100/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 opacity-90"
                              : "bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                                ...{c.token.slice(-10)}
                              </span>
                              {isStealth && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  <EyeOff className="h-2.5 w-2.5" />
                                  Stealth Ativo
                                </span>
                              )}
                              {c.revogado ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                  Revogado
                                </span>
                              ) : c.expira_em && new Date(c.expira_em).getTime() < Date.now() ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500 border border-slate-500/20">
                                  Expirado
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {c.expira_em ? (
                                <span>
                                  Expira em: {new Date(c.expira_em).toLocaleString("pt-BR")}
                                </span>
                              ) : (
                                <span className="font-bold text-orange-600 dark:text-orange-400">
                                  Sem expiração (Encerramento manual)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(fullLink);
                                toast.success("Link copiado para a área de transferência!");
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition"
                              title="Copiar link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {!c.revogado && (
                              <button
                                type="button"
                                onClick={() => handleRevogar(c.token)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                                title="Revogar link agora"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Botão de Alternância do Modo Stealth */}
                        {!c.revogado && (
                          <button
                            type="button"
                            onClick={() => handleAlternarStealth(c.token, isStealth)}
                            disabled={isCarregandoStealth}
                            className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 border ${
                              isStealth
                                ? "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                : "bg-slate-200/70 dark:bg-slate-800/70 hover:bg-slate-300/80 dark:hover:bg-slate-700/80 border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                            title={
                              isStealth
                                ? "Posição congelada. Clique para desativar e voltar ao tempo real."
                                : "Clique para congelar a posição deste link no ponto atual."
                            }
                          >
                            {isCarregandoStealth ? (
                              <Loader2 className="h-3 w-3 animate-spin text-current" />
                            ) : isStealth ? (
                              <EyeOff className="h-3 w-3 text-amber-500" />
                            ) : (
                              <Eye className="h-3 w-3 text-slate-400" />
                            )}
                            <span>
                              {isCarregandoStealth
                                ? "Atualizando..."
                                : isStealth
                                  ? "Modo Stealth Ativo: Posição Congelada (Desativar)"
                                  : "Ativar Modo Stealth (Congelar Posição)"}
                            </span>
                          </button>
                        )}

                        {/* Seção de Acessos ao Link */}
                        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                          <button
                            type="button"
                            onClick={() => handleToggleExpandir(c.id, c.token)}
                            className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Eye className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                Acessos ao Link ({acessos.length})
                              </span>
                              {temAlguemOnline && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                                  Visualizando agora
                                </span>
                              )}
                            </div>

                            <div className="text-slate-400 shrink-0">
                              {isExpandido ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </div>
                          </button>

                          {/* Lista detalhada de acessos */}
                          {isExpandido && (
                            <div className="mt-2 space-y-2 pl-1 animate-in fade-in duration-150">
                              {isCarregandoAcessos ? (
                                <div className="text-center py-2 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Carregando acessos...</span>
                                </div>
                              ) : acessos.length === 0 ? (
                                <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 text-center text-[11px] text-slate-400">
                                  Nenhum acesso registrado até o momento para este link.
                                </div>
                              ) : (
                                acessos.map((acesso) => {
                                  const isAtivoAgora =
                                    !acesso.finalizado_em &&
                                    Date.now() - new Date(acesso.ultimo_ping_em).getTime() < 40000;

                                  return (
                                    <div
                                      key={acesso.id}
                                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/80 shadow-2xs space-y-2 text-xs"
                                    >
                                      {/* Cabeçalho do Acesso: IP, Data/Hora e Duração */}
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                          <Globe className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                            {acesso.ip}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[10px]">
                                          {isAtivoAgora ? (
                                            <span className="font-bold px-1.5 py-0.5 rounded-md bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1">
                                              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                                              Ao vivo ({formatarDuracao(acesso.duracao_segundos)})
                                            </span>
                                          ) : (
                                            <span className="text-slate-500 flex items-center gap-1 font-medium">
                                              <Clock className="h-3 w-3" />
                                              {formatarDuracao(acesso.duracao_segundos)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Horário de Início */}
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                        Iniciado em:{" "}
                                        {new Date(acesso.iniciado_em).toLocaleString("pt-BR")}
                                      </div>

                                      {/* Local de Início e Término */}
                                      <div className="space-y-1 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                        <div className="flex items-start gap-1.5">
                                          <span className="h-3.5 w-3.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                                            A
                                          </span>
                                          <div className="min-w-0">
                                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                              Início do veículo:{" "}
                                            </span>
                                            <span className="text-slate-600 dark:text-slate-400">
                                              {acesso.inicio_endereco ||
                                                (acesso.inicio_latitude
                                                  ? `Lat: ${acesso.inicio_latitude?.toFixed(4)}, Lng: ${acesso.inicio_longitude?.toFixed(4)}`
                                                  : "Sem leitura")}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-start gap-1.5">
                                          <span className="h-3.5 w-3.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                                            B
                                          </span>
                                          <div className="min-w-0">
                                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                              Término do veículo:{" "}
                                            </span>
                                            <span className="text-slate-600 dark:text-slate-400">
                                              {acesso.fim_endereco ||
                                                (acesso.fim_latitude
                                                  ? `Lat: ${acesso.fim_latitude?.toFixed(4)}, Lng: ${acesso.fim_longitude?.toFixed(4)}`
                                                  : "Sem leitura")}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Auditoria de Modo Stealth no Acesso */}
                                      {acesso.stealth_observado ? (
                                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-[11px] space-y-0.5 animate-in fade-in">
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="font-bold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                                              <EyeOff className="h-3 w-3 text-amber-500 shrink-0" />
                                              Modo Stealth Ativado neste Acesso
                                            </span>
                                            {acesso.stealth_duracao_segundos ? (
                                              <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                                {formatarDuracao(acesso.stealth_duracao_segundos)}{" "}
                                                congelado
                                              </span>
                                            ) : null}
                                          </div>
                                          <div className="text-[10px] text-slate-600 dark:text-slate-400 pl-4.5">
                                            {acesso.stealth_inicio_em && acesso.stealth_fim_em ? (
                                              <span>
                                                Período: das{" "}
                                                <strong className="text-amber-700 dark:text-amber-300 font-mono">
                                                  {new Date(
                                                    acesso.stealth_inicio_em,
                                                  ).toLocaleTimeString("pt-BR", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                  })}
                                                </strong>{" "}
                                                às{" "}
                                                <strong className="text-amber-700 dark:text-amber-300 font-mono">
                                                  {new Date(
                                                    acesso.stealth_fim_em,
                                                  ).toLocaleTimeString("pt-BR", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                  })}
                                                </strong>
                                              </span>
                                            ) : (
                                              <span>
                                                Posição congelada taticamente durante a
                                                visualização.
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-[10px] text-slate-400 flex items-center gap-1 px-1">
                                          <Eye className="h-2.5 w-2.5" />
                                          <span>Modo Stealth: Não utilizado neste acesso</span>
                                        </div>
                                      )}

                                      {/* Botão de Ver Trajeto Visualizado */}
                                      <button
                                        type="button"
                                        onClick={() => setAcessoParaTrajeto(acesso)}
                                        className="w-full mt-1 py-1.5 px-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold text-[11px] transition flex items-center justify-center gap-1.5"
                                        title="Abrir mapa do trajeto que a pessoa viu o veículo percorrer"
                                      >
                                        <RouteIcon className="h-3.5 w-3.5" />
                                        <span>Ver Trajeto Percorrido neste Acesso</span>
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Exibição do Trajeto Percorrido durante o Acesso */}
      {acessoParaTrajeto && (
        <TrajetoVisualizadoModal
          acesso={acessoParaTrajeto}
          placa={veiculo.placa}
          marcaModelo={veiculo.marca_modelo}
          onFechar={() => setAcessoParaTrajeto(null)}
        />
      )}
    </ModalPortal>
  );
}
