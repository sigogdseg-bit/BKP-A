import { useState } from "react";
import { X, Calendar, Clock, Check, Wrench, Car, MapPin, Send, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { instaladorDefinirAgendamento } from "@/features/clientes/services/clienteService";
import {
  instaladorDefinirAgendamentoInstalacao,
  instaladorSolicitarEnderecoCliente,
} from "@/features/instalacoes/services/instalacaoService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { sanitizarMensagemErro } from "@/shared/utils/erroAmigavel";
import { ModalPortal } from "@/shared/components/ModalPortal";

import {
  temKitDisponibilizado as verificarKitDisponibilizado,
  MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO,
} from "../utils/kitDisponibilizado";

interface ModalAgendamentoInstalacaoProps {
  cliente: {
    id: string;
    nome: string;
    userId?: string | null;
    user_id?: string | null;
    telefone?: string | null;
    data_agendamento?: string | null;
    hora_agendamento?: string | null;
    status_agendamento?: string | null;
  };
  instalacaoId?: string;
  veiculoPlaca?: string;
  veiculoModelo?: string;
  enderecoInstalador?: string | null;
  localTipoAtual?: "oficina" | "domicilio" | "local_veiculo";
  localEnderecoAtual?: string | null;
  solicitaEnderecoClienteAtual?: boolean;
  enderecoClienteInformadoAtual?: string | null;
  temKitDisponibilizado?: boolean;
  rastreadorImei?: string | null;
  onSalvo: () => void;
  onFechar: () => void;
}

export function ModalAgendamentoInstalacao({
  cliente,
  instalacaoId,
  veiculoPlaca,
  veiculoModelo,
  enderecoInstalador,
  localTipoAtual = "oficina",
  localEnderecoAtual,
  solicitaEnderecoClienteAtual = false,
  enderecoClienteInformadoAtual,
  temKitDisponibilizado = true,
  rastreadorImei,
  onSalvo,
  onFechar,
}: ModalAgendamentoInstalacaoProps) {
  const hojeStr = new Date().toISOString().split("T")[0];
  const [data, setData] = useState(cliente.data_agendamento || hojeStr);
  const [hora, setHora] = useState(cliente.hora_agendamento || "09:00");
  const [localTipo, setLocalTipo] = useState<"oficina" | "local_veiculo">(
    localTipoAtual === "local_veiculo" ? "local_veiculo" : "oficina",
  );
  const [enderecoCustom, setEnderecoCustom] = useState(
    enderecoClienteInformadoAtual || localEnderecoAtual || "",
  );
  const [solicitandoEndereco, setSolicitandoEndereco] = useState(false);
  const [jaSolicitouEndereco, setJaSolicitouEndereco] = useState(solicitaEnderecoClienteAtual);
  const [salvando, setSalvando] = useState(false);

  const obterDestUserId = async (): Promise<string | null> => {
    let destUserId = cliente.userId || cliente.user_id || null;
    if (!destUserId && cliente.id) {
      try {
        const { data: cRow } = await supabase
          .from("clientes")
          .select("user_id")
          .eq("id", cliente.id)
          .maybeSingle();
        destUserId = cRow?.user_id || null;
      } catch {
        // Fallback
      }
    }
    return destUserId;
  };

  const handleSolicitarEndereco = async () => {
    if (!instalacaoId) {
      toast.error("Identificador da instalação ausente para solicitar endereço.");
      return;
    }
    setSolicitandoEndereco(true);
    try {
      const res = await instaladorSolicitarEnderecoCliente(instalacaoId);
      if (res.success) {
        toast.success(
          "Solicitação de endereço enviada ao cliente com sucesso! O cliente receberá notificação imediata.",
        );
        setJaSolicitouEndereco(true);
        setLocalTipo("local_veiculo");

        const destUserId = await obterDestUserId();
        if (destUserId) {
          try {
            const canalAlvo = supabase.channel(`hunter_cliente_veics_inst_${destUserId}`);
            canalAlvo
              .send({
                type: "broadcast",
                event: "hunter_endereco_solicitado",
                payload: { instalacaoId, veiculoPlaca },
              })
              .catch(() => {});
          } catch (errCanal) {
            console.debug("Canal de broadcast opcional não disponível:", errCanal);
          }
        }
      } else {
        toast.error(sanitizarMensagemErro(res.message, "Não foi possível enviar a solicitação."));
      }
    } catch (err: any) {
      toast.error(sanitizarMensagemErro(err, "Erro ao solicitar endereço ao cliente."));
    } finally {
      setSolicitandoEndereco(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!temKitDisponibilizado) {
      toast.error(MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO);
      return;
    }

    if (!data) {
      toast.error("Selecione a data da instalação.");
      return;
    }
    if (!hora) {
      toast.error("Informe o horário da instalação.");
      return;
    }

    const enderecoFinal =
      localTipo === "oficina"
        ? enderecoInstalador || "Oficina do Instalador"
        : enderecoCustom.trim() || enderecoClienteInformadoAtual || "Local do Veículo (a combinar)";

    setSalvando(true);
    try {
      const res = instalacaoId
        ? await instaladorDefinirAgendamentoInstalacao(
            instalacaoId,
            data,
            hora,
            localTipo,
            enderecoFinal,
          )
        : await instaladorDefinirAgendamento(cliente.id, data, hora);

      if (res.success) {
        // Dispara mensagem WhatsApp via Central para o cliente com data, horário, endereço e opções 1, 2 e 3
        let waDisparado = false;
        if (typeof window !== "undefined" && typeof fetch === "function") {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;
            if (token) {
              const respWa = await fetch("/api/whatsapp/instalacao-evento", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  evento: "agendamento_definido",
                  instalacaoId: instalacaoId || null,
                  clienteId: cliente.id,
                  data,
                  hora,
                  localTipo,
                  localEndereco: enderecoFinal,
                }),
              });
              if (respWa.ok) {
                const jsonWa = await respWa.json().catch(() => null);
                waDisparado = Boolean(jsonWa?.enviado);
              }
            }
          } catch (errWa) {
            console.warn("Aviso ao enviar agendamento via WhatsApp da Central:", errWa);
          }
        }

        if (waDisparado) {
          toast.success(
            "Agendamento salvo e enviado para confirmação do cliente via WhatsApp da Central!",
          );
        } else {
          toast.success(res.message || "Agendamento confirmado com sucesso!");
        }

        const destUserId = await obterDestUserId();
        // A RPC instalador_definir_agendamento_instalacao já grava atomicamente no BD
        // e notifica cliente, operadores e administradores.
        // Apenas no fallback legado sem instalacaoId enviamos pelo frontend:
        if (!instalacaoId) {
          await enviarNotificacaoViaBd({
            destinatarioUserId: destUserId,
            destinatarioClienteId: cliente.id,
            titulo: `📅 Instalação Agendada${veiculoPlaca ? `: ${veiculoPlaca}` : ""}`,
            mensagem: `A instalação do seu rastreador ${veiculoPlaca ? `no veículo ${veiculoPlaca} ` : ""}foi agendada para ${data.split("-").reverse().join("/")} às ${hora} (${localTipo === "local_veiculo" ? "Local do Veículo" : "Oficina"}: ${enderecoFinal}).`,
            tipo: "agendamento",
            url: "/login",
            placa: veiculoPlaca,
          }).catch(() => {});
        }

        if (destUserId) {
          try {
            const canalAlvo = supabase.channel(`hunter_cliente_veics_inst_${destUserId}`);
            canalAlvo
              .send({
                type: "broadcast",
                event: "hunter_agendamento_atualizado",
                payload: { instalacaoId, data, hora, enderecoFinal, veiculoPlaca },
              })
              .catch(() => {});
          } catch (errCanal) {
            console.debug("Canal de broadcast opcional não disponível:", errCanal);
          }
        }

        onSalvo();
      } else {
        toast.error(
          sanitizarMensagemErro(res.message, "Não foi possível confirmar o agendamento."),
        );
      }
    } catch (err: any) {
      console.error("Erro ao salvar agendamento:", err);
      toast.error(sanitizarMensagemErro(err, "Erro ao confirmar agendamento no banco de dados."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col transition-colors">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white/70 dark:bg-slate-900/80 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Agendar Instalação Técnica
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Defina data, horário e local de atendimento individual
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              {/* Card do Veículo (se agendamento específico de veículo) */}
              {veiculoPlaca && (
                <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1">
                    <Car className="h-3 w-3" />
                    <span>Veículo a Instalar</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-sm px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-500/30 text-slate-900 dark:text-slate-100">
                      {veiculoPlaca}
                    </span>
                    {veiculoModelo && (
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {veiculoModelo}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Card do Cliente */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
                  Cliente
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {cliente.nome}
                </div>
                {cliente.telefone && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                    Telefone: {cliente.telefone}
                  </div>
                )}
              </div>

              {/* Data e Horário */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-amber-500" />
                    <span>Data *</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={hojeStr}
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500 shadow-inner min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <span>Horário *</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500 shadow-inner min-h-[44px]"
                  />
                </div>
              </div>

              {/* Seletor de Local de Atendimento */}
              <div className="space-y-2 pt-1 border-t border-slate-200/80 dark:border-slate-800">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Local de Atendimento</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalTipo("oficina")}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1 min-h-[64px] ${
                      localTipo === "oficina"
                        ? "bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/30 text-amber-950 dark:text-amber-100"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-amber-500" />
                        <span>Na Minha Oficina</span>
                      </span>
                      {localTipo === "oficina" && (
                        <Check className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {enderecoInstalador || "Endereço cadastrado no seu perfil"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocalTipo("local_veiculo")}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1 min-h-[64px] ${
                      localTipo === "local_veiculo"
                        ? "bg-sky-500/15 border-sky-500/80 ring-2 ring-sky-500/30 text-sky-950 dark:text-sky-100"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5 text-sky-500" />
                        <span>No Local do Veículo</span>
                      </span>
                      {localTipo === "local_veiculo" && (
                        <Check className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      Atendimento domiciliar / na garagem
                    </span>
                  </button>
                </div>

                {/* Bloco quando Local do Veículo está selecionado */}
                {localTipo === "local_veiculo" && (
                  <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 space-y-2 mt-2">
                    {enderecoClienteInformadoAtual ? (
                      <div>
                        <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <span className="flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                            <span>Endereço informado pelo cliente:</span>
                          </span>
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-2 rounded-xl border border-emerald-500/30 font-mono">
                          {enderecoClienteInformadoAtual}
                        </div>
                      </div>
                    ) : jaSolicitouEndereco ? (
                      <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>Endereço já solicitado ao cliente!</strong>
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                            O cliente visualiza o pedido de endereço no app. Assim que ele enviar,
                            você receberá uma notificação imediata.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-sky-800 dark:text-sky-300">
                          Precisa que o cliente forneça o endereço onde o carro estará?
                        </div>
                        {instalacaoId && (
                          <button
                            type="button"
                            onClick={handleSolicitarEndereco}
                            disabled={solicitandoEndereco}
                            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 shrink-0 min-h-[36px]"
                          >
                            <Send className="h-3 w-3" />
                            <span>
                              {solicitandoEndereco ? "Solicitando..." : "Solicitar Endereço"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Input manual de endereço se necessário */}
                    <div className="space-y-1 pt-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Endereço de Atendimento (Rua, Número, Bairro, Cidade):
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Rua das Flores, 120 - Bairro Centro"
                        value={enderecoCustom}
                        onChange={(e) => setEnderecoCustom(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-sky-500 min-h-[40px]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {!temKitDisponibilizado ? (
                <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2.5 font-bold leading-relaxed">
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
                  <span>
                    Bloqueio de Agendamento: Nenhum kit físico foi disponibilizado para este veículo
                    ainda. O operador deve vincular e disponibilizar o rastreador no estoque antes
                    de marcar a data com o cliente.
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Ao confirmar, o status no banco de dados mudará para <strong>Agendado</strong> e o
                  cliente receberá <strong>notificação imediata no celular/dispositivo</strong> com
                  data, horário e local do atendimento.
                </div>
              )}
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-end gap-2.5">
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onFechar}
                  className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando || !temKitDisponibilizado}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {!temKitDisponibilizado
                      ? "Aguardando Kit"
                      : salvando
                        ? "Salvando..."
                        : "Confirmar Agendamento"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
