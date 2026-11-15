import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  X,
  MapPin,
  Clock,
  Navigation,
  Globe,
  Gauge,
  Route as RouteIcon,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import type { CompartilhamentoAcesso } from "../services/compartilhamentoService";
import { calcularRumoPonto } from "../utils/telemetriaDinamica";

interface TrajetoVisualizadoModalProps {
  acesso: CompartilhamentoAcesso;
  placa: string;
  marcaModelo?: string;
  onFechar: () => void;
}

export function TrajetoVisualizadoModal({
  acesso,
  placa,
  marcaModelo,
  onFechar,
}: TrajetoVisualizadoModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Formatação de duração em horas, minutos e segundos
  const formatarDuracao = (segundos: number) => {
    if (segundos <= 0) return "Menos de 1 min";
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const pontos = (acesso.trajeto || []).filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number" && !isNaN(p.lat) && !isNaN(p.lng),
  );

  const temInicio =
    acesso.inicio_latitude !== null &&
    acesso.inicio_longitude !== null &&
    !isNaN(acesso.inicio_latitude) &&
    !isNaN(acesso.inicio_longitude);

  const temFim =
    acesso.fim_latitude !== null &&
    acesso.fim_longitude !== null &&
    !isNaN(acesso.fim_latitude) &&
    !isNaN(acesso.fim_longitude);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const latCentro = temInicio ? acesso.inicio_latitude! : -22.5235;
    const lngCentro = temInicio ? acesso.inicio_longitude! : -44.1042;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [latCentro, lngCentro],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 21,
        maxNativeZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Ícone verde de início
    const greenIcon = L.divIcon({
      className: "custom-pin-inicio",
      html: `
        <div style="background-color: #10B981; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">
          A
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    // Ícone azul/vermelho de término
    const redIcon = L.divIcon({
      className: "custom-pin-fim",
      html: `
        <div style="background-color: #EF4444; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 11px;">
          B
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const bounds = L.latLngBounds([]);

    // 1. Marcador de Início
    if (temInicio) {
      const pInicio = L.latLng(acesso.inicio_latitude!, acesso.inicio_longitude!);
      bounds.extend(pInicio);
      L.marker(pInicio, { icon: greenIcon })
        .addTo(map)
        .bindPopup(
          `<strong>Ponto de Início da Visualização</strong><br/>` +
            `Data/Hora: ${new Date(acesso.iniciado_em).toLocaleString("pt-BR")}<br/>` +
            `Local: ${acesso.inicio_endereco || "Coordenadas registradas"}`,
        );
    }

    // 2. Trajeto percorrido durante a visualização
    if (pontos.length > 1) {
      const latlngs = pontos.map((p) => {
        const pt = L.latLng(p.lat, p.lng);
        bounds.extend(pt);
        return pt;
      });

      L.polyline(latlngs, {
        color: "#0284c7",
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // Pontas de seta direcionais piscantes em cada ponto registrado
      pontos.forEach((p, idx) => {
        const proximo = idx < pontos.length - 1 ? pontos[idx + 1] : undefined;
        const anterior = idx > 0 ? pontos[idx - 1] : undefined;
        const rumo = calcularRumoPonto(
          { latitude: p.lat, longitude: p.lng },
          proximo ? { latitude: proximo.lat, longitude: proximo.lng } : undefined,
          anterior ? { latitude: anterior.lat, longitude: anterior.lng } : undefined,
        );

        const iconeSeta = L.divIcon({
          html: `
            <div class="hunter-seta-ping-container" style="transform: rotate(${rumo}deg); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;" title="Ponto gravado · Sentido: ${rumo}°">
              <div class="hunter-seta-ping-wrapper" style="width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L21 21L12 17L3 21L12 2Z" fill="#0284c7" stroke="#075985" stroke-width="1.8" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
          `,
          className: "custom-hunter-marker",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        L.marker([p.lat, p.lng], { icon: iconeSeta }).addTo(map);
      });
    }

    // 3. Marcador de Término
    if (temFim) {
      const pFim = L.latLng(acesso.fim_latitude!, acesso.fim_longitude!);
      bounds.extend(pFim);
      L.marker(pFim, { icon: redIcon })
        .addTo(map)
        .bindPopup(
          `<strong>Ponto de Término da Visualização</strong><br/>` +
            `Data/Hora: ${new Date(acesso.ultimo_ping_em || acesso.iniciado_em).toLocaleString("pt-BR")}<br/>` +
            `Local: ${acesso.fim_endereco || "Coordenadas registradas"}`,
        );
    }

    // Ajusta enquadramento
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [acesso, temInicio, temFim, pontos]);

  const veiculoEstacionado =
    pontos.length <= 1 ||
    (temInicio &&
      temFim &&
      Math.abs((acesso.inicio_latitude || 0) - (acesso.fim_latitude || 0)) < 0.0001 &&
      Math.abs((acesso.inicio_longitude || 0) - (acesso.fim_longitude || 0)) < 0.0001);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
                <RouteIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    Trajeto Visualizado no Acesso
                  </h3>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    {placa}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Visualizador IP: {acesso.ip} •{" "}
                  {new Date(acesso.iniciado_em).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onFechar}
              className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {/* Mapa do Trajeto */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner">
              <div
                ref={mapContainerRef}
                className="h-64 sm:h-80 w-full bg-slate-100 dark:bg-slate-950"
              />

              {/* Banner informativo de trajeto ou veículo estacionado */}
              <div className="absolute top-3 left-3 right-3 z-[1000] pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-lg flex items-center justify-between text-xs text-slate-200 gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                    <span className="truncate">
                      {veiculoEstacionado
                        ? "Veículo permaneceu no mesmo local durante este acesso"
                        : `Trajeto gravado: ${pontos.length} coordenadas registradas`}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-sky-400 shrink-0">
                    {formatarDuracao(acesso.duracao_segundos)}
                  </span>
                </div>
              </div>
            </div>

            {/* Painel de Métricas e Locais de Início e Término */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Local de Início */}
              <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black">
                      A
                    </span>
                    Local de Início do Veículo
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(acesso.iniciado_em).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                  {acesso.inicio_endereco ||
                    (temInicio
                      ? `Lat: ${acesso.inicio_latitude?.toFixed(5)}, Lng: ${acesso.inicio_longitude?.toFixed(5)}`
                      : "Sem leitura no momento")}
                </p>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Aberto em: {new Date(acesso.iniciado_em).toLocaleString("pt-BR")}
                </div>
              </div>

              {/* Local de Término */}
              <div className="p-3.5 rounded-2xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/20 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <span className="h-4 w-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-black">
                      B
                    </span>
                    Local de Término do Veículo
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(acesso.ultimo_ping_em || acesso.iniciado_em).toLocaleTimeString(
                      "pt-BR",
                    )}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                  {acesso.fim_endereco ||
                    (temFim
                      ? `Lat: ${acesso.fim_latitude?.toFixed(5)}, Lng: ${acesso.fim_longitude?.toFixed(5)}`
                      : "Sem leitura no momento")}
                </p>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {acesso.finalizado_em
                    ? `Encerrado em: ${new Date(acesso.finalizado_em).toLocaleString("pt-BR")}`
                    : `Último sinal: ${new Date(acesso.ultimo_ping_em || acesso.iniciado_em).toLocaleString("pt-BR")}`}
                </div>
              </div>
            </div>

            {/* Informações Consolidadas do Acesso */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Tempo Conectado
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5">
                  <Clock className="h-3.5 w-3.5 text-sky-500" />
                  {formatarDuracao(acesso.duracao_segundos)}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Distância Vista
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5">
                  <Navigation className="h-3.5 w-3.5 text-emerald-500" />
                  {acesso.distancia_percorrida_km > 0
                    ? `${acesso.distancia_percorrida_km.toFixed(1)} km`
                    : "0 km (Parado)"}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Velocidade Máxima
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5">
                  <Gauge className="h-3.5 w-3.5 text-amber-500" />
                  {acesso.velocidade_maxima || 0} km/h
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
                  Endereço IP
                </span>
                <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5 truncate">
                  <Globe className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{acesso.ip}</span>
                </span>
              </div>
            </div>

            {/* Auditoria de Modo Stealth durante este Acesso */}
            {acesso.stealth_observado ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <EyeOff className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Modo Stealth (Congelamento Tático) Ativado neste Acesso</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                    {acesso.stealth_duracao_segundos
                      ? formatarDuracao(acesso.stealth_duracao_segundos)
                      : "Ativo"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-700 dark:text-slate-300 pl-6 leading-relaxed">
                  {acesso.stealth_inicio_em && acesso.stealth_fim_em ? (
                    <span>
                      Período em que o visitante visualizou a posição congelada: das{" "}
                      <strong className="font-mono text-amber-700 dark:text-amber-300">
                        {new Date(acesso.stealth_inicio_em).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </strong>{" "}
                      às{" "}
                      <strong className="font-mono text-amber-700 dark:text-amber-300">
                        {new Date(acesso.stealth_fim_em).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </strong>
                      .
                    </span>
                  ) : (
                    <span>
                      O veículo permaneceu com posição congelada durante o período deste acesso.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                  <span>Modo Stealth: Não utilizado neste acesso</span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Transmissão 100% em Tempo Real
                </span>
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Auditoria forense do link de compartilhamento</span>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
