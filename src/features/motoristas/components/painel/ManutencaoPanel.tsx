import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Wrench,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Plus,
  Gauge,
  Clock,
  Camera,
  FileText,
  X,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  Building2,
  DollarSign,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  carregarItensManutencao,
  concluirManutencaoComGasto,
  inicializarItensPadraoVeiculo,
  lancarGastoAvulsoVeiculo,
  salvarItemManutencao,
} from "@/features/manutencao/services/manutencaoService";
import type { FormaPagamentoManutencao, PlanoManutencaoItem } from "@/features/manutencao/types";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import { formatarKm } from "@/features/monitor-gps/utils/formatadoresViagem";
import { MoedaInput } from "@/shared/components/MoedaInput";

interface Props {
  clienteId: string;
  motoristaId?: string;
  motoristaNome: string;
  veiculoId: string;
  veiculoPlaca: string;
  onVoltar: () => void;
}

const FORMAS_PAGAMENTO: {
  id: FormaPagamentoManutencao;
  label: string;
  icone: React.ReactNode;
}[] = [
  { id: "pix", label: "Pix", icone: <QrCode className="h-3.5 w-3.5" /> },
  { id: "cartao_credito", label: "Crédito", icone: <CreditCard className="h-3.5 w-3.5" /> },
  { id: "cartao_debito", label: "Débito", icone: <CreditCard className="h-3.5 w-3.5" /> },
  { id: "dinheiro", label: "Dinheiro", icone: <Banknote className="h-3.5 w-3.5" /> },
  { id: "boleto", label: "Boleto", icone: <FileText className="h-3.5 w-3.5" /> },
];

export function ManutencaoPanel({
  clienteId,
  motoristaId,
  motoristaNome,
  veiculoId,
  veiculoPlaca,
  onVoltar,
}: Props) {
  const [itens, setItens] = useState<PlanoManutencaoItem[]>([]);
  const [odometroVeiculo, setOdometroVeiculo] = useState<number>(0);
  const [carregando, setCarregando] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState<PlanoManutencaoItem | null>(null);
  const [kmRealizado, setKmRealizado] = useState<string>("");
  const [intervaloKm, setIntervaloKm] = useState<string>("5000");
  const [novoItemNome, setNovoItemNome] = useState<string>("");
  const [modoNovo, setModoNovo] = useState(false);

  // Campos de custos e comprovante NF
  const [valorGasto, setValorGasto] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoManutencao>("pix");
  const [oficina, setOficina] = useState<string>("");
  const [nfNumero, setNfNumero] = useState<string>("");
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [salvando, setSalvando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { data: vei } = await supabase
        .from("veiculos")
        .select("odometro_km")
        .eq("id", veiculoId)
        .maybeSingle();

      const odo = Number(vei?.odometro_km) || 0;
      setOdometroVeiculo(odo);

      let lista = await carregarItensManutencao(veiculoId);
      if (lista.length === 0) {
        await inicializarItensPadraoVeiculo(veiculoId, odo);
        lista = await carregarItensManutencao(veiculoId);
      }
      setItens(lista);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar itens de manutenção.");
    } finally {
      setCarregando(false);
    }
  }, [veiculoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const limparCamposForm = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setValorGasto(0);
    setFormaPagamento("pix");
    setOficina("");
    setNfNumero("");
    setNfFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selecionarParaBaixa = (item: PlanoManutencaoItem) => {
    limparCamposForm();
    setModoNovo(false);
    setItemSelecionado(item);
    setKmRealizado(String(item.odometro_atual || odometroVeiculo || item.ultimo_km_realizado || 0));
    setIntervaloKm(String(item.intervalo_km || 5000));
    setErro(null);
    setMensagemSucesso(null);
  };

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNfFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRemoverArquivo = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setNfFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRegistrarManutencao = async () => {
    const kmNum = Number(kmRealizado);
    const intNum = Number(intervaloKm);

    if (!Number.isFinite(kmNum) || kmNum < 0) {
      setErro("Informe a quilometragem (KM) atual válida do veículo.");
      return;
    }
    if (!Number.isFinite(intNum) || intNum < 500) {
      setErro("O intervalo para a próxima revisão deve ser de pelo menos 500 km.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      let nomeManutencao = "";
      const hoje = new Date().toISOString().split("T")[0];

      if (modoNovo) {
        if (!novoItemNome.trim()) {
          setErro("Informe o nome do serviço realizado (ex: Troca de Óleo e Filtro).");
          setSalvando(false);
          return;
        }
        nomeManutencao = novoItemNome.trim();
        const res = await salvarItemManutencao({
          veiculo_id: veiculoId,
          item_manutencao: nomeManutencao,
          intervalo_km: intNum,
          aviso_antecipado_km: 500,
          ultimo_km_realizado: kmNum,
        });
        if (!res.success) throw new Error(res.message);

        // Se houver valor financeiro ou NF, registra a despesa correspondente
        if (valorGasto > 0 || nfFile || nfNumero.trim()) {
          await lancarGastoAvulsoVeiculo({
            veiculoId,
            clienteId,
            motoristaId,
            descricao: `Revisão: ${nomeManutencao}`,
            categoria: "manutencao",
            valorTotal: valorGasto,
            formaPagamento,
            odometroKm: kmNum,
            dataRealizacao: hoje,
            oficina: oficina.trim() || undefined,
            nfNumero: nfNumero.trim() || undefined,
            nfFile,
            observacoes: `Registrado pelo motorista ${motoristaNome} via Portal`,
          });
        }
      } else if (itemSelecionado) {
        nomeManutencao = itemSelecionado.item_manutencao;
        const res = await concluirManutencaoComGasto({
          itemId: itemSelecionado.id,
          veiculoId,
          clienteId,
          motoristaId,
          itemNome: nomeManutencao,
          odometroKm: kmNum,
          intervaloKm: intNum,
          valorTotal: valorGasto,
          formaPagamento,
          dataRealizacao: hoje,
          oficina: oficina.trim() || undefined,
          nfNumero: nfNumero.trim() || undefined,
          nfFile,
          observacoes: `Registrado pelo motorista ${motoristaNome} via Portal`,
        });
        if (!res.success) throw new Error(res.message);
      }

      // Manutenção registrada com sucesso

      // Registra alerta e notificação para o cliente
      const proxKm = Math.round(kmNum + intNum);
      const valorFmt =
        valorGasto > 0
          ? ` com custo de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorGasto)}`
          : "";

      await supabase
        .from("alertas_seguranca")
        .insert({
          veiculo_id: veiculoId,
          tipo_alerta: "manutencao_realizada",
          mensagem: `Manutenção "${nomeManutencao}" registrada pelo motorista ${motoristaNome} aos ${kmNum.toLocaleString("pt-BR")} km${valorFmt} (próxima em ${proxKm.toLocaleString("pt-BR")} km).`,
          lida: false,
          created_at: new Date().toISOString(),
        })
        .then(() => {});

      enviarNotificacaoViaBd({
        destinatarioClienteId: clienteId,
        titulo: `🔧 Manutenção Registrada — ${veiculoPlaca}`,
        mensagem: `${motoristaNome} registrou "${nomeManutencao}" aos ${kmNum.toLocaleString("pt-BR")} km${valorFmt}. Próxima revisão em ${proxKm.toLocaleString("pt-BR")} km.`,
        tipo: "manutencao",
        url: "/manutencao",
        placa: veiculoPlaca,
      }).catch(() => {});

      setMensagemSucesso(
        `Manutenção "${nomeManutencao}" registrada aos ${kmNum.toLocaleString("pt-BR")} km${valorFmt}! Próxima meta: ${proxKm.toLocaleString("pt-BR")} km.`,
      );
      setItemSelecionado(null);
      setModoNovo(false);
      setNovoItemNome("");
      limparCamposForm();
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Falha ao registrar manutenção.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            id="btn-voltar-manutencao"
            onClick={onVoltar}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-400" />
              Manutenção Preventiva e Revisões
            </h2>
            <p className="text-xs text-slate-400">
              Veículo {veiculoPlaca} · Odômetro: {formatarKm(odometroVeiculo)}
            </p>
          </div>
        </div>
        <button
          id="btn-novo-item-manutencao-motorista"
          onClick={() => {
            limparCamposForm();
            setItemSelecionado(null);
            setModoNovo(true);
            setNovoItemNome("");
            setKmRealizado(String(odometroVeiculo || 0));
            setIntervaloKm("5000");
            setErro(null);
            setMensagemSucesso(null);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Outro Serviço
        </button>
      </div>

      {mensagemSucesso && (
        <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-200 leading-relaxed">{mensagemSucesso}</p>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{erro}</p>
        </div>
      )}

      {/* Formulário de Baixa / Registro de Troca de Óleo ou Serviço com Custos e NF */}
      {(itemSelecionado || modoNovo) && (
        <div className="rounded-xl bg-slate-800/90 border border-amber-500/40 p-4 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-400" />
              {modoNovo
                ? "Registrar Novo Serviço / Revisão"
                : `Registrar Realização: ${itemSelecionado?.item_manutencao}`}
            </h3>
            <button
              onClick={() => {
                setItemSelecionado(null);
                setModoNovo(false);
                limparCamposForm();
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
          </div>

          {modoNovo && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Serviço Realizado *</label>
              <input
                type="text"
                value={novoItemNome}
                onChange={(e) => setNovoItemNome(e.target.value)}
                placeholder="Ex: Troca de Óleo e Filtro, Alinhamento..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 shadow-xs"
              />
            </div>
          )}

          {/* KM Realizado e Intervalo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5 text-slate-500" />
                <span>KM Realizado *</span>
              </label>
              <input
                type="number"
                min="0"
                value={kmRealizado}
                onChange={(e) => setKmRealizado(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono shadow-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>Próxima Troca (KM) *</span>
              </label>
              <input
                type="number"
                min="500"
                step="500"
                value={intervaloKm}
                onChange={(e) => setIntervaloKm(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono shadow-xs"
              />
            </div>
          </div>

          {/* Seção Financeira: Valor e Pagamento */}
          <div className="pt-2 border-t border-slate-300/60 dark:border-slate-700/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Custos da Revisão / Serviço
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Total de peças + mão de obra
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5 text-slate-500" />
                  <span>Valor Total Gasto (R$)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-black text-emerald-600 dark:text-emerald-400">
                    R$
                  </span>
                  <MoedaInput
                    value={valorGasto}
                    onChange={setValorGasto}
                    placeholder="0,00"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono font-bold shadow-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>Oficina / Estabelecimento</span>
                </label>
                <input
                  type="text"
                  value={oficina}
                  onChange={(e) => setOficina(e.target.value)}
                  placeholder="Ex: Auto Center Centro, Oficina Silva"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 shadow-xs"
                />
              </div>
            </div>

            {/* Como foi pago */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Forma de Pagamento
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {FORMAS_PAGAMENTO.map((fp) => (
                  <button
                    key={fp.id}
                    type="button"
                    onClick={() => setFormaPagamento(fp.id)}
                    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg text-xs transition border cursor-pointer ${
                      formaPagamento === fp.id
                        ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-xs"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {fp.icone}
                    <span className="text-[10px] leading-tight">{fp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Número da NF e Anexo/Foto */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    <span>Nº da Nota Fiscal / Recibo</span>
                  </label>
                  <input
                    type="text"
                    value={nfNumero}
                    onChange={(e) => setNfNumero(e.target.value)}
                    placeholder="Ex: 84920"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-mono shadow-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-slate-500" />
                    <span>Foto / Arquivo da Nota Fiscal</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleArquivo}
                    className="hidden"
                  />

                  {nfFile ? (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-amber-500/30 text-xs text-slate-200">
                      <div className="flex items-center gap-2 truncate">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Preview NF"
                            className="h-8 w-8 object-cover rounded border border-slate-700"
                          />
                        ) : (
                          <FileText className="h-5 w-5 text-amber-400 flex-shrink-0" />
                        )}
                        <span className="truncate max-w-[150px] font-medium">{nfFile.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoverArquivo}
                        className="p-1 text-slate-400 hover:text-rose-400 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 hover:border-amber-500/60 text-xs font-medium text-slate-300 transition"
                    >
                      <Camera className="h-4 w-4 text-amber-400" />
                      <span>Tirar Foto ou Anexar NF</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            id="btn-confirmar-manutencao-motorista"
            onClick={handleRegistrarManutencao}
            disabled={salvando}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm transition-colors shadow-md mt-2"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Registrando e Salvando Custos…
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>
                  {valorGasto > 0
                    ? `Confirmar Revisão e Salvar Gasto (${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorGasto)})`
                    : "Confirmar Revisão e Atualizar Odômetro"}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Lista de Itens Preventivos do Veículo */}
      {carregando ? (
        <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
          Carregando plano de manutenção…
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Toque em <strong className="text-slate-200">Registrar Troca / Revisão</strong> para dar
            baixa na manutenção realizada, informar custos/NF e atualizar automaticamente o
            preventivo do veículo:
          </p>
          {itens.map((item) => {
            const vencida = item.status === "vencida";
            const proxima = item.status === "proxima";
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  vencida
                    ? "bg-red-500/10 border-red-500/30"
                    : proxima
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-slate-800/60 border-slate-700/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">{item.item_manutencao}</h4>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3.5 w-3.5 text-slate-500" />
                        Última: {formatarKm(item.ultimo_km_realizado)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        Próxima: {formatarKm(item.proximo_km_alvo)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      vencida
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : proxima
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {vencida ? "Vencida" : proxima ? "Próxima" : "Em dia"}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                  <span className="text-xs text-slate-400">
                    {Math.round(item.km_restante ?? 0) <= 0
                      ? `Excedido em ${formatarKm(Math.abs(item.km_restante ?? 0))}`
                      : `Faltam ${formatarKm(item.km_restante ?? 0)}`}
                  </span>
                  <button
                    id={`btn-baixa-manut-${item.id}`}
                    onClick={() => selecionarParaBaixa(item)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
                  >
                    Registrar Troca / Revisão
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
