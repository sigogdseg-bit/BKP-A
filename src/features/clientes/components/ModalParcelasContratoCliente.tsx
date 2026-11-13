import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  QrCode,
  Sparkles,
  RefreshCw,
  Calendar,
} from "lucide-react";
import type { Cliente } from "../types";
import {
  obterParcelasContratoCliente,
  gerarParcelasContratoCliente,
  type QuadroParcelasContrato,
  type ParcelaContratoItem,
} from "../services/clienteService";
import {
  atualizarVencimentoMensalidade,
  formatarParcelaMensalidade,
} from "@/features/mensalidades/services/mensalidadeService";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { APP_NOME, APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import { toast } from "sonner";

interface ModalParcelasContratoClienteProps {
  cliente: Cliente;
  onFechar: () => void;
}

export function ModalParcelasContratoCliente({
  cliente,
  onFechar,
}: ModalParcelasContratoClienteProps) {
  const [clienteAtual, setClienteAtual] = useState<Cliente>(cliente);
  const [quadro, setQuadro] = useState<QuadroParcelasContrato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<
    "todas" | "quitadas" | "atrasadas" | "atrasadas_pagas" | "futuras"
  >("todas");
  const [modalPix, setModalPix] = useState<{
    parcela: ParcelaContratoItem;
    payload: string;
    dataUrl: string;
  } | null>(null);
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [modalEditarVencimento, setModalEditarVencimento] = useState<{
    parcela: ParcelaContratoItem;
    novaData: string;
    escopo: "somente_esta" | "todas_futuras";
  } | null>(null);
  const [salvandoVencimento, setSalvandoVencimento] = useState(false);

  const handleSalvarVencimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEditarVencimento) return;
    const { parcela, novaData, escopo } = modalEditarVencimento;
    if (!novaData) {
      toast.error("Informe a nova data de vencimento.");
      return;
    }

    setSalvandoVencimento(true);
    try {
      const res = await atualizarVencimentoMensalidade(parcela.id, novaData, escopo);
      if (res.success) {
        toast.success(res.message);
        setModalEditarVencimento(null);
        await carregar();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar vencimento da parcela.");
    } finally {
      setSalvandoVencimento(false);
    }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: cDb } = await supabase
        .from("clientes")
        .select("id, nome_razao_social, dia_vencimento, valor_mensalidade")
        .eq("id", cliente.id)
        .maybeSingle();

      if (cDb) {
        setClienteAtual((prev) => ({ ...prev, ...cDb }));
      }

      const dados = await obterParcelasContratoCliente(cliente.id);
      setQuadro(dados);
    } catch (err) {
      console.error("Erro ao carregar parcelas:", err);
      toast.error("Falha ao carregar parcelas do contrato.");
    } finally {
      setCarregando(false);
    }
  }, [cliente.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleForcarSincronizacao = async () => {
    setSincronizando(true);
    try {
      const { data: cDb } = await supabase
        .from("clientes")
        .select("id, dia_vencimento, valor_mensalidade")
        .eq("id", cliente.id)
        .maybeSingle();

      const valorMensal =
        cDb?.valor_mensalidade !== null && cDb?.valor_mensalidade !== undefined
          ? Number(cDb.valor_mensalidade)
          : clienteAtual.valor_mensalidade;

      const res = await gerarParcelasContratoCliente(cliente.id, {
        mesesContrato: clienteAtual.meses_contrato || 12,
        diaVencimento: cDb?.dia_vencimento || clienteAtual.dia_vencimento || 10,
        valorMensalidade: valorMensal,
      });
      toast.success(res.message || "Parcelas sincronizadas com sucesso!");
      await carregar();
    } catch (e: any) {
      toast.error("Erro ao sincronizar parcelas.");
    } finally {
      setSincronizando(false);
    }
  };

  const handleGerarPix = async (p: ParcelaContratoItem) => {
    try {
      const valor = p.tipo === "atrasada" ? p.valorAtualizadoHoje : p.valorOriginal;
      const txid = `FAT${p.id
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .toUpperCase()}`;
      const payload = gerarPayloadPix({
        chavePix: APP_CHAVE_PIX_PADRAO,
        nomeRecebedor: APP_NOME,
        cidadeRecebedor: "BRASIL",
        valor,
        identificador: txid,
      });
      const dataUrl = await gerarQrCodePixDataUrl(payload);
      setModalPix({ parcela: p, payload, dataUrl });
    } catch {
      toast.error("Erro ao gerar QR Code PIX.");
    }
  };

  const listaExibida: ParcelaContratoItem[] = !quadro
    ? []
    : abaAtiva === "todas"
      ? quadro.parcelas
      : abaAtiva === "quitadas"
        ? quadro.quitadas
        : abaAtiva === "atrasadas"
          ? quadro.atrasadas
          : abaAtiva === "atrasadas_pagas"
            ? quadro.atrasadasPagas
            : quadro.futuras;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-fadeIn select-none">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/40">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Parcelas Contratadas</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    {clienteAtual.meses_contrato || 12} meses
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cliente:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {clienteAtual.nome_razao_social}
                  </strong>{" "}
                  · Vencimento todo dia {clienteAtual.dia_vencimento}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleForcarSincronizacao}
                disabled={sincronizando}
                className="h-8 px-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-300/70 dark:border-slate-700/60 flex items-center gap-1.5 text-xs font-bold transition disabled:opacity-50 shadow-xs"
                title="Forçar sincronização de parcelas contratuais"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
              <button
                onClick={onFechar}
                className="h-8 w-8 rounded-xl bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white border border-slate-300/70 dark:border-transparent flex items-center justify-center transition shadow-xs"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Resumo de Indicadores Financeiros do Contrato */}
          {quadro && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-white/40 dark:bg-slate-950/60 border-b border-slate-300/60 dark:border-slate-800/80 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 text-center shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                  Total Contrato
                </span>
                <strong className="text-slate-900 dark:text-slate-100 text-sm">
                  R$ {quadro.totalGeralContrato.toFixed(2)}
                </strong>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center shadow-xs">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 block font-sans">
                  Quitadas ({quadro.quitadas.length})
                </span>
                <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                  R$ {quadro.totalQuitado.toFixed(2)}
                </strong>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center shadow-xs">
                <span className="text-[10px] text-rose-700 dark:text-rose-400/80 block font-sans">
                  Atrasadas ({quadro.atrasadas.length})
                </span>
                <strong className="text-rose-600 dark:text-rose-400 text-sm">
                  R$ {quadro.totalAtrasadoAtualizadoHoje.toFixed(2)}
                </strong>
              </div>

              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-center shadow-xs">
                <span className="text-[10px] text-sky-700 dark:text-sky-400/80 block font-sans">
                  A Vencer ({quadro.futuras.length})
                </span>
                <strong className="text-sky-600 dark:text-sky-400 text-sm">
                  R$ {quadro.totalFuturoAVencer.toFixed(2)}
                </strong>
              </div>
            </div>
          )}

          {/* Abas de Navegação */}
          {quadro && (
            <div className="flex flex-wrap items-center gap-1.5 p-3 border-b border-slate-300/60 dark:border-slate-800 text-xs">
              {[
                { id: "todas", label: `Todas (${quadro.parcelas.length})` },
                { id: "quitadas", label: `Quitadas (${quadro.quitadas.length})` },
                { id: "atrasadas", label: `Em Atraso (${quadro.atrasadas.length})` },
                {
                  id: "atrasadas_pagas",
                  label: `Atrasadas Pagas (${quadro.atrasadasPagas.length})`,
                },
                { id: "futuras", label: `Futuras a Vencer (${quadro.futuras.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAbaAtiva(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition shadow-xs ${
                    abaAtiva === tab.id
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Lista de Parcelas */}
          <div className="p-3 sm:p-4 overflow-y-auto space-y-2 flex-1">
            {carregando ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
                Carregando parcelas contratuais...
              </div>
            ) : listaExibida.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono bg-white/60 dark:bg-slate-950/40 rounded-2xl border border-slate-300/60 dark:border-slate-800/60 p-6 space-y-3 shadow-xs">
                <p className="text-slate-800 dark:text-slate-300 font-sans text-sm font-semibold">
                  Nenhuma parcela encontrada nesta categoria.
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-sans">
                  Você pode sincronizar ou gerar automaticamente as parcelas do contrato para este
                  cliente.
                </p>
                <button
                  type="button"
                  onClick={handleForcarSincronizacao}
                  disabled={sincronizando}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition inline-flex items-center gap-2 shadow disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{sincronizando ? "Gerando..." : "Gerar Parcelas do Contrato Agora"}</span>
                </button>
              </div>
            ) : (
              listaExibida.map((p) => {
                const isAdesao = p.mesReferencia === 0;
                const parcelaFmt = isAdesao
                  ? ""
                  : formatarParcelaMensalidade(p.numeroParcela, p.totalParcelas);
                const refTexto = isAdesao
                  ? "Taxa de Instalação e Ativação"
                  : `${String(p.mesReferencia).padStart(2, "0")}/${p.anoReferencia}`;

                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition shadow-xs ${
                      p.tipo === "atrasada"
                        ? "bg-rose-500/10 dark:bg-rose-500/5 border-rose-500/30"
                        : p.tipo === "quitada"
                          ? "bg-emerald-500/10 dark:bg-emerald-500/5 border-emerald-500/20"
                          : p.tipo === "atrasada_paga"
                            ? "bg-sky-500/10 dark:bg-sky-500/5 border-sky-500/20"
                            : "bg-white dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800/80"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {parcelaFmt && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                            Parcela {parcelaFmt}
                          </span>
                        )}
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono">
                          {refTexto}
                        </span>

                        {p.tipo === "quitada" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Quitada</span>
                          </span>
                        )}

                        {p.tipo === "atrasada_paga" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Atrasada Paga</span>
                          </span>
                        )}

                        {p.tipo === "atrasada" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Em Atraso ({p.diasAtraso}d)</span>
                          </span>
                        )}

                        {p.tipo === "futura" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-500/15 text-slate-700 dark:text-slate-400 border border-slate-300/70 dark:border-slate-500/30 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Futura a Vencer</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                        <span>
                          Vencimento:{" "}
                          <strong className="text-slate-700 dark:text-slate-300">
                            {p.dataVencimento.split("-").reverse().join("/")}
                          </strong>
                        </span>

                        {p.dataPagamento && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Quitou em: {p.dataPagamento.split("-").reverse().join("/")}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Discriminação de juros e mora se estiver em atraso */}
                      {p.tipo === "atrasada" && p.diasAtraso > 0 && (
                        <div className="text-[10px] font-mono text-rose-600 dark:text-rose-400 pt-0.5">
                          Encargos do dia: Multa 2% (R$ {p.valorMulta.toFixed(2)}) + Juros 1% a.m.
                          (R$ {p.valorJuros.toFixed(2)})
                        </div>
                      )}

                      {/* Discriminação de pró-rata do mês de adesão */}
                      {p.tipo === "futura" &&
                        !isAdesao &&
                        p.valorOriginal > (clienteAtual.valor_mensalidade || 0) && (
                          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 pt-0.5">
                            Inclui pró-rata do mês de adesão (+R${" "}
                            {(p.valorOriginal - (clienteAtual.valor_mensalidade || 0)).toFixed(2)})
                          </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                      <div className="text-right font-mono">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                          {p.tipo === "atrasada" ? "Valor Atualizado" : "Valor"}
                        </span>
                        <strong
                          className={`text-xs sm:text-sm font-black ${
                            p.tipo === "quitada" || p.tipo === "atrasada_paga"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : p.tipo === "atrasada"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-800 dark:text-slate-200"
                          }`}
                        >
                          R${" "}
                          {p.tipo === "atrasada"
                            ? p.valorAtualizadoHoje.toFixed(2)
                            : p.valorOriginal.toFixed(2)}
                        </strong>
                        {p.tipo === "atrasada" && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">
                            Orig: R$ {p.valorOriginal.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {(p.tipo === "atrasada" || p.tipo === "futura") && (
                        <button
                          type="button"
                          onClick={() =>
                            setModalEditarVencimento({
                              parcela: p,
                              novaData: p.dataVencimento,
                              escopo: "todas_futuras",
                            })
                          }
                          className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-sky-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                          title="Alterar data de vencimento desta parcela"
                        >
                          <Calendar className="h-4 w-4" />
                        </button>
                      )}

                      {p.tipo === "atrasada" && (
                        <button
                          onClick={() => handleGerarPix(p)}
                          className="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1 shadow-xs"
                          title="Ver QR Code PIX com valor atualizado hoje"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>PIX</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Rodapé Informativo */}
          <div className="p-3 bg-[#eaf0f8]/80 dark:bg-slate-950/60 border-t border-slate-300/60 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Encargos legais calculados com base na data do acesso (Multa 2% e Juros 1% a.m.).
              </span>
            </div>
            <button
              onClick={onFechar}
              className="px-3 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs border border-slate-300/70 dark:border-slate-700 transition shadow-xs"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Modal QR Code PIX */}
        {modalPix && (
          <div className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl text-center text-slate-800 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-300/60 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  QR Code PIX
                </span>
                <button
                  onClick={() => setModalPix(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="bg-white p-3 rounded-2xl mx-auto w-fit border border-slate-300/60 dark:border-transparent shadow-inner">
                <img
                  src={modalPix.dataUrl}
                  alt="QR Code PIX"
                  loading="lazy"
                  decoding="async"
                  className="w-48 h-48 object-contain"
                />
              </div>

              <div className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
                R$ {modalPix.parcela.valorAtualizadoHoje.toFixed(2)}
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(modalPix.payload);
                  setCopiadoPix(true);
                  toast.success("Código PIX Copia e Cola copiado!");
                  setTimeout(() => setCopiadoPix(false), 2000);
                }}
                className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-xs"
              >
                <QrCode className="h-4 w-4" />
                <span>{copiadoPix ? "Copiado!" : "Copiar Código Copia e Cola"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Alterar Vencimento com Pergunta de Escopo */}
        {modalEditarVencimento && (
          <div className="fixed inset-0 z-[999999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto flex flex-col transition-colors">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Alterar Vencimento
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {clienteAtual.nome_razao_social || "Cliente"} ·{" "}
                      {modalEditarVencimento.parcela.mesReferencia === 0
                        ? "Competência Adesão"
                        : `${
                            formatarParcelaMensalidade(
                              modalEditarVencimento.parcela.numeroParcela,
                              modalEditarVencimento.parcela.totalParcelas,
                            )
                              ? `Parcela ${formatarParcelaMensalidade(
                                  modalEditarVencimento.parcela.numeroParcela,
                                  modalEditarVencimento.parcela.totalParcelas,
                                )} · `
                              : ""
                          }Competência ${String(modalEditarVencimento.parcela.mesReferencia).padStart(2, "0")}/${modalEditarVencimento.parcela.anoReferencia}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalEditarVencimento(null)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              {/* Form com Rolagem Interna */}
              <form
                onSubmit={handleSalvarVencimento}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Nova Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={modalEditarVencimento.novaData}
                      onChange={(e) =>
                        setModalEditarVencimento({
                          ...modalEditarVencimento,
                          novaData: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 font-mono shadow-xs font-bold"
                      required
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                      Vencimento atual:{" "}
                      {modalEditarVencimento.parcela.dataVencimento
                        ? modalEditarVencimento.parcela.dataVencimento
                            .split("-")
                            .reverse()
                            .join("/")
                        : "Não informado"}
                    </span>
                  </div>

                  {/* Pergunta de Escopo */}
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-2 text-xs">
                    <span className="font-bold text-sky-900 dark:text-sky-200 block text-[11px] uppercase tracking-wider">
                      Deseja aplicar a alteração em:
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                      Escolha se a mudança de data deve afetar apenas esta cobrança pontual ou
                      recalcular também todas as próximas mensalidades do cliente.
                    </p>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setModalEditarVencimento({
                            ...modalEditarVencimento,
                            escopo: "somente_esta",
                          })
                        }
                        className={`w-full p-2.5 rounded-xl border text-left transition ${
                          modalEditarVencimento.escopo === "somente_esta"
                            ? "bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-500 font-bold"
                            : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>{modalEditarVencimento.escopo === "somente_esta" ? "●" : "○"}</span>
                          <span>Somente este pagamento</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                          Altera apenas esta fatura pontual. As próximas cobranças continuam na data
                          antiga.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setModalEditarVencimento({
                            ...modalEditarVencimento,
                            escopo: "todas_futuras",
                          })
                        }
                        className={`w-full p-2.5 rounded-xl border text-left transition ${
                          modalEditarVencimento.escopo === "todas_futuras"
                            ? "bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-500 font-bold"
                            : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>
                            {modalEditarVencimento.escopo === "todas_futuras" ? "●" : "○"}
                          </span>
                          <span>Este e todos os futuros</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                          Altera esta fatura, atualiza o dia de vencimento no cadastro do cliente e
                          recalcula todas as cobranças futuras pendentes.
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rodapé Fixo */}
                <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalEditarVencimento(null)}
                    disabled={salvandoVencimento}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoVencimento}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{salvandoVencimento ? "Salvando..." : "Salvar Alterações"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
