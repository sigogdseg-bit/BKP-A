import { X, Check, Zap, Sparkles, Shield, ArrowUpRight, Headphones } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface UpgradePlanoModalProps {
  aberto: boolean;
  onFechar: () => void;
  recursoSolicitado?: string;
}

export function UpgradePlanoModal({ aberto, onFechar, recursoSolicitado }: UpgradePlanoModalProps) {
  if (!aberto) return null;

  const contatarSuporteUpgrade = (planoDesejado: string) => {
    const mensagem = encodeURIComponent(
      `Olá! Tenho interesse em fazer upgrade do meu plano GD Rastreamento para o plano ${planoDesejado.toUpperCase()}${
        recursoSolicitado ? ` para liberar o recurso de ${recursoSolicitado}` : ""
      }. Poderiam me informar as condições?`,
    );
    window.open(`https://wa.me/5524999999999?text=${mensagem}`, "_blank");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-y-auto">
        <div className="relative w-full max-w-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto">
          {/* Cabeçalho */}
          <div className="relative p-6 sm:p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 text-white overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 left-10 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

            <button
              onClick={onFechar}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              <span>GD Rastreamento Telemetria Avançada</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white">
              Eleve o Nível do Seu Monitoramento
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              {recursoSolicitado
                ? `O recurso de ${recursoSolicitado} faz parte dos planos de alta tecnologia do GD Rastreamento.`
                : "Desbloqueie telemetria de precisão, sensores giroscópicos, modo 3D e prevenção contra acidentes."}
            </p>
          </div>

          {/* Comparativo de Planos */}
          <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card Plano Pro */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5 flex flex-col justify-between hover:border-sky-500/60 transition">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    Plano Pro
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Alta Eficiência</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  Telemetria e Modo 3D
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                  Ideal para frotas comerciais que necessitam de controle elétrico e replay de
                  trajetos.
                </p>

                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>Voltagem contínua da bateria e alternador</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>Constelação de satélites GNSS e bússola de rumo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>Refazer trajetos em 2D e visualização 3D</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>20 dias de histórico contínuo</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => contatarSuporteUpgrade("Pro")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-lg shadow-sky-600/20"
              >
                <span>Solicitar Upgrade para o Pro</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            {/* Card Plano Master */}
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5 flex flex-col justify-between hover:border-emerald-500/70 transition relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 font-black text-[9px] uppercase tracking-widest px-3 py-0.5 rounded-bl-xl shadow-md">
                Mais Completo
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Plano Master
                  </span>
                  <span className="text-xs text-emerald-400 font-mono">Defesa Total</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                  Sensores Físicos e Acidentes
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                  Proteção máxima com telemetria inercial, detecção de colisões e capotamento.
                </p>

                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Todos os recursos do Plano Pro</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Acelerômetro triaxial com medição de Força G</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Giroscópio de inclinação angular do chassi</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Detecção instantânea de acidentes e colisão</span>
                  </li>
                  <li className="flex items-center gap-2 font-bold text-emerald-400">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Montagem de Trajeto Inteligente e Roteirização Otimizada</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>35 dias de histórico técnico</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => contatarSuporteUpgrade("Master")}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20"
              >
                <Zap className="h-4 w-4 fill-current" />
                <span>Solicitar Upgrade para o Master</span>
              </button>
            </div>
          </div>

          {/* Rodapé com Central de Suporte */}
          <div className="p-3.5 sm:p-4 bg-[#eaf0f8]/95 dark:bg-slate-950/80 border-t border-slate-300/60 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 shrink-0">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-emerald-500" />
              <span className="truncate">
                Atendimento GD Rastreamento 24h para migração instantânea
              </span>
            </div>
            <button
              onClick={onFechar}
              className="px-4 py-2 rounded-xl border border-slate-300/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer min-h-[44px]"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
