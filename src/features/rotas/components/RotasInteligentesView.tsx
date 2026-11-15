import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Navigation, MapPin, ArrowLeft, Loader2, Sparkles, Route as RouteIcon } from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { TrajetoInteligenteModal } from "@/features/monitor-gps/components/TrajetoInteligenteModal";
import { listarMeusVeiculos } from "@/features/motoristas/services/motoristasService";
import type { VeiculoGps } from "@/features/monitor-gps/types";

export function RotasInteligentesView() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [modalAberto, setModalAberto] = useState(true);
  const [veiculoAtivo, setVeiculoAtivo] = useState<VeiculoGps | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (session?.isInstalador) {
      navigate({ to: "/inicio" });
      return;
    }

    let montado = true;
    async function carregar() {
      try {
        const veics = await listarMeusVeiculos();
        if (montado && veics.length > 0) {
          const v = veics[0];
          setVeiculoAtivo({
            id: v.veiculo_id || v.id,
            placa: v.veiculo_placa || "VEICULO",
            marca: "",
            modelo: v.veiculo_modelo || "",
            marca_modelo: v.veiculo_modelo || "",
            cor: v.veiculo_cor || "",
            latitude: -22.5235,
            longitude: -44.1042,
            ignicao: false,
            online: true,
            bloqueado: false,
            velocidade: 0,
            direcao: 0,
            atualizado_em: new Date().toISOString(),
          } as unknown as VeiculoGps);
        }
      } catch (err) {
        console.warn("Nenhum veículo inicial para ancorar rota:", err);
      } finally {
        if (montado) setCarregando(false);
      }
    }
    carregar();
    return () => {
      montado = false;
    };
  }, [session?.isInstalador, navigate]);

  const handleFecharModal = () => {
    setModalAberto(false);
  };

  if (session?.isInstalador) {
    return null;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none pb-12">
      {/* Banner Superior com Padrão Canônico Claro e Escuro */}
      <div className="relative overflow-hidden rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-6 sm:p-8 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl transition-all duration-300">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Roteirização Otimizada 2-Opt pelas Ruas</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Rotas e Trajetos Inteligentes
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Planejamento inteligente de viagens com múltiplos destinos, estimativa de combustível,
              eliminação de nós no trânsito e exportação direta para Waze e Google Maps.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#047857] transition cursor-pointer"
            >
              <Navigation className="h-4 w-4" />
              <span>Abrir Planejador de Rota</span>
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/inicio" })}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] hover:shadow-[3px_3px_8px_#b8c6da] dark:shadow-none active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo Informativo quando o modal for fechado */}
      {!modalAberto && (
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none flex items-center justify-center text-orange-600 dark:text-orange-400">
            <RouteIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Planejador de Rotas Pronto para Operar
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Adicione endereços de partida, paradas intermediárias e destino final. O algoritmo
              2-Opt organizará as ruas na melhor ordem para economizar tempo e combustível.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="px-6 py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-wider shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#047857] transition cursor-pointer"
            >
              Montar Novo Trajeto Agora
            </button>
          </div>
        </div>
      )}

      {/* Modal Canônico de Roteirização Inteligente */}
      {modalAberto && (
        <TrajetoInteligenteModal veiculo={veiculoAtivo} onFechar={handleFecharModal} />
      )}
    </div>
  );
}
