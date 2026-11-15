import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Wrench,
  Receipt,
  Camera,
  Upload,
  CheckCircle2,
  Trash2,
  Building2,
  Calendar,
  Gauge,
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { MoedaInput } from "@/shared/components/MoedaInput";
import {
  concluirManutencaoComGasto,
  lancarGastoAvulsoVeiculo,
} from "../services/manutencaoService";
import {
  carregarSugestoesCompletas,
  salvarSugestaoLocal,
  removerSugestaoLocal,
  obterSugestoesLocais,
  SUGESTOES_BASE_PADRAO,
  type SugestaoServicoItem,
} from "../services/sugestoesDespesasService";
import type { PlanoManutencaoItem, FormaPagamentoManutencao, CategoriaDespesa } from "../types";
import { toast } from "sonner";
import { formatarKm } from "@/features/monitor-gps/utils/formatadoresViagem";
import { extrairDadosNF } from "@/features/financeiro/services/ocrNfService";
import { converterImagemParaPdf } from "@/shared/lib/comprovantePdfHelper";

interface ModalLancamentoDespesaVeiculoProps {
  veiculoId: string;
  veiculoPlaca?: string;
  placaVeiculo?: string;
  veiculoModelo?: string;
  clienteId?: string;
  odometroAtual: number;
  /** Se preenchido, o modal opera no modo "Concluir Revisão" */
  itemPlano?: PlanoManutencaoItem | null;
  itemManutencao?: PlanoManutencaoItem | null;
  onFechar: () => void;
  onSucesso: () => void;
}

const FORMAS_PAGAMENTO: {
  id: FormaPagamentoManutencao;
  label: string;
  icone: React.ReactNode;
}[] = [
  { id: "pix", label: "Pix", icone: <QrCode className="h-4 w-4" /> },
  { id: "cartao_credito", label: "Cartão de Crédito", icone: <CreditCard className="h-4 w-4" /> },
  { id: "cartao_debito", label: "Cartão de Débito", icone: <CreditCard className="h-4 w-4" /> },
  { id: "dinheiro", label: "Dinheiro", icone: <Banknote className="h-4 w-4" /> },
  { id: "boleto", label: "Boleto / Faturado", icone: <FileText className="h-4 w-4" /> },
];

export function ModalLancamentoDespesaVeiculo({
  veiculoId,
  veiculoPlaca,
  placaVeiculo,
  veiculoModelo = "",
  clienteId = "",
  odometroAtual,
  itemPlano,
  itemManutencao,
  onFechar,
  onSucesso,
}: ModalLancamentoDespesaVeiculoProps) {
  const placa = veiculoPlaca || placaVeiculo || "Veículo";
  const itemAlvo = itemPlano || itemManutencao || null;
  const isConclusaoRevisao = !!itemAlvo;
  const hoje = new Date().toISOString().split("T")[0];

  const [descricao, setDescricao] = useState(itemAlvo?.item_manutencao || "Troca de Óleo e Filtro");
  const [categoria, setCategoria] = useState<string>("manutencao");
  const [valorTotal, setValorTotal] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoManutencao>("pix");
  const [kmRealizado, setKmRealizado] = useState<number>(
    odometroAtual > 0 ? odometroAtual : itemAlvo?.proximo_km_alvo || 0,
  );
  const [dataRealizacao, setDataRealizacao] = useState(hoje);
  const [oficina, setOficina] = useState("");
  const [nfNumero, setNfNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Sugestões dinâmicas que aprendem automaticamente com novos gastos enviados
  const [sugestoes, setSugestoes] = useState<SugestaoServicoItem[]>(() => {
    const locais = obterSugestoesLocais(clienteId);
    const mapa = new Map<string, SugestaoServicoItem>();
    for (const it of locais) mapa.set(it.label.toLowerCase().trim(), it);
    for (const it of SUGESTOES_BASE_PADRAO) {
      const k = it.label.toLowerCase().trim();
      if (!mapa.has(k)) mapa.set(k, it);
    }
    return Array.from(mapa.values());
  });

  useEffect(() => {
    let ativo = true;
    carregarSugestoesCompletas(clienteId, veiculoId).then((lista) => {
      if (ativo && lista.length > 0) {
        setSugestoes(lista);
      }
    });

    const handler = () => {
      carregarSugestoesCompletas(clienteId, veiculoId).then((lista) => {
        if (ativo && lista.length > 0) {
          setSugestoes(lista);
        }
      });
    };

    window.addEventListener("hunter_sugestoes_atualizadas", handler);
    return () => {
      ativo = false;
      window.removeEventListener("hunter_sugestoes_atualizadas", handler);
    };
  }, [clienteId, veiculoId]);

  const [nfFile, setNfFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ocrLendo, setOcrLendo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Converte automaticamente para PDF canônico do comprovante
    let arquivoFinal = file;
    try {
      arquivoFinal = await converterImagemParaPdf(file, {
        tipo: isConclusaoRevisao ? "Revisão Preventiva" : "Despesa / Manutenção",
        placa,
        data: dataRealizacao,
      });
    } catch (convErr) {
      console.warn("Conversão para PDF falhou, usando original:", convErr);
    }
    setNfFile(arquivoFinal);

    setOcrLendo(true);
    try {
      const dados = await extrairDadosNF(file);
      if (dados.valor_total && Number(dados.valor_total) > 0) {
        setValorTotal(Number(dados.valor_total));
      }
      if (dados.data) {
        setDataRealizacao(dados.data);
      }
      if (dados.posto_nome) {
        setOficina(dados.posto_nome);
      }
      if (dados.nf_numero) {
        setNfNumero(dados.nf_numero);
      }
      if (dados.forma_pagamento) {
        const fp = dados.forma_pagamento.toLowerCase();
        if (["pix", "cartao_credito", "cartao_debito", "dinheiro", "boleto"].includes(fp)) {
          setFormaPagamento(fp as FormaPagamentoManutencao);
        } else if (fp.includes("credito")) {
          setFormaPagamento("cartao_credito");
        } else if (fp.includes("debito")) {
          setFormaPagamento("cartao_debito");
        } else if (fp.includes("pix")) {
          setFormaPagamento("pix");
        }
      }
      if (dados.descricao_itens && !descricao) {
        setDescricao(dados.descricao_itens);
      }
      toast.success(
        `Nota Fiscal lida com sucesso! Valor: R$ ${
          dados.valor_total ? Number(dados.valor_total).toFixed(2) : "—"
        }`,
      );
    } catch (err: any) {
      console.warn("Falha no OCR da NF:", err);
      toast.info(
        "Não foi possível ler todos os campos da foto. Confira e preencha os dados abaixo.",
      );
    } finally {
      setOcrLendo(false);
    }
  };

  const handleRemoverArquivo = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setNfFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!descricao.trim()) {
      toast.error("Informe a descrição ou nome do serviço realizado.");
      return;
    }

    if (kmRealizado <= 0) {
      toast.error("Informe a quilometragem (odômetro) do veículo.");
      return;
    }

    setSalvando(true);

    try {
      if (isConclusaoRevisao && itemAlvo) {
        const res = await concluirManutencaoComGasto({
          itemId: itemAlvo.id,
          veiculoId,
          clienteId,
          itemNome: descricao.trim(),
          odometroKm: Number(kmRealizado),
          intervaloKm: itemAlvo.intervalo_km,
          valorTotal,
          formaPagamento,
          dataRealizacao,
          oficina: oficina.trim() || undefined,
          nfNumero: nfNumero.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
          nfFile,
        });

        if (res.success) {
          salvarSugestaoLocal(descricao.trim(), categoria, clienteId);
          toast.success(res.message);
          onSucesso();
          onFechar();
        } else {
          toast.error(res.message);
        }
      } else {
        const res = await lancarGastoAvulsoVeiculo({
          veiculoId,
          clienteId,
          descricao: descricao.trim(),
          categoria,
          valorTotal,
          formaPagamento,
          odometroKm: Number(kmRealizado),
          dataRealizacao,
          oficina: oficina.trim() || undefined,
          nfNumero: nfNumero.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
          nfFile,
        });

        if (res.success) {
          salvarSugestaoLocal(descricao.trim(), categoria, clienteId);
          toast.success(res.message);
          onSucesso();
          onFechar();
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar gasto do veículo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl transition-colors flex flex-col">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#fbf2e9]/80 dark:bg-slate-950/50 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${
                  isConclusaoRevisao
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400"
                }`}
              >
                {isConclusaoRevisao ? (
                  <Wrench className="h-5 w-5" />
                ) : (
                  <Receipt className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>
                    {isConclusaoRevisao
                      ? "Concluir Revisão Preventiva"
                      : "Registrar Gasto / Despesa"}
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
                    {placa}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {veiculoModelo ? `${veiculoModelo} • ` : ""}Odômetro Atual:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {formatarKm(odometroAtual)}
                  </strong>
                </p>
              </div>
            </div>

            <button
              onClick={onFechar}
              disabled={salvando}
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form com Scroll Interno */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Se for lançamento avulso, sugestões rápidas de serviços dinâmicas */}
            {!isConclusaoRevisao && sugestoes.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                    <span>Sugestões de Serviços e Gastos Rápidos</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Aprende automaticamente com novos gastos
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {sugestoes.map((at) => {
                    const isSelecionado =
                      descricao.toLowerCase().trim() === at.label.toLowerCase().trim();
                    return (
                      <div
                        key={at.label}
                        className="inline-flex items-center group rounded-xl overflow-hidden shadow-2xs"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setDescricao(at.label);
                            if (at.categoria) setCategoria(at.categoria);
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold transition border ${
                            isSelecionado
                              ? "bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-xs"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          } ${at.isPersonalizada ? "rounded-l-xl border-r-0" : "rounded-xl"}`}
                        >
                          {at.label}
                        </button>
                        {at.isPersonalizada && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removerSugestaoLocal(at.label, clienteId);
                              setSugestoes((prev) => prev.filter((p) => p.label !== at.label));
                            }}
                            className={`px-1.5 py-1 text-[11px] transition border border-l-0 ${
                              isSelecionado
                                ? "bg-emerald-600 text-slate-950 border-emerald-400 hover:bg-emerald-700"
                                : "bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-500 border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            } rounded-r-xl`}
                            title={`Remover sugestão "${at.label}"`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Descrição do Serviço / Peça */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Item de Manutenção / Descrição do Gasto</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Troca de Óleo 5W30, Troca de Palhetas Dianteiras..."
                required
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Grid: Valor Gasto e Odômetro Realizado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Valor Gasto */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Valor Total Gasto (R$)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-black text-emerald-600 dark:text-emerald-400">
                    R$
                  </span>
                  <MoedaInput
                    value={valorTotal}
                    onChange={setValorTotal}
                    placeholder="0,00"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Odômetro Realizado */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-slate-400" />
                    <span>Odômetro do Serviço (KM)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  {odometroAtual > 0 && kmRealizado !== odometroAtual && (
                    <button
                      type="button"
                      onClick={() => setKmRealizado(odometroAtual)}
                      className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Usar atual ({formatarKm(odometroAtual)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={kmRealizado || ""}
                  onChange={(e) => setKmRealizado(parseInt(e.target.value, 10) || 0)}
                  placeholder="Ex: 182947"
                  required
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-mono font-bold text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            {/* Como Foi Pago (Forma de Pagamento) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span>Como foi pago? (Forma de Pagamento)</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FORMAS_PAGAMENTO.map((fp) => (
                  <button
                    key={fp.id}
                    type="button"
                    onClick={() => setFormaPagamento(fp.id)}
                    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-2xl text-center text-xs transition border ${
                      formaPagamento === fp.id
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                    }`}
                  >
                    {fp.icone}
                    <span className="text-[11px] leading-tight">{fp.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grid: Data de Realização e Oficina / Estabelecimento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Data de Realização */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Data da Manutenção / Gasto</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={dataRealizacao}
                  onChange={(e) => setDataRealizacao(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Oficina / Estabelecimento */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Oficina / Fornecedor / Estabelecimento</span>
                </label>
                <input
                  type="text"
                  value={oficina}
                  onChange={(e) => setOficina(e.target.value)}
                  placeholder="Ex: Auto Center Silva, Posto Ipiranga..."
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            {/* Número da Nota Fiscal */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span>Número da Nota Fiscal / Cupom Fiscal</span>
                <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={nfNumero}
                onChange={(e) => setNfNumero(e.target.value)}
                placeholder="Ex: NF-e 004812"
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Upload de Nota Fiscal / Comprovante */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Anexar Comprovante / Nota Fiscal (Foto ou PDF)</span>
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  Disponível para download pelo adm
                </span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={handleArquivo}
                className="hidden"
              />

              {!nfFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ocrLendo}
                  className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 bg-white/60 dark:bg-slate-800/60 flex flex-col items-center justify-center gap-1.5 text-center transition group disabled:opacity-50"
                >
                  {ocrLendo ? (
                    <>
                      <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                      <span className="text-xs font-bold text-amber-500">
                        Lendo dados da Nota Fiscal com Inteligência Artificial...
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition">
                        <Camera className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span>Tirar Foto ou Selecionar Comprovante</span>
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Leitura automática com IA · Foto de Celular ou PDF
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview NF"
                        className="h-10 w-10 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                    )}
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {nfFile.name}
                        </p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold uppercase shrink-0">
                          PDF A4
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {(nfFile.size / 1024).toFixed(1)} KB • Documento padronizado para auditoria
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoverArquivo}
                    className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0"
                    title="Remover anexo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Observações
              </label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Detalhes adicionais da manutenção, garantia da peça ou observações do mecânico..."
                className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition resize-none"
              />
            </div>
          </form>

          {/* Rodapé Fixo */}
          <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 bg-[#fbf2e9]/80 dark:bg-slate-950/50 shrink-0">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={salvando}
              className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Salvando e Enviando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {isConclusaoRevisao
                      ? "Concluir Revisão e Salvar Gasto"
                      : "Salvar Registro de Gasto"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
