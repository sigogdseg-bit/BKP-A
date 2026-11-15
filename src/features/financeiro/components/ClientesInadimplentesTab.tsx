import { useState, useMemo } from "react";
import {
  AlertTriangle,
  Search,
  Bell,
  DollarSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  UserX,
  Phone,
  Mail,
  FileText,
  Clock,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  QrCode,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { ClienteInadimplente, MensalidadeInadimplente } from "../types";
import { calcularResumoInadimplencia } from "../services/financeiroService";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { APP_NOME } from "@/shared/lib/version";
import { ModalPixCobrancaInadimplente } from "./ModalPixCobrancaInadimplente";
import { ModalGerenciarBloqueioAdmin } from "@/features/clientes/components/ModalGerenciarBloqueioAdmin";
import { formatarParcelaMensalidade } from "@/features/mensalidades/services/mensalidadeService";

interface ClientesInadimplentesTabProps {
  clientesInadimplentes: ClienteInadimplente[];
  carregando: boolean;
  onAtualizar: () => void;
  onLiquidarMensalidade?: (mensalidadeId: string) => Promise<void>;
  chavePixPadrao?: string;
}

export function ClientesInadimplentesTab({
  clientesInadimplentes,
  carregando,
  onAtualizar,
  onLiquidarMensalidade,
  chavePixPadrao,
}: ClientesInadimplentesTabProps) {
  const [busca, setBusca] = useState("");
  const [filtroAtraso, setFiltroAtraso] = useState<"todos" | "ate15" | "16a30" | "mais30">("todos");
  const [clienteExpandidoId, setClienteExpandidoId] = useState<string | null>(null);
  const [liquidandoId, setLiquidandoId] = useState<string | null>(null);
  const [clienteModalPix, setClienteModalPix] = useState<ClienteInadimplente | null>(null);
  const [clienteBloqueioAdm, setClienteBloqueioAdm] = useState<ClienteInadimplente | null>(null);

  const resumo = useMemo(() => {
    return calcularResumoInadimplencia(clientesInadimplentes);
  }, [clientesInadimplentes]);

  const filtrados = useMemo(() => {
    return clientesInadimplentes.filter((c) => {
      // Filtro de busca textual
      if (busca) {
        const termo = busca.toLowerCase();
        const matchNome = c.nome_razao_social.toLowerCase().includes(termo);
        const matchDoc = c.documento ? c.documento.includes(termo) : false;
        const matchTel = c.telefone ? c.telefone.includes(termo) : false;
        const matchEmail = c.email ? c.email.toLowerCase().includes(termo) : false;
        if (!matchNome && !matchDoc && !matchTel && !matchEmail) return false;
      }

      // Filtro por faixa de atraso
      if (filtroAtraso === "ate15" && c.maiorAtrasoDias > 15) return false;
      if (filtroAtraso === "16a30" && (c.maiorAtrasoDias <= 15 || c.maiorAtrasoDias > 30))
        return false;
      if (filtroAtraso === "mais30" && c.maiorAtrasoDias <= 30) return false;

      return true;
    });
  }, [clientesInadimplentes, busca, filtroAtraso]);

  const [notificandoId, setNotificandoId] = useState<string | null>(null);

  const handleNotificarCliente = async (c: ClienteInadimplente) => {
    const primeiroNome = c.nome_razao_social.split(" ")[0];
    try {
      setNotificandoId(c.cliente_id);
      toast.info(`Emitindo notificação imediata de fatura para ${primeiroNome}...`);
      const ok = await enviarNotificacaoViaBd({
        destinatarioClienteId: c.cliente_id,
        titulo: `Aviso de Vencimento do Plano — ${APP_NOME}`,
        mensagem: `Olá, ${primeiroNome}. Identificamos ${c.qtdMensalidadesAtrasadas} fatura(s) pendente(s) no valor total de R$ ${c.totalDevido.toFixed(2)}. Acesse o painel para regularizar via PIX.`,
        tipo: "cobranca",
        url: "/faturas",
      });

      if (ok) {
        toast.success(`Notificação imediata enviada para ${primeiroNome} com sucesso!`);
      } else {
        toast.error(`Falha ao emitir notificação imediata para ${primeiroNome}.`);
      }
    } catch (err: any) {
      toast.error(`Erro ao disparar notificação: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setNotificandoId(null);
    }
  };

  const handleLiquidarFatura = async (m: MensalidadeInadimplente) => {
    if (!onLiquidarMensalidade) return;
    if (
      !window.confirm(
        `Confirmar baixa manual da fatura de R$ ${m.valor.toFixed(2)} referente a ${m.mes_referencia}/${m.ano_referencia}?`,
      )
    ) {
      return;
    }

    try {
      setLiquidandoId(m.id);
      await onLiquidarMensalidade(m.id);
      toast.success("Mensalidade liquidada com sucesso!");
      onAtualizar();
    } catch (err) {
      console.error("Erro ao liquidar fatura:", err);
      toast.error("Falha ao registrar liquidacao da mensalidade.");
    } finally {
      setLiquidandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cards de Indicadores de Inadimplência */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Inadimplente */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-rose-500/20 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs mb-1">
            <span className="font-semibold">Total em Atraso</span>
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
              R$ {resumo.totalInadimplente.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Saldo vencido a receber
            </div>
          </div>
        </div>

        {/* Total Clientes Inadimplentes */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-amber-500/20 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs mb-1">
            <span className="font-semibold">Clientes Inadimplentes</span>
            <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {resumo.totalClientesInadimplentes}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Com faturas vencidas
            </div>
          </div>
        </div>

        {/* Faturas Vencidas */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800/80 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 text-xs mb-1">
            <span className="font-semibold">Faturas em Aberto</span>
            <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400">
              {resumo.totalMensalidadesVencidas}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Mensalidades acumuladas
            </div>
          </div>
        </div>

        {/* Maior Atraso */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-purple-500/20 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 text-xs mb-1">
            <span className="font-semibold">Maior Atraso</span>
            <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
              {resumo.maiorAtrasoGeralDias} <span className="text-xs font-normal">dias</span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
              Tempo da dívida mais antiga
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/40 border border-slate-300/60 dark:border-slate-800/80 p-3 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, documento ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto text-xs">
          <select
            value={filtroAtraso}
            onChange={(e) => setFiltroAtraso(e.target.value as any)}
            className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 shadow-xs"
          >
            <option value="todos">Todos os Atrasos ({clientesInadimplentes.length})</option>
            <option value="ate15">Até 15 dias de atraso</option>
            <option value="16a30">De 16 a 30 dias (Aviso prévio)</option>
            <option value="mais30">Mais de 30 dias (Bloqueio)</option>
          </select>

          <button
            onClick={onAtualizar}
            disabled={carregando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-medium shadow-xs"
            title="Atualizar lista"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${carregando ? "animate-spin text-amber-500" : ""}`}
            />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Lista de Inadimplentes */}
      <div className="space-y-3">
        {carregando ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            Localizando mensalidades vencidas no sistema...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-8 space-y-2 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
            <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="text-slate-900 dark:text-slate-200 font-bold text-sm">
              Nenhum cliente inadimplente encontrado!
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-xs max-w-md mx-auto">
              Todas as mensalidades estão rigorosamente em dia ou não há faturas vencidas no filtro
              selecionado.
            </p>
          </div>
        ) : (
          filtrados.map((c) => {
            const expandido = clienteExpandidoId === c.cliente_id;
            const atrasoCritico = c.maiorAtrasoDias > 30;
            const atrasoModerado = c.maiorAtrasoDias > 15 && c.maiorAtrasoDias <= 30;

            return (
              <div
                key={c.cliente_id}
                className={`rounded-2xl border transition-all ${
                  atrasoCritico
                    ? "bg-[#eaf0f8] dark:bg-slate-900/80 border-rose-500/40 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
                    : atrasoModerado
                      ? "bg-[#eaf0f8] dark:bg-slate-900/70 border-amber-500/40 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
                      : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/90 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    {/* Badge de Risco */}
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                        atrasoCritico
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : atrasoModerado
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                      }`}
                    >
                      <ShieldAlert className="h-5 w-5" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {c.nome_razao_social}
                        </span>

                        {/* Tag de dias de atraso */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            atrasoCritico
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                          }`}
                        >
                          {c.maiorAtrasoDias} dias de atraso
                        </span>

                        {/* Tag de status do cliente */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
                            c.status_cliente === "bloqueado"
                              ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800"
                              : "bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300/60 dark:border-slate-700"
                          }`}
                        >
                          {c.status_cliente === "bloqueado" ? "Acesso Bloqueado" : "Cliente Ativo"}
                        </span>
                      </div>

                      {/* Metadados: Telefone, Documento, Email */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        {c.telefone && (
                          <span className="flex items-center gap-1 text-slate-800 dark:text-slate-300">
                            <Phone className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>{c.telefone}</span>
                          </span>
                        )}
                        {c.documento && (
                          <span>
                            Doc:{" "}
                            <strong className="text-slate-800 dark:text-slate-300 font-mono">
                              {c.documento}
                            </strong>
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span>{c.email}</span>
                          </span>
                        )}
                      </div>

                      {/* Informações da mensalidade mais antiga */}
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 pt-0.5">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>
                          Vencimento mais antigo:{" "}
                          <strong className="text-slate-800 dark:text-slate-200">
                            {c.mensalidadeMaisAntigaVencimento.split("-").reverse().join("/")}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Total de faturas:{" "}
                          <strong className="text-amber-600 dark:text-amber-400">
                            {c.qtdMensalidadesAtrasadas}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Valor Total e Ações */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-300/60 dark:border-slate-800/80">
                    <div className="text-left lg:text-right pr-2">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase tracking-wider font-semibold">
                        Débito Total Acumulado
                      </span>
                      <span className="text-lg sm:text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                        R$ {c.totalDevido.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botão de Visualização e Cópia do PIX / QR Code */}
                      <button
                        onClick={() => setClienteModalPix(c)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition shadow-xs active:scale-95"
                        title="Visualizar QR Code Pix e copiar código Copia e Cola"
                      >
                        <QrCode className="h-4 w-4" />
                        <span className="hidden sm:inline">QR Code / Pix</span>
                      </button>

                      {/* Botão de Notificação Imediata ao Cliente */}
                      <button
                        onClick={() => handleNotificarCliente(c)}
                        disabled={notificandoId === c.cliente_id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Enviar notificação imediata de cobrança para o dispositivo do cliente"
                      >
                        {notificandoId === c.cliente_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bell className="h-4 w-4" />
                        )}
                        <span>
                          {notificandoId === c.cliente_id ? "Notificando..." : "Notificar Cliente"}
                        </span>
                      </button>

                      {/* Botão de Bloqueio Administrativo (Localização e Acesso) */}
                      <button
                        onClick={() => setClienteBloqueioAdm(c)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition shadow-xs active:scale-95"
                        title="Gerenciar bloqueio de localização e login do cliente"
                      >
                        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="hidden sm:inline">Bloqueios</span>
                      </button>

                      {/* Botão de Expandir Detalhes */}
                      <button
                        onClick={() => setClienteExpandidoId(expandido ? null : c.cliente_id)}
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300/60 dark:border-slate-800 transition"
                        title={expandido ? "Recolher faturas" : "Ver faturas detalhadas"}
                      >
                        {expandido ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Seção Expandida: Faturas Vencidas Individuais */}
                {expandido && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-2 border-t border-slate-300/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/40 rounded-b-2xl space-y-2.5">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-300 flex items-center justify-between">
                      <span>Detalhamento das Mensalidades em Aberto:</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.mensalidades.length} fatura(s)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {c.mensalidades.map((m) => {
                        const parcelaFmt = formatarParcelaMensalidade(
                          m.numero_parcela,
                          m.total_parcelas,
                        );
                        return (
                          <div
                            key={m.id}
                            className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-300/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shadow-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              {parcelaFmt && (
                                <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[11px] border border-indigo-500/30">
                                  Parcela {parcelaFmt}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] border border-slate-200 dark:border-slate-700">
                                Comp: {String(m.mes_referencia).padStart(2, "0")}/{m.ano_referencia}
                              </span>
                              <span className="text-slate-600 dark:text-slate-400">
                                Venc:{" "}
                                <strong className="text-slate-800 dark:text-slate-200">
                                  {m.data_vencimento.split("-").reverse().join("/")}
                                </strong>
                              </span>
                              <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                ({m.diasAtraso} dias de atraso)
                              </span>
                            </div>

                            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                              <span className="font-bold font-mono text-rose-600 dark:text-rose-300">
                                R$ {m.valor.toFixed(2)}
                              </span>

                              {onLiquidarMensalidade && (
                                <button
                                  onClick={() => handleLiquidarFatura(m)}
                                  disabled={liquidandoId === m.id}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition flex items-center gap-1 disabled:opacity-50"
                                  title="Dar baixa manual nesta mensalidade"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>{liquidandoId === m.id ? "Baixando..." : "Dar Baixa"}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Exibição de QR Code e Cópia e Cola do PIX */}
      {clienteModalPix && (
        <ModalPixCobrancaInadimplente
          cliente={clienteModalPix}
          chavePixPadrao={chavePixPadrao}
          onFechar={() => setClienteModalPix(null)}
          onLiquidar={() => {
            setClienteModalPix(null);
            onAtualizar();
          }}
        />
      )}

      {/* Modal de Gestão de Bloqueio Administrativo (Localização e Acesso) */}
      {clienteBloqueioAdm && (
        <ModalGerenciarBloqueioAdmin
          aberto={Boolean(clienteBloqueioAdm)}
          onFechar={() => setClienteBloqueioAdm(null)}
          cliente={
            {
              id: clienteBloqueioAdm.cliente_id,
              nome_razao_social: clienteBloqueioAdm.nome_razao_social,
            } as any
          }
          onSalvo={onAtualizar}
        />
      )}
    </div>
  );
}
