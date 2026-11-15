import { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Cpu,
  Radio,
  ScanLine,
  Check,
  AlertCircle,
  Link,
  Unlink,
  Trash2,
  ChevronDown,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";
import {
  salvarRastreadorComChip,
  desvincularChipRastreador,
  excluirRastreadorEstoque,
  listarTodosDispositivosEstoque,
  type DispositivoEstoqueCompleto,
  type ChipDisponivel,
} from "../services/rastreadorChipService";

interface ModalSerialRastreadorChipProps {
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
  dispositivoEdicao?: DispositivoEstoqueCompleto | null;
  chipsDisponiveis?: ChipDisponivel[];
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

export function ModalSerialRastreadorChip({
  open,
  onClose,
  onSalvo,
  dispositivoEdicao,
  chipsDisponiveis = [],
}: ModalSerialRastreadorChipProps) {
  const isEdicao = Boolean(dispositivoEdicao?.id);

  const [imei, setImei] = useState(dispositivoEdicao?.imei || "");
  const [modelo, setModelo] = useState(dispositivoEdicao?.modelo || "J16 4G");
  const [iccid, setIccid] = useState(dispositivoEdicao?.iccid || "");
  const [operadora, setOperadora] = useState(dispositivoEdicao?.operadora || "Vivo");
  const [operadoraCustomizada, setOperadoraCustomizada] = useState(false);
  const [linha, setLinha] = useState(dispositivoEdicao?.linha || "");

  const [scannerAbertoPara, setScannerAbertoPara] = useState<"imei" | "iccid" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [desvinculando, setDesvinculando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [listaChipsLivres, setListaChipsLivres] = useState<ChipDisponivel[]>(chipsDisponiveis);
  const [dropdownChipsAberto, setDropdownChipsAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora ou pressionar Escape
  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownChipsAberto(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdownChipsAberto(false);
      }
    }
    if (dropdownChipsAberto) {
      document.addEventListener("mousedown", handleClickFora);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickFora);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [dropdownChipsAberto]);

  // Sincronizar ou carregar chips disponíveis do banco ao abrir o modal
  useEffect(() => {
    if (open) {
      if (chipsDisponiveis && chipsDisponiveis.length > 0) {
        setListaChipsLivres(chipsDisponiveis);
      } else {
        listarTodosDispositivosEstoque()
          .then((res) => {
            if (res?.chips_disponiveis) {
              setListaChipsLivres(res.chips_disponiveis);
            }
          })
          .catch(() => {});
      }
    }
  }, [open, chipsDisponiveis]);

  useEffect(() => {
    if (dispositivoEdicao) {
      setImei(dispositivoEdicao.imei || "");
      setModelo(dispositivoEdicao.modelo || "J16 4G");
      setIccid(dispositivoEdicao.iccid || "");
      const op = dispositivoEdicao.operadora || "Vivo";
      setOperadora(op);
      setOperadoraCustomizada(
        op !== "" &&
          !LISTA_OPERADORAS.filter((o) => o.valor !== "Outra").some(
            (o) => o.valor.toLowerCase() === op.toLowerCase(),
          ),
      );
      setLinha(dispositivoEdicao.linha || "");
    } else {
      setImei("");
      setModelo("J16 4G");
      setIccid("");
      setOperadora("Vivo");
      setOperadoraCustomizada(false);
      setLinha("");
    }
  }, [dispositivoEdicao, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const imeiLimpo = imei.replace(/\D/g, "");

    if (!imeiLimpo || imeiLimpo.length < 8) {
      toast.error("Informe um IMEI válido com pelo menos 8 dígitos.");
      return;
    }

    setSalvando(true);
    try {
      const res = await salvarRastreadorComChip({
        imei: imeiLimpo,
        modelo: modelo.trim() || "J16 4G",
        iccid: iccid.trim() || undefined,
        operadora: operadora.trim() || "Vivo",
        linha: linha.trim() || undefined,
        rastreadorId: dispositivoEdicao?.id,
      });

      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao salvar serial.");
    } finally {
      setSalvando(false);
    }
  };

  const handleDesvincular = async () => {
    if (!dispositivoEdicao?.id) return;
    if (
      !confirm(
        "Deseja realmente desvincular o chip deste rastreador? Ele voltará a ficar pendente.",
      )
    ) {
      return;
    }

    setDesvinculando(true);
    try {
      const res = await desvincularChipRastreador(dispositivoEdicao.id);
      if (res.success) {
        toast.success(res.message);
        setIccid("");
        setLinha("");
        onSalvo();
      } else {
        toast.error(res.message);
      }
    } finally {
      setDesvinculando(false);
    }
  };

  const handleExcluir = async () => {
    if (!dispositivoEdicao?.id) return;
    const confirmacao = window.confirm(
      `Deseja realmente excluir o rastreador IMEI ${dispositivoEdicao.imei} do estoque?\n\nEsta ação removerá o cadastro do equipamento. Se houver chip vinculado, ele será liberado de volta ao estoque de chips.`,
    );
    if (!confirmacao) return;

    setExcluindo(true);
    try {
      const res = await excluirRastreadorEstoque(dispositivoEdicao.id, dispositivoEdicao.imei);
      if (res.success) {
        toast.success(res.message);
        onSalvo();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir equipamento.");
    } finally {
      setExcluindo(false);
    }
  };

  const handleSelecionarChipExistente = (c: ChipDisponivel) => {
    setIccid(c.iccid);
    const op = c.operadora || "Algar";
    setOperadora(op);
    setOperadoraCustomizada(
      op !== "" &&
        !LISTA_OPERADORAS.filter((o) => o.valor !== "Outra").some(
          (o) => o.valor.toLowerCase() === op.toLowerCase(),
        ),
    );
    if (c.linha) setLinha(c.linha);
    setDropdownChipsAberto(false);
    toast.info(`Chip ${c.iccid} selecionado.`);
  };

  const chipsFiltrados = useMemo(() => {
    if (!iccid.trim()) return listaChipsLivres;
    const termo = iccid.trim().toLowerCase();
    return listaChipsLivres.filter(
      (c) =>
        c.iccid.toLowerCase().includes(termo) ||
        (c.linha && c.linha.toLowerCase().includes(termo)) ||
        c.operadora.toLowerCase().includes(termo),
    );
  }, [listaChipsLivres, iccid]);

  if (!open) return null;

  const estaLiberado = Boolean(imei.trim() && iccid.trim());

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-200">
        <div className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto transition-colors">
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {isEdicao
                    ? "Editar Serial e Vínculo de Chip"
                    : "Novo Rastreador e Vínculo de Chip"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Cadastre o IMEI e vincule o ICCID para liberar o equipamento para instalação.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Status de Liberação */}
            <div
              className={`p-3 rounded-2xl border flex items-center gap-2.5 text-xs transition ${
                estaLiberado
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
              }`}
            >
              {estaLiberado ? (
                <>
                  <Check className="h-4 w-4 text-orange-500 shrink-0" />
                  <div>
                    <strong className="font-black">Pronto para Instalação:</strong> IMEI e ICCID
                    preenchidos. O equipamento estará disponível para o operador compor o kit.
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <div>
                    <strong className="font-bold">Aguardando Vínculo Completo:</strong> O rastreador
                    só é liberado para instalação quando tiver o IMEI e o ICCID vinculados.
                  </div>
                </>
              )}
            </div>

            {/* Seção 1: Rastreador (IMEI e Modelo) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                <Cpu className="h-3.5 w-3.5 text-amber-500" />
                <span>Dados do Rastreador Físico</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      IMEI do Rastreador *
                    </label>
                    <button
                      type="button"
                      onClick={() => setScannerAbertoPara("imei")}
                      className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      <ScanLine className="h-3.5 w-3.5" />
                      <span>Ler Código de Barras (Câmera)</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder="Ex: 864521045896321"
                    required
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs tracking-wider text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Modelo do Equipamento
                  </label>
                  <input
                    type="text"
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="Ex: J16 4G"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Seção 2: Chip M2M (ICCID, Operadora e Linha) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Radio className="h-3.5 w-3.5 text-sky-500" />
                  <span>Chip M2M Vinculado (Opcional no momento)</span>
                </div>

                {isEdicao && dispositivoEdicao?.chip_id && (
                  <button
                    type="button"
                    onClick={handleDesvincular}
                    disabled={desvinculando}
                    className="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1"
                  >
                    <Unlink className="h-3 w-3" />
                    <span>Desvincular Chip</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div ref={dropdownRef} className="relative space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      ICCID do Chip M2M
                    </label>
                    <div className="flex items-center gap-2">
                      {listaChipsLivres.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDropdownChipsAberto((prev) => !prev)}
                          className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/50 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800 flex items-center gap-1 transition"
                          title="Clique para ver os chips livres no banco de dados"
                        >
                          <Database className="h-3 w-3" />
                          <span>
                            {listaChipsLivres.length}{" "}
                            {listaChipsLivres.length === 1 ? "livre em BD" : "livres em BD"}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setScannerAbertoPara("iccid")}
                        className="px-2.5 py-1 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 font-bold text-[11px] flex items-center gap-1 transition"
                      >
                        <ScanLine className="h-3.5 w-3.5" />
                        <span>Ler Código de Barras (Câmera)</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={iccid}
                      onChange={(e) => {
                        setIccid(e.target.value);
                        setDropdownChipsAberto(true);
                      }}
                      onClick={() => setDropdownChipsAberto(true)}
                      onFocus={() => setDropdownChipsAberto(true)}
                      placeholder="Clique para ver os chips disponíveis ou digite..."
                      className="w-full p-2.5 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs tracking-wider text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setDropdownChipsAberto((prev) => !prev)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 transition"
                      title="Listar chips disponíveis no banco de dados"
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          dropdownChipsAberto ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {/* Dropdown de Chips Disponíveis em BD */}
                  {dropdownChipsAberto && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Database className="h-3.5 w-3.5 text-sky-500" />
                          <span>Chips Livres no Banco ({chipsFiltrados.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setDropdownChipsAberto(false)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-lg"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {chipsFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                          Nenhum chip livre correspondente no banco.
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Você pode digitar o ICCID para cadastrar um novo chip.
                          </div>
                        </div>
                      ) : (
                        chipsFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelecionarChipExistente(c)}
                            className="w-full text-left p-2 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/50 flex items-center justify-between gap-2 transition group border border-transparent hover:border-sky-200 dark:hover:border-sky-800"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Radio className="h-3.5 w-3.5 text-sky-500 shrink-0 group-hover:scale-110 transition-transform" />
                              <div className="min-w-0">
                                <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 tracking-wider truncate">
                                  {c.iccid}
                                </div>
                                {c.linha && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                                    Linha: {c.linha}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                                {c.operadora}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                                Livre
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Operadora do Chip
                    </label>
                    <select
                      value={
                        operadoraCustomizada
                          ? "Outra"
                          : LISTA_OPERADORAS.find(
                              (op) => op.valor.toLowerCase() === operadora.toLowerCase(),
                            )?.valor || "Algar"
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "Outra") {
                          setOperadoraCustomizada(true);
                          if (
                            LISTA_OPERADORAS.some(
                              (o) => o.valor.toLowerCase() === operadora.toLowerCase(),
                            )
                          ) {
                            setOperadora("");
                          }
                        } else {
                          setOperadoraCustomizada(false);
                          setOperadora(val);
                        }
                      }}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                    >
                      {LISTA_OPERADORAS.map((op) => (
                        <option key={op.valor} value={op.valor}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Linha / Telefone M2M
                    </label>
                    <input
                      type="text"
                      value={linha}
                      onChange={(e) => setLinha(e.target.value)}
                      placeholder="Ex: 24988887777"
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                    />
                  </div>

                  {operadoraCustomizada && (
                    <div className="space-y-1.5 sm:col-span-2 animate-in fade-in duration-150">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Nome da Operadora Personalizada
                      </label>
                      <input
                        type="text"
                        value={operadora}
                        onChange={(e) => setOperadora(e.target.value)}
                        placeholder="Digite o nome da operadora..."
                        className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500 outline-none"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rodapé de Ações */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#eaf0f8]/90 dark:bg-slate-950/60 shrink-0">
              <div>
                {isEdicao && (
                  <button
                    type="button"
                    onClick={handleExcluir}
                    disabled={salvando || excluindo}
                    className="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-rose-200/80 dark:border-rose-900/50"
                    title="Excluir este rastreador do estoque"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{excluindo ? "Excluindo..." : "Excluir Dispositivo"}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={salvando || excluindo}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition flex items-center justify-center"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={salvando || excluindo}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {salvando
                      ? "Salvando..."
                      : isEdicao
                        ? "Salvar Alterações"
                        : "Cadastrar no Estoque"}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Leitor de Código de Barras por Câmera */}
      {scannerAbertoPara && (
        <CameraBarcodeScannerModal
          open={Boolean(scannerAbertoPara)}
          onClose={() => setScannerAbertoPara(null)}
          titulo={
            scannerAbertoPara === "imei"
              ? "Escanear IMEI do Rastreador"
              : "Escanear ICCID do Chip M2M"
          }
          subtitulo="Aponte a câmera para a etiqueta de código de barras ou digite o número."
          onScanSucesso={(codigo) => {
            if (scannerAbertoPara === "imei") {
              setImei(codigo);
            } else {
              setIccid(codigo);
            }
          }}
        />
      )}
    </ModalPortal>
  );
}
