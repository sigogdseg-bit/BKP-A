import { useState, useEffect } from "react";
import {
  X,
  QrCode,
  Copy,
  Check,
  CheckCircle2,
  DollarSign,
  User,
  UserCheck,
  Car,
  AlertTriangle,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { Instalacao } from "../types";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "../utils/pixPayload";
import {
  marcarPagamentoInstalacao,
  marcarPagamentoLoteInstalador,
  marcarPagamentoPeloCliente,
} from "../services/instalacaoService";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalPagamentoPixInstalacaoProps {
  instalacao: Instalacao;
  todasInstalacoesDoInstalador: Instalacao[];
  onFechar: () => void;
  onPagamentoConcluido: () => void;
}

export function ModalPagamentoPixInstalacao({
  instalacao,
  todasInstalacoesDoInstalador,
  onFechar,
  onPagamentoConcluido,
}: ModalPagamentoPixInstalacaoProps) {
  // Filtra apenas as instalações pendentes deste instalador
  const pendentesDoInstalador = todasInstalacoesDoInstalador.filter(
    (i) => i.instalador_id === instalacao.instalador_id && i.status_pagamento === "pendente",
  );

  const valorIndividual = Number(instalacao.valor_instalacao) || 0;
  const valorTotalPendente = pendentesDoInstalador.reduce(
    (acc, curr) => acc + (Number(curr.valor_instalacao) || 0),
    0,
  );

  // Modo: 'individual' (apenas esta OS) ou 'total' (todas as pendentes do instalador)
  const [modo, setModo] = useState<"individual" | "total">("individual");
  const [chavePix, setChavePix] = useState(instalacao.instalador_chave_pix || "");
  const [comprovante, setComprovante] = useState("");
  const [copiadoPix, setCopiadoPix] = useState(false);
  const [copiadoChave, setCopiadoChave] = useState(false);

  const [payloadPix, setPayloadPix] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [gerandoQr, setGerandoQr] = useState(true);
  const [processandoQuitacao, setProcessandoQuitacao] = useState(false);

  const valorAtivo = modo === "individual" ? valorIndividual : valorTotalPendente;
  const qtdOrdensAtivas = modo === "individual" ? 1 : pendentesDoInstalador.length;

  useEffect(() => {
    async function atualizarQrCode() {
      if (!chavePix.trim()) {
        setPayloadPix("");
        setQrCodeDataUrl("");
        setGerandoQr(false);
        return;
      }

      setGerandoQr(true);
      const idReferencia =
        modo === "individual"
          ? `INST-${instalacao.placa.replace(/[^a-zA-Z0-9]/g, "")}`
          : `LOTE-${pendentesDoInstalador.length}ORDENS`;

      const payload = gerarPayloadPix({
        chavePix: chavePix.trim(),
        nomeRecebedor: instalacao.instalador_nome || "Instalador Credenciado",
        valor: valorAtivo,
        identificador: idReferencia,
      });

      setPayloadPix(payload);
      const dataUrl = await gerarQrCodePixDataUrl(payload);
      setQrCodeDataUrl(dataUrl);
      setGerandoQr(false);
    }

    atualizarQrCode();
  }, [modo, chavePix, valorAtivo, instalacao, pendentesDoInstalador.length]);

  const copiarPixCopiaECola = () => {
    if (!payloadPix) return;
    navigator.clipboard.writeText(payloadPix);
    setCopiadoPix(true);
    toast.success("Código PIX Copia e Cola copiado com sucesso!");
    setTimeout(() => setCopiadoPix(false), 2500);
  };

  const copiarChave = () => {
    if (!chavePix) return;
    navigator.clipboard.writeText(chavePix);
    setCopiadoChave(true);
    toast.success("Chave PIX copiada!");
    setTimeout(() => setCopiadoChave(false), 2500);
  };

  const handleConfirmarPagamento = async () => {
    setProcessandoQuitacao(true);
    try {
      if (modo === "individual") {
        const res = await marcarPagamentoInstalacao(instalacao.id, "pago", comprovante.trim());
        if (res.success) {
          toast.success(res.message);
          onPagamentoConcluido();
        } else {
          toast.error(res.message);
        }
      } else {
        const res = await marcarPagamentoLoteInstalador(
          instalacao.instalador_id,
          comprovante.trim(),
        );
        if (res.success) {
          toast.success(res.message);
          onPagamentoConcluido();
        } else {
          toast.error(res.message);
        }
      }
    } finally {
      setProcessandoQuitacao(false);
    }
  };

  const handleLiquidarPeloCliente = async () => {
    if (
      !window.confirm(
        `Confirma que a instalação da placa ${instalacao.placa} foi paga DIRETAMENTE pelo cliente ao instalador?\n\nO repasse será marcado como quitado com R$ 0,00 da empresa, sem impacto no livro-caixa.`,
      )
    ) {
      return;
    }
    setProcessandoQuitacao(true);
    try {
      const res = await marcarPagamentoPeloCliente(instalacao.id);
      if (res.success) {
        toast.success(res.message);
        onPagamentoConcluido();
      } else {
        toast.error(res.message);
      }
    } finally {
      setProcessandoQuitacao(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="relative w-full max-w-xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden rounded-3xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl my-auto flex flex-col transition-colors">
          {/* Header Fixo */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 shrink-0">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  Pagamento de Repasse via PIX
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Escaneie o QR Code no app do banco ou copie o código Pix.
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo com Rolagem Interna */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
            {/* Alternador de Modo: Individual vs Total Acumulado */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModo("individual")}
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition ${
                  modo === "individual"
                    ? "bg-white dark:bg-slate-950 text-orange-600 dark:text-orange-400 font-bold shadow-md border border-orange-500/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Car className="h-3.5 w-3.5" />
                  <span>Desta Instalação</span>
                </div>
                <div className="font-mono text-sm mt-0.5 font-black">
                  R$ {valorIndividual.toFixed(2)}
                </div>
                <span className="text-[10px] opacity-75 font-normal">Placa {instalacao.placa}</span>
              </button>

              <button
                type="button"
                onClick={() => setModo("total")}
                className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-xl transition ${
                  modo === "total"
                    ? "bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 font-bold shadow-md border border-indigo-500/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Total do Instalador</span>
                </div>
                <div className="font-mono text-sm mt-0.5 font-black">
                  R$ {valorTotalPendente.toFixed(2)}
                </div>
                <span className="text-[10px] opacity-75 font-normal">
                  {pendentesDoInstalador.length}{" "}
                  {pendentesDoInstalador.length === 1 ? "ordem pendente" : "ordens pendentes"}
                </span>
              </button>
            </div>

            {/* Card Informativo do Beneficiário */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" /> Instalador Beneficiário:
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {instalacao.instalador_nome}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Chave PIX:</span>
                {chavePix ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                      {chavePix}
                    </span>
                    <button
                      type="button"
                      onClick={copiarChave}
                      className="p-1 rounded-md text-slate-400 hover:text-orange-500 transition"
                      title="Copiar Chave PIX"
                    >
                      {copiadoChave ? (
                        <Check className="h-3.5 w-3.5 text-orange-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-rose-400 font-semibold text-[11px]">Não cadastrada</span>
                )}
              </div>

              {/* Campo para editar/inserir chave pix se necessário */}
              {!chavePix && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  <label className="text-[11px] font-semibold text-amber-500 block">
                    Informe a chave PIX do instalador para gerar o QR Code:
                  </label>
                  <input
                    type="text"
                    value={chavePix}
                    onChange={(e) => setChavePix(e.target.value)}
                    placeholder="CPF, E-mail, Celular ou Chave Aleatória"
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-amber-500/40 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* QR Code Container */}
            {chavePix ? (
              <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-center">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                    {modo === "individual"
                      ? "QR Code Desta Instalação"
                      : `QR Code Total em Lote (${qtdOrdensAtivas} ordens)`}
                  </div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-orange-600 dark:text-orange-400 mt-0.5">
                    R$ {valorAtivo.toFixed(2)}
                  </div>
                </div>

                {/* Imagem do QR Code */}
                <div className="p-3 rounded-2xl bg-white shadow-xl border border-slate-200 flex items-center justify-center">
                  {gerandoQr ? (
                    <div className="h-56 w-56 flex items-center justify-center text-xs text-slate-400 font-mono">
                      Gerando QR Code...
                    </div>
                  ) : qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="QR Code PIX Banco Central"
                      className="h-56 w-56 object-contain"
                    />
                  ) : (
                    <div className="h-56 w-56 flex items-center justify-center text-xs text-rose-400 text-center p-4">
                      Não foi possível renderizar o QR Code. Copie a chave acima.
                    </div>
                  )}
                </div>

                {/* Código PIX Copia e Cola */}
                {payloadPix && (
                  <div className="w-full space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                      <span>Pix Copia e Cola:</span>
                      <button
                        type="button"
                        onClick={copiarPixCopiaECola}
                        className="flex items-center gap-1 text-orange-500 hover:text-orange-400 font-bold transition"
                      >
                        {copiadoPix ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar Código Pix</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      onClick={copiarPixCopiaECola}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 break-all line-clamp-2 cursor-pointer hover:border-orange-500/50 transition"
                      title="Clique para copiar o código Pix completo"
                    >
                      {payloadPix}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-2">
                <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                <h3 className="font-bold text-sm text-amber-400">Chave PIX não cadastrada</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Cadastre a chave PIX no perfil do instalador em Usuários ou informe-a acima para
                  gerar o QR Code instantâneo.
                </p>
              </div>
            )}

            {/* Campo de Comprovante e Confirmação de Quitação */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                Código de Comprovante Bancário (Opcional):
              </label>
              <input
                type="text"
                value={comprovante}
                onChange={(e) => setComprovante(e.target.value)}
                placeholder="Ex: E18236120202609191630..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[44px]"
              />
            </div>
          </div>

          {/* Rodapé Fixo de Ação */}
          <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onFechar}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition flex items-center justify-center"
            >
              Fechar
            </button>

            {modo === "individual" && (
              <button
                type="button"
                disabled={processandoQuitacao}
                onClick={handleLiquidarPeloCliente}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition shadow-xs"
                title="Marcar que o cliente pagou diretamente ao instalador (sem débito para a empresa)"
              >
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>Pago pelo Cliente (R$ 0,00)</span>
              </button>
            )}

            <button
              type="button"
              disabled={processandoQuitacao}
              onClick={handleConfirmarPagamento}
              className={`w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-lg ${
                modo === "individual"
                  ? "bg-orange-600 hover:bg-orange-500 shadow-orange-600/20"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-center">
                {processandoQuitacao
                  ? "Registrando Quitação..."
                  : modo === "individual"
                    ? `Liquidar pela Empresa (R$ ${valorIndividual.toFixed(2)})`
                    : `Confirmar Quitação Total (${qtdOrdensAtivas} ordens - R$ ${valorTotalPendente.toFixed(2)})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
