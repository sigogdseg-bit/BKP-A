import React, { useState, useRef, useEffect } from "react";
import {
  Fuel,
  Camera,
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { MoedaInput } from "@/shared/components/MoedaInput";
import {
  registrarAbastecimento,
  sanitizarNumeroDecimal,
} from "@/features/motoristas/services/motoristasService";
import { extrairDadosNF } from "@/features/financeiro/services/ocrNfService";
import { converterImagemParaPdf } from "@/shared/lib/comprovantePdfHelper";
import type { AbastecimentoForm, TipoCombustivel } from "@/features/motoristas/types";

interface VeiculoBasico {
  id: string;
  placa: string;
  marca_modelo: string;
  odometro_km: number;
}

interface ModalLancamentoAbastecimentoProps {
  clienteId: string;
  veiculoId?: string;
  veiculoPlaca?: string;
  onFechar: () => void;
  onSucesso: () => void;
}

const COMBUSTIVEIS: { value: TipoCombustivel; label: string }[] = [
  { value: "gasolina", label: "Gasolina Comum" },
  { value: "gasolina_aditivada", label: "Gasolina Aditivada" },
  { value: "etanol", label: "Etanol" },
  { value: "diesel", label: "Diesel Comum" },
  { value: "diesel_s10", label: "Diesel S10" },
  { value: "gnv", label: "GNV" },
  { value: "eletrico", label: "Elétrico" },
];

export function ModalLancamentoAbastecimento({
  clienteId,
  veiculoId: propVeiculoId,
  veiculoPlaca: propVeiculoPlaca,
  onFechar,
  onSucesso,
}: ModalLancamentoAbastecimentoProps) {
  const [veiculos, setVeiculos] = useState<VeiculoBasico[]>([]);
  const [veiculoSelecionadoId, setVeiculoSelecionadoId] = useState<string>(propVeiculoId || "");
  const [carregandoVeiculos, setCarregandoVeiculos] = useState(!propVeiculoId);

  const agora = new Date();
  const hoje = agora.toISOString().split("T")[0];

  const [form, setForm] = useState<AbastecimentoForm>({
    veiculo_id: propVeiculoId || "",
    data_abastecimento: hoje,
    km_atual: "",
    litros: "",
    valor_total: "",
    valor_por_litro: "",
    combustivel: "gasolina",
    posto_nome: "",
    posto_cidade: "",
    nf_numero: "",
    observacoes: "",
  });

  const [nfFile, setNfFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ocrLendo, setOcrLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carrega a lista de veículos se o veículo não foi pré-determinado
  useEffect(() => {
    if (propVeiculoId) {
      setVeiculoSelecionadoId(propVeiculoId);
      setForm((f) => ({ ...f, veiculo_id: propVeiculoId }));
      return;
    }

    let ativo = true;
    supabase
      .from("veiculos")
      .select("id, placa, marca_modelo, odometro_km")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .order("placa", { ascending: true })
      .then(({ data }) => {
        if (ativo && data && data.length > 0) {
          setVeiculos(data);
          const primeiro = data[0];
          setVeiculoSelecionadoId(primeiro.id);
          setForm((f) => ({
            ...f,
            veiculo_id: primeiro.id,
            km_atual: String(Math.round(Number(primeiro.odometro_km || 0))),
          }));
        }
        setCarregandoVeiculos(false);
      });

    return () => {
      ativo = false;
    };
  }, [clienteId, propVeiculoId]);

  // Carrega odômetro ao trocar de veículo
  useEffect(() => {
    if (!veiculoSelecionadoId) return;
    setForm((f) => ({ ...f, veiculo_id: veiculoSelecionadoId }));

    supabase
      .from("veiculos")
      .select("odometro_km")
      .eq("id", veiculoSelecionadoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.odometro_km) {
          setForm((f) => ({
            ...f,
            km_atual: String(Math.round(Number(data.odometro_km))),
          }));
        }
      });
  }, [veiculoSelecionadoId]);

  const set = (campo: keyof AbastecimentoForm, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const handleValorOuLitros = (campo: "valor_total" | "litros", valor: string) => {
    setForm((f) => {
      const novo = { ...f, [campo]: valor };
      const litros = sanitizarNumeroDecimal(campo === "litros" ? valor : f.litros);
      const total = sanitizarNumeroDecimal(campo === "valor_total" ? valor : f.valor_total);
      if (litros && total && litros > 0 && total > 0) {
        novo.valor_por_litro = (total / litros).toFixed(4);
      }
      return novo;
    });
  };

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
    e.target.value = "";

    // Converte automaticamente para PDF canônico do comprovante
    let arquivoFinal = file;
    try {
      arquivoFinal = await converterImagemParaPdf(file, {
        tipo: "Abastecimento",
        placa: veiculos.find((v) => v.id === veiculoSelecionadoId)?.placa,
        data: form.data_abastecimento,
      });
    } catch (convErr) {
      console.warn("Conversão para PDF falhou, usando original:", convErr);
    }
    setNfFile(arquivoFinal);

    // Leitura inteligente via OCR (IA)
    setOcrLendo(true);
    setErro(null);
    try {
      const dados = await extrairDadosNF(file);
      setForm((f) => {
        const novo = { ...f };
        if (dados.data) novo.data_abastecimento = dados.data;
        if (dados.litros && Number(dados.litros) > 0) {
          novo.litros = String(Number(dados.litros).toFixed(2));
        }
        if (dados.valor_total && Number(dados.valor_total) > 0) {
          novo.valor_total = String(Number(dados.valor_total).toFixed(2));
        }
        if (dados.valor_por_litro && Number(dados.valor_por_litro) > 0) {
          novo.valor_por_litro = String(Number(dados.valor_por_litro).toFixed(4));
        } else if (novo.litros && novo.valor_total) {
          const l = parseFloat(novo.litros.replace(",", "."));
          const t = parseFloat(novo.valor_total.replace(",", "."));
          if (l > 0 && t > 0) novo.valor_por_litro = (t / l).toFixed(4);
        }
        if (dados.combustivel && COMBUSTIVEIS.some((c) => c.value === dados.combustivel)) {
          novo.combustivel = dados.combustivel as TipoCombustivel;
        }
        if (dados.posto_nome) novo.posto_nome = dados.posto_nome;
        if (dados.posto_cidade) novo.posto_cidade = dados.posto_cidade;
        if (dados.nf_numero) novo.nf_numero = dados.nf_numero;
        if (dados.forma_pagamento) {
          const tag = `Pagamento: ${dados.forma_pagamento.toUpperCase()}`;
          novo.observacoes = novo.observacoes ? `${novo.observacoes} | ${tag}` : tag;
        }
        return novo;
      });
      toast.success(
        `Nota Fiscal lida com sucesso! Litros: ${dados.litros || "—"} · Total: R$ ${
          dados.valor_total || "—"
        }`,
      );
    } catch (ocrErr: any) {
      console.warn("Falha no OCR da NF:", ocrErr);
      toast.info(
        "Não foi possível ler todos os campos da foto. Confira e preencha os dados abaixo.",
      );
    } finally {
      setOcrLendo(false);
    }
  };

  const removerArquivo = () => {
    if (preview) URL.revokeObjectURL(preview);
    setNfFile(null);
    setPreview(null);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.veiculo_id) {
      setErro("Selecione um veículo para registrar o abastecimento.");
      return;
    }
    const litrosNum = sanitizarNumeroDecimal(form.litros);
    if (!litrosNum || litrosNum <= 0) {
      setErro("Informe a quantidade de litros abastecidos.");
      return;
    }
    const valorTotalNum = sanitizarNumeroDecimal(form.valor_total);
    if (!valorTotalNum || valorTotalNum <= 0) {
      setErro("Informe o valor total do abastecimento.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      await registrarAbastecimento(clienteId, null, form, nfFile);
      toast.success("Abastecimento registrado com sucesso!");
      onSucesso();
      onFechar();
    } catch (err: any) {
      setErro(err?.message || "Erro ao salvar abastecimento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl transition-colors flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/90 dark:bg-slate-950/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400 flex items-center justify-center shadow-xs shrink-0">
                <Fuel className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Registrar Abastecimento
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {propVeiculoPlaca
                    ? `Veículo: ${propVeiculoPlaca}`
                    : "Lançamento de combustível da frota"}
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              disabled={salvando}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form com Scroll */}
          <form onSubmit={handleSalvar} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Seletor de Veículo se não fornecido */}
            {!propVeiculoId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Veículo da Frota *
                </label>
                {carregandoVeiculos ? (
                  <div className="h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-xl" />
                ) : (
                  <select
                    value={veiculoSelecionadoId}
                    onChange={(e) => setVeiculoSelecionadoId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                    required
                  >
                    {veiculos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.placa} — {v.marca_modelo} (Odômetro:{" "}
                        {Math.round(v.odometro_km || 0).toLocaleString("pt-BR")} km)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Upload e OCR da NF */}
            <div className="rounded-2xl border border-dashed border-orange-500/40 bg-orange-500/5 p-4 transition-all">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                id="input-nf-modal"
                onChange={handleArquivo}
              />
              {nfFile ? (
                <div className="flex items-center gap-3">
                  {preview ? (
                    <img
                      src={preview}
                      alt="Preview NF"
                      className="h-16 w-16 rounded-xl object-cover border border-orange-500/40 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-rose-500 shrink-0">
                      <FileText className="h-7 w-7" />
                      <span className="text-[9px] font-black uppercase tracking-wider mt-0.5">
                        PDF
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {nfFile.name}
                      </p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold uppercase shrink-0">
                        PDF A4
                      </span>
                    </div>
                    {ocrLendo ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold animate-pulse mt-0.5">
                        <Sparkles className="h-3.5 w-3.5 animate-spin" />
                        <span>Lendo dados do Comprovante com IA...</span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {(nfFile.size / 1024).toFixed(1)} KB · Documento padronizado para auditoria
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={removerArquivo}
                    disabled={ocrLendo}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={ocrLendo}
                  className="w-full flex flex-col items-center gap-2 py-3 hover:opacity-80 transition-opacity"
                >
                  <div className="flex items-center gap-2">
                    <Camera className="h-6 w-6 text-orange-500" />
                    <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Tirar Foto ou Anexar Cupom Fiscal / Getnet / PDF
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    A IA lê automaticamente litros, valor, combustível, posto e data
                  </p>
                </button>
              )}
            </div>

            {/* Linha 1: Data e Odômetro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Data do Abastecimento *
                </label>
                <input
                  type="date"
                  value={form.data_abastecimento}
                  onChange={(e) => set("data_abastecimento", e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  KM Atual (Odômetro do Painel) *
                </label>
                <input
                  type="number"
                  value={form.km_atual}
                  onChange={(e) => set("km_atual", e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  required
                />
              </div>
            </div>

            {/* Linha 2: Combustível */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tipo de Combustível *
              </label>
              <select
                value={form.combustivel}
                onChange={(e) => set("combustivel", e.target.value as TipoCombustivel)}
                className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                {COMBUSTIVEIS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Linha 3: Litros e Valor Total */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Litros Abastecidos *
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={form.litros}
                  onChange={(e) => handleValorOuLitros("litros", e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Valor Total Pago *
                </label>
                <MoedaInput
                  value={Number(form.valor_total) || 0}
                  onChange={(val) => handleValorOuLitros("valor_total", String(val))}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
            </div>

            {form.valor_por_litro && Number(form.valor_por_litro) > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold text-right">
                Preço por litro: R$ {parseFloat(form.valor_por_litro).toFixed(3)}
              </p>
            )}

            {/* Linha 4: Posto e Cidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Posto de Combustível
                </label>
                <input
                  type="text"
                  placeholder="Ex: Posto Ipiranga / Shell"
                  value={form.posto_nome}
                  onChange={(e) => set("posto_nome", e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cidade
                </label>
                <input
                  type="text"
                  placeholder="Ex: Volta Redonda"
                  value={form.posto_cidade}
                  onChange={(e) => set("posto_cidade", e.target.value)}
                  className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
            </div>

            {/* Linha 5: Nro NF e Observações */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Número da NF / Cupom Fiscal
              </label>
              <input
                type="text"
                placeholder="Ex: 206095"
                value={form.nf_numero}
                onChange={(e) => set("nf_numero", e.target.value)}
                className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações
              </label>
              <input
                type="text"
                placeholder="Ex: Cartão corporativo, abastecimento completo"
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </div>

            {erro && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}

            {/* Footer Fixo */}
            <div className="pt-3.5 sm:pt-4 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || ocrLendo}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-emerald-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Confirmar Abastecimento</span>
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
