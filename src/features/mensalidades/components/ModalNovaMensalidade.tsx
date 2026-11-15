import { useState, useEffect } from "react";
import { DollarSign, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Cliente } from "@/features/clientes/types";
import { criarMensalidadeManual } from "../services/mensalidadeService";
import type { StatusMensalidade } from "../types";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalNovaMensalidadeProps {
  clientes: Cliente[];
  onFechar: () => void;
  onSucesso: () => void;
}

export function ModalNovaMensalidade({ clientes, onFechar, onSucesso }: ModalNovaMensalidadeProps) {
  const dataHoje = new Date();
  const mesAtual = dataHoje.getMonth() + 1;
  const anoAtual = dataHoje.getFullYear();

  const [clienteId, setClienteId] = useState<string>("");
  const [mes, setMes] = useState<number>(mesAtual);
  const [ano, setAno] = useState<number>(anoAtual);
  const [valor, setValor] = useState<number>(79.9);
  const [dataVencimento, setDataVencimento] = useState<string>("");
  const [status, setStatus] = useState<StatusMensalidade>("pendente");
  const [salvando, setSalvando] = useState(false);

  // Inicializar com o primeiro cliente se houver
  useEffect(() => {
    if (clientes.length > 0 && !clienteId) {
      const primeiro = clientes[0];
      setClienteId(primeiro.id);
      setValor(primeiro.valor_mensalidade || 79.9);

      const ultimoDia = new Date(anoAtual, mesAtual, 0).getDate();
      const diaVenc = Math.min(Math.max(primeiro.dia_vencimento || 10, 1), ultimoDia);
      setDataVencimento(
        `${anoAtual}-${String(mesAtual).padStart(2, "0")}-${String(diaVenc).padStart(2, "0")}`,
      );
    }
  }, [clientes, clienteId, anoAtual, mesAtual]);

  const handleClienteChange = (id: string) => {
    setClienteId(id);
    const cli = clientes.find((c) => c.id === id);
    if (cli) {
      setValor(cli.valor_mensalidade || 79.9);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const diaVenc = Math.min(Math.max(cli.dia_vencimento || 10, 1), ultimoDia);
      setDataVencimento(
        `${ano}-${String(mes).padStart(2, "0")}-${String(diaVenc).padStart(2, "0")}`,
      );
    }
  };

  const handleMesAnoChange = (novoMes: number, novoAno: number) => {
    setMes(novoMes);
    setAno(novoAno);
    const cli = clientes.find((c) => c.id === clienteId);
    const diaBase = cli?.dia_vencimento || 10;
    const ultimoDia = new Date(novoAno, novoMes, 0).getDate();
    const diaVenc = Math.min(Math.max(diaBase, 1), ultimoDia);
    setDataVencimento(
      `${novoAno}-${String(novoMes).padStart(2, "0")}-${String(diaVenc).padStart(2, "0")}`,
    );
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) {
      toast.error("Selecione um cliente.");
      return;
    }

    if (!dataVencimento) {
      toast.error("Informe a data de vencimento.");
      return;
    }

    if (valor <= 0) {
      toast.error("O valor da mensalidade deve ser maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      const res = await criarMensalidadeManual({
        cliente_id: clienteId,
        mes_referencia: mes,
        ano_referencia: ano,
        valor,
        data_vencimento: dataVencimento,
        status,
      });

      if (res.success) {
        toast.success(res.message);
        onSucesso();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar cobranca.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto flex flex-col transition-colors">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs shrink-0">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Nova Mensalidade Manual
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Lançamento avulso de cobrança para cliente
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

          {/* Formulario com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSalvar} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Cliente Destino
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => handleClienteChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500"
                  required
                >
                  {clientes.length === 0 ? (
                    <option value="">Nenhum cliente cadastrado</option>
                  ) : (
                    clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome_razao_social} {c.documento ? `(${c.documento})` : ""} - Venc. dia{" "}
                        {c.dia_vencimento}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Mês de Referência
                  </label>
                  <select
                    value={mes}
                    onChange={(e) => handleMesAnoChange(Number(e.target.value), ano)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
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
                    onChange={(e) => handleMesAnoChange(mes, Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={valor}
                    onChange={(e) => setValor(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Situação Inicial
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("pendente")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      status === "pendente"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs"
                        : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Pendente
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("pago")}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      status === "pago"
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-xs"
                        : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Já Pago (Dar Baixa)
                  </button>
                </div>
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
                disabled={salvando || clientes.length === 0}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    <span>Cadastrar Mensalidade</span>
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
