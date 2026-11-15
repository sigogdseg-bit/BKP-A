import { useState } from "react";
import { X, Calendar, Wrench, Clock, CheckCircle2, Bell } from "lucide-react";
import type { PlanoManutencaoItem, NovoAgendamentoPayload } from "../types";
import { solicitarAgendamento } from "../services/manutencaoService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface AgendamentoModalProps {
  itemManutencao?: PlanoManutencaoItem | null;
  itemPreSelecionado?: PlanoManutencaoItem | null;
  clienteId?: string;
  clienteNome?: string;
  clienteTelefone?: string;
  veiculoId?: string;
  placaVeiculo?: string;
  onFechar: () => void;
  onSucesso: () => void;
}

export function AgendamentoModal({
  itemManutencao,
  itemPreSelecionado,
  clienteId,
  clienteNome,
  clienteTelefone,
  veiculoId,
  placaVeiculo,
  onFechar,
  onSucesso,
}: AgendamentoModalProps) {
  const itemAlvo = itemPreSelecionado || itemManutencao;
  const [servico, setServico] = useState(itemAlvo?.item_manutencao || "Troca de Óleo e Filtro");
  const [dataSugerida, setDataSugerida] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  });
  const [turno, setTurno] = useState<"manha" | "tarde">("manha");
  const [oficina, setOficina] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const idVeiculoFinal = veiculoId || itemAlvo?.veiculo_id || "";
  const idClienteFinal = clienteId || itemAlvo?.cliente_id || "";
  const placaFinal = placaVeiculo || itemAlvo?.placa || "Veículo";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataSugerida) {
      toast.error("Selecione a data desejada para o atendimento.");
      return;
    }

    if (!idVeiculoFinal || !idClienteFinal) {
      toast.error("Identificação do veículo ou cliente indisponível para agendamento.");
      return;
    }

    setSalvando(true);
    const payload: NovoAgendamentoPayload = {
      cliente_id: idClienteFinal,
      veiculo_id: idVeiculoFinal,
      item_manutencao: servico,
      data_sugerida: dataSugerida,
      turno,
      oficina_parceira: oficina || undefined,
      observacoes: observacoes || undefined,
    };

    const ok = await solicitarAgendamento(payload);
    setSalvando(false);

    if (ok) {
      toast.success("Agendamento solicitado com sucesso! A equipe entrará em contato.");
      // Disparo de notificação imediata inter-dispositivos e Web Push
      await enviarNotificacaoViaBd({
        destinatarioClienteId: idClienteFinal,
        titulo: `🔧 Manutenção Agendada — ${placaFinal}`,
        mensagem: `Agendamento de ${servico} solicitado para ${dataSugerida.split("-").reverse().join("/")} (${turno === "manha" ? "Manhã" : "Tarde"}).${oficina ? ` Oficina: ${oficina}.` : ""}`,
        tipo: "manutencao",
        url: "/manutencao",
        placa: placaFinal,
      }).catch(() => {});
      onSucesso();
      onFechar();
    } else {
      toast.error("Falha ao enviar agendamento. Tente novamente.");
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl transition-colors flex flex-col">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>Agendar Manutenção Preventiva</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-xs">
                    {placaFinal}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Solicitação direta de revisão com horário reservado
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Serviço Preventivo
                </label>
                <select
                  value={servico}
                  onChange={(e) => setServico(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                >
                  <option value="Troca de Óleo e Filtro">Troca de Óleo e Filtro</option>
                  <option value="Pneus, Alinhamento e Balanceamento">
                    Pneus, Alinhamento e Balanceamento
                  </option>
                  <option value="Pastilhas de Freio e Fluidos">Pastilhas de Freio e Fluidos</option>
                  <option value="Revisão Geral e Correias">Revisão Geral e Correias</option>
                  <option value="Outros Serviços Preventivos">Outros Serviços Preventivos</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Data Sugerida
                  </label>
                  <input
                    type="date"
                    value={dataSugerida}
                    onChange={(e) => setDataSugerida(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 font-mono shadow-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Turno de Preferência
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTurno("manha")}
                      className={`py-2 rounded-xl text-xs font-semibold border transition shadow-xs ${
                        turno === "manha"
                          ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-400"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Manhã (08h - 12h)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTurno("tarde")}
                      className={`py-2 rounded-xl text-xs font-semibold border transition shadow-xs ${
                        turno === "tarde"
                          ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-400"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Tarde (13h - 17h)
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Oficina Parceira de Preferência (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Centro Automotivo Central, Oficina Parceira Credenciada..."
                  value={oficina}
                  onChange={(e) => setOficina(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observações ou Detalhes do Veículo
                </label>
                <textarea
                  rows={3}
                  placeholder="Descreva se percebeu algum ruído, vibração ou necessidade específica..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 resize-none shadow-xs"
                />
              </div>
            </div>

            {/* Ações do Rodapé Fixo */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 shadow-xs transition flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{salvando ? "Enviando..." : "Confirmar Agendamento"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
