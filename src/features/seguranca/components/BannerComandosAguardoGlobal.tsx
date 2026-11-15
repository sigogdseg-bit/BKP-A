import { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle2,
  X,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Minimize2,
  Maximize2,
  Settings,
  Radio,
  Zap,
  Terminal,
  Bell,
  MessageSquare,
  PhoneCall,
  Check,
  Smartphone,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  obterComandosEmAguardo,
  inscreverAtualizacaoComandos,
  removerComandoEmAguardo,
  limparComandosConcluidos,
  limparTodosComandosEmAguardo,
  reenviarComandoParaImei,
  reiniciarEForcarComandoEmAguardo,
  obterAlertaMinimizado,
  salvarAlertaMinimizado,
  obterSomMudo,
  salvarSomMudo,
  obterCanaisAlerta,
  salvarCanaisAlerta,
  inscreverAtualizacaoCanais,
  type ComandoEmAguardoItem,
  type CanaisAlertaComandoAguardo,
} from "../services/comandosEmAguardoService";
import { ModalConfiguracaoCanaisAlerta } from "./ModalConfiguracaoCanaisAlerta";

export function BannerComandosAguardoGlobal() {
  const [comandos, setComandos] = useState<ComandoEmAguardoItem[]>([]);
  const [minimizado, setMinimizado] = useState<boolean>(() => obterAlertaMinimizado());
  const [somMudo, setSomMudo] = useState<boolean>(() => obterSomMudo());
  const [expandido, setExpandido] = useState<boolean>(true);
  const [abaFocoVeiculo, setAbaFocoVeiculo] = useState<string>("todos");
  const [modalCanaisAberto, setModalCanaisAberto] = useState(false);
  const [canaisAlerta, setCanaisAlerta] = useState<CanaisAlertaComandoAguardo>(() =>
    obterCanaisAlerta(),
  );
  const [telefoneDestino, setTelefoneDestino] = useState<string>(() => {
    return obterCanaisAlerta().telefoneDestino || "";
  });

  useEffect(() => {
    const unsubComandos = inscreverAtualizacaoComandos((novos) => {
      setComandos(novos);
    });
    const unsubCanais = inscreverAtualizacaoCanais((novos) => {
      setCanaisAlerta(novos);
      setTelefoneDestino(novos.telefoneDestino || "");
    });
    return () => {
      unsubComandos();
      unsubCanais();
    };
  }, []);

  const alternarMinimizado = (novoMinimizado: boolean) => {
    setMinimizado(novoMinimizado);
    salvarAlertaMinimizado(novoMinimizado);
  };

  const alternarSomMudo = () => {
    const novoMudo = !somMudo;
    setSomMudo(novoMudo);
    salvarSomMudo(novoMudo);
  };

  const salvarPreferenciasCanais = (novos: CanaisAlertaComandoAguardo) => {
    setCanaisAlerta(novos);
    salvarCanaisAlerta(novos);
    toast.success("Preferências de alerta salvas com sucesso!");
  };

  if (comandos.length === 0 || typeof document === "undefined") {
    return null;
  }

  const pendentesAguardo = comandos.filter(
    (c) => c.status !== "concluido" && c.status !== "cancelado",
  );
  const concluidosAguardo = comandos.filter((c) => c.status === "concluido");
  const todosConcluidos = comandos.length > 0 && pendentesAguardo.length === 0;
  const emDespertar = pendentesAguardo.some(
    (c) => c.status === "transmitindo" || c.status === "aguardando_retorno",
  );

  const itensExibir =
    abaFocoVeiculo === "todos"
      ? comandos
      : comandos.filter((c) => c.id === abaFocoVeiculo || c.imei === abaFocoVeiculo);

  // ── ESTADO 1: BOTÃO FLUTUANTE COMPACTO (MINIMIZADO VISÍVEL EM TODAS AS TELAS) ──
  if (minimizado) {
    return (
      <ModalPortal>
        <div className="fixed top-20 right-4 z-[9999] pointer-events-auto animate-in slide-in-from-top-2 duration-200">
          <div
            onClick={() => alternarMinimizado(false)}
            className={`flex items-center gap-2 p-2 pr-3 rounded-2xl border-2 shadow-2xl backdrop-blur-md cursor-pointer transition-all hover:scale-105 active:scale-95 group select-none ${
              todosConcluidos
                ? "border-orange-500/90 bg-slate-950/95 text-white shadow-orange-500/20 ring-2 ring-orange-500/30"
                : emDespertar
                  ? "border-cyan-500/90 bg-slate-950/95 text-white shadow-cyan-500/20 ring-2 ring-cyan-500/30"
                  : "border-amber-500/90 bg-slate-950/95 text-white shadow-amber-500/20 ring-2 ring-amber-500/30"
            }`}
            title="Clique para expandir o painel militar de comandos em aguardo"
          >
            <div
              className={`p-1.5 rounded-xl ${
                todosConcluidos
                  ? "bg-orange-500/20 text-orange-400"
                  : emDespertar
                    ? "bg-cyan-500/20 text-cyan-400 animate-pulse"
                    : "bg-amber-500/20 text-amber-400 animate-pulse"
              }`}
            >
              {todosConcluidos ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : emDespertar ? (
                <Zap className="h-4 w-4 text-cyan-400" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </div>

            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-black uppercase text-white tracking-wider">
                  {todosConcluidos
                    ? comandos.length > 1
                      ? `${comandos.length} Concluídos!`
                      : "Concluído (0x15)!"
                    : emDespertar
                      ? "Despertando..."
                      : comandos.length > 1
                        ? `${comandos.length} Comandos`
                        : comandos[0].placa || "Comando J16"}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black uppercase ${
                    todosConcluidos
                      ? "bg-orange-500 text-slate-950"
                      : emDespertar
                        ? "bg-cyan-500 text-slate-950 font-black animate-pulse"
                        : "bg-amber-500 text-slate-950"
                  }`}
                >
                  {todosConcluidos ? "OK" : `PROBE ~${comandos[0].segundosAteProximoProbe ?? 15}s`}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 truncate max-w-[170px]">
                {todosConcluidos
                  ? "Hardware respondeu ao despertar"
                  : `Probe a cada 15s · Tentativa ${comandos[0].tentativasEnvio || 1}`}
              </span>
            </div>

            <div className="flex items-center gap-1 ml-1 text-slate-400 group-hover:text-white">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  alternarMinimizado(false);
                }}
                className="p-1 rounded-lg hover:bg-slate-800 transition"
                title="Expandir painel"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  limparTodosComandosEmAguardo();
                }}
                className="p-1 rounded-lg hover:bg-slate-800 transition text-slate-500 hover:text-white"
                title="Dispensar todos os alertas"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  // ── ESTADO 2: PAINEL MILITAR EXPANDIDO COMPLETO (MULTI-VEÍCULOS COM MINIMIZAR) ──
  return (
    <>
      <ModalPortal>
        <div
          className={`fixed top-20 right-4 z-[9999] ${
            comandos.length > 1 ? "max-w-lg" : "max-w-md"
          } w-[calc(100vw-2rem)] pointer-events-auto animate-in slide-in-from-top-4 duration-300`}
        >
          <div
            className={`rounded-2xl sm:rounded-3xl border-2 shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ${
              todosConcluidos
                ? "border-orange-500/90 bg-slate-950/95 text-white shadow-orange-500/20 ring-2 ring-orange-500/30"
                : emDespertar
                  ? "border-cyan-500/90 bg-slate-950/95 text-white shadow-cyan-500/20 ring-2 ring-cyan-500/30"
                  : "border-amber-500/90 bg-slate-950/95 text-white shadow-amber-500/20 ring-2 ring-amber-500/30"
            }`}
          >
            {/* Header do Alerta Militar Multi-Veículos */}
            <div
              className={`p-3.5 sm:p-4 flex items-center justify-between border-b ${
                todosConcluidos
                  ? "bg-emerald-950/60 border-emerald-800/80"
                  : emDespertar
                    ? "bg-cyan-950/60 border-cyan-800/80"
                    : "bg-amber-950/60 border-amber-800/80"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    todosConcluidos
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : emDespertar
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
                  }`}
                >
                  {todosConcluidos ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : emDespertar ? (
                    <Zap className="h-5 w-5 text-cyan-400" />
                  ) : (
                    <Clock className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono font-black tracking-wider uppercase text-white">
                      {comandos.length === 1
                        ? todosConcluidos
                          ? "Comando Concluído (0x15)"
                          : emDespertar
                            ? "Comando em Despertar (Disparo TCP)"
                            : "Comando em Aguardo de Despertar"
                        : todosConcluidos
                          ? `Comandos Concluídos (${comandos.length} Veículos)`
                          : emDespertar
                            ? `Despertando (${pendentesAguardo.length} Veículos)`
                            : `Comandos em Aguardo (${comandos.length} Veículos)`}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black uppercase ${
                        todosConcluidos
                          ? "bg-orange-500 text-slate-950"
                          : emDespertar
                            ? "bg-cyan-500 text-slate-950 font-black animate-pulse"
                            : "bg-amber-500 text-slate-950"
                      }`}
                    >
                      {todosConcluidos
                        ? "Concluído"
                        : emDespertar
                          ? "Disparando TCP"
                          : concluidosAguardo.length > 0
                            ? `${concluidosAguardo.length} OK · ${pendentesAguardo.length} Aguardando`
                            : `${comandos.length} em Aguardo`}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {todosConcluidos
                      ? "Hardware J16 respondeu com sucesso ao despertar"
                      : emDespertar
                        ? "⚡ Janela de repouso atingida · Transmitindo comando ao socket TCP"
                        : `${pendentesAguardo.length} veículo(s) em repouso · Spooler ativo`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={alternarSomMudo}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title={somMudo ? "Ativar som de aviso" : "Silenciar som de aviso"}
                >
                  {somMudo ? (
                    <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-orange-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setModalCanaisAberto(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Configurar canais de alerta (App, WhatsApp, Ligação)"
                >
                  <Settings className="h-3.5 w-3.5 text-amber-400" />
                </button>
                <button
                  type="button"
                  onClick={() => alternarMinimizado(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Minimizar para botão flutuante discreto em todas as telas"
                >
                  <Minimize2 className="h-3.5 w-3.5 text-orange-400" />
                </button>
                <button
                  type="button"
                  onClick={() => setExpandido((prev) => !prev)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title={expandido ? "Recolher alerta" : "Expandir alerta"}
                >
                  {expandido ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={limparTodosComandosEmAguardo}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Dispensar todos os alertas"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Conteúdo Expandido do Alerta Multi-Veículos */}
            {expandido && (
              <div className="p-3.5 sm:p-4 space-y-3 text-xs">
                {/* Se houver múltiplos veículos, exibe seletor em abas */}
                {comandos.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAbaFocoVeiculo("todos")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition shrink-0 cursor-pointer ${
                        abaFocoVeiculo === "todos"
                          ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                          : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      Ver Todos ({comandos.length})
                    </button>
                    {comandos.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setAbaFocoVeiculo(v.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition shrink-0 cursor-pointer flex items-center gap-1 border ${
                          abaFocoVeiculo === v.id
                            ? v.status === "concluido"
                              ? "bg-orange-500 text-slate-950 border-orange-400 font-black shadow-xs"
                              : "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                            : "bg-slate-900 text-slate-400 hover:text-white border-slate-800"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            v.status === "concluido"
                              ? "bg-orange-400"
                              : "bg-amber-400 animate-pulse"
                          }`}
                        />
                        <span>{v.placa || v.imei.slice(-6)}</span>
                        {v.status !== "concluido" && (
                          <span className="opacity-75 text-[9px]">
                            ~{Math.floor(v.segundosRestantes / 60)}m
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Cards de Acompanhamento Individual para Cada Veículo */}
                <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                  {itensExibir.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all ${
                        item.status === "concluido"
                          ? "bg-slate-900/95 border-orange-500/50 shadow-xs"
                          : "bg-slate-900/90 border-slate-800"
                      } space-y-2.5`}
                    >
                      {/* Cabeçalho do Card do Veículo */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`font-mono font-black text-sm tracking-wider ${
                              item.status === "concluido" ? "text-orange-400" : "text-amber-400"
                            }`}
                          >
                            {item.placa || "Sem Placa"}
                          </span>
                          <span className="text-[11px] text-slate-300 font-bold truncate">
                            {item.modelo || "Rastreador J16"}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-black uppercase ${
                              item.status === "concluido"
                                ? "bg-orange-500 text-slate-950"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {item.status === "concluido"
                              ? "Concluído"
                              : item.tentativasEnvio && item.tentativasEnvio > 1
                                ? `HBT ${item.hbtSegundos}s · Tentativa ${item.tentativasEnvio}`
                                : `HBT ${item.hbtSegundos}s`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono text-slate-400">
                            {item.horaDisparo}
                          </span>
                          <button
                            type="button"
                            onClick={() => removerComandoEmAguardo(item.id)}
                            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                            title="Dispensar este veículo"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Linha do Comando Transmitido */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">
                          Comando:
                        </span>
                        <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 truncate">
                          {item.comando}
                        </span>
                        {item.clienteNome && (
                          <span className="text-[10px] text-slate-400 truncate ml-auto">
                            {item.clienteNome}
                          </span>
                        )}
                      </div>

                      {/* Progresso ou Retorno da MCU */}
                      {item.status === "concluido" ? (
                        <div className="pt-2 border-t border-emerald-800/80 flex items-start gap-1.5 text-orange-300 font-mono text-[11px]">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-orange-400" />
                          <div className="min-w-0">
                            <div className="font-bold text-white">Retorno do Hardware:</div>
                            <div className="bg-slate-950 p-1.5 rounded border border-emerald-700/60 mt-0.5 break-all text-orange-300">
                              "{item.respostaHardware || "OK"}"
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-slate-400 flex items-center gap-1">
                              <Radio className="h-3 w-3 text-cyan-400 animate-pulse" />
                              <span>Probe Ativo (15s):</span>
                            </span>
                            <span className="font-black text-cyan-300">
                              ~{item.segundosAteProximoProbe ?? 15}s para envio ·{" "}
                              {item.tentativasEnvio || 1}ª tentativa
                            </span>
                          </div>

                          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                            <div
                              className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 animate-pulse"
                              style={{
                                width: `${Math.max(
                                  8,
                                  Math.min(
                                    100,
                                    ((15 - (item.segundosAteProximoProbe ?? 15)) / 15) * 100,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>

                          {item.mensagemStatus && (
                            <div className="text-[10px] text-cyan-300/90 font-mono bg-cyan-950/50 px-2 py-1 rounded-lg border border-cyan-800/50 flex items-center justify-between gap-1">
                              <span className="truncate">{item.mensagemStatus}</span>
                              {item.tentativasEnvio && item.tentativasEnvio > 1 && (
                                <span className="shrink-0 font-bold text-[9px] bg-cyan-500/20 px-1.5 py-0.5 rounded text-cyan-300 border border-cyan-500/30">
                                  {item.tentativasEnvio}ª tentativa
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[9px] text-slate-500">
                            <span>
                              Probe a cada 15s · Decorrido:{" "}
                              {Math.floor((item.segundosDecorridoTotal || 0) / 60) > 0
                                ? `${Math.floor((item.segundosDecorridoTotal || 0) / 60)}m `
                                : ""}
                              {(item.segundosDecorridoTotal || 0) % 60}s
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                reiniciarEForcarComandoEmAguardo(item.imei, item.comando, {
                                  placa: item.placa,
                                });
                              }}
                              className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                            >
                              <Zap className="h-2.5 w-2.5" />
                              <span>Forçar Envio Agora</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Botões de Ação do Rodapé Multi-Veículos */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-xs flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.location.href = "/configuracao/rastreador-j16";
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition shadow-xs text-xs flex items-center gap-1.5 active:scale-95 cursor-pointer border border-slate-700"
                  >
                    <Terminal className="h-3.5 w-3.5 text-orange-400" />
                    <span>Ver no Console</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {concluidosAguardo.length > 0 && (
                      <button
                        type="button"
                        onClick={limparComandosConcluidos}
                        className="px-3 py-1.5 rounded-xl bg-orange-600/30 hover:bg-orange-600/50 text-orange-300 border border-orange-500/40 font-bold transition shadow-xs text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                        title="Dispensar comandos já concluídos"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Limpar Concluídos ({concluidosAguardo.length})</span>
                      </button>
                    )}

                    {pendentesAguardo.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          pendentesAguardo.forEach((item) => {
                            reiniciarEForcarComandoEmAguardo(item.imei, item.comando, {
                              placa: item.placa,
                            });
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow-xs text-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        <span>Forçar Todos ({pendentesAguardo.length})</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={limparTodosComandosEmAguardo}
                        className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black transition shadow-xs text-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Dispensar Todos</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalPortal>

      {/* ── MODAL CANÔNICO DE CANAIS DE ALERTA DE COMANDOS EM AGUARDO ── */}
      <ModalConfiguracaoCanaisAlerta
        aberto={modalCanaisAberto}
        onClose={() => setModalCanaisAberto(false)}
        onSalvo={(novos) => setCanaisAlerta(novos)}
      />
    </>
  );
}
