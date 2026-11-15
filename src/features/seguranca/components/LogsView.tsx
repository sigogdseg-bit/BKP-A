import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  User,
  Clock,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Lock,
  UploadCloud,
  Copy,
  Check,
  FileCheck,
  XCircle,
  FileBadge,
  LogIn,
  Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  verificarDocumentoPdf,
  verificarDocumentoPorHash,
  listarDocumentosEmitidos,
} from "../services/documentosService";
import type { DocumentoEmitido, ResultadoVerificacaoDocumento } from "../types/documento";

function formatarBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatarTipoDocumento(tipo: string): { label: string; cor: string } {
  switch (tipo) {
    case "CONTRATO_PRESTACAO_SERVICOS":
      return {
        label: "Contrato de Adesão",
        cor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      };
    case "PROPOSTA_COMERCIAL":
      return {
        label: "Proposta Comercial",
        cor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
      };
    case "LAUDO_TELEMETRIA":
      return {
        label: "Laudo de Telemetria",
        cor: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
      };
    case "RELATORIO_FINANCEIRO":
      return {
        label: "Relatório Financeiro",
        cor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
      };
    default:
      return {
        label: tipo.replace(/_/g, " "),
        cor: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
      };
  }
}

export function LogsView() {
  const hoje = new Date();
  const [aba, setAba] = useState<"login" | "atividade" | "documentos">("login");
  const [logsLogin, setLogsLogin] = useState<any[]>([]);
  const [logsAtividade, setLogsAtividade] = useState<any[]>([]);
  const [documentosEmitidos, setDocumentosEmitidos] = useState<DocumentoEmitido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroAno, setFiltroAno] = useState<number | "todos">("todos");
  const [filtroMes, setFiltroMes] = useState<number | "todos">("todos");

  // Estado para a aba de Conferência de Documentos
  const [verificandoArquivo, setVerificandoArquivo] = useState(false);
  const [resultadoVerificacao, setResultadoVerificacao] =
    useState<ResultadoVerificacaoDocumento | null>(null);
  const [hashManual, setHashManual] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [hashCopiado, setHashCopiado] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MESES = [
    { valor: 1, nome: "Janeiro" },
    { valor: 2, nome: "Fevereiro" },
    { valor: 3, nome: "Março" },
    { valor: 4, nome: "Abril" },
    { valor: 5, nome: "Maio" },
    { valor: 6, nome: "Junho" },
    { valor: 7, nome: "Julho" },
    { valor: 8, nome: "Agosto" },
    { valor: 9, nome: "Setembro" },
    { valor: 10, nome: "Outubro" },
    { valor: 11, nome: "Novembro" },
    { valor: 12, nome: "Dezembro" },
  ];
  const ANOS = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Sempre mantém a lista e contagem de documentos emitidos atualizada
      const carregarDocs = listarDocumentosEmitidos().then((docs) => {
        setDocumentosEmitidos(docs);
      });

      let queryLogin = supabase.from("system_login_logs").select("*");
      let queryAtiv = supabase.from("system_activity_logs").select("*");

      if (filtroAno !== "todos" && filtroMes !== "todos") {
        const anoNum = Number(filtroAno);
        const mesNum = Number(filtroMes);
        const mesStr = String(mesNum).padStart(2, "0");
        const ultimoDia = new Date(anoNum, mesNum, 0).getDate();
        const ultimoDiaStr = String(ultimoDia).padStart(2, "0");
        const inicioIso = `${anoNum}-${mesStr}-01T00:00:00.000Z`;
        const fimIso = `${anoNum}-${mesStr}-${ultimoDiaStr}T23:59:59.999Z`;

        queryLogin = queryLogin.gte("created_at", inicioIso).lte("created_at", fimIso);
        queryAtiv = queryAtiv.gte("created_at", inicioIso).lte("created_at", fimIso);
      } else if (filtroAno !== "todos") {
        const anoNum = Number(filtroAno);
        const inicioIso = `${anoNum}-01-01T00:00:00.000Z`;
        const fimIso = `${anoNum}-12-31T23:59:59.999Z`;

        queryLogin = queryLogin.gte("created_at", inicioIso).lte("created_at", fimIso);
        queryAtiv = queryAtiv.gte("created_at", inicioIso).lte("created_at", fimIso);
      }

      if (aba === "documentos") {
        await carregarDocs;
      } else if (aba === "login") {
        const [resLogin] = await Promise.all([
          queryLogin.order("created_at", { ascending: false }).limit(200),
          carregarDocs,
        ]);
        if (resLogin.data) setLogsLogin(resLogin.data);
      } else {
        const [resAtiv] = await Promise.all([
          queryAtiv.order("created_at", { ascending: false }).limit(200),
          carregarDocs,
        ]);
        if (resAtiv.data) setLogsAtividade(resAtiv.data);
      }
    } finally {
      setCarregando(false);
    }
  }, [aba, filtroAno, filtroMes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Carrega contagens iniciais das 3 abas em background no mount
  useEffect(() => {
    supabase
      .from("system_login_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setLogsLogin(data);
      });
    supabase
      .from("system_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setLogsAtividade(data);
      });
    listarDocumentosEmitidos().then((docs) => setDocumentosEmitidos(docs));
  }, []);

  const processarArquivoPdf = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Por favor, selecione um arquivo em formato PDF (.pdf).");
      return;
    }

    setVerificandoArquivo(true);
    setResultadoVerificacao(null);

    try {
      const res = await verificarDocumentoPdf(file);
      setResultadoVerificacao(res);
      if (res.integro) {
        toast.success("Documento autêntico e íntegro localizado!");
      } else {
        toast.error("Documento não reconhecido ou adulterado.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao verificar documento.");
    } finally {
      setVerificandoArquivo(false);
    }
  };

  const processarHashManual = async () => {
    const hashLimpo = hashManual.trim();
    if (!hashLimpo || hashLimpo.length < 16) {
      toast.error("Informe um Hash SHA-256 válido para verificação.");
      return;
    }

    setVerificandoArquivo(true);
    setResultadoVerificacao(null);

    try {
      const res = await verificarDocumentoPorHash(hashLimpo);
      setResultadoVerificacao(res);
      if (res.integro) {
        toast.success("Documento oficial localizado na base forense!");
      } else {
        toast.error("Hash não localizado nos registros do sistema.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha ao verificar hash.");
    } finally {
      setVerificandoArquivo(false);
    }
  };

  const copiarParaTransferencia = (texto: string) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(texto);
    setHashCopiado(texto);
    toast.success("Hash SHA-256 copiado para a área de transferência!");
    setTimeout(() => setHashCopiado(null), 3000);
  };

  const filtradosLogin = logsLogin.filter((l) => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (
      (l.email || "").toLowerCase().includes(b) ||
      (l.role || "").toLowerCase().includes(b) ||
      (l.user_agent || "").toLowerCase().includes(b)
    );
  });

  const filtradosAtividade = logsAtividade.filter((a) => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (
      (a.acao || "").toLowerCase().includes(b) ||
      (a.detalhe || "").toLowerCase().includes(b) ||
      (a.hash_sha256 || "").toLowerCase().includes(b)
    );
  });

  const filtradosDocumentos = documentosEmitidos.filter((d) => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (
      (d.nome_arquivo || "").toLowerCase().includes(b) ||
      (d.descricao || "").toLowerCase().includes(b) ||
      (d.tipo_documento || "").toLowerCase().includes(b) ||
      (d.emissor_nome || "").toLowerCase().includes(b) ||
      (d.emissor_email || "").toLowerCase().includes(b) ||
      (d.hash_sha256 || "").toLowerCase().includes(b)
    );
  });

  return (
    <div className="space-y-5 max-w-6xl mx-auto select-none">
      {/* 1. Cabeçalho Canônico Neumorphic Hunter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <FileText className="h-6 w-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                Logs e Auditoria do Sistema
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                Forense SHA-256
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Rastreabilidade forense de autenticações, atividades operacionais e conferência de
              integridade de PDFs
            </p>
          </div>
        </div>

        {/* Abas e Ações */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-1 bg-[#fbf2e9] dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300/60 dark:border-slate-700 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none w-full sm:w-auto overflow-hidden">
            <button
              onClick={() => {
                setAba("login");
                setResultadoVerificacao(null);
              }}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                aba === "login"
                  ? "bg-[#fbf2e9] dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-slate-300/60 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>Logins ({logsLogin.length})</span>
            </button>
            <button
              onClick={() => {
                setAba("atividade");
                setResultadoVerificacao(null);
              }}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                aba === "atividade"
                  ? "bg-[#fbf2e9] dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-slate-300/60 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              <span>Atividades ({logsAtividade.length})</span>
            </button>
            <button
              onClick={() => setAba("documentos")}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                aba === "documentos"
                  ? "bg-[#fbf2e9] dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-slate-300/60 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <FileCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Conferência de PDFs ({documentosEmitidos.length})</span>
            </button>
          </div>

          <button
            onClick={carregar}
            disabled={carregando}
            className="p-2.5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md transition shrink-0"
            title="Recarregar Registros"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin text-emerald-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* ABA: CONFERÊNCIA DE PDFs */}
      {aba === "documentos" ? (
        <div className="space-y-6">
          {/* Card de Upload / Dropzone para Conferência Forense */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-6 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Conferência de Autenticidade e Integridade de Documentos
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Envie o arquivo PDF emitido pelo sistema para conferir se está íntegro e extrair
                  os dados forenses oficiais
                </p>
              </div>
              <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                Operador e Adm
              </span>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processarArquivoPdf(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                arrastando
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[1.01]"
                  : "border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40 hover:border-emerald-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processarArquivoPdf(file);
                }}
              />

              <div className="flex flex-col items-center justify-center gap-2.5">
                <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <UploadCloud className="h-7 w-7 stroke-[2.2]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Arraste e solte o PDF para conferência aqui
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    ou clique para selecionar o documento (.pdf) no seu dispositivo
                  </p>
                </div>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                  Cálculo binário SHA-256 via Web Crypto API · Verificação imediata
                </span>
              </div>
            </div>

            {/* Verificação por Hash Manual */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={hashManual}
                onChange={(e) => setHashManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") processarHashManual();
                }}
                placeholder="Ou informe/cole o Hash SHA-256 (64 hexadecimais) para consulta direta..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={processarHashManual}
                disabled={verificandoArquivo || !hashManual.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition disabled:opacity-50"
              >
                Conferir Hash
              </button>
            </div>
          </div>

          {/* Estado de Carregamento da Verificação */}
          {verificandoArquivo && (
            <div className="p-8 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-center space-y-3 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl animate-pulse">
              <RefreshCw className="h-8 w-8 text-emerald-600 dark:text-emerald-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Calculando hash criptográfico SHA-256 e conferindo autenticidade forense...
              </p>
              <p className="text-xs text-slate-500 font-mono">
                Comparando assinatura binária com o registro oficial de emissão
              </p>
            </div>
          )}

          {/* Resultado da Conferência de Autenticidade */}
          {resultadoVerificacao && !verificandoArquivo && (
            <div
              className={`p-6 rounded-3xl border transition-all shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl ${
                resultadoVerificacao.integro
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/40"
                  : "bg-rose-50/70 dark:bg-rose-950/20 border-rose-500/40"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      resultadoVerificacao.integro
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                        : "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                    }`}
                  >
                    {resultadoVerificacao.integro ? (
                      <ShieldCheck className="h-7 w-7" />
                    ) : (
                      <ShieldAlert className="h-7 w-7" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-black uppercase tracking-wider ${
                          resultadoVerificacao.integro
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        {resultadoVerificacao.integro
                          ? "DOCUMENTO ÍNTEGRO E AUTÊNTICO"
                          : "DOCUMENTO NÃO RECONHECIDO OU ADULTERADO"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          resultadoVerificacao.integro
                            ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {resultadoVerificacao.integro ? "Autêntico" : "Inválido"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                      {resultadoVerificacao.mensagem}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setResultadoVerificacao(null);
                    setHashManual("");
                  }}
                  className="self-start md:self-auto px-3.5 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Conferir Outro PDF
                </button>
              </div>

              {/* Informações Forenses Retornadas */}
              {resultadoVerificacao.integro && resultadoVerificacao.documento ? (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Nome do Arquivo */}
                  <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Nome do Arquivo Oficial
                    </span>
                    <p className="font-bold text-slate-900 dark:text-slate-100 break-all">
                      {resultadoVerificacao.documento.nome_arquivo}
                    </p>
                    {resultadoVerificacao.nomeArquivoEnviado &&
                      resultadoVerificacao.nomeArquivoEnviado !==
                        resultadoVerificacao.documento.nome_arquivo && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          (Arquivo enviado para conferência:{" "}
                          {resultadoVerificacao.nomeArquivoEnviado})
                        </p>
                      )}
                  </div>

                  {/* Do que se trata */}
                  <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Do que se trata o Documento
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          formatarTipoDocumento(resultadoVerificacao.documento.tipo_documento).cor
                        }`}
                      >
                        {formatarTipoDocumento(resultadoVerificacao.documento.tipo_documento).label}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {resultadoVerificacao.documento.descricao}
                    </p>
                  </div>

                  {/* Data e Hora de Emissão */}
                  <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Data e Hora de Emissão
                    </span>
                    <p className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {new Date(resultadoVerificacao.documento.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Tamanho do documento:{" "}
                      {formatarBytes(resultadoVerificacao.documento.tamanho_bytes)}
                    </p>
                  </div>

                  {/* Quem Emitiu */}
                  <div className="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Quem Emitiu o Documento
                    </span>
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {resultadoVerificacao.documento.emissor_nome}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {resultadoVerificacao.documento.emissor_email} · Perfil:{" "}
                      <span className="font-bold uppercase">
                        {resultadoVerificacao.documento.emissor_role || "Operador"}
                      </span>
                    </p>
                  </div>

                  {/* Hash SHA-256 Forense */}
                  <div className="md:col-span-2 bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-2xl border border-emerald-500/20 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Hash Forense Criptográfico (SHA-256)
                      </span>
                      <button
                        onClick={() =>
                          copiarParaTransferencia(resultadoVerificacao.documento!.hash_sha256)
                        }
                        className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        {hashCopiado === resultadoVerificacao.documento.hash_sha256 ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar Hash</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 break-all">
                      {resultadoVerificacao.documento.hash_sha256}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3 text-xs">
                  <div className="bg-white/80 dark:bg-slate-900/80 p-4 rounded-2xl border border-rose-500/20 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Hash Calculado do Arquivo Enviado
                    </span>
                    <p className="font-mono text-[11px] text-rose-700 dark:text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20 break-all">
                      {resultadoVerificacao.hashCalculado}
                    </p>
                    {resultadoVerificacao.nomeArquivoEnviado && (
                      <p className="text-slate-600 dark:text-slate-400">
                        Arquivo analisado:{" "}
                        <span className="font-bold">{resultadoVerificacao.nomeArquivoEnviado}</span>{" "}
                        ({formatarBytes(resultadoVerificacao.tamanhoArquivoEnviado)})
                      </p>
                    )}
                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Aviso Forense: Documentos emitidos pelo GD Rastreamento possuem assinatura
                      digital inalterável. Qualquer modificação de caractere, número, data ou valor
                      invalida completamente o hash criptográfico.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lista de Documentos Emitidos Oficialmente */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-3.5 rounded-2xl shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md">
              <div className="flex items-center gap-2">
                <FileBadge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Documentos Emitidos Oficialmente ({documentosEmitidos.length})
                </h3>
              </div>

              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por arquivo, descrição, emissor ou hash..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Itens */}
            <div className="space-y-2">
              {filtradosDocumentos.length === 0 ? (
                <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs bg-[#fbf2e9] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-xl">
                  {documentosEmitidos.length === 0
                    ? "Nenhum documento emitido registrado até o momento."
                    : "Nenhum documento encontrado com o filtro informado."}
                </div>
              ) : (
                filtradosDocumentos.map((doc) => {
                  const infoTipo = formatarTipoDocumento(doc.tipo_documento);
                  return (
                    <div
                      key={doc.id}
                      className="p-4 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md hover:border-emerald-500/40 transition"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100 break-all">
                            {doc.nome_arquivo}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider border ${infoTipo.cor}`}
                          >
                            {infoTipo.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">
                          {doc.descricao}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                          <span>
                            Emitido por:{" "}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {doc.emissor_nome}
                            </strong>{" "}
                            ({doc.emissor_email})
                          </span>
                          {doc.tamanho_bytes ? (
                            <span>Tamanho: {formatarBytes(doc.tamanho_bytes)}</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[10px] text-slate-400 font-mono truncate max-w-sm">
                            Hash: {doc.hash_sha256}
                          </span>
                          <button
                            onClick={() => copiarParaTransferencia(doc.hash_sha256)}
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 font-bold"
                          >
                            <Copy className="h-3 w-3" />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-right text-slate-500 dark:text-slate-400 text-[11px] shrink-0 font-mono self-end md:self-center">
                        {new Date(doc.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ABAS TRADICIONAIS: LOGIN E ATIVIDADE */
        <>
          {/* 2. Barra de Busca e Filtro */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-3 rounded-2xl shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={
                  aba === "login"
                    ? "Filtrar por e-mail, perfil ou navegador..."
                    : "Filtrar por ação, detalhe ou hash..."
                }
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={filtroAno}
                onChange={(e) =>
                  setFiltroAno(e.target.value === "todos" ? "todos" : Number(e.target.value))
                }
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="todos">Todos os Anos</option>
                {ANOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <select
                value={filtroMes}
                onChange={(e) =>
                  setFiltroMes(e.target.value === "todos" ? "todos" : Number(e.target.value))
                }
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="todos">Todos os Meses</option>
                {MESES.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Tabela / Lista de Registros */}
          <div className="space-y-2.5">
            {carregando ? (
              <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs font-mono bg-[#fbf2e9] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-xl">
                Carregando trilha de auditoria forense...
              </div>
            ) : aba === "login" ? (
              filtradosLogin.length === 0 ? (
                <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs bg-[#fbf2e9] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-xl">
                  Nenhum registro de login encontrado.
                </div>
              ) : (
                filtradosLogin.map((l) => (
                  <div
                    key={l.id}
                    className="p-4 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {l.email}
                        </span>
                        <span className="px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {l.role}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                            l.status === "sucesso"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {l.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xl">
                        {l.user_agent}
                      </div>
                    </div>
                    <div className="text-right text-slate-500 dark:text-slate-400 text-[11px] shrink-0 font-mono">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))
              )
            ) : filtradosAtividade.length === 0 ? (
              <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs bg-[#fbf2e9] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-xl">
                Nenhum registro de atividade operacional encontrado.
              </div>
            ) : (
              filtradosAtividade.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-[4px_4px_14px_#c3cfe2] dark:shadow-md"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {a.acao}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700 dark:text-slate-300">
                      {a.detalhe}
                    </div>
                    {a.hash_sha256 && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-md">
                        Hash SHA-256: {a.hash_sha256}
                      </div>
                    )}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap shrink-0 font-mono">
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
