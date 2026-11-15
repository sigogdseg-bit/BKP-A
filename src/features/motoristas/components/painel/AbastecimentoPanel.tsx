import React, { useState, useRef, useEffect } from "react";
import {
  Fuel,
  Camera,
  Upload,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  X,
  Sparkles,
  FileText,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registrarAbastecimento, sanitizarNumeroDecimal } from "../../services/motoristasService";
import { extrairDadosNF } from "@/features/financeiro/services/ocrNfService";
import { converterImagemParaPdf } from "@/shared/lib/comprovantePdfHelper";
import { MoedaInput } from "@/shared/components/MoedaInput";
import type { AbastecimentoForm, TipoCombustivel } from "../../types";

interface Props {
  clienteId: string;
  motoristaId: string;
  veiculoId: string;
  veiculoPlaca: string;
  onVoltar: () => void;
}

const COMBUSTIVEIS: { value: TipoCombustivel; label: string }[] = [
  { value: "gasolina", label: "Gasolina" },
  { value: "gasolina_aditivada", label: "Gasolina Aditivada" },
  { value: "etanol", label: "Etanol" },
  { value: "diesel", label: "Diesel" },
  { value: "diesel_s10", label: "Diesel S10" },
  { value: "gnv", label: "GNV" },
  { value: "eletrico", label: "Elétrico" },
];

const hoje = new Date().toISOString().split("T")[0];

// ============================================================================
// AbastecimentoPanel — registro de abastecimento pelo motorista
// ============================================================================
export function AbastecimentoPanel({
  clienteId,
  motoristaId,
  veiculoId,
  veiculoPlaca,
  onVoltar,
}: Props) {
  const [form, setForm] = useState<AbastecimentoForm>({
    veiculo_id: veiculoId,
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
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estaNoPosto, setEstaNoPosto] = useState<boolean | null>(null);
  const [odometroSistema, setOdometroSistema] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const extrairPrefixoKmSemUltimos3Digitos = (km: number | string | null | undefined): string => {
    if (!km) return "";
    const kmStr = String(Math.round(Number(km)));
    if (kmStr.length <= 3) return "";
    return kmStr.slice(0, -3);
  };

  // Carrega o odômetro atual do veículo para referência
  useEffect(() => {
    if (!veiculoId) return;
    supabase
      .from("veiculos")
      .select("odometro_km")
      .eq("id", veiculoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.odometro_km) {
          setOdometroSistema(Number(data.odometro_km));
        }
      });
  }, [veiculoId]);

  const handleRespostaPosto = (noPosto: boolean) => {
    setEstaNoPosto(noPosto);
    if (noPosto) {
      if (odometroSistema && odometroSistema > 999) {
        const prefixo = extrairPrefixoKmSemUltimos3Digitos(odometroSistema);
        setForm((f) => ({ ...f, km_atual: prefixo }));
        toast.info(
          `Prefixo (${prefixo}) preenchido do sistema. Complete com os 3 últimos dígitos do painel!`,
        );
      } else {
        setForm((f) => ({ ...f, km_atual: "" }));
        toast.info("Digite o KM completo exibido no painel do veículo.");
      }
    } else {
      setForm((f) => ({
        ...f,
        km_atual: odometroSistema ? String(Math.round(Number(odometroSistema))) : "",
      }));
    }
  };

  const set = (campo: keyof AbastecimentoForm, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  // Cálculo automático de valor por litro
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
        placa: veiculoPlaca,
        data: form.data_abastecimento,
      });
    } catch (convErr) {
      console.warn("Conversão para PDF falhou, usando original:", convErr);
    }
    setNfFile(arquivoFinal);

    // Leitura inteligente via OCR (IA / PDF nativo)
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

  const handleSalvar = async () => {
    const litrosNum = sanitizarNumeroDecimal(form.litros);
    const valorTotalNum = sanitizarNumeroDecimal(form.valor_total);
    if (!litrosNum || litrosNum <= 0 || !valorTotalNum || valorTotalNum <= 0) {
      setErro("Informe a quantidade de litros e o valor total.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await registrarAbastecimento(clienteId, motoristaId, form, nfFile);
      setSucesso(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="rounded-full bg-orange-500/10 p-4">
          <CheckCircle className="h-10 w-10 text-orange-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-200">Abastecimento registrado!</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          {nfFile
            ? "A nota fiscal foi enviada. Seu cliente receberá um aviso para baixá-la."
            : "Registro salvo com sucesso."}
        </p>
        <button
          id="btn-novo-abastecimento"
          onClick={() => {
            setSucesso(false);
            setForm({
              ...form,
              litros: "",
              valor_total: "",
              valor_por_litro: "",
              nf_numero: "",
              observacoes: "",
            });
            setNfFile(null);
            setPreview(null);
          }}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Registrar outro
        </button>
        <button onClick={onVoltar} className="text-sm text-slate-500 hover:text-slate-300">
          Voltar ao início
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          id="btn-voltar-abastecimento"
          onClick={onVoltar}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Fuel className="h-5 w-5 text-orange-400" />
            Registrar Abastecimento
          </h2>
          <p className="text-xs text-slate-400">{veiculoPlaca}</p>
        </div>
      </div>

      {/* Upload NF */}
      <div className="rounded-xl border border-dashed border-slate-600/60 bg-slate-800/30">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          id="input-nf-abast"
          onChange={handleArquivo}
        />
        {nfFile ? (
          <div className="flex items-center gap-3 p-4">
            {preview ? (
              <img
                src={preview}
                alt="Preview NF"
                className="h-16 w-16 rounded-lg object-cover border border-slate-600 shadow-sm"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-rose-400">
                <FileText className="h-7 w-7" />
                <span className="text-[9px] font-black uppercase tracking-wider mt-0.5">PDF</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-slate-200 truncate">{nfFile.name}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold uppercase shrink-0">
                  PDF A4
                </span>
              </div>
              {ocrLendo ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold animate-pulse mt-0.5">
                  <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  <span>Lendo Comprovante com IA...</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {(nfFile.size / 1024).toFixed(1)} KB · Documento padronizado para auditoria
                </p>
              )}
            </div>
            <button
              onClick={removerArquivo}
              disabled={ocrLendo}
              className="text-slate-500 hover:text-red-400 p-1 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            id="btn-foto-nf-abast"
            onClick={() => fileRef.current?.click()}
            disabled={ocrLendo}
            className="w-full flex flex-col items-center gap-2 p-6 hover:bg-slate-700/20 transition-colors rounded-xl"
          >
            {ocrLendo ? (
              <>
                <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
                <p className="text-sm font-semibold text-amber-400">Lendo Nota Fiscal com IA...</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate-400">
                  <Camera className="h-7 w-7 text-orange-400" />
                  <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
                </div>
                <p className="text-sm font-medium text-slate-200">Foto ou PDF da Nota Fiscal</p>
                <p className="text-xs text-slate-400">
                  Leitura automática com IA · Cupom Fiscal, Getnet ou PDF
                </p>
              </>
            )}
          </button>
        )}
      </div>

      {/* Pergunta de Verificação no Posto de Combustível */}
      <div className="p-4 rounded-2xl border border-slate-700/80 bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-transparent space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
              <Fuel className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-100">
                Você está no posto de combustível agora?
              </h4>
              <p className="text-[11px] text-slate-400">
                Se sim, preenchemos os primeiros dígitos do odômetro para você apenas completar os 3
                últimos do painel.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRespostaPosto(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                estaNoPosto === true
                  ? "bg-orange-600 text-white shadow-xs"
                  : "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              <span>Sim, estou no posto</span>
            </button>

            <button
              type="button"
              onClick={() => handleRespostaPosto(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                estaNoPosto === false
                  ? "bg-slate-700 text-white shadow-xs"
                  : "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Não, lançamento posterior</span>
            </button>
          </div>
        </div>

        {estaNoPosto === true && (
          <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-2 text-xs text-orange-300 font-medium animate-in fade-in duration-150">
            <Sparkles className="h-4 w-4 shrink-0 text-orange-400" />
            <span>
              Modo de calibração ativo: complete o campo <strong>KM Atual</strong> com os 3 dígitos
              finais que aparecem no painel do carro para atualizar o odômetro real do veículo!
            </span>
          </div>
        )}
      </div>

      {/* Formulário */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Data *">
            <input
              id="abast-data"
              type="date"
              value={form.data_abastecimento}
              onChange={(e) => set("data_abastecimento", e.target.value)}
              className={inputCls}
            />
          </Campo>
          <Campo label="KM Atual">
            <div className="space-y-1">
              <input
                id="abast-km"
                type="number"
                value={form.km_atual}
                onChange={(e) => set("km_atual", e.target.value)}
                className={`${inputCls} ${
                  estaNoPosto === true
                    ? "border-orange-500 bg-emerald-950/20 text-emerald-200 focus:ring-orange-500"
                    : ""
                }`}
                placeholder={estaNoPosto === true ? "3 últimos dígitos" : "0"}
                min="0"
              />
              {estaNoPosto === true && (
                <p className="text-[10px] text-orange-400 font-medium">
                  * Prefixo carregado. Complete com os 3 dígitos finais do painel.
                </p>
              )}
            </div>
          </Campo>
        </div>

        <Campo label="Combustível *">
          <select
            id="abast-combustivel"
            value={form.combustivel}
            onChange={(e) => set("combustivel", e.target.value as TipoCombustivel)}
            className={inputCls}
          >
            {COMBUSTIVEIS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Litros *">
            <input
              id="abast-litros"
              type="number"
              value={form.litros}
              onChange={(e) => handleValorOuLitros("litros", e.target.value)}
              className={inputCls}
              placeholder="0.000"
              step="0.001"
              min="0"
            />
          </Campo>
          <Campo label="Valor Total (R$) *">
            <MoedaInput
              id="abast-valor-total"
              value={Number(form.valor_total) || 0}
              onChange={(val) => handleValorOuLitros("valor_total", String(val))}
              className={inputCls}
            />
          </Campo>
        </div>

        {form.valor_por_litro && (
          <p className="text-xs text-orange-400 text-right">
            R$ {parseFloat(form.valor_por_litro).toFixed(4)} / litro
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Posto">
            <input
              id="abast-posto-nome"
              type="text"
              value={form.posto_nome}
              onChange={(e) => set("posto_nome", e.target.value)}
              className={inputCls}
              placeholder="Nome do posto"
            />
          </Campo>
          <Campo label="Cidade">
            <input
              id="abast-posto-cidade"
              type="text"
              value={form.posto_cidade}
              onChange={(e) => set("posto_cidade", e.target.value)}
              className={inputCls}
              placeholder="Cidade"
            />
          </Campo>
        </div>

        <Campo label="Nro da NF">
          <input
            id="abast-nf-numero"
            type="text"
            value={form.nf_numero}
            onChange={(e) => set("nf_numero", e.target.value)}
            className={inputCls}
            placeholder="Número da nota fiscal"
          />
        </Campo>

        <Campo label="Observações">
          <textarea
            id="abast-obs"
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="Observações opcionais…"
          />
        </Campo>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{erro}</p>
        </div>
      )}

      <button
        id="btn-salvar-abastecimento"
        onClick={handleSalvar}
        disabled={salvando}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
          bg-orange-600 hover:bg-orange-500 disabled:opacity-60
          text-white font-semibold transition-colors"
      >
        {salvando ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Salvando…
          </>
        ) : (
          <>
            <CheckCircle className="h-5 w-5" /> Registrar Abastecimento
          </>
        )}
      </button>
    </div>
  );
}

const inputCls =
  "w-full bg-slate-800 border border-slate-700/60 rounded-lg px-3 py-2.5 text-sm text-slate-200 " +
  "placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
