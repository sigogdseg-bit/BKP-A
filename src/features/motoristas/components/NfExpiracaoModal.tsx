import React, { useEffect, useState, useCallback } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { AlertTriangle, Download, CheckCircle, Clock, FileText, X } from "lucide-react";
import type { NfPendenteAlerta } from "../types";
import {
  buscarNfsPendentesCliente,
  downloadNF,
  excluirNFAposConfirmacao,
  registrarCienciaNF,
  executarLazyCleanup,
} from "../services/nfStorageService";

interface Props {
  clienteId: string;
}

// ============================================================================
// NfExpiracaoModal — Modal BLOQUEANTE de NFs aguardando ação do cliente
// Exibido automaticamente ao abrir o painel quando há NFs com +24h de upload
// sem download nem ciência confirmada.
// ============================================================================
export function NfExpiracaoModal({ clienteId }: Props) {
  const [pendentes, setPendentes] = useState<NfPendenteAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [visivel, setVisivel] = useState(false);

  const carregar = useCallback(async () => {
    if (!clienteId) return;
    setCarregando(true);
    try {
      // Primeiro roda o cleanup lazy (deleta expirados do Storage)
      await executarLazyCleanup(clienteId);
      const nfs = await buscarNfsPendentesCliente(clienteId);
      setPendentes(nfs);
      setVisivel(nfs.length > 0);
    } catch (err) {
      console.warn("[NfExpiracaoModal]", err);
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleDownload = async (nf: NfPendenteAlerta) => {
    setBaixando(nf.id);
    try {
      await downloadNF(nf.nf_foto_url, nf.id, nf.tipo);
      // Atualiza estado local para mostrar que já baixou
      setPendentes((prev) =>
        prev.map((p) => (p.id === nf.id ? { ...p, status: "baixado_pendente_exclusao" } : p)),
      );
    } catch (err: any) {
      alert(`Erro ao baixar arquivo: ${err.message}`);
    } finally {
      setBaixando(null);
    }
  };

  const handleExcluir = async (nf: NfPendenteAlerta) => {
    setConfirmando(nf.id);
    try {
      await excluirNFAposConfirmacao(nf.nf_foto_url, nf.id, nf.tipo);
      setPendentes((prev) => prev.filter((p) => p.id !== nf.id));
      if (pendentes.length <= 1) setVisivel(false);
    } catch (err: any) {
      alert(`Erro ao excluir arquivo: ${err.message}`);
    } finally {
      setConfirmando(null);
    }
  };

  const handleCiencia = async (nf: NfPendenteAlerta) => {
    setConfirmando(nf.id);
    try {
      await registrarCienciaNF(nf.id, nf.tipo);
      setPendentes((prev) =>
        prev.map((p) =>
          p.id === nf.id
            ? { ...p, status: "aguardando_expiracao", nf_ciente_em: new Date().toISOString() }
            : p,
        ),
      );
    } catch (err: any) {
      alert(`Erro ao registrar ciência: ${err.message}`);
    } finally {
      setConfirmando(null);
    }
  };

  const handleFechar = () => {
    // Só permite fechar se todos já têm ciência ou foram baixados
    const semCiencia = pendentes.filter((p) => p.status === "aguardando_ciencia");
    if (semCiencia.length > 0) {
      alert(
        `Você precisa confirmar ciência ou baixar ${semCiencia.length} arquivo(s) antes de fechar.\n\n` +
          "Arquivos sem ciência continuarão aparecendo a cada acesso.",
      );
      return;
    }
    setVisivel(false);
  };

  if (carregando || !visivel || pendentes.length === 0) return null;

  const temSemCiencia = pendentes.some((p) => p.status === "aguardando_ciencia");

  return (
    <ModalPortal>
      <div
        id="modal-nf-expiracao-overlay"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn"
      >
        <div
          id="modal-nf-expiracao"
          className="relative w-full max-w-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-amber-500/30 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl my-auto flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden transition-colors"
        >
          {/* Header */}
          <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/90 dark:bg-slate-950/60 backdrop-blur-md shrink-0">
            <div className="flex-shrink-0 mt-0.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-2.5 sm:p-3">
              <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-amber-300">
                {pendentes.length === 1
                  ? "1 nota fiscal aguardando sua ação"
                  : `${pendentes.length} notas fiscais aguardando sua ação`}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Seu motorista enviou notas fiscais que estão armazenadas temporariamente.{" "}
                <strong className="text-amber-600 dark:text-amber-300">
                  Baixe o arquivo agora ou confirme ciência para receber mais 24h.
                </strong>{" "}
                Após o prazo, o arquivo será apagado automaticamente pelo sistema.
              </p>
            </div>
            {!temSemCiencia && (
              <button
                id="btn-fechar-nf-expiracao"
                onClick={handleFechar}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Lista de NFs */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
            {pendentes.map((nf) => {
              const aguardandoCiencia = nf.status === "aguardando_ciencia";
              const aguardandoExpiracao = nf.status === "aguardando_expiracao";
              const uploadDate = new Date(nf.nf_upload_em);
              const horasPassadas = Math.floor(
                (Date.now() - uploadDate.getTime()) / (1000 * 60 * 60),
              );

              return (
                <div
                  key={nf.id}
                  id={`nf-pendente-${nf.id}`}
                  className={`rounded-xl border p-4 ${
                    aguardandoCiencia
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-amber-500/20 bg-amber-500/5"
                  }`}
                >
                  {/* Info do registro */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-200">
                          {nf.tipo === "abastecimento" ? "Abastecimento" : "Despesa"}{" "}
                          <span className="text-slate-400 font-normal">— {nf.veiculo_placa}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          Motorista: {nf.motorista_nome} · Valor:{" "}
                          {nf.valor.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}{" "}
                          · Data:{" "}
                          {new Date(nf.data_registro + "T00:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    {/* Badge de status */}
                    <div className="flex-shrink-0">
                      {aguardandoCiencia ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                          <Clock className="h-3 w-3" />
                          {horasPassadas}h sem ação
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <CheckCircle className="h-3 w-3" />
                          Ciência confirmada
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 flex-wrap">
                    {nf.status !== "baixado_pendente_exclusao" && (
                      <button
                        id={`btn-download-nf-${nf.id}`}
                        onClick={() => handleDownload(nf)}
                        disabled={baixando === nf.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg
                        bg-orange-600 hover:bg-orange-500 disabled:opacity-60
                        text-white font-medium transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {baixando === nf.id ? "Baixando…" : "Baixar Agora"}
                      </button>
                    )}

                    {nf.status === "baixado_pendente_exclusao" && (
                      <button
                        id={`btn-excluir-nf-${nf.id}`}
                        onClick={() => handleExcluir(nf)}
                        disabled={confirmando === nf.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg
                        bg-red-600 hover:bg-red-500 disabled:opacity-60
                        text-white font-medium transition-colors"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {confirmando === nf.id ? "Excluindo…" : "Arquivo OK, Apagar"}
                      </button>
                    )}

                    {aguardandoCiencia && (
                      <button
                        id={`btn-ciencia-nf-${nf.id}`}
                        onClick={() => handleCiencia(nf)}
                        disabled={confirmando === nf.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg
                        bg-amber-600/80 hover:bg-amber-600 disabled:opacity-60
                        text-white font-medium transition-colors"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {confirmando === nf.id ? "Registrando…" : "Estou Ciente — Apagar em 24h"}
                      </button>
                    )}

                    {aguardandoExpiracao && nf.nf_ciente_em && (
                      <p className="text-xs text-slate-500 self-center">
                        Será apagado em{" "}
                        {new Date(
                          new Date(nf.nf_ciente_em).getTime() + 24 * 60 * 60 * 1000,
                        ).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rodapé */}
          <div className="border-t border-slate-300/60 dark:border-slate-800 p-3.5 sm:p-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8]/90 dark:bg-slate-950/60 shrink-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {temSemCiencia
                ? "Confirme ciência em todos os arquivos para poder fechar este aviso."
                : "Todos os arquivos foram confirmados. Você pode fechar este aviso."}
            </p>
            <button
              id="btn-fechar-nf-expiracao-rodape"
              onClick={handleFechar}
              disabled={temSemCiencia}
              className={`min-h-[44px] w-full sm:w-auto text-xs sm:text-sm px-5 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center ${
                temSemCiencia
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                  : "bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white"
              }`}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
