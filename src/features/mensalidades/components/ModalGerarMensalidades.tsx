import { useState } from "react";
import { Calendar, DollarSign, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { gerarMensalidadesLote } from "../services/mensalidadeService";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalGerarMensalidadesProps {
  onFechar: () => void;
  onSucesso: () => void;
  totalClientesAptos?: number;
}

const MESES = [
  { valor: 1, nome: "Janeiro" },
  { valor: 2, nome: "Fevereiro" },
  { valor: 3, nome: "Marco" },
  { valor: 4, nome: "Abril" },
  { valor: 5, nome: "Maio" },
  { valor: 6, nome: "Junho" },
  { valor: 7, nome: "Julho" },
  { valor: 8, nome: "Agosto" },
  { valor: 9, nome: "Setembro" },
  { valor: 10, nome: "Outubro" },
  { valor: 11, nome: "Novembro" },
  { valor: 12, nome: "Dezembro" },
];

export function ModalGerarMensalidades({
  onFechar,
  onSucesso,
  totalClientesAptos = 0,
}: ModalGerarMensalidadesProps) {
  const dataHoje = new Date();
  const [mes, setMes] = useState<number>(dataHoje.getMonth() + 1);
  const [ano, setAno] = useState<number>(dataHoje.getFullYear());
  const [salvando, setSalvando] = useState(false);

  const handleGerar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const res = await gerarMensalidadesLote(mes, ano);
      if (res.success) {
        toast.success(res.message);
        onSucesso();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha na geracao de mensalidades.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto flex flex-col transition-colors">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Gerar Mensalidades em Lote
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Criação automática para clientes ativos por competência
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Formulario */}
          <form onSubmit={handleGerar} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Mês de Referência
                  </label>
                  <select
                    value={mes}
                    onChange={(e) => setMes(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-orange-500"
                  >
                    {MESES.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {String(m.valor).padStart(2, "0")} - {m.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Ano de Referência
                  </label>
                  <input
                    type="number"
                    min={2024}
                    max={2035}
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-orange-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-orange-600 dark:text-orange-400">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>
                    Competência: {String(mes).padStart(2, "0")}/{ano}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  O sistema calculará a data de vencimento de cada cliente com base no seu dia de
                  vencimento cadastrado e no valor do contrato, sem duplicar cobranças já
                  existentes.
                </p>
                {totalClientesAptos > 0 && (
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold pt-1">
                    Clientes cadastrados na base: {totalClientesAptos}
                  </p>
                )}
              </div>
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Gerando...</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    <span>Gerar Mensalidades</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
