import { useState, useEffect, useCallback } from "react";
import {
  X,
  Gauge,
  Check,
  RotateCcw,
  Info,
  Sliders,
  History,
  TrendingUp,
  AlertTriangle,
  Cpu,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { VeiculoGps } from "../types";
import { MostradoresOdometroFusional } from "./MostradoresOdometroFusional";
import { calibrarOdometroHardwareJ16 } from "../services/gpsService";

interface AjusteOdometroModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
  onOdometroAtualizado?: (novoKm: number) => void;
}

interface CalibracaoHistoricoItem {
  id: string;
  hodometro_inicial_painel_km: number;
  hodometro_final_painel_km: number;
  odometro_inicial_sigo_km: number;
  odometro_final_sigo_km: number;
  distancia_painel_km: number;
  distancia_sigo_km: number;
  diferenca_km: number;
  erro_percentual: number;
  fator_correcao_calculado: number;
  fator_correcao_aplicado: number;
  tendencia: string;
  criado_em: string;
}

export function AjusteOdometroModal({
  veiculo,
  onFechar,
  onOdometroAtualizado,
}: AjusteOdometroModalProps) {
  const { session } = useAuth();
  const isEngenhariaPermitida = Boolean(
    session?.isSuperAdmin ||
    session?.isAdmin ||
    session?.role === "adm" ||
    session?.role === "superadmin",
  );

  const odometroAtual = Number(veiculo.odometro_motor_media_km ?? veiculo.odometro ?? 0);
  const proximoInteiro = Math.ceil(odometroAtual);

  const [abaAtiva, setAbaAtiva] = useState<
    "sincronizacao" | "calibracao" | "historico" | "comparativo"
  >("sincronizacao");
  const [novoKm, setNovoKm] = useState<string>(odometroAtual.toString());
  const [salvando, setSalvando] = useState(false);

  // Estados da Calibração Individual (ETAPA 6)
  const [hodometroInicial, setHodometroInicial] = useState<string>("");
  const [hodometroFinal, setHodometroFinal] = useState<string>("");
  const [odometroInicialSigo, setOdometroInicialSigo] = useState<string>(odometroAtual.toFixed(2));
  const [odometroFinalSigo, setOdometroFinalSigo] = useState<string>(odometroAtual.toFixed(2));
  const [aplicarFator, setAplicarFator] = useState<boolean>(false);
  const [observacoes, setObservacoes] = useState<string>("");

  // Histórico de Calibrações
  const [historicoCalibracoes, setHistoricoCalibracoes] = useState<CalibracaoHistoricoItem[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState<boolean>(false);

  const carregarHistoricoCalibracoes = useCallback(async () => {
    setCarregandoHistorico(true);
    try {
      const { data, error } = await (supabase.rpc as any)("obter_calibracoes_odometro_veiculo", {
        p_veiculo_id: veiculo.id,
      });
      if (!error && Array.isArray(data)) {
        setHistoricoCalibracoes(data);
      } else {
        const { data: dbData } = await supabase
          .from("veiculo_calibracoes_odometro")
          .select("*")
          .eq("veiculo_id", veiculo.id)
          .order("criado_em", { ascending: false });
        if (dbData) setHistoricoCalibracoes(dbData as any);
      }
    } catch {
      // Ignora silenciosamente
    } finally {
      setCarregandoHistorico(false);
    }
  }, [veiculo.id]);

  useEffect(() => {
    carregarHistoricoCalibracoes();
  }, [carregarHistoricoCalibracoes]);

  // Cálculos prévios em tempo real da Calibração
  const hIni = parseFloat(hodometroInicial.replace(",", "."));
  const hFim = parseFloat(hodometroFinal.replace(",", "."));
  const sIni = parseFloat(odometroInicialSigo.replace(",", "."));
  const sFim = parseFloat(odometroFinalSigo.replace(",", "."));
  const distPainelCalculada = !isNaN(hIni) && !isNaN(hFim) && hFim >= hIni ? hFim - hIni : 0;
  const distSigoCalculada = !isNaN(sIni) && !isNaN(sFim) && sFim >= sIni ? sFim - sIni : 0;
  const diferencaKmCalculada = distSigoCalculada - distPainelCalculada;
  const erroPercentualCalculado =
    distPainelCalculada > 0 ? (Math.abs(diferencaKmCalculada) / distPainelCalculada) * 100 : 0;
  const fatorCalculado = distSigoCalculada > 0 ? distPainelCalculada / distSigoCalculada : 1.0;

  const handleSalvarSincronizacao = async () => {
    const kmNumerico = parseFloat(novoKm.replace(",", "."));
    if (isNaN(kmNumerico) || kmNumerico < 0) {
      toast.error("Informe uma quilometragem válida maior ou igual a zero.");
      return;
    }

    setSalvando(true);
    try {
      // 1. Executa a RPC canônica que atualiza os 7 odômetros de forma atômica
      const { error: errRpc } = await (supabase.rpc as any)("ajustar_odometro_veiculo", {
        p_veiculo_id: veiculo.id,
        p_novo_odometro: kmNumerico,
      });

      // 2. Defesa em profundidade: update direto de todos os 7 odômetros para garantir consistência imediata
      const { error: errUpdate } = await supabase
        .from("veiculos")
        .update({
          odometro_km: kmNumerico,
          odometro_motor_media_km: kmNumerico,
          odometro_wgs84_km: kmNumerico,
          odometro_cinematico_km: kmNumerico,
          odometro_motor_a_km: kmNumerico,
          odometro_motor_b_km: kmNumerico,
          odometro_motor_c_km: kmNumerico,
          odometro_hardware_km: Math.round(kmNumerico),
          odometro_hardware_atualizado_em: new Date().toISOString(),
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", veiculo.id);

      if (errRpc && errUpdate) {
        throw errRpc || errUpdate;
      }

      // 3. Atualiza o objeto em memória veiculo imediatamente
      veiculo.odometro = kmNumerico;
      (veiculo as any).odometro_km = kmNumerico;
      veiculo.odometro_motor_media_km = kmNumerico;
      veiculo.odometro_wgs84_km = kmNumerico;
      veiculo.odometro_cinematico_km = kmNumerico;
      veiculo.odometro_motor_a_km = kmNumerico;
      veiculo.odometro_motor_b_km = kmNumerico;
      veiculo.odometro_motor_c_km = kmNumerico;
      veiculo.odometro_hardware_km = Math.round(kmNumerico);

      // 4. Se o veículo possuir rastreador físico J16/GT06 vinculado, envia comando MILEAGE=<km>#
      const imeiRastreador = veiculo.rastreador_imei || (veiculo as any).imei;
      if (imeiRastreador) {
        calibrarOdometroHardwareJ16(kmNumerico, imeiRastreador, veiculo.id).catch((errHw) => {
          console.warn(
            "[AjusteOdometroModal] Aviso ao transmitir calibração de hardware J16:",
            errHw,
          );
        });
      }

      // 5. Atualiza o cache local do Cockpit de telemetria para sincronia imediata na interface
      const storageKeyId = `hunter_odometros_cockpit_${veiculo.id}`;
      const storageKeyPlaca = veiculo.placa ? `hunter_odometros_cockpit_${veiculo.placa}` : null;
      const payloadCockpit = JSON.stringify({
        kmA: kmNumerico,
        kmB: kmNumerico,
        kmC: kmNumerico,
        kmHardware: Math.round(kmNumerico),
        ts: Date.now(),
      });
      try {
        localStorage.setItem(storageKeyId, payloadCockpit);
        if (storageKeyPlaca) localStorage.setItem(storageKeyPlaca, payloadCockpit);
      } catch {
        // silencioso
      }

      // 6. Notifica globalmente a aplicação sobre a sincronização de odômetros
      window.dispatchEvent(
        new CustomEvent("hunter_odometro_sincronizado", {
          detail: {
            veiculoId: veiculo.id,
            placa: veiculo.placa,
            novoKm: kmNumerico,
          },
        }),
      );

      // 7. Registra log de auditoria
      try {
        await supabase.from("system_activity_logs").insert({
          acao: "AJUSTE_CALIBRACAO_ODOMETRO",
          detalhe: `Odômetro do veículo ${veiculo.placa} ajustado de ${odometroAtual.toFixed(2)} km para ${kmNumerico.toFixed(2)} km pelo operador com equalização atômica dos 7 medidores.`,
        });
      } catch {
        // Silencioso se política de auditoria restringir inserção direta
      }

      toast.success(
        `Odômetro do veículo ${veiculo.placa} sincronizado com sucesso para ${kmNumerico.toLocaleString("pt-BR")} km!`,
      );
      if (onOdometroAtualizado) {
        onOdometroAtualizado(kmNumerico);
      }
      onFechar();
    } catch (err: any) {
      toast.error("Erro ao sincronizar odômetro: " + (err?.message || "Tente novamente."));
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarCalibracao = async () => {
    if (isNaN(hIni) || isNaN(hFim) || hFim <= hIni) {
      toast.error(
        "Informe as leituras inicial e final do hodômetro do painel (final deve ser maior que inicial).",
      );
      return;
    }
    if (isNaN(sIni) || isNaN(sFim) || sFim <= sIni) {
      toast.error(
        "Informe as leituras inicial e final do GD Rastreamento (final deve ser maior que inicial).",
      );
      return;
    }
    if (distPainelCalculada < 1.0) {
      toast.warning(
        "Para calibração confiável, realize percursos de no mínimo 1 km (recomendado 10 a 50 km).",
      );
    }

    setSalvando(true);
    try {
      const { data: resRpc, error: errRpc } = await (supabase.rpc as any)(
        "registrar_calibracao_odometro_veiculo",
        {
          p_veiculo_id: veiculo.id,
          p_hodometro_inicial_painel: hIni,
          p_hodometro_final_painel: hFim,
          p_odometro_inicial_sigo: sIni,
          p_odometro_final_sigo: sFim,
          p_aplicar_fator: aplicarFator,
          p_configuracao_j16: "TIMER,15,3600# | ANGLE,3,15#",
          p_condicoes_percurso: "Aferição em percurso com vias urbanas e rodovias",
          p_observacoes: observacoes || "Calibração individual de odômetro via painel físico",
        },
      );

      if (errRpc) {
        throw errRpc;
      }

      toast.success(
        `Calibração registrada! Erro medido: ${erroPercentualCalculado.toFixed(2)}% (${diferencaKmCalculada > 0 ? "+" : ""}${diferencaKmCalculada.toFixed(2)} km).${aplicarFator ? " Fator individual de correção atualizado no veículo." : ""}`,
      );
      await carregarHistoricoCalibracoes();
      setAbaAtiva("historico");
    } catch (err: any) {
      toast.error("Erro ao salvar calibração: " + (err?.message || "Tente novamente."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div
          className={`relative w-full ${
            abaAtiva === "comparativo" ? "max-w-4xl" : "max-w-xl"
          } max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-200`}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                <Gauge className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 truncate">
                  Odometria e Calibração Veicular
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                  Veículo:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{veiculo.placa}</strong> ·{" "}
                  {veiculo.marca_modelo}
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-2 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Abas com scroll horizontal fluido no mobile (apenas para perfil de engenharia/administração) */}
          {isEngenhariaPermitida && (
            <div className="flex items-center border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/80 dark:bg-slate-950/40 px-3 sm:px-4 shrink-0 overflow-x-auto scrollbar-none gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setAbaAtiva("sincronizacao")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                  abaAtiva === "sincronizacao"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sincronização Rápida</span>
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva("calibracao")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                  abaAtiva === "calibracao"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Calibração por Trajeto</span>
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva("historico")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                  abaAtiva === "historico"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico ({historicoCalibracoes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva("comparativo")}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer shrink-0 whitespace-nowrap ${
                  abaAtiva === "comparativo"
                    ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Comparativo 3 Motores (A, B e C)</span>
              </button>
            </div>
          )}

          {/* Corpo Rolável */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {abaAtiva === "sincronizacao" && (
              <>
                <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/60 text-sky-900 dark:text-sky-200 text-xs leading-relaxed space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-sky-800 dark:text-sky-300">
                    <Info className="w-4 h-4 shrink-0 text-sky-600" />
                    <span>Sincronização com o Painel Físico:</span>
                  </div>
                  <p>
                    O painel do veículo exibe apenas quilômetros inteiros. Quando o quilômetro virar
                    exatamente no velocímetro do carro, preencha o valor exato aqui para zerar
                    qualquer fração residual.
                  </p>
                </div>

                {/* Comparativo de Leituras */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                      Odômetro no GD Rastreamento
                    </span>
                    <span className="font-mono font-black text-base sm:text-lg text-slate-800 dark:text-slate-100">
                      {odometroAtual.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      <span className="text-xs font-normal text-slate-500">km</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                      Virada de KM no Painel
                    </span>
                    <button
                      type="button"
                      onClick={() => setNovoKm(proximoInteiro.toString())}
                      className="mt-0.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold transition cursor-pointer"
                      title="Clique para preencher com o próximo quilômetro exato"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{proximoInteiro.toLocaleString("pt-BR")} km</span>
                    </button>
                  </div>
                </div>

                {/* Campo de Entrada */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Quilometragem Exata do Painel (km)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={novoKm}
                      onChange={(e) => setNovoKm(e.target.value)}
                      placeholder="Ex: 50231"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                      KM
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Aceita valores inteiros ou decimais.
                  </span>
                </div>
              </>
            )}

            {abaAtiva === "calibracao" && (
              <>
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                    <Sliders className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Protocolo de Calibração Individual (ETAPA 6):</span>
                  </div>
                  <p>
                    Para calibrar a odometria do veículo, anote a leitura do hodômetro no painel
                    antes de iniciar o trajeto e anote novamente ao concluir. O sistema calcula a
                    diferença exata e o erro percentual.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Painel Físico */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block border-b border-slate-200 dark:border-slate-800 pb-1.5">
                      Hodômetro Físico (Painel do Carro)
                    </span>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Leitura Inicial (km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={hodometroInicial}
                        onChange={(e) => setHodometroInicial(e.target.value)}
                        placeholder="Ex: 125430.0"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Leitura Final (km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={hodometroFinal}
                        onChange={(e) => setHodometroFinal(e.target.value)}
                        placeholder="Ex: 125482.0"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="pt-1 text-xs font-mono text-slate-500">
                      Distância do Painel:{" "}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {distPainelCalculada.toFixed(2)} km
                      </strong>
                    </div>
                  </div>

                  {/* GD Rastreamento */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block border-b border-slate-200 dark:border-slate-800 pb-1.5">
                      Odômetro GD Rastreamento
                    </span>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Leitura Inicial (km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={odometroInicialSigo}
                        onChange={(e) => setOdometroInicialSigo(e.target.value)}
                        placeholder="Ex: 125430.0"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Leitura Final (km)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={odometroFinalSigo}
                        onChange={(e) => setOdometroFinalSigo(e.target.value)}
                        placeholder="Ex: 125481.8"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="pt-1 text-xs font-mono text-slate-500">
                      Distância SIGO:{" "}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {distSigoCalculada.toFixed(2)} km
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Resultado da Aferição */}
                {distPainelCalculada > 0 && distSigoCalculada > 0 && (
                  <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">Diferença Medida:</span>
                      <span
                        className={`font-mono ${Math.abs(diferencaKmCalculada) < 0.2 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                      >
                        {diferencaKmCalculada > 0 ? "+" : ""}
                        {diferencaKmCalculada.toFixed(3)} km ({erroPercentualCalculado.toFixed(2)}%
                        erro)
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Fator de Correção Calculado:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {fatorCalculado.toFixed(6)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      <input
                        type="checkbox"
                        id="aplicarFatorCheck"
                        checked={aplicarFator}
                        onChange={(e) => setAplicarFator(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <label
                        htmlFor="aplicarFatorCheck"
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Aplicar fator de calibração individual ({fatorCalculado.toFixed(4)}) a este
                        veículo
                      </label>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Observações do Percurso
                  </label>
                  <input
                    type="text"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex: Trecho Volta Redonda a Barra Mansa (Dutra e perímetro urbano)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </>
            )}

            {abaAtiva === "historico" && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Sessões de Calibração Registradas ({historicoCalibracoes.length})
                </span>

                {carregandoHistorico ? (
                  <p className="text-xs text-slate-500 py-4 text-center">Carregando histórico...</p>
                ) : historicoCalibracoes.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                    Nenhuma sessão de calibração registrada ainda para este veículo.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {historicoCalibracoes.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {new Date(item.criado_em).toLocaleDateString("pt-BR")} às{" "}
                            {new Date(item.criado_em).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.tendencia === "EXATO"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            }`}
                          >
                            {item.tendencia} ({item.erro_percentual?.toFixed(2)}% erro)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                          <div>
                            Painel: <strong>{item.distancia_painel_km?.toFixed(2)} km</strong>
                          </div>
                          <div>
                            SIGO: <strong>{item.distancia_sigo_km?.toFixed(2)} km</strong>
                          </div>
                          <div>
                            Diferença:{" "}
                            <strong>
                              {item.diferenca_km > 0 ? "+" : ""}
                              {item.diferenca_km?.toFixed(3)} km
                            </strong>
                          </div>
                          <div>
                            Fator Aplicado:{" "}
                            <strong>{item.fator_correcao_aplicado?.toFixed(4)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {abaAtiva === "comparativo" && (
              <MostradoresOdometroFusional
                placaVeiculo={veiculo.placa}
                odometroPainelReferenciaKm={odometroAtual > 0 ? odometroAtual : 183421.0}
              />
            )}

            {/* Ações do Rodapé */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Fechar
              </button>

              {abaAtiva === "sincronizacao" && (
                <button
                  type="button"
                  onClick={handleSalvarSincronizacao}
                  disabled={salvando}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{salvando ? "Sincronizando..." : "Sincronizar Odômetro"}</span>
                </button>
              )}

              {abaAtiva === "calibracao" && (
                <button
                  type="button"
                  onClick={handleSalvarCalibracao}
                  disabled={salvando}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md shadow-emerald-600/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{salvando ? "Registrando..." : "Registrar Calibração"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
