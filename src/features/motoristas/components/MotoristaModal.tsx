// ============================================================================
// MÓDULO MOTORISTAS — Modal de Cadastro e Edição de Motorista com OCR CNH
// Diretrizes: HUNTER-GUARDIAN · DJR-NEW · Zero Mock · Zero Workaround · Portal Global
// ============================================================================
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Upload,
  Camera,
  Car,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  Lock,
  Mail,
  Eye,
  EyeOff,
  User,
  Building2,
  FileCheck2,
  Power,
  PowerOff,
  ShieldAlert,
} from "lucide-react";
import {
  cadastrarMotorista,
  extrairDadosCNH,
  atualizarMotorista,
  inativarMotorista,
  reativarMotorista,
  garantirLoginMotorista,
} from "../services/motoristasService";
import type { MotoristaForm, OcrCnhResultado, Motorista } from "../types";
import type { Cliente } from "@/features/clientes/types";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface Props {
  clienteIdPadrao?: string;
  isAdminOrOperator?: boolean;
  clientesDisponiveis?: Cliente[];
  motoristaEmEdicao?: Motorista | null;
  onSucesso: () => void;
  onFechar: () => void;
}

const CATEGORIAS_CNH = ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE", "ACC"];

function normalizarDataCnh(valor?: string): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function formatarTelefone(v: string): string {
  const nums = v.replace(/\D/g, "").slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10) return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

export function MotoristaModal({
  clienteIdPadrao,
  isAdminOrOperator,
  clientesDisponiveis = [],
  motoristaEmEdicao,
  onSucesso,
  onFechar,
}: Props) {
  const isEdit = !!motoristaEmEdicao;
  const [salvando, setSalvando] = useState(false);
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [ocrCarregando, setOcrCarregando] = useState(false);
  const [ocrSucessoMsg, setOcrSucessoMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucessoGeralMsg, setSucessoGeralMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [clienteSelecionado, setClienteSelecionado] = useState<string>(
    motoristaEmEdicao?.cliente_id || clienteIdPadrao || "",
  );

  const [form, setForm] = useState<MotoristaForm>({
    nome: motoristaEmEdicao?.nome || "",
    email: motoristaEmEdicao?.email || "",
    senha: "",
    cpf: motoristaEmEdicao?.cpf || "",
    data_nascimento: motoristaEmEdicao?.data_nascimento || "",
    telefone: formatarTelefone(motoristaEmEdicao?.telefone || ""),
    cnh_numero: motoristaEmEdicao?.cnh_numero || "",
    cnh_categoria: motoristaEmEdicao?.cnh_categoria || "",
    cnh_validade: motoristaEmEdicao?.cnh_validade || "",
    cnh_primeira_habilitacao: motoristaEmEdicao?.cnh_primeira_habilitacao || "",
    cnh_renach: motoristaEmEdicao?.cnh_renach || "",
    cnh_observacoes: motoristaEmEdicao?.cnh_observacoes || "",
    acesso_mapa: motoristaEmEdicao?.acesso_mapa ?? false,
  });

  useEffect(() => {
    if (!isEdit && clienteIdPadrao) {
      setClienteSelecionado(clienteIdPadrao);
    }
  }, [clienteIdPadrao, isEdit]);

  const setCampo = (campo: keyof MotoristaForm, valor: string | boolean) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const handleOcr = useCallback(async (file: File) => {
    setOcrCarregando(true);
    setOcrSucessoMsg(null);
    setErro(null);

    try {
      const resultado: OcrCnhResultado = await extrairDadosCNH(file);

      setForm((prev) => ({
        ...prev,
        nome: resultado.nome || prev.nome,
        cpf: resultado.cpf || prev.cpf,
        data_nascimento: resultado.data_nascimento || prev.data_nascimento,
        cnh_numero: resultado.cnh_numero || prev.cnh_numero,
        cnh_categoria: resultado.cnh_categoria || prev.cnh_categoria,
        cnh_validade: resultado.cnh_validade || prev.cnh_validade,
        cnh_primeira_habilitacao:
          resultado.cnh_primeira_habilitacao || prev.cnh_primeira_habilitacao,
        cnh_renach: resultado.cnh_renach || prev.cnh_renach,
        cnh_observacoes: resultado.cnh_observacoes || prev.cnh_observacoes,
      }));

      const qtd = resultado.campos_extraidos.length;
      if (qtd > 0) {
        setOcrSucessoMsg(
          `✓ Leitura concluída! ${qtd} campos preenchidos. Confira os dados antes de salvar.`,
        );
      } else {
        setOcrSucessoMsg("Documento processado. Confira os campos manualmente.");
      }
    } catch (e: any) {
      setErro(
        `Não foi possível extrair automaticamente: ${e.message || "Tente novamente ou preencha manualmente."}`,
      );
    } finally {
      setOcrCarregando(false);
    }
  }, []);

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleOcr(file);
    e.target.value = "";
  };

  const motoristaSemLogin = isEdit && !motoristaEmEdicao?.user_id;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucessoGeralMsg(null);

    if (!clienteSelecionado || !clienteSelecionado.trim()) {
      setErro("É obrigatório selecionar o cliente ao qual o motorista pertence.");
      return;
    }

    if (!form.nome.trim()) {
      setErro("Informe o nome do motorista.");
      return;
    }

    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErro("Informe um e-mail válido para o acesso do motorista.");
      return;
    }

    if (!isEdit && (!form.senha || form.senha.length < 6)) {
      setErro("A senha de acesso do motorista deve ter no mínimo 6 caracteres.");
      return;
    }

    if (motoristaSemLogin && (!form.senha || form.senha.length < 6)) {
      setErro(
        "Este motorista ainda não possui login criado. Defina uma senha de no mínimo 6 caracteres para ativar o acesso.",
      );
      return;
    }

    if (isEdit && form.senha && form.senha.length < 6) {
      setErro("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      if (isEdit) {
        const emailAlterado =
          form.email.trim().toLowerCase() !== (motoristaEmEdicao?.email || "").trim().toLowerCase();

        // Atualiza campos cadastrais
        await atualizarMotorista(motoristaEmEdicao!.id, {
          nome: form.nome,
          cpf: form.cpf,
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone,
          email: form.email.trim(),
          cnh_numero: form.cnh_numero,
          cnh_categoria: form.cnh_categoria,
          cnh_validade: form.cnh_validade || null,
          cnh_primeira_habilitacao: form.cnh_primeira_habilitacao || null,
          cnh_renach: form.cnh_renach,
          cnh_observacoes: form.cnh_observacoes,
          acesso_mapa: form.acesso_mapa,
        });

        // Se digitou senha, não possuía login ativo ou alterou o e-mail, garante o login de forma atômica
        if ((form.senha && form.senha.trim().length >= 6) || motoristaSemLogin || emailAlterado) {
          await garantirLoginMotorista(
            motoristaEmEdicao!.id,
            form.senha && form.senha.trim().length >= 6 ? form.senha.trim() : undefined,
            emailAlterado ? form.email.trim() : undefined,
          );
        }
      } else {
        await cadastrarMotorista(clienteSelecionado, form);
      }
      onSucesso();
    } catch (err: any) {
      setErro(err.message || "Erro ao salvar motorista.");
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!motoristaEmEdicao) return;
    setProcessandoAcao(true);
    setErro(null);
    try {
      if (motoristaEmEdicao.ativo) {
        await inativarMotorista(motoristaEmEdicao.id);
        setSucessoGeralMsg("Motorista INATIVADO com sucesso.");
      } else {
        await reativarMotorista(motoristaEmEdicao.id);
        setSucessoGeralMsg("Motorista REATIVADO com sucesso.");
      }
      onSucesso();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setProcessandoAcao(false);
    }
  };

  return (
    <ModalPortal>
      <div
        id="modal-motorista-overlay"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto select-none animate-fadeIn"
      >
        <div
          id="modal-motorista"
          className="relative w-full max-w-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl my-auto overflow-hidden flex flex-col text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[88vh] transition-colors"
        >
          {/* Cabeçalho Fixo */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/90 dark:bg-slate-950/60 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">
                  {isEdit ? "Editar Motorista" : "Cadastrar Motorista"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEdit
                    ? "Atualize os dados e a CNH (via leitura automática ou manual)"
                    : "Leitura inteligente da CNH e credenciais de acesso"}
                </p>
              </div>
            </div>
            <button
              type="button"
              id="btn-fechar-modal-motorista"
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Estruturado com Pinned Footer */}
          <form onSubmit={handleSalvar} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Corpo com Scroll */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Card de Destaque: Leitura Automática de CNH */}
              <div className="rounded-2xl border border-blue-400/40 dark:border-blue-500/30 bg-gradient-to-br from-blue-100/70 via-slate-100/80 to-white dark:from-blue-950/40 dark:via-slate-900/60 dark:to-slate-900 p-4 sm:p-4.5 shadow-sm dark:shadow-lg relative overflow-hidden">
                <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                        Leitura Automática de CNH
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-md">
                      Envie o <strong>PDF da CNH Digital</strong> ou uma{" "}
                      <strong>foto da CNH física em papel</strong>. Os dados da habilitação serão
                      lidos e preenchidos automaticamente. {isEdit && "Ótimo para CNHs renovadas!"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/webp,image/*"
                      onChange={handleArquivo}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleArquivo}
                      className="hidden"
                    />

                    <button
                      type="button"
                      id="btn-importar-cnh-pdf"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={ocrCarregando}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                      title="Importar CNH Digital em PDF ou arquivo de imagem salvo"
                    >
                      {ocrCarregando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Importar
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      id="btn-tirar-foto-cnh"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={ocrCarregando}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                      title="Tirar foto da CNH física em papel com a câmera do celular"
                    >
                      <Camera className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      Foto
                    </button>
                  </div>
                </div>

                {ocrSucessoMsg && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-orange-700 dark:text-orange-400 bg-orange-100/70 dark:bg-orange-950/40 border border-orange-500/30 rounded-xl px-3 py-2">
                    <CheckCircle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                    <span>{ocrSucessoMsg}</span>
                  </div>
                )}
              </div>

              {/* Alertas */}
              {erro && (
                <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400 bg-red-100/80 dark:bg-red-950/40 border border-red-500/30 rounded-xl p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <span>{erro}</span>
                </div>
              )}
              {sucessoGeralMsg && (
                <div className="flex items-start gap-2.5 text-xs text-orange-700 dark:text-orange-400 bg-orange-100/80 dark:bg-orange-950/40 border border-orange-500/30 rounded-xl p-3">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600 dark:text-orange-400" />
                  <span>{sucessoGeralMsg}</span>
                </div>
              )}

              {/* Alerta de Motorista Sem Login Ativo */}
              {motoristaSemLogin && (
                <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/40 border border-amber-500/40 rounded-xl p-3.5 shadow-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-bold">Acesso ao aplicativo ainda não ativado</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400/90 mt-0.5">
                      Este motorista não possui credenciais ativas em <strong>auth.users</strong>.
                      Informe uma senha abaixo para criar o login e permitir o acesso ao Portal do
                      Motorista.
                    </p>
                  </div>
                </div>
              )}

              {/* Status/Inativar (Apenas Edição) */}
              {isEdit && motoristaEmEdicao && (
                <div
                  className={`flex items-center justify-between p-3.5 rounded-xl border ${
                    motoristaEmEdicao.ativo
                      ? "bg-orange-100/60 dark:bg-orange-950/20 border-orange-500/30"
                      : "bg-red-100/60 dark:bg-red-950/20 border-red-500/30"
                  }`}
                >
                  <div>
                    <p
                      className={`text-xs font-bold ${motoristaEmEdicao.ativo ? "text-orange-700 dark:text-orange-400" : "text-red-700 dark:text-red-400"}`}
                    >
                      Status Atual: {motoristaEmEdicao.ativo ? "ATIVO" : "INATIVO"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {motoristaEmEdicao.ativo
                        ? "O motorista pode acessar o aplicativo normalmente."
                        : "O acesso do motorista está bloqueado."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAtivo}
                    disabled={processandoAcao}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                      motoristaEmEdicao.ativo
                        ? "bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25"
                        : "bg-orange-500/15 text-orange-700 dark:text-orange-400 hover:bg-orange-500/25"
                    }`}
                  >
                    {motoristaEmEdicao.ativo ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5" /> Bloquear
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5" /> Reativar
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Vínculo de Cliente */}
              {isAdminOrOperator ? (
                <div className="space-y-1.5 p-4 rounded-2xl bg-white/80 dark:bg-slate-800/40 border border-slate-300/70 dark:border-slate-700/60 shadow-xs">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Cliente Responsável pelo Motorista <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="select-cliente-motorista"
                    required
                    disabled={isEdit}
                    value={clienteSelecionado}
                    onChange={(e) => setClienteSelecionado(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs disabled:opacity-60 transition-colors"
                  >
                    <option value="">-- Selecione o Cliente Obrigatório --</option>
                    {clientesDisponiveis.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome_razao_social} {c.documento ? `(${c.documento})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input type="hidden" value={clienteSelecionado} />
              )}

              {/* Dados Pessoais */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Dados do Condutor
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nome do motorista"
                      value={form.nome}
                      onChange={(e) => setCampo("nome", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      CPF
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={form.cpf}
                      onChange={(e) => setCampo("cpf", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={form.data_nascimento}
                      onChange={(e) => setCampo("data_nascimento", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={form.telefone}
                      onChange={(e) => setCampo("telefone", formatarTelefone(e.target.value))}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Dados da CNH */}
              <div className="space-y-3 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileCheck2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Dados da Habilitação (CNH)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nº de Registro da CNH
                    </label>
                    <input
                      type="text"
                      placeholder="00000000000"
                      value={form.cnh_numero}
                      onChange={(e) => setCampo("cnh_numero", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Categoria
                    </label>
                    <select
                      value={form.cnh_categoria}
                      onChange={(e) => setCampo("cnh_categoria", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    >
                      <option value="">Selecione a categoria</option>
                      {CATEGORIAS_CNH.map((c) => (
                        <option key={c} value={c}>
                          Categoria {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Validade da CNH
                    </label>
                    <input
                      type="date"
                      value={form.cnh_validade}
                      onChange={(e) => setCampo("cnh_validade", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      1ª Habilitação
                    </label>
                    <input
                      type="date"
                      value={form.cnh_primeira_habilitacao}
                      onChange={(e) => setCampo("cnh_primeira_habilitacao", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      RENACH
                    </label>
                    <input
                      type="text"
                      placeholder="Código RENACH"
                      value={form.cnh_renach}
                      onChange={(e) => setCampo("cnh_renach", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Observações / Restrições
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: EAR, A (óculos), etc"
                      value={form.cnh_observacoes}
                      onChange={(e) => setCampo("cnh_observacoes", e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Credenciais de Acesso */}
              <div className="space-y-3 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Credenciais de Acesso ao Portal do Motorista
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      E-mail de Acesso <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        required
                        placeholder="motorista@email.com"
                        value={form.email}
                        onChange={(e) => setCampo("email", e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 shadow-xs transition-colors"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {isEdit
                        ? motoristaSemLogin
                          ? "Definir Senha de Ativação"
                          : "Redefinir Senha (opcional)"
                        : "Senha de Acesso"}{" "}
                      {(!isEdit || motoristaSemLogin) && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <input
                        type={senhaVisivel ? "text" : "password"}
                        required={!isEdit || motoristaSemLogin}
                        placeholder={
                          isEdit
                            ? motoristaSemLogin
                              ? "Crie uma senha de acesso (mínimo 6 caracteres)"
                              : "Preencha APENAS se quiser mudar a senha"
                            : "Mínimo 6 caracteres"
                        }
                        value={form.senha}
                        onChange={(e) => setCampo("senha", e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl pl-9 pr-10 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono shadow-xs transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setSenhaVisivel(!senhaVisivel)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      >
                        {senhaVisivel ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Acesso ao Mapa Operacional */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/40 border border-slate-300/70 dark:border-slate-700/60 shadow-xs mt-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Permitir Acesso ao Mapa Operacional?
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ative se desejar que o motorista visualize a localização dos seus veículos no
                      mapa.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.acesso_mapa}
                    onChange={(e) => setCampo("acesso_mapa", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 focus:ring-blue-500/30 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé de Ações Fixo e Sempre Visível (Zero Corte de Viewport) */}
            <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/95 dark:bg-slate-950/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando || processandoAcao}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || ocrCarregando || processandoAcao}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    {isEdit ? "Salvar Alterações" : "Cadastrar Motorista"}
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
