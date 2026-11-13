import { useState } from "react";
import { AlertCircle, QrCode, X, Clock } from "lucide-react";
import type { StatusFinanceiroCliente } from "@/features/mensalidades/services/mensalidadeService";
import { ModalPixCobrancaInadimplente } from "@/features/financeiro/components/ModalPixCobrancaInadimplente";
import { APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";

interface BannerAvisoVencimentoProps {
  statusFinanceiro: StatusFinanceiroCliente;
  onAtualizado?: () => void;
}

export function BannerAvisoVencimento({
  statusFinanceiro,
  onAtualizado,
}: BannerAvisoVencimentoProps) {
  const [dispensado, setDispensado] = useState(false);
  const [modalPixAberto, setModalPixAberto] = useState(false);

  const fatura = statusFinanceiro.faturaAVencer;
  if (!statusFinanceiro.avisoVencimentoProximo || !fatura || dispensado) {
    return null;
  }

  const dias = fatura.diasParaVencer;
  const textoDias =
    dias === 0 ? "vence HOJE" : dias === 1 ? "vence AMANHÃ" : `vence em ${dias} dias`;

  const clienteInadimplenteAdapter = {
    id: fatura.id,
    cliente_id: "",
    nome_razao_social: "Minha Assinatura SIGO Guardião",
    telefone: "",
    totalDevido: fatura.valor,
    qtdMensalidadesAtrasadas: 1,
    maiorAtrasoDias: 0,
    mensalidadeMaisAntigaVencimento: fatura.dataVencimento,
    status_cliente: "ativo",
    mensalidades: [],
  };

  return (
    <>
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2 select-none animate-fadeIn">
        <div className="flex items-center gap-2 overflow-hidden">
          <Clock className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="truncate">
            <strong>Aviso Financeiro:</strong> Sua mensalidade de{" "}
            <strong>R$ {fatura.valor.toFixed(2).replace(".", ",")}</strong> {textoDias} (
            {fatura.dataVencimento.split("-").reverse().join("/")}).
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setModalPixAberto(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>Pagar com PIX</span>
          </button>

          <button
            onClick={() => setDispensado(true)}
            className="p-1 text-amber-400 hover:text-amber-200 transition"
            title="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {modalPixAberto && (
        <ModalPixCobrancaInadimplente
          cliente={clienteInadimplenteAdapter}
          chavePixPadrao={APP_CHAVE_PIX_PADRAO}
          onFechar={() => setModalPixAberto(false)}
          onLiquidar={() => {
            setModalPixAberto(false);
            onAtualizado?.();
          }}
        />
      )}
    </>
  );
}
