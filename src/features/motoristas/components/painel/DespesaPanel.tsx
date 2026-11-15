import React, { useState, useRef, useEffect } from "react";
import {
  Receipt,
  Camera,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  X,
  Upload,
  Sparkles,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registrarDespesa } from "../../services/motoristasService";
import { extrairDadosNF } from "@/features/financeiro/services/ocrNfService";
import { converterImagemParaPdf } from "@/shared/lib/comprovantePdfHelper";
import { MoedaInput } from "@/shared/components/MoedaInput";
import type { DespesaForm, CategoriaDespesa } from "../../types";

interface Props {
  clienteId: string;
  motoristaId: string;
  veiculoId: string;
  veiculoPlaca: string;
  onVoltar: () => void;
}

const CATEGORIAS: { value: CategoriaDespesa; label: string }[] = [
  { value: "pedagio", label: "Pedágio" },
  { value: "estacionamento", label: "Estacionamento" },
  { value: "lavagem", label: "Lavagem" },
  { value: "multa", label: "Multa" },
  { value: "refeicao", label: "Refeição" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "outro", label: "Outro" },
];

const SUGESTOES_RAPIDAS = [
  { label: "Pedágio", cat: "pedagio" as CategoriaDespesa },
  { label: "Estacionamento", cat: "estacionamento" as CategoriaDespesa },
  { label: "Lavagem Completa", cat: "lavagem" as CategoriaDespesa },
  { label: "Almoço / Refeição", cat: "refeicao" as CategoriaDespesa },
  { label: "Borracharia / Calibragem", cat: "outro" as CategoriaDespesa },
];

const hoje = new Date().toISOString().split("T")[0];

// ============================================================================
// DespesaPanel — registro de despesas pelo motorista com OCR de NF e Odômetro
// ============================================================================
export function DespesaPanel({ clienteId, motoristaId, veiculoId, veiculoPlaca, onVoltar }: Props) {
  const [form, setForm] = useState<DespesaForm>({
    veiculo_id: veiculoId,
    data_despesa: hoje,
    categoria: "pedagio",
    descricao: "",
    valor: "",
    km_atual: "",
    nf_numero: "",
    observacoes: "",
  });

  const [valorCentavos, setValorCentavos] = useState<number>(0);
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ocrLendo, setOcrLendo] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carrega o odômetro atual do veículo para pré-preenchimento
  useEffect(() => {
    if (!veiculoId) return;
    supabase
      .from("veiculos")
      .select("odometro_km")
      .eq("id", veiculoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.odometro_km) {
          setForm((f) => ({
            ...f,
            km_atual: f.km_atual || String(Math.round(Number(data.odometro_km))),
          }));
        }
      });
  }, [veiculoId]);

  const set = (campo: keyof DespesaForm, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

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
        tipo: "Despesa",
        placa: veiculoPlaca,
        data: form.data_despesa,
      });
    } catch (convErr) {
      console.warn("Conversão para PDF falhou, usando original:", convErr);
    }
    setNfFile(arquivoFinal);

    // Leitura inteligente de NF via IA
    try {
      setOcrLendo(true);
      toast.info("Lendo nota fiscal com Inteligência Artificial...", {
        icon: <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />,
      });
      const ocr = await extrairDadosNF(file);

      if (ocr) {
        const d = ocr;
        setForm((prev) => ({
          ...prev,
          data_despesa: d.data || prev.data_despesa,
          valor: d.valor_total ? String(d.valor_total) : prev.valor,
          nf_numero: d.nf_numero || prev.nf_numero,
          descricao: prev.descricao || d.descricao_itens || d.posto_nome || "",
          observacoes:
            prev.observacoes ||
            (d.posto_nome
              ? `Estabelecimento: ${d.posto_nome}${d.posto_cidade ? ` - ${d.posto_cidade}` : ""}`
              : ""),
        }));

        if (d.valor_total && d.valor_total > 0) {
          setValorCentavos(Math.round(d.valor_total * 100));
        }

        toast.success("Dados da nota fiscal preenchidos pela IA!");
      }
    } catch (err: any) {
      console.warn("Falha no OCR da NF de despesa:", err);
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
    const valorFinal = valorCentavos > 0 ? (valorCentavos / 100).toFixed(2) : form.valor;
    if (!form.descricao.trim()) {
      setErro("Informe a descrição da despesa.");
      return;
    }
    if (!valorFinal || Number(valorFinal) <= 0) {
      setErro("Informe o valor da despesa.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await registrarDespesa(clienteId, motoristaId, { ...form, valor: valorFinal }, nfFile);
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
        <h3 className="text-lg font-bold text-slate-200">Despesa registrada!</h3>
        <p className="text-sm text-slate-400 max-w-xs">
          {nfFile
            ? "A nota fiscal foi enviada e processada. O comprovante está arquivado no sistema."
            : "Registro salvo com sucesso."}
        </p>
        <button
          id="btn-nova-despesa"
          onClick={() => {
            setSucesso(false);
            setForm({
              veiculo_id: veiculoId,
              data_despesa: hoje,
              categoria: "pedagio",
              descricao: "",
              valor: "",
              km_atual: "",
              nf_numero: "",
              observacoes: "",
            });
            setValorCentavos(0);
            setNfFile(null);
            setPreview(null);
          }}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Registrar outra
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
          id="btn-voltar-despesa"
          onClick={onVoltar}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-400" />
            Registrar Despesa
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
          id="input-nf-despesa"
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
                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400 mt-1 font-medium animate-pulse">
                  <Sparkles className="h-3 w-3" /> Lendo comprovante com IA...
                </span>
              ) : (
                <p className="text-xs text-slate-400">
                  {(nfFile.size / 1024).toFixed(1)} KB · Documento padronizado para auditoria
                </p>
              )}
            </div>
            <button onClick={removerArquivo} className="text-slate-500 hover:text-red-400 p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            id="btn-foto-nf-despesa"
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-2 p-6 hover:bg-slate-700/20 transition-colors rounded-xl"
          >
            <Camera className="h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-400">Foto ou PDF do Recibo / Nota Fiscal</p>
            <p className="text-xs text-cyan-400/80 flex items-center gap-1 font-medium">
              <Sparkles className="h-3 w-3" /> Leitura e preenchimento automático por Inteligência
              Artificial
            </p>
          </button>
        )}
      </div>

      {/* Sugestões Rápidas */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] text-slate-400 font-medium mr-1">Rápido:</span>
        {SUGESTOES_RAPIDAS.map((sug) => (
          <button
            key={sug.label}
            type="button"
            onClick={() => {
              setForm((f) => ({ ...f, categoria: sug.cat, descricao: sug.label }));
            }}
            className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700/70 text-slate-300 hover:text-white transition-colors"
          >
            {sug.label}
          </button>
        ))}
      </div>

      {/* Formulário */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Data *">
            <input
              id="despesa-data"
              type="date"
              value={form.data_despesa}
              onChange={(e) => set("data_despesa", e.target.value)}
              className={inputCls}
            />
          </Campo>
          <Campo label="Categoria *">
            <select
              id="despesa-categoria"
              value={form.categoria}
              onChange={(e) => set("categoria", e.target.value as CategoriaDespesa)}
              className={inputCls}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo label="Descrição *">
          <input
            id="despesa-descricao"
            type="text"
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            className={inputCls}
            placeholder="Ex: Pedágio Anhanguera km 45"
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor (R$) *">
            <MoedaInput
              value={valorCentavos}
              onChange={(centavos) => {
                setValorCentavos(centavos);
                set("valor", (centavos / 100).toFixed(2));
              }}
              className={inputCls}
              placeholder="R$ 0,00"
            />
          </Campo>
          <Campo label="KM Atual">
            <input
              id="despesa-km"
              type="number"
              value={form.km_atual}
              onChange={(e) => set("km_atual", e.target.value)}
              className={inputCls}
              placeholder="0"
              min="0"
            />
          </Campo>
        </div>

        <Campo label="Nro da NF / Recibo">
          <input
            id="despesa-nf-numero"
            type="text"
            value={form.nf_numero}
            onChange={(e) => set("nf_numero", e.target.value)}
            className={inputCls}
            placeholder="Número do comprovante"
          />
        </Campo>

        <Campo label="Observações">
          <textarea
            id="despesa-obs"
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
        id="btn-salvar-despesa"
        onClick={handleSalvar}
        disabled={salvando || ocrLendo}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
          bg-blue-600 hover:bg-blue-500 disabled:opacity-60
          text-white font-semibold transition-colors shadow-lg shadow-blue-500/20"
      >
        {salvando ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Salvando…
          </>
        ) : (
          <>
            <CheckCircle className="h-5 w-5" /> Registrar Despesa
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
