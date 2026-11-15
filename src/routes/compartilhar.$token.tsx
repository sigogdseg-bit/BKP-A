import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  consultarVeiculoPorToken,
  registrarAcessoCompartilhamento,
  pingAcessoCompartilhamento,
  finalizarAcessoCompartilhamento,
  obterEnderecoPorCoordenadas,
  type VeiculoCompartilhadoPublico,
} from "@/features/monitor-gps/services/compartilhamentoService";
import { avaliarStatusComunicacao } from "@/features/monitor-gps/services/gpsService";
import { gerarMarcador3DHtml } from "@/features/monitor-gps/utils/vehicle3dIcons";
import {
  ControladorMovimentoSuave,
  coordenadaValidaMapa,
  criarChaveVisualMarcador,
  atualizarRotacaoElementoMarcador,
} from "@/features/monitor-gps/utils/interpolacaoMapaSuave";
import { Clock, AlertTriangle, Radio, ExternalLink } from "lucide-react";
import { APP_NOME } from "@/shared/lib/version";

export const Route = createFileRoute("/compartilhar/$token")({
  component: CompartilharVeiculoPage,
});

function CompartilharVeiculoPage() {
  const { token } = Route.useParams();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState<VeiculoCompartilhadoPublico | null>(null);
  const [expiraEm, setExpiraEm] = useState<string | null>(null);
  const [criadoEm, setCriadoEm] = useState<string | null>(null);
  const [tempoRestante, setTempoRestante] = useState<string>("");
  const [tempoAtivo, setTempoAtivo] = useState<string>("");

  const horaCarregamentoRef = useRef<number>(Date.now());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const visualKeyMarcadorRef = useRef<string>("");
  const controladorMovimentoRef = useRef<ControladorMovimentoSuave>(
    new ControladorMovimentoSuave(),
  );
  const seguindoCameraRef = useRef<boolean>(true);
  const userDraggingRef = useRef<boolean>(false);
  const ultimoPanFollowMsRef = useRef<number>(0);

  // Controle de auditoria da sessão de acesso deste espectador
  const acessoIdRef = useRef<string | null>(null);
  const acessoIniciadoRef = useRef<boolean>(false);
  const enderecoAtualRef = useRef<string>("");

  const carregarDados = useCallback(async () => {
    try {
      const res = await consultarVeiculoPorToken(token);
      if (res.sucesso && res.veiculo) {
        setVeiculo(res.veiculo);
        setExpiraEm(res.expira_em || null);
        if (res.created_at) {
          setCriadoEm(res.created_at);
        }
        setErro(null);

        // Geocodificação assíncrona para registrar ponto no acesso
        if (res.veiculo.latitude && res.veiculo.longitude) {
          obterEnderecoPorCoordenadas(res.veiculo.latitude, res.veiculo.longitude).then((end) => {
            enderecoAtualRef.current = end;
          });
        }

        // Se ainda não registrou o acesso para este espectador, registra agora
        if (!acessoIdRef.current) {
          let endInicio = "";
          if (res.veiculo.latitude && res.veiculo.longitude) {
            endInicio = await obterEnderecoPorCoordenadas(
              res.veiculo.latitude,
              res.veiculo.longitude,
            );
            enderecoAtualRef.current = endInicio;
          }
          const regRes = await registrarAcessoCompartilhamento({
            token,
            enderecoInicio: endInicio,
          });
          if (regRes.sucesso && regRes.acesso_id) {
            acessoIdRef.current = regRes.acesso_id;
            acessoIniciadoRef.current = true;
          }
        } else {
          // Envia ping periódico com a posição e endereço atuais
          pingAcessoCompartilhamento({
            acesso_id: acessoIdRef.current,
            token,
            enderecoAtual: enderecoAtualRef.current,
          });
        }
      } else {
        setErro(res.mensagem || "Link de compartilhamento inválido ou expirado.");
      }
    } catch {
      setErro("Falha ao carregar localização do veículo.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    carregarDados();
    // Atualização suave e heartbeat a cada 15 segundos enquanto a tela estiver aberta
    const timer = setInterval(carregarDados, 15000);

    // Finalização segura ao sair ou fechar a aba
    const handleSair = () => {
      if (acessoIdRef.current) {
        finalizarAcessoCompartilhamento({
          acesso_id: acessoIdRef.current,
          token,
          enderecoFim: enderecoAtualRef.current,
        });
      }
    };

    window.addEventListener("beforeunload", handleSair);
    window.addEventListener("pagehide", handleSair);

    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", handleSair);
      window.removeEventListener("pagehide", handleSair);
      handleSair();
    };
  }, [carregarDados, token]);

  // Contadores de tempo: Regressivo para links com prazo ou Progressivo para Encerramento Manual
  useEffect(() => {
    const atualizarContadores = () => {
      const agora = Date.now();

      // 1. Caso com validade estipulada -> Contador regressivo
      if (expiraEm) {
        const expira = new Date(expiraEm).getTime();
        const diff = expira - agora;

        if (diff <= 0) {
          setTempoRestante("Expirado");
          setErro("Este link de compartilhamento expirou.");
        } else {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setTempoRestante(`${h}h ${m}m ${s}s`);
        }
      }

      // 2. Encerramento manual -> Contador progressivo de quanto tempo o link está ativo
      if (!expiraEm) {
        const inicio = criadoEm ? new Date(criadoEm).getTime() : horaCarregamentoRef.current;
        const diff = Math.max(0, agora - inicio);
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        setTempoAtivo(`${h}h ${m}m ${s}s`);
      }
    };

    atualizarContadores();
    const t = setInterval(atualizarContadores, 1000);
    return () => clearInterval(t);
  }, [expiraEm, criadoEm]);

  // Coordenadas válidas de satélite
  const temCoordenadasValidas =
    veiculo !== null && coordenadaValidaMapa(veiculo.latitude, veiculo.longitude);

  const latPadrao = temCoordenadasValidas ? veiculo!.latitude! : -22.5235;
  const lngPadrao = temCoordenadasValidas ? veiculo!.longitude! : -44.1042;

  useEffect(() => {
    const controlador = controladorMovimentoRef.current;
    return () => {
      controlador.limpar();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markerRef.current = null;
    };
  }, []);

  const sincronizarQuadroCompartilhado = useCallback((agoraMs: number) => {
    const map = mapInstanceRef.current;
    const marker = markerRef.current;
    const estado = controladorMovimentoRef.current.obterEstado("compartilhado");
    if (!marker || !estado) return;

    marker.setLatLng([estado.visualLat, estado.visualLng]);
    atualizarRotacaoElementoMarcador(marker.getElement(), estado.headingContinuous);

    if (
      map &&
      seguindoCameraRef.current &&
      !userDraggingRef.current &&
      !(map as any)._animatingZoom &&
      agoraMs - ultimoPanFollowMsRef.current >= 320
    ) {
      try {
        const centroPx = map.latLngToContainerPoint(map.getCenter());
        const marcadorPx = map.latLngToContainerPoint([estado.visualLat, estado.visualLng]);
        const distPx = Math.hypot(centroPx.x - marcadorPx.x, centroPx.y - marcadorPx.y);
        if (distPx > 22) {
          ultimoPanFollowMsRef.current = agoraMs;
          map.panTo([estado.visualLat, estado.visualLng], {
            animate: true,
            duration: 0.35,
            easeLinearity: 1,
            noMoveStart: true,
          });
        }
      } catch {
        // Viewport em transição
      }
    }
  }, []);

  // Inicializa mapa Leaflet isolado e atualiza marcador com deslocamento contínuo a 60 FPS
  useEffect(() => {
    if (!veiculo || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [latPadrao, lngPadrao],
        zoom: temCoordenadasValidas ? 15 : 12,
        maxZoom: 21,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 21,
        maxNativeZoom: 19,
      }).addTo(map);

      map.on("dragstart", () => {
        userDraggingRef.current = true;
        seguindoCameraRef.current = false;
      });
      map.on("dragend", () => {
        userDraggingRef.current = false;
      });

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    if (temCoordenadasValidas) {
      const statusCom = avaliarStatusComunicacao(veiculo.ultima_atualizacao);
      const isOffline = !statusCom.ativo;
      const isEmRota = (veiculo.velocidade || 0) > 3;
      const anguloRumo = veiculo.rumo ?? 0;

      // Cores canônicas do Pino Genérico 3D Hunter:
      // - Offline (sem sinal > 10 min): Vermelho (#EF4444)
      // - Online com ignição ligada / em rota: Verde (#10B981)
      // - Online com ignição desligada / estacionado (ou Modo Stealth camuflado): Azul (#2563EB)
      let corStatus: string;
      if (isOffline) {
        corStatus = "#EF4444";
      } else if (veiculo.ignicao || isEmRota) {
        corStatus = "#10B981";
      } else {
        corStatus = "#2563EB";
      }

      const controlador = controladorMovimentoRef.current;
      const estado = controlador.atualizarDestino({
        id: "compartilhado",
        latitude: veiculo.latitude!,
        longitude: veiculo.longitude!,
        rumo: anguloRumo,
        velocidadeKmh: veiculo.velocidade || 0,
        ignicao: Boolean(veiculo.ignicao || isEmRota),
        bloqueado: false,
        online: !isOffline,
        ultimaAtualizacaoIso: veiculo.ultima_atualizacao,
      });

      const visualKey = criarChaveVisualMarcador({
        placa: "",
        tipo: "carro",
        corStatus,
        isSelected: false,
        temAlerta: false,
        isEmRota,
        iconeGenerico: true,
        mostrarPlaca: false,
      });

      const criarDivIcon = () => {
        // Ícone Genérico (3D) - "Pino em Pé na Via" oficial do sistema Hunter
        const iconeHtml = gerarMarcador3DHtml({
          placa: "",
          tipo: "carro",
          corStatus,
          anguloRumo: estado.headingContinuous,
          isSelected: false,
          temAlerta: false,
          isEmRota,
          iconeGenerico: true, // Pino Genérico (3D) em pé na via
          mostrarPlaca: false, // Estritamente sem a placa
        });

        return L.divIcon({
          html: iconeHtml,
          className: "custom-hunter-marker",
          iconSize: [44, 48],
          iconAnchor: [22, 48],
          popupAnchor: [0, -48],
        });
      };

      if (markerRef.current) {
        markerRef.current.setLatLng([estado.visualLat, estado.visualLng]);
        if (visualKeyMarcadorRef.current !== visualKey) {
          markerRef.current.setIcon(criarDivIcon());
          visualKeyMarcadorRef.current = visualKey;
        } else {
          atualizarRotacaoElementoMarcador(
            markerRef.current.getElement(),
            estado.headingContinuous,
          );
        }
      } else {
        markerRef.current = L.marker([estado.visualLat, estado.visualLng], {
          icon: criarDivIcon(),
        }).addTo(map);
        visualKeyMarcadorRef.current = visualKey;
      }

      controlador.agendarLoop(sincronizarQuadroCompartilhado);
    }
  }, [veiculo, temCoordenadasValidas, latPadrao, lngPadrao, sincronizarQuadroCompartilhado]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#eaf0f8] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-800 dark:text-slate-100 font-sans transition-colors">
        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-sm">
          <Radio className="h-5 w-5 animate-pulse" />
          <span>Localizando veículo...</span>
        </div>
      </div>
    );
  }

  if (erro || !veiculo) {
    return (
      <div className="min-h-screen bg-[#eaf0f8] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-800 dark:text-slate-100 font-sans transition-colors">
        <div className="bg-white dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-sm text-center shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Acesso Indisponível
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{erro}</p>
          <div className="pt-2 text-[10px] text-slate-400 dark:text-slate-500">
            {APP_NOME} · Plataforma de Rastreamento Veicular
          </div>
        </div>
      </div>
    );
  }

  const statusComAtual = avaliarStatusComunicacao(veiculo.ultima_atualizacao);
  const isOfflineAtual = !statusComAtual.ativo;

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none overflow-hidden relative transition-colors">
      {/* Barra de Topo */}
      <header className="h-16 px-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between z-10 shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5 h-full py-1">
          <img
            src="/logo-emblema.png"
            alt={APP_NOME}
            className="h-14 w-14 object-contain drop-shadow-md shrink-0"
          />
          <div>
            <div className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>{veiculo.marca_modelo}</span>
              {/* Ícone piscante ONLINE com o texto ON LINE de alta visibilidade (sem a placa) */}
              {isOfflineAtual ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-600 dark:text-rose-400 font-extrabold text-[10px] sm:text-[11px] tracking-wider shadow-xs select-none">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-sm"></span>
                  </span>
                  <span>OFFLINE</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-600 dark:text-orange-400 font-extrabold text-[10px] sm:text-[11px] tracking-wider shadow-xs select-none">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500 shadow-sm"></span>
                  </span>
                  <span>ON LINE</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium mt-0.5">
              <span>
                {isOfflineAtual ? "Último Sinal" : "Ao Vivo"} ·{" "}
                {veiculo.status_operacional.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Validade do Link / Contador Progressivo de Encerramento Manual */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {expiraEm ? (
            <div className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-300/70 dark:border-slate-700 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 shadow-xs">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Válido por:</span>
              <span className="font-bold">{tempoRestante}</span>
            </div>
          ) : (
            <div className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-white dark:bg-slate-800/80 border border-orange-500/30 dark:border-orange-500/30 flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 shadow-xs">
              <Clock className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              <span className="hidden sm:inline">Link ativo há:</span>
              <span className="font-bold">{tempoAtivo || "0h 0m 0s"}</span>
            </div>
          )}
        </div>
      </header>

      {/* Mapa em Tela Cheia */}
      <div className="flex-1 w-full relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Painel Flutuante Inferior com Telemetria Básica */}
        <div className="absolute bottom-4 left-4 right-4 max-w-sm mx-auto z-1000 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-300/70 dark:border-slate-800 rounded-2xl p-3 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl flex flex-col gap-2.5 text-xs">
          {!temCoordenadasValidas && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px]">
              <Radio className="h-4 w-4 shrink-0 animate-pulse" />
              <span>Aguardando primeiro sinal GPS de satélite do veículo...</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 font-mono">
              <div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-sans">
                  Velocidade
                </span>
                <span className="font-bold text-orange-600 dark:text-orange-400 text-sm">
                  {veiculo.velocidade} km/h
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 block font-sans">
                  Ignição
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {veiculo.ignicao ? "Ligada" : "Desligada"}
                </span>
              </div>
            </div>

            {temCoordenadasValidas ? (
              <a
                href={`https://www.google.com/maps?q=${veiculo.latitude},${veiculo.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition flex items-center gap-1.5 shadow-sm"
              >
                <span>Google Maps</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                Sem GPS fixo
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
