import { useState, useEffect, useMemo } from "react";
import {
  Smartphone,
  Laptop,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  Plus,
  RefreshCw,
  Copy,
  Info,
  KeyRound,
  Fingerprint as FingerprintIcon,
  Cpu,
  Monitor,
  Globe,
  Clock,
  Sparkles,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";
import { APP_NOME } from "@/shared/lib/version";
import { TiltCard } from "@/shared/components/TiltCard";

interface DispositivoRegistro {
  id: string;
  user_id: string;
  fingerprint: string;
  nome_dispositivo: string | null;
  status: string;
  ultimo_acesso: string;
  created_at: string;
}

// Utilitário para gerar hash estável do dispositivo atual via Web Crypto SHA-256
async function gerarFingerprintAtual(): Promise<string> {
  try {
    const rawData = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency || 4,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|#|");

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(rawData);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    return "fp_" + Math.random().toString(36).substring(2, 15);
  }
}

// Identificar nome amigável do sistema operacional e navegador
function obterNomeAmigavelDispositivo(): { nome: string; tipo: "mobile" | "desktop" } {
  const ua = navigator.userAgent;
  let so = "Dispositivo Desconhecido";
  let navegador = "Navegador Web";
  let tipo: "mobile" | "desktop" = "desktop";

  if (/iPhone|iPad|iPod/i.test(ua)) {
    so = "iOS (Apple)";
    tipo = "mobile";
  } else if (/Android/i.test(ua)) {
    so = "Android";
    tipo = "mobile";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    so = "macOS";
    tipo = "desktop";
  } else if (/Windows NT/i.test(ua)) {
    so = "Windows";
    tipo = "desktop";
  } else if (/Linux/i.test(ua)) {
    so = "Linux";
    tipo = "desktop";
  }

  if (/Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua)) {
    navegador = "Google Chrome";
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    navegador = "Apple Safari";
  } else if (/Firefox|FxiOS/i.test(ua)) {
    navegador = "Mozilla Firefox";
  } else if (/Edg/i.test(ua)) {
    navegador = "Microsoft Edge";
  }

  return {
    nome: `${so} — ${navegador}`,
    tipo,
  };
}

export function DispositivosView() {
  const { session } = useAuth();
  const [dispositivos, setDispositivos] = useState<DispositivoRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [fingerprintAtual, setFingerprintAtual] = useState<string>("");
  const [nomeSugerido, setNomeSugerido] = useState<string>("");
  const [tipoDispositivo, setTipoDispositivo] = useState<"mobile" | "desktop">("desktop");
  const [apelidoCustomizado, setApelidoCustomizado] = useState("");
  const [filtroDispositivo, setFiltroDispositivo] = useState<
    "todos" | "este_aparelho" | "desktop" | "mobile"
  >("todos");

  const carregar = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("dispositivos_autorizados")
        .select("*")
        .order("ultimo_acesso", { ascending: false });

      if (error) {
        console.error("Erro ao carregar dispositivos:", error);
      } else if (data) {
        setDispositivos(data as DispositivoRegistro[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    const info = obterNomeAmigavelDispositivo();
    setNomeSugerido(info.nome);
    setTipoDispositivo(info.tipo);
    setApelidoCustomizado(info.nome);

    gerarFingerprintAtual().then((fp) => {
      setFingerprintAtual(fp);
    });
  }, []);

  // Verificar se o dispositivo atual já consta na lista de autorizados
  const dispositivoAtualRegistrado = useMemo(() => {
    if (!fingerprintAtual || dispositivos.length === 0) return null;
    return dispositivos.find((d) => d.fingerprint === fingerprintAtual);
  }, [fingerprintAtual, dispositivos]);

  const totalDesktop = useMemo(() => {
    return dispositivos.filter((d) => {
      const nomeLower = (d.nome_dispositivo || "").toLowerCase();
      return !(
        nomeLower.includes("android") ||
        nomeLower.includes("ios") ||
        nomeLower.includes("iphone")
      );
    }).length;
  }, [dispositivos]);

  const totalMobile = useMemo(() => {
    return dispositivos.filter((d) => {
      const nomeLower = (d.nome_dispositivo || "").toLowerCase();
      return (
        nomeLower.includes("android") || nomeLower.includes("ios") || nomeLower.includes("iphone")
      );
    }).length;
  }, [dispositivos]);

  const dispositivosFiltrados = useMemo(() => {
    return dispositivos.filter((d) => {
      const isEsteDispositivo = d.fingerprint === fingerprintAtual;
      const nomeLower = (d.nome_dispositivo || "").toLowerCase();
      const isMobile =
        nomeLower.includes("android") || nomeLower.includes("ios") || nomeLower.includes("iphone");
      if (filtroDispositivo === "este_aparelho") return isEsteDispositivo;
      if (filtroDispositivo === "desktop") return !isMobile;
      if (filtroDispositivo === "mobile") return isMobile;
      return true;
    });
  }, [dispositivos, filtroDispositivo, fingerprintAtual]);

  const autorizarDispositivoAtual = async () => {
    if (!session?.userId) {
      toast.error("Usuário não autenticado. Efetue login novamente.");
      return;
    }

    setSalvando(true);
    try {
      const nomeFinal = apelidoCustomizado.trim() || nomeSugerido;
      const { data, error } = await supabase
        .from("dispositivos_autorizados")
        .upsert(
          {
            user_id: session.userId,
            fingerprint: fingerprintAtual,
            nome_dispositivo: nomeFinal,
            status: "autorizado",
            ultimo_acesso: new Date().toISOString(),
          },
          { onConflict: "user_id,fingerprint" },
        )
        .select()
        .single();

      if (error) {
        console.error("Erro ao autorizar dispositivo:", error);
        toast.error("Falha ao registrar dispositivo: " + error.message);
      } else {
        toast.success("Dispositivo autorizado com sucesso na política TOFU!");
        carregar();
      }
    } catch (err: any) {
      toast.error("Erro ao processar autorização: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const revogar = async (id: string, nome?: string | null) => {
    if (
      !window.confirm(
        `Deseja realmente revogar a autorização de "${nome || "este aparelho"}"? Ele perderá o acesso confiável.`,
      )
    ) {
      return;
    }

    const { error } = await supabase.from("dispositivos_autorizados").delete().eq("id", id);
    if (!error) {
      toast.success("Dispositivo revogado com sucesso!");
      carregar();
    } else {
      toast.error("Erro ao revogar dispositivo: " + error.message);
    }
  };

  const copiarFingerprint = (fp: string) => {
    navigator.clipboard.writeText(fp);
    toast.success("Fingerprint copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 select-none transition-all duration-300">
      {/* 1. Cabeçalho Canônico Neumorphic Hunter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs">
            <Smartphone className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Dispositivos Autorizados
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                TOFU Protegido
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Gestão de aparelhos com fingerprint criptográfico de hardware e política
              Trust-On-First-Use
            </p>
          </div>
        </div>

        <button
          onClick={carregar}
          disabled={carregando}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-[#fbf2e9] hover:bg-[#dfe8f5] dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none transition min-h-[44px]"
          title="Recarregar Lista"
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin text-emerald-500" : ""}`} />
          <span>Sincronizar</span>
        </button>
      </div>

      {/* 2. Métricas Canônicas de Segurança com Filtro Bidirecional */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TiltCard
          spotlightColor="rgba(16, 185, 129, 0.18)"
          onClick={() => setFiltroDispositivo((prev) => (prev === "todos" ? "todos" : "todos"))}
          className={`p-4 rounded-2xl cursor-pointer text-left transition-all ${
            filtroDispositivo === "todos"
              ? "ring-2 ring-emerald-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
              : "bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
          }`}
        >
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Aparelhos Confiáveis
          </span>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
            {dispositivos.length}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-1">
            <CheckCircle2 className="h-3 w-3" /> Registrados no RLS
          </span>
        </TiltCard>

        <TiltCard
          spotlightColor={
            dispositivoAtualRegistrado ? "rgba(16, 185, 129, 0.18)" : "rgba(245, 158, 11, 0.18)"
          }
          onClick={() =>
            setFiltroDispositivo((prev) => (prev === "este_aparelho" ? "todos" : "este_aparelho"))
          }
          className={`p-4 rounded-2xl cursor-pointer text-left transition-all ${
            filtroDispositivo === "este_aparelho"
              ? "ring-2 ring-emerald-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
              : "bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
          }`}
        >
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Este Terminal
          </span>
          <div className="text-base font-black text-slate-900 dark:text-slate-100 mt-1 truncate">
            {dispositivoAtualRegistrado ? "Autorizado" : "Pendente"}
          </div>
          <span
            className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${
              dispositivoAtualRegistrado
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {dispositivoAtualRegistrado ? (
              <>
                <CheckCircle2 className="h-3 w-3" /> Sessão Blindada
              </>
            ) : (
              <>
                <ShieldAlert className="h-3 w-3" /> Requer Validação
              </>
            )}
          </span>
        </TiltCard>

        <TiltCard
          spotlightColor="rgba(56, 189, 248, 0.18)"
          onClick={() => setFiltroDispositivo((prev) => (prev === "desktop" ? "todos" : "desktop"))}
          className={`p-4 rounded-2xl cursor-pointer text-left transition-all ${
            filtroDispositivo === "desktop"
              ? "ring-2 ring-sky-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
              : "bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
          }`}
        >
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Terminais Desktop
          </span>
          <div className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-1">
            {totalDesktop}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-1">
            <Laptop className="h-3 w-3 text-sky-500" /> Computadores
          </span>
        </TiltCard>

        <TiltCard
          spotlightColor="rgba(168, 85, 247, 0.18)"
          onClick={() => setFiltroDispositivo((prev) => (prev === "mobile" ? "todos" : "mobile"))}
          className={`p-4 rounded-2xl cursor-pointer text-left transition-all ${
            filtroDispositivo === "mobile"
              ? "ring-2 ring-purple-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
              : "bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
          }`}
        >
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Aparelhos Mobile
          </span>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-1">
            {totalMobile}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-1">
            <Smartphone className="h-3 w-3 text-purple-500" /> Smartphones
          </span>
        </TiltCard>
      </div>

      {/* 3. Card do Dispositivo Atual com Ação de Alta Finalidade */}
      <TiltCard
        spotlightColor="rgba(16, 185, 129, 0.22)"
        className="p-5 sm:p-6 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border-2 border-emerald-500/30 dark:border-emerald-500/20 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              {tipoDispositivo === "mobile" ? (
                <Smartphone className="h-6 w-6 stroke-[2.2]" />
              ) : (
                <Laptop className="h-6 w-6 stroke-[2.2]" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Terminal em Uso Neste Momento
                </span>
                {dispositivoAtualRegistrado ? (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" /> Autorizado e Protegido
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <ShieldAlert className="h-3 w-3" /> Não Registrado
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                <span className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                  <Monitor className="h-3.5 w-3.5 text-slate-400" />
                  {nomeSugerido}
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Resolução: {screen.width}x{screen.height}
                </span>
              </div>

              {fingerprintAtual && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 truncate max-w-xs sm:max-w-md">
                    FP: {fingerprintAtual}
                  </div>
                  <button
                    onClick={() => copiarFingerprint(fingerprintAtual)}
                    className="p-1 rounded text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                    title="Copiar Fingerprint Completo"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Botão de Ação / Autorização */}
          <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {!dispositivoAtualRegistrado ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                <input
                  type="text"
                  value={apelidoCustomizado}
                  onChange={(e) => setApelidoCustomizado(e.target.value)}
                  placeholder="Nome do Dispositivo (ex: Meu Computador)"
                  className="px-3.5 py-2.5 rounded-xl text-xs bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/50 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none focus:ring-2 focus:ring-[#00CFCC] font-medium"
                />
                <button
                  onClick={autorizarDispositivoAtual}
                  disabled={salvando || !fingerprintAtual}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 transition shadow-[2px_2px_8px_rgba(5,150,105,0.4)] whitespace-nowrap min-h-[44px]"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  <span>{salvando ? "Autorizando..." : "Autorizar Este Aparelho"}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 rounded-xl shadow-xs">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Terminal Validado e Confiável
                </span>
              </div>
            )}
          </div>
        </div>
      </TiltCard>

      {/* 4. Lista de Dispositivos Conhecidos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Aparelhos Cadastrados na Política TOFU
            </h2>
            {filtroDispositivo !== "todos" && (
              <button
                onClick={() => setFiltroDispositivo("todos")}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
              >
                Filtro: {filtroDispositivo} ✕
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {dispositivosFiltrados.length} de {dispositivos.length}{" "}
            {dispositivos.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        {carregando ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs font-mono bg-[#fbf2e9] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-xl">
            Sincronizando dispositivos com o cluster Supabase...
          </div>
        ) : dispositivosFiltrados.length === 0 ? (
          <div className="p-8 sm:p-10 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <FingerprintIcon className="h-8 w-8 stroke-[1.8]" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {dispositivos.length === 0
                  ? "Nenhum dispositivo registrado ainda"
                  : "Nenhum dispositivo encontrado para este filtro"}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {dispositivos.length === 0
                  ? `A política TOFU protege o sistema ${APP_NOME} garantindo que apenas navegadores com impressão digital autorizada acessem o ambiente operacional com credenciais válidas.`
                  : "Alterne o filtro ou clique em 'Ver todos' para visualizar a lista completa de terminais."}
              </p>
            </div>
            {dispositivos.length === 0 ? (
              <div>
                <button
                  onClick={autorizarDispositivoAtual}
                  disabled={salvando || !fingerprintAtual}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition shadow-[2px_2px_8px_rgba(5,150,105,0.4)] min-h-[44px]"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
                  <span>Autorizar Meu Navegador Atual Agora</span>
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => setFiltroDispositivo("todos")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-[#dfe8f5] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 hover:bg-slate-200 transition"
                >
                  <span>Restaurar Visão Geral (Todos)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {dispositivosFiltrados.map((d) => {
              const isEsteDispositivo = d.fingerprint === fingerprintAtual;
              const isMobile =
                (d.nome_dispositivo || "").toLowerCase().includes("android") ||
                (d.nome_dispositivo || "").toLowerCase().includes("ios") ||
                (d.nome_dispositivo || "").toLowerCase().includes("iphone");

              return (
                <TiltCard
                  key={d.id}
                  spotlightColor={
                    isEsteDispositivo
                      ? "rgba(16, 185, 129, 0.2)"
                      : isMobile
                        ? "rgba(168, 85, 247, 0.16)"
                        : "rgba(56, 189, 248, 0.16)"
                  }
                  className={`p-4 sm:p-5 rounded-3xl border transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl ${
                    isEsteDispositivo
                      ? "border-emerald-500/40 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.04]"
                      : "bg-[#fbf2e9] dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isEsteDispositivo
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {isMobile ? (
                        <Smartphone className="h-5 w-5" />
                      ) : (
                        <Laptop className="h-5 w-5" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {d.nome_dispositivo || "Navegador Web Confiável"}
                        </span>

                        {isEsteDispositivo && (
                          <span className="px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            Este Aparelho
                          </span>
                        )}

                        <span className="px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {d.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono text-[11px] truncate max-w-xs">
                          Fingerprint: {d.fingerprint.slice(0, 16)}...
                        </span>
                        <button
                          onClick={() => copiarFingerprint(d.fingerprint)}
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                          title="Copiar Hash Completo"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="h-3 w-3" />
                          Último acesso: {new Date(d.ultimo_acesso).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => revogar(d.id, d.nome_dispositivo)}
                      className="p-2.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition"
                      title="Revogar Autorização deste Dispositivo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </TiltCard>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Painel Explicativo de Segurança TOFU (Alta Rastreabilidade e Finalidade) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm">
          <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Finalidade Operacional da Política TOFU no {APP_NOME}</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          O protocolo <strong>Trust-On-First-Use (TOFU)</strong> combina assinatura de hardware do
          navegador (resolução, plataforma, entropia de CPU e criptografia Web Crypto SHA-256) para
          impedir que credenciais vazadas ou cookies sequestrados sejam utilizados em máquinas não
          reconhecidas. Cada autorização cria um vínculo imutável no banco de dados com proteção por
          Row Level Security (RLS).
        </p>
      </div>
    </div>
  );
}
