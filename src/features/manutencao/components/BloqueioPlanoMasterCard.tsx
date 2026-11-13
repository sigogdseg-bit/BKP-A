import { Sparkles, PhoneCall, ArrowRight } from "lucide-react";

export function BloqueioPlanoMasterCard() {
  const handleFalarComComercial = () => {
    const telefoneCentral = "24999999999";
    window.location.href = `tel:${telefoneCentral}`;
  };

  return (
    <div className="max-w-2xl mx-auto my-12 p-8 sm:p-10 rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/20 shadow-2xl text-center space-y-6 select-none animate-in fade-in zoom-in-95 duration-200">
      <div className="mx-auto h-16 w-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
        <Sparkles className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <span>Recurso Exclusivo Plano Master</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
          Manutenção Preventiva e Controle de Frotas
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          O módulo de controle preventivo, alertas de odômetro, troca de óleo, pastilhas e
          agendamento de revisões está disponível para assinantes do Plano Master.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1">
            Odômetro Preciso
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Controle de quilometragem e cálculo automático do momento exato de cada parada.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1">
            Avisos Antecipados
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Alertas preventivos programáveis antes do prazo para organizar a manutenção com calma.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1">
            Agendamento Rápido
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Solicitação de horários em oficinas credenciadas diretamente pelo aplicativo.
          </p>
        </div>
      </div>

      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={handleFalarComComercial}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
        >
          <PhoneCall className="h-4 w-4" />
          <span>Ligar para o Comercial e Ativar</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
