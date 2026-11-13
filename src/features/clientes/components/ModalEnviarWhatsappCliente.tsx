// ModalEnviarWhatsappCliente.tsx — SIGO Guardião
// Modal ergonômico para envio de mensagens via WhatsApp (ChatbotX / WhatsApp Web) pelo Operador ou Administrador

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Send,
  X,
  CheckCircle2,
  Copy,
  Sparkles,
  Smartphone,
  AlertCircle,
  RotateCcw,
  Paperclip,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  enviarMensagemWhatsappOperador,
  normalizarTelefoneParaWhatsapp,
  DocumentoWhatsappEnvio,
} from "@/shared/lib/chatbotxBridge";

export interface ModalEnviarWhatsappClienteProps {
  aberto: boolean;
  onClose: () => void;
  cliente: {
    id?: string;
    nome_razao_social: string;
    telefone?: string | null;
    documento?: string | null;
  } | null;
  operadorNome?: string;
}

export function ModalEnviarWhatsappCliente({
  aberto,
  onClose,
  cliente,
  operadorNome = "Operador SIGO Guardião",
}: ModalEnviarWhatsappClienteProps) {
  const { session } = useAuth();
  const [telefoneDestino, setTelefoneDestino] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [documento, setDocumento] = useState<DocumentoWhatsappEnvio | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const primeiroNome = cliente?.nome_razao_social?.split(" ")[0] || "Cliente";
  const telefoneOriginal = cliente?.telefone || "";
  const foneE164 = normalizarTelefoneParaWhatsapp(telefoneOriginal);

  const TEMPLATES_PADRAO = [
    {
      id: "suporte",
      titulo: "Suporte e Atendimento",
      icone: "💬",
      texto: `Olá, ${primeiroNome}! Aqui é da equipe do SIGO Guardião. Entramos em contato a respeito do auto-monitoramento do seu veículo. Como podemos ajudar hoje?`,
    },
    {
      id: "agendamento",
      titulo: "Confirmação de Instalação",
      icone: "🔧",
      texto: `Olá, ${primeiroNome}! Aqui é da equipe técnica do SIGO Guardião. Gostaríamos de confirmar os detalhes do agendamento da instalação do seu rastreador veicular.`,
    },
    {
      id: "alerta",
      titulo: "Aviso de Segurança / Alerta",
      icone: "🚨",
      texto: `Olá, ${primeiroNome}! Identificamos um evento de alerta de segurança em seu veículo monitorado pelo SIGO Guardião. Por favor, verifique o seu aplicativo ou nos responda aqui para averiguação.`,
    },
    {
      id: "cobranca",
      titulo: "Lembrete de Mensalidade",
      icone: "💳",
      texto: `Olá, ${primeiroNome}! Lembramos que a mensalidade do seu plano de rastreamento veicular SIGO Guardião está disponível. Qualquer dúvida ou para solicitar a 2ª via com PIX, estamos à disposição!`,
    },
  ];

  // Sincroniza estado quando um cliente for selecionado ou o modal for aberto
  useEffect(() => {
    if (aberto && cliente) {
      setTelefoneDestino(cliente.telefone || "");
      const nome = cliente.nome_razao_social?.split(" ")[0] || "Cliente";
      setMensagem(
        `Olá, ${nome}! Aqui é da equipe do SIGO Guardião. Entramos em contato a respeito do auto-monitoramento do seu veículo. Como podemos ajudar hoje?`,
      );
      setDocumento(null);
      setEnviando(false);
      setCopiado(false);
    }
  }, [aberto, cliente]);

  const podeEnviarWhatsapp = Boolean(session?.isAdmin || session?.isOperador);
  if (!aberto || !cliente || !podeEnviarWhatsapp) return null;

  const handleCopiarMensagem = () => {
    if (!mensagem) return;
    navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    toast.success("Mensagem copiada para a área de transferência!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleSelecionarDocumento = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limite preventivo de 15 MB
    const limiteBytes = 15 * 1024 * 1024;
    if (file.size > limiteBytes) {
      toast.error("O documento selecionado excede o limite máximo permitido de 15 MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setDocumento({
        nome: file.name,
        base64,
        mimetype: file.type || "application/octet-stream",
        tamanho: file.size,
      });
      toast.success(`Documento "${file.name}" anexado para envio via WhatsApp!`);
    };
    reader.onerror = () => {
      toast.error("Falha ao carregar o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoverDocumento = () => {
    setDocumento(null);
    toast.info("Documento removido.");
  };

  const handleEnviarChatbotX = async () => {
    if (!telefoneDestino.trim()) {
      toast.error("Informe um telefone de destino com DDD.");
      return;
    }
    if (!mensagem.trim() && !documento) {
      toast.error("Digite o texto da mensagem ou insira um documento para envio.");
      return;
    }

    setEnviando(true);
    try {
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: cliente.nome_razao_social,
        telefone: telefoneDestino,
        mensagem: mensagem.trim(),
        operadorNome,
        clienteId: cliente.id,
        documento: documento || undefined,
      });

      if (res.sucesso) {
        toast.success(
          documento
            ? `Mensagem e documento enviados com sucesso para o WhatsApp de ${primeiroNome} via ChatbotX!`
            : `Mensagem enviada com sucesso para o WhatsApp de ${primeiroNome} via ChatbotX!`,
        );
        onClose();
      } else {
        const isErroRede =
          res.erro?.includes("Erro de rede") ||
          res.erro?.includes("Load failed") ||
          res.erro?.includes("Failed to fetch");

        if (isErroRede) {
          toast.error(
            "Gateway WhatsApp offline ou em contingência. Verifique a Central e o status de conexão.",
            { duration: 6000 },
          );
        } else {
          toast.error(res.erro || "Falha ao enviar via Gateway WhatsApp.");
        }
      }
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message || String(e)}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-500/5 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Mensagem WhatsApp para Cliente</span>
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {cliente.nome_razao_social}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo com Rolagem Interna Segura */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Campo de Telefone */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Número do WhatsApp (Destinatário):</span>
                {foneE164 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                    Canônico: +{foneE164}
                  </span>
                )}
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={telefoneDestino}
                  onChange={(e) => setTelefoneDestino(e.target.value)}
                  placeholder="(DDD) 99999-9999"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Modelos Rápidos (Templates em 1 Clique) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  <span>Modelos Rápidos de Mensagem:</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES_PADRAO.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setMensagem(tpl.texto)}
                    className="p-2 rounded-xl text-left border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition cursor-pointer text-[11px] flex items-center gap-1.5 group"
                  >
                    <span>{tpl.icone}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                      {tpl.titulo}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Caixa de Texto da Mensagem */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Texto da Mensagem:
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {mensagem.length} caracteres
                </span>
              </div>
              <textarea
                rows={5}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Digite a mensagem personalizada que o cliente receberá no WhatsApp..."
                className="w-full p-3 text-xs leading-relaxed rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none font-medium shadow-2xs"
              />
            </div>

            {/* Inserir Documento para Envio (Opcional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="h-3 w-3 text-emerald-500" />
                  <span>Documento para Envio (Opcional):</span>
                </label>
                {documento && (
                  <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {(documento.tamanho ? documento.tamanho / 1024 : 0).toFixed(1)} KB
                  </span>
                )}
              </div>

              {!documento ? (
                <label className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:bg-emerald-500/5 hover:border-emerald-500/40 transition cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                  <Paperclip className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-semibold text-[11px]">
                    Inserir documento (PDF, DOCX, XLSX, TXT ou Imagem)
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleSelecionarDocumento}
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-[11px] truncate">{documento.nome}</p>
                      <p className="text-[9px] text-emerald-700 dark:text-emerald-300 truncate">
                        {documento.mimetype} •{" "}
                        {(documento.tamanho ? documento.tamanho / 1024 : 0).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoverDocumento}
                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                    title="Remover documento anexo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Dica Informativa de Omnichannel */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                O envio via <strong>WhatsApp Gateway</strong> despacha a mensagem pelo número
                oficial do sistema de forma 100% automatizada e auditada.
              </span>
            </div>
          </div>

          {/* Rodapé Fixo */}
          <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleCopiarMensagem}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition cursor-pointer"
              title="Copiar texto da mensagem"
            >
              {copiado ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Fechar
              </button>

              <button
                type="button"
                onClick={handleEnviarChatbotX}
                disabled={enviando || !telefoneDestino.trim() || (!mensagem.trim() && !documento)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Disparo automático pelo Gateway WhatsApp"
              >
                {enviando ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                    <span>Transmitindo...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 text-white" />
                    <span>
                      {documento ? "Enviar Mensagem e Documento" : "Enviar via WhatsApp Gateway"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
