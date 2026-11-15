import { useState } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { X, Car, Plus, Clock, Sparkles, Info, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { clienteSolicitarNovoVeiculo } from "../services/conviteClienteService";
import { LISTA_TIPOS_VEICULO, type TipoVeiculo } from "@/features/monitor-gps/utils/vehicle3dIcons";

import { supabase } from "@/integrations/supabase/client";

interface ModalClienteSolicitarVeiculoProps {
  aberto: boolean;
  onFechar: () => void;
  onSucesso?: () => void;
  clienteIdProp?: string;
}

export function ModalClienteSolicitarVeiculo({
  aberto,
  onFechar,
  onSucesso,
  clienteIdProp,
}: ModalClienteSolicitarVeiculoProps) {
  const { session } = useAuth();
  const [tipoVeiculo, setTipoVeiculo] = useState<TipoVeiculo>("carro");
  const [placa, setPlaca] = useState("");
  const [chassi, setChassi] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [cor, setCor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!aberto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let clienteIdAlvo = clienteIdProp || session?.clienteId;

    // Resolução resiliente caso a sessão ainda não tenha o clienteId carregado
    if (!clienteIdAlvo && session?.userId) {
      try {
        const q = supabase.from("clientes").select("id").eq("user_id", session.userId);
        const { data: cData } = await q.maybeSingle();
        let c = cData;
        if (!c && session.email) {
          const resEmail = await supabase
            .from("clientes")
            .select("id")
            .ilike("email", session.email.trim())
            .maybeSingle();
          c = resEmail.data;
        }
        if (c?.id) {
          clienteIdAlvo = c.id;
        }
      } catch {
        /* ignorar */
      }
    }

    if (!clienteIdAlvo) {
      toast.error(
        "Identificador do cliente não localizado na sessão. Por favor, recarregue a página.",
      );
      return;
    }

    const isSemPlaca =
      tipoVeiculo === "maquina" ||
      tipoVeiculo === "trator" ||
      tipoVeiculo === "equipamento" ||
      tipoVeiculo === "moto_eletrica";

    if (!isSemPlaca && !placa.trim()) {
      toast.error("Informe a placa do novo veículo.");
      return;
    }

    if (!modelo.trim()) {
      toast.error("Informe o modelo do novo veículo.");
      return;
    }

    const rawChassi = chassi.trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFinal =
      placa.trim().toUpperCase() || (isSemPlaca ? sufixoChassi || "SEM PLACA" : "A DEFINIR");

    setSalvando(true);

    try {
      const res = await clienteSolicitarNovoVeiculo(
        clienteIdAlvo,
        {
          tipo_veiculo: tipoVeiculo,
          placa: placaFinal,
          chassi: rawChassi || undefined,
          marca: marca.trim() || undefined,
          modelo: modelo.trim(),
          ano: ano.trim() || undefined,
          cor: cor.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        },
        { userId: session?.userId, email: session?.email },
      );

      if (res.success) {
        toast.success(res.message);
        onSucesso?.();
        onFechar();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao solicitar novo veículo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
        <div className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/90 dark:bg-slate-900/90 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  Adicionar Novo Veículo
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Solicitação de novo rastreador para sua frota
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              disabled={salvando}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Aviso de Governança Operacional */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold text-[11px] text-amber-700 dark:text-amber-300">
                <Info className="h-4 w-4 shrink-0 text-amber-500" />
                <span>Processo de Adição e Instalação:</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Após o envio, a administração do GD Rastreamento atribuirá o instalador técnico
                credenciado e ajustará o valor da sua mensalidade contratual para incluir o novo
                veículo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Veículo
                </label>
                <select
                  value={tipoVeiculo}
                  onChange={(e) => setTipoVeiculo(e.target.value as TipoVeiculo)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                >
                  {LISTA_TIPOS_VEICULO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Placa (Opcional para Máquinas e Motos Elétricas) */}
              {(() => {
                const isSemPlaca =
                  tipoVeiculo === "maquina" ||
                  tipoVeiculo === "trator" ||
                  tipoVeiculo === "equipamento" ||
                  tipoVeiculo === "moto_eletrica";
                return (
                  <>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <span>Placa</span>
                        {isSemPlaca ? (
                          <span className="text-slate-500 font-normal">
                            (Opcional p/ máquinas e motos elétricas)
                          </span>
                        ) : (
                          <span className="text-rose-500">*</span>
                        )}
                      </label>
                      <input
                        type="text"
                        required={!isSemPlaca}
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                        placeholder={
                          isSemPlaca ? "Opcional (ou Chassi / Nº)" : "ABC-1234 ou ABC1D23"
                        }
                        maxLength={10}
                        className="w-full px-3 py-2 font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <span>Chassi</span>
                        {isSemPlaca ? (
                          <span className="text-slate-500 font-normal">(6 dígitos p/ mapa)</span>
                        ) : null}
                      </label>
                      <input
                        type="text"
                        value={chassi}
                        onChange={(e) => setChassi(e.target.value.toUpperCase())}
                        placeholder="6 últimos dígitos p/ mapa"
                        maxLength={25}
                        className="w-full px-3 py-2 font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>
                  </>
                );
              })()}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <span>Modelo</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Corolla, Onix, CG 160"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Marca / Fabricante
                </label>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Toyota, Chevrolet, Honda"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Ano de Fabricação
                </label>
                <input
                  type="text"
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  placeholder="Ex: 2024"
                  maxLength={4}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Cor Predominante
                </label>
                <input
                  type="text"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  placeholder="Ex: Prata, Preto, Branco"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex: Preferência por instalação aos sábados pela manhã"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 transition resize-none"
                />
              </div>
            </div>

            {/* Rodapé de Ações */}
            <div className="pt-3 border-t border-slate-300/60 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" />
                    <span>Enviando Solicitação...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Solicitar Instalação</span>
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
