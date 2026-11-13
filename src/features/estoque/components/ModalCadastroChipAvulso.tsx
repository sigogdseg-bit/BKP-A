import { useState } from "react";
import { X, Radio, ScanLine, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";
import { cadastrarChipAvulsoEstoque } from "../services/rastreadorChipService";

interface ModalCadastroChipAvulsoProps {
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

const LISTA_OPERADORAS = [
  { valor: "Algar", label: "Algar Telecom" },
  { valor: "Vivo", label: "Vivo M2M" },
  { valor: "Claro", label: "Claro M2M" },
  { valor: "TIM", label: "TIM M2M" },
  { valor: "Arqia", label: "Arqia / Datora" },
  { valor: "Vodafone", label: "Vodafone / Kore" },
  { valor: "Multi-Operadora", label: "Multi-Operadora (eSIM)" },
  { valor: "Outra", label: "Outra Operadora" },
];

export function ModalCadastroChipAvulso({ open, onClose, onSalvo }: ModalCadastroChipAvulsoProps) {
  const [iccid, setIccid] = useState("");
  const [operadora, setOperadora] = useState("Algar");
  const [operadoraCustomizada, setOperadoraCustomizada] = useState(false);
  const [linha, setLinha] = useState("");

  const [scannerAberto, setScannerAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const iccidLimpo = iccid.replace(/[^0-9A-Z]/gi, "").toUpperCase();

    if (!iccidLimpo || iccidLimpo.length < 4) {
      toast.error("Informe um ICCID válido com pelo menos 4 dígitos alfanuméricos.");
      return;
    }

    setSalvando(true);
    try {
      const res = await cadastrarChipAvulsoEstoque({
        iccid: iccidLimpo,
        operadora: operadora.trim() || "Algar",
        linha: linha.trim() || undefined,
      });

      if (res.success) {
        toast.success(res.message);
        setIccid("");
        setLinha("");
        onSalvo();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao cadastrar chip.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <div
          className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden my-auto max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] flex flex-col transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Novo Chip M2M (Estoque Livre)
                </h2>
                <p className="text-xs text-slate-500">
                  Cadastre o chip da operadora para disponibilizá-lo para vínculos e instalações.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={salvando}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com rolagem interna */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-start gap-2.5 text-xs text-sky-800 dark:text-sky-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <p>
                <strong>Entrada Imediata no Estoque:</strong> O chip ficará disponível como{" "}
                <strong>Chip Livre</strong> e poderá ser selecionado com 1 clique ao cadastrar novos
                rastreadores ou compor ordens de instalação.
              </p>
            </div>

            {/* ICCID do Chip */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ICCID do Chip M2M *
                </label>
                <button
                  type="button"
                  onClick={() => setScannerAberto(true)}
                  className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                >
                  <ScanLine className="h-3 w-3" />
                  <span>Ler Código de Barras (Câmera)</span>
                </button>
              </div>
              <input
                type="text"
                value={iccid}
                onChange={(e) => setIccid(e.target.value.toUpperCase())}
                placeholder="Ex: 89553202100092787817"
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            {/* Operadora do Chip */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Operadora do Chip *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={operadoraCustomizada ? "Outra" : operadora}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "Outra") {
                      setOperadoraCustomizada(true);
                      setOperadora("");
                    } else {
                      setOperadoraCustomizada(false);
                      setOperadora(val);
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                >
                  {LISTA_OPERADORAS.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {operadoraCustomizada ? (
                  <input
                    type="text"
                    value={operadora}
                    onChange={(e) => setOperadora(e.target.value)}
                    placeholder="Nome da Operadora"
                    required
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                ) : (
                  <div className="flex items-center px-3 text-xs text-slate-400 font-medium">
                    Homologada para telemetria M2M
                  </div>
                )}
              </div>
            </div>

            {/* Linha / Telefone M2M */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Linha / Telefone M2M (Opcional)
              </label>
              <input
                type="text"
                value={linha}
                onChange={(e) => setLinha(e.target.value)}
                placeholder="Ex: 5516910197996"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            {/* Rodapé de Ações */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0 bg-[#eaf0f8]/90 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={onClose}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition flex items-center justify-center"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-sky-500/20 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>{salvando ? "Cadastrando..." : "Cadastrar no Estoque"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Leitor Óptico de Código de Barras / Câmera */}
      {scannerAberto && (
        <CameraBarcodeScannerModal
          open={scannerAberto}
          onClose={() => setScannerAberto(false)}
          onScanSucesso={(codigo) => {
            const limpo = codigo.replace(/[^0-9A-Z]/gi, "").toUpperCase();
            setIccid(limpo);
            toast.success(`ICCID lido pela câmera: ${limpo}`);
            setScannerAberto(false);
          }}
          titulo="Escanear Código de Barras do Chip (ICCID)"
          subtitulo="Aponte a câmera para o código de barras impresso no cartão do chip SIM/M2M."
        />
      )}
    </ModalPortal>
  );
}
