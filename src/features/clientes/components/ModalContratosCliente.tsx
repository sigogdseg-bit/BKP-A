import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  FileText,
  Send,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Download,
  Upload,
  Copy,
  FileCheck,
  RefreshCw,
  Plus,
  MessageCircle,
  ShieldAlert,
  Hash,
  Link,
  Trash2,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { Cliente } from "../types";
import {
  listarContratosCliente,
  registrarAssinaturaContrato,
  inserirContratoJaAssinado,
  marcarContratoEnviadoCliente,
  verificarIntegridadePdfContrato,
  baixarPdfContratoArmazenado,
  cancelarContrato,
  excluirContratoTeste,
  type ContratoCliente,
} from "../services/contratosAssinadosService";
import {
  emitirContratoPrestacaoServicosPdf,
  emitirCopiaAutenticadaContratoPdf,
} from "../services/contratoPdfService";
import { APP_PUBLIC_URL } from "@/shared/lib/version";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import { supabase } from "@/integrations/supabase/client";

interface ModalContratosClienteProps {
  cliente: Cliente;
  isOpen: boolean;
  onClose: () => void;
  usuarioEmissor?: string;
  onContratoAtualizado?: () => void;
}

export function ModalContratosCliente({
  cliente,
  isOpen,
  onClose,
  usuarioEmissor = "Administrador do Sistema",
  onContratoAtualizado,
}: ModalContratosClienteProps) {
  const [contratos, setContratos] = useState<ContratoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [emitindoNovo, setEmitindoNovo] = useState(false);
  const [processandoAssinaturaId, setProcessandoAssinaturaId] = useState<string | null>(null);
  const [processandoDownloadId, setProcessandoDownloadId] = useState<string | null>(null);

  // Modal interno de confirmação: Atualização de Contrato vs Novo Contrato Adicional
  const [modalConfirmarEmissaoAberto, setModalConfirmarEmissaoAberto] = useState(false);
  const [contratoParaAtualizar, setContratoParaAtualizar] = useState<ContratoCliente | null>(null);

  // Modal interno de upload/registro de assinatura em contrato existente
  const [contratoParaAssinar, setContratoParaAssinar] = useState<ContratoCliente | null>(null);
  const [nomeSignatario, setNomeSignatario] = useState("");
  const [metodoAssinatura, setMetodoAssinatura] = useState<
    "digital" | "manuscrita" | "aceite_plataforma"
  >("digital");
  const [arquivoPdfAssinado, setArquivoPdfAssinado] = useState<File | null>(null);

  // Modal interno para inserção direta de contrato já assinado pelo cliente
  const [modalInserirAssinadoAberto, setModalInserirAssinadoAberto] = useState(false);
  const [inserindoAssinado, setInserindoAssinado] = useState(false);
  const [novoNumeroContrato, setNovoNumeroContrato] = useState("");
  const [novoNomeSignatario, setNovoNomeSignatario] = useState("");
  const [novoMetodoAssinatura, setNovoMetodoAssinatura] = useState<
    "digital" | "manuscrita" | "aceite_plataforma"
  >("digital");
  const [novaDataAssinatura, setNovaDataAssinatura] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [novoArquivoPdfAssinado, setNovoArquivoPdfAssinado] = useState<File | null>(null);

  // Modal interno de verificação de integridade
  const [contratoParaVerificar, setContratoParaVerificar] = useState<ContratoCliente | null>(null);
  const [resultadoIntegridade, setResultadoIntegridade] = useState<{
    integro: boolean;
    hashCalculado: string;
    hashArmazenado: string | null;
    mensagem: string;
  } | null>(null);
  const [verificandoArquivo, setVerificandoArquivo] = useState(false);

  const fileInputAssinaturaRef = useRef<HTMLInputElement>(null);
  const fileInputConferenciaRef = useRef<HTMLInputElement>(null);
  const fileInputInserirAssinadoRef = useRef<HTMLInputElement>(null);

  // Modal de Exclusão de Teste ou Cancelamento de Contrato
  const [contratoParaGerenciar, setContratoParaGerenciar] = useState<ContratoCliente | null>(null);
  const [modalGerenciarAberto, setModalGerenciarAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("Cancelado pelo operador");
  const [processandoAcao, setProcessandoAcao] = useState(false);

  // Carrega lista de contratos do cliente
  const carregarContratos = useCallback(async () => {
    if (!cliente.id) return;
    setCarregando(true);
    try {
      const lista = await listarContratosCliente(cliente.id);
      setContratos(lista);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar contratos do cliente.");
    } finally {
      setCarregando(false);
    }
  }, [cliente.id]);

  useEffect(() => {
    if (!isOpen) return;

    carregarContratos();

    if (!cliente?.id) return;

    // Supabase Realtime: Reatividade instantânea via WebSocket quando o cliente assina pelo celular
    const channel = supabase
      .channel(`realtime-contratos-cliente-${cliente.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contratos_clientes",
          filter: `cliente_id=eq.${cliente.id}`,
        },
        () => {
          carregarContratos();
          onContratoAtualizado?.();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, cliente?.id, carregarContratos, onContratoAtualizado]);

  // Contagens para os cards informativos / filtros bidirecionais
  const stats = useMemo(() => {
    const total = contratos.length;
    const assinados = contratos.filter((c) => c.status === "assinado").length;
    const pendentes = contratos.filter(
      (c) => c.status === "pendente_assinatura" || c.status === "enviado_cliente",
    ).length;
    const atualizados = contratos.filter((c) => c.status === "atualizado").length;
    const cancelados = contratos.filter((c) => c.status === "cancelado").length;
    return { total, assinados, pendentes, atualizados, cancelados };
  }, [contratos]);

  // Lista filtrada bidirecional
  const contratosFiltrados = useMemo(() => {
    if (!filtroStatus || filtroStatus === "todos") return contratos;
    if (filtroStatus === "assinado") return contratos.filter((c) => c.status === "assinado");
    if (filtroStatus === "pendente")
      return contratos.filter(
        (c) => c.status === "pendente_assinatura" || c.status === "enviado_cliente",
      );
    if (filtroStatus === "atualizado") return contratos.filter((c) => c.status === "atualizado");
    if (filtroStatus === "cancelado") return contratos.filter((c) => c.status === "cancelado");
    return contratos;
  }, [contratos, filtroStatus]);

  // Alterna filtro bidirecional
  const alternarFiltro = (filtro: string) => {
    setFiltroStatus((atual) => (atual === filtro ? null : filtro));
  };

  // Copia texto para a área de transferência
  const copiarTexto = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto);
    toast.success(`${label} copiado para a área de transferência!`);
  };

  // Ao clicar em emitir contrato, verifica se cliente já tem contratos ativos
  const handleClicarEmitirContrato = () => {
    const contratosValidos = contratos.filter((c) => c.status !== "cancelado");
    if (contratosValidos.length > 0) {
      // Abre diálogo perguntando se é atualização do contrato existente ou novo adicional
      setContratoParaAtualizar(contratosValidos[0]);
      setModalConfirmarEmissaoAberto(true);
    } else {
      // Cliente novo sem contratos, emite diretamente
      executarEmissaoContrato({ isAtualizacao: false });
    }
  };

  // Executa exclusão definitiva de contrato no BD
  const handleConfirmarExcluirTeste = async () => {
    if (!contratoParaGerenciar) return;
    try {
      setProcessandoAcao(true);
      const res = await excluirContratoTeste(contratoParaGerenciar);
      if (res.sucesso) {
        toast.success(res.mensagem || "Contrato excluído definitivamente do banco de dados!");
        setModalGerenciarAberto(false);
        setContratoParaGerenciar(null);
        await carregarContratos();
        onContratoAtualizado?.();
      } else {
        toast.error(res.mensagem || "Falha ao excluir contrato.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar exclusão.");
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Executa cancelamento de contrato com motivo
  const handleConfirmarCancelar = async () => {
    if (!contratoParaGerenciar) return;
    try {
      setProcessandoAcao(true);
      const res = await cancelarContrato(
        contratoParaGerenciar.id,
        motivoCancelamento.trim() || "Cancelado pelo operador",
      );
      if (res.sucesso) {
        toast.success(res.mensagem || "Contrato cancelado com sucesso!");
        setModalGerenciarAberto(false);
        setContratoParaGerenciar(null);
        await carregarContratos();
        onContratoAtualizado?.();
      } else {
        toast.error(res.mensagem || "Falha ao cancelar contrato.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar cancelamento.");
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Executa emissão do contrato (seja como atualização com invalidação do anterior ou como novo independente)
  const executarEmissaoContrato = async (opcoes: {
    isAtualizacao: boolean;
    contratoAnterior?: ContratoCliente | null;
  }) => {
    try {
      setEmitindoNovo(true);
      setModalConfirmarEmissaoAberto(false);
      toast.info(
        opcoes.isAtualizacao
          ? `Gerando atualização do Contrato ${opcoes.contratoAnterior?.numero_contrato}...`
          : "Gerando novo contrato com selo de autenticidade...",
      );

      await emitirContratoPrestacaoServicosPdf({
        cliente,
        usuarioEmissor,
        isAtualizacao: opcoes.isAtualizacao,
        contratoAnteriorId: opcoes.contratoAnterior?.id,
        numeroContratoAnterior: opcoes.contratoAnterior?.numero_contrato,
      });

      toast.success(
        opcoes.isAtualizacao
          ? `Atualização gerada com sucesso! O contrato anterior (${opcoes.contratoAnterior?.numero_contrato}) foi invalidado e substituído no sistema.`
          : "Novo contrato gerado e registrado no banco de dados com sucesso!",
      );
      await carregarContratos();
      onContratoAtualizado?.();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao emitir contrato.");
    } finally {
      setEmitindoNovo(false);
    }
  };

  // Abre modal para inserir contrato assinado diretamente
  const handleAbrirInserirAssinado = () => {
    const anoAtual = new Date().getFullYear();
    const seq = String(contratos.length + 1).padStart(4, "0");
    setNovoNumeroContrato(`CTR-${seq}/${anoAtual}`);
    setNovoNomeSignatario(cliente.nome_razao_social || "");
    setNovoMetodoAssinatura("digital");
    setNovaDataAssinatura(new Date().toISOString().split("T")[0]);
    setNovoArquivoPdfAssinado(null);
    setModalInserirAssinadoAberto(true);
  };

  // Confirma e registra inserção direta de contrato assinado
  const handleConfirmarInserirAssinado = async () => {
    if (!novoArquivoPdfAssinado) {
      toast.error("Selecione o arquivo PDF assinado pelo cliente.");
      return;
    }

    try {
      setInserindoAssinado(true);
      toast.info("Processando arquivo PDF e registrando contrato no banco de dados...");

      const arrayBuffer = await novoArquivoPdfAssinado.arrayBuffer();

      const res = await inserirContratoJaAssinado({
        cliente_id: cliente.id,
        numero_contrato: novoNumeroContrato.trim(),
        pdf_assinado_buffer: arrayBuffer,
        assinado_por_nome: novoNomeSignatario.trim() || cliente.nome_razao_social,
        assinatura_metodo: novoMetodoAssinatura,
        data_assinatura: novaDataAssinatura,
        emitido_por_nome: usuarioEmissor,
        valor_mensalidade: cliente.valor_mensalidade || 0,
      });

      if (res.sucesso) {
        toast.success(
          "Contrato assinado registrado com sucesso no banco de dados com hash SHA-256 e selo SGD!",
        );
        setModalInserirAssinadoAberto(false);
        setNovoArquivoPdfAssinado(null);
        await carregarContratos();
        onContratoAtualizado?.();
      } else {
        toast.error(res.mensagem || "Falha ao registrar contrato assinado.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar contrato assinado.");
    } finally {
      setInserindoAssinado(false);
    }
  };

  // Envia contrato para o cliente exclusivamente via WhatsApp oficial do sistema
  const handleEnviarWhatsApp = async (contrato: ContratoCliente) => {
    const telefoneLimpo = (cliente.telefone || "").replace(/\D/g, "");
    if (!telefoneLimpo) {
      toast.error("O cliente não possui número de telefone/WhatsApp cadastrado para envio.");
      return;
    }

    try {
      toast.info(
        `Despachando contrato via WhatsApp do sistema para ${cliente.nome_razao_social}...`,
      );

      const linkAssinatura = `${APP_PUBLIC_URL}/assinar?codigo=${contrato.codigo_verificacao}`;
      const linkDownload = `${APP_PUBLIC_URL}/api/contratos/download/${contrato.codigo_verificacao}`;

      const textoMensagem =
        `Olá, *${cliente.nome_razao_social}*!\n\n` +
        `Segue o seu *Contrato de Prestação de Serviços e Automonitoramento Veicular — SIGO Guardião*:\n\n` +
        `📄 *Contrato nº:* ${contrato.numero_contrato}\n` +
        `🔐 *Selo de Autenticidade:* ${contrato.selo_autenticidade}\n` +
        `🔑 *Código de Verificação:* ${contrato.codigo_verificacao}\n\n` +
        `📥 *Link para Baixar / Visualizar o Contrato em PDF:*\n${linkDownload}\n\n` +
        `✍️ *Link para Assinar Digitalmente pelo Celular (1 Toque):*\n${linkAssinatura}\n\n` +
        `A assinatura é rápida, 100% digital e realizada diretamente pelo seu dispositivo com plena validade jurídica e força executiva (MP nº 2.200-2/2001 e Lei nº 14.063/2020).\n\n` +
        `Estamos à sua inteira disposição!`;

      const res = await enviarMensagemWhatsappOperador({
        telefone: telefoneLimpo,
        mensagem: textoMensagem,
        operadorNome: usuarioEmissor,
        clienteNome: cliente.nome_razao_social,
        clienteId: cliente.id,
      });

      if (res.sucesso) {
        await marcarContratoEnviadoCliente(contrato.id);
        toast.success("Contrato despachado com sucesso pelo WhatsApp do sistema!");
        await carregarContratos();
        onContratoAtualizado?.();
      } else {
        toast.error(res.erro || "Falha ao enviar mensagem pelo WhatsApp do sistema.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao despachar contrato via WhatsApp do sistema.");
    }
  };

  // Confirma e registra a devolução do contrato assinado
  const handleConfirmarAssinatura = async () => {
    if (!contratoParaAssinar) return;

    if (!arquivoPdfAssinado) {
      toast.error("Selecione o arquivo PDF assinado devolvido pelo cliente.");
      return;
    }

    try {
      setProcessandoAssinaturaId(contratoParaAssinar.id);
      toast.info("Processando arquivo PDF e calculando hash SHA-256...");

      const arrayBuffer = await arquivoPdfAssinado.arrayBuffer();

      const res = await registrarAssinaturaContrato({
        contrato_id: contratoParaAssinar.id,
        pdf_assinado_buffer: arrayBuffer,
        assinado_por_nome: nomeSignatario.trim() || cliente.nome_razao_social,
        assinatura_metodo: metodoAssinatura,
      });

      if (res.sucesso) {
        toast.success(
          "Contrato assinado registrado com sucesso no banco de dados com hash de integridade!",
        );
        setContratoParaAssinar(null);
        setArquivoPdfAssinado(null);
        setNomeSignatario("");
        await carregarContratos();
        onContratoAtualizado?.();
      } else {
        toast.error(res.mensagem || "Falha ao registrar assinatura.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao processar assinatura do contrato.");
    } finally {
      setProcessandoAssinaturaId(null);
    }
  };

  // Emite Cópia Autêntica com a assinatura e certificação digital do sistema
  const handleEmitirCopiaAutentica = async (contrato: ContratoCliente) => {
    try {
      setProcessandoDownloadId(contrato.id);
      toast.info("Gerando cópia autêntica certificada pelo sistema...");

      // Se temos o PDF assinado no backend, tentamos baixar direto o arquivo original assinado
      let baixado = false;
      if (contrato.status === "assinado") {
        baixado = await baixarPdfContratoArmazenado(
          contrato.id,
          `Contrato_Assinado_${cliente.nome_razao_social?.replace(/[^a-zA-Z0-9]/g, "_")}_${contrato.numero_contrato}.pdf`,
        );
      }

      // Se não havia o bytea no banco ou falhou o download, gera a Cópia Autêntica com Certificação Digital
      if (!baixado) {
        await emitirCopiaAutenticadaContratoPdf({
          cliente,
          contrato,
          usuarioEmissor,
        });
      }

      toast.success("Cópia autêntica com assinatura do sistema emitida com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao emitir cópia autêntica.");
    } finally {
      setProcessandoDownloadId(null);
    }
  };

  // Verifica a integridade de um PDF selecionado contra o hash do contrato
  const handleVerificarArquivoPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contratoParaVerificar) return;

    try {
      setVerificandoArquivo(true);
      const buffer = await file.arrayBuffer();
      const resultado = await verificarIntegridadePdfContrato(contratoParaVerificar.id, buffer);
      setResultadoIntegridade(resultado);

      if (resultado.integro) {
        toast.success("Documento autêntico e íntegro! O hash SHA-256 confere.");
      } else {
        toast.error("Alerta: O hash deste arquivo NÃO confere com o contrato registrado.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao verificar integridade do PDF.");
    } finally {
      setVerificandoArquivo(false);
      if (e.target) e.target.value = "";
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Contratos e Autenticidade Forense
              </h2>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliente:{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {cliente.nome_razao_social}
                </span>{" "}
                • CPF/CNPJ: {cliente.documento || "N/I"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Fechar Modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal com Rolagem Interna */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Cards Infográficos Interativos com Filtro Bidirecional */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <button
              type="button"
              onClick={() => alternarFiltro("todos")}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                filtroStatus === null
                  ? "bg-slate-900 text-white dark:bg-slate-700 border-slate-900"
                  : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <span className="text-[11px] font-medium block opacity-70">Total Contratos</span>
              <span className="text-xl font-black">{stats.total}</span>
            </button>

            <button
              type="button"
              onClick={() => alternarFiltro("assinado")}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                filtroStatus === "assinado"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium block opacity-90">Assinados no BD</span>
                <ShieldCheck className="h-4 w-4" />
              </div>
              <span className="text-xl font-black">{stats.assinados}</span>
            </button>

            <button
              type="button"
              onClick={() => alternarFiltro("pendente")}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                filtroStatus === "pendente"
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 hover:border-amber-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium block opacity-90">
                  Aguardando Assinatura
                </span>
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-xl font-black">{stats.pendentes}</span>
            </button>

            <button
              type="button"
              onClick={() => alternarFiltro("atualizado")}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                filtroStatus === "atualizado"
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 hover:border-amber-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium block opacity-90">Atualizados</span>
                <RefreshCw className="h-4 w-4" />
              </div>
              <span className="text-xl font-black">{stats.atualizados}</span>
            </button>

            <button
              type="button"
              onClick={() => alternarFiltro("cancelado")}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                filtroStatus === "cancelado"
                  ? "bg-slate-600 text-white border-slate-600"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium block opacity-90">Cancelados</span>
                <AlertCircle className="h-4 w-4" />
              </div>
              <span className="text-xl font-black">{stats.cancelados}</span>
            </button>
          </div>

          {/* Barra de Ação Superior */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Histórico Contratual ({contratosFiltrados.length}
              {filtroStatus ? " filtrados" : ""})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={carregarContratos}
                disabled={carregando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                title="Recarregar Contratos"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
                <span>Atualizar</span>
              </button>

              <button
                type="button"
                onClick={handleAbrirInserirAssinado}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 border border-sky-500/30 transition shadow-xs active:scale-95 cursor-pointer"
                title="Inserir documento ou cópia de contrato que já foi assinado pelo cliente"
              >
                <Upload className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                <span>Inserir Contrato Assinado</span>
              </button>

              <button
                type="button"
                onClick={handleClicarEmitirContrato}
                disabled={emitindoNovo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{emitindoNovo ? "Emitindo..." : "Emitir Novo Contrato"}</span>
              </button>
            </div>
          </div>

          {/* Lista de Contratos */}
          {carregando ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-500" />
              <p className="text-xs">Carregando cadeia de custódia dos contratos...</p>
            </div>
          ) : contratosFiltrados.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <FileText className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Nenhum contrato localizado
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Você pode gerar a minuta oficial digital pelo sistema com selo SGD ou inserir
                  diretamente um documento em PDF já assinado pelo cliente.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleAbrirInserirAssinado}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 border border-sky-500/30 transition shadow-xs active:scale-95 cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span>Inserir Contrato Já Assinado</span>
                </button>

                <button
                  type="button"
                  onClick={handleClicarEmitirContrato}
                  disabled={emitindoNovo}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>{emitindoNovo ? "Emitindo..." : "Emitir Novo Contrato"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {contratosFiltrados.map((contrato) => {
                const isAssinado = contrato.status === "assinado";
                const isEnviado = contrato.status === "enviado_cliente";
                const isAtualizado = contrato.status === "atualizado";
                const isCancelado = contrato.status === "cancelado";

                return (
                  <div
                    key={contrato.id}
                    className={`p-4 rounded-xl border transition shadow-xs space-y-3 ${
                      isAtualizado
                        ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {/* Linha 1: Identificação, Status e Selo */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Contrato: {contrato.numero_contrato}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isAssinado
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : isAtualizado
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                : isEnviado
                                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                                  : isCancelado
                                    ? "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {isAssinado ? (
                            <>
                              <ShieldCheck className="h-3 w-3" />
                              <span>Assinado no BD</span>
                            </>
                          ) : isAtualizado ? (
                            <>
                              <RefreshCw className="h-3 w-3" />
                              <span>Substituído por Atualização</span>
                            </>
                          ) : isEnviado ? (
                            <>
                              <Send className="h-3 w-3" />
                              <span>Enviado ao Cliente</span>
                            </>
                          ) : isCancelado ? (
                            <>
                              <AlertCircle className="h-3 w-3" />
                              <span>Cancelado</span>
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              <span>Aguardando Assinatura</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">
                          Emitido em: {new Date(contrato.data_emissao).toLocaleDateString("pt-BR")}
                        </span>
                        {contrato.data_assinatura && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            • Assinado em:{" "}
                            {new Date(contrato.data_assinatura).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Aviso de Invalidação por Atualização (se aplicável) */}
                    {contrato.motivo_invalidacao && (
                      <div className="p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{contrato.motivo_invalidacao}</span>
                      </div>
                    )}

                    {/* Linha 2: Selo SGD, Código de Verificação e Hashes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Selo de Autenticidade:
                          </span>
                          <button
                            type="button"
                            onClick={() => copiarTexto(contrato.selo_autenticidade, "Selo")}
                            className="inline-flex items-center gap-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                            title="Copiar Selo de Autenticidade"
                          >
                            <span>{contrato.selo_autenticidade}</span>
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Código de Verificação:
                          </span>
                          <button
                            type="button"
                            onClick={() => copiarTexto(contrato.codigo_verificacao, "Código")}
                            className="inline-flex items-center gap-1 font-mono font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                            title="Copiar Código de Verificação"
                          >
                            <span>{contrato.codigo_verificacao}</span>
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Hash PDF Assinado:
                          </span>
                          {contrato.hash_pdf_assinado ? (
                            <button
                              type="button"
                              onClick={() =>
                                copiarTexto(contrato.hash_pdf_assinado || "", "Hash Assinado")
                              }
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-700 dark:text-slate-300 hover:text-emerald-500 cursor-pointer"
                              title={contrato.hash_pdf_assinado}
                            >
                              <span>{contrato.hash_pdf_assinado.substring(0, 16)}...</span>
                              <Copy className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-amber-500">
                              Pendente de assinatura
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Hash Original:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copiarTexto(contrato.hash_pdf_original || "", "Hash Original")
                            }
                            className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title={contrato.hash_pdf_original || ""}
                          >
                            <span>{(contrato.hash_pdf_original || "").substring(0, 16)}...</span>
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Linha 3: Barra de Ações do Contrato */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Botão Enviar ao Cliente */}
                        {!isAtualizado && !isCancelado && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEnviarWhatsApp(contrato)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 border border-emerald-500/20 transition cursor-pointer"
                              title="Enviar contrato e link de assinatura ao cliente via WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Enviar WhatsApp</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const link = `${APP_PUBLIC_URL}/assinar?codigo=${contrato.codigo_verificacao}`;
                                copiarTexto(link, "Link de Assinatura Eletrônica");
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 border border-sky-500/20 transition cursor-pointer"
                              title="Copiar link para o cliente assinar eletronicamente pelo celular ou computador"
                            >
                              <Link className="h-3.5 w-3.5 text-sky-600" />
                              <span>Copiar Link de Assinatura</span>
                            </button>
                          </>
                        )}

                        {/* Botão Anexar / Registrar Assinatura */}
                        {!isAssinado && !isAtualizado && !isCancelado && (
                          <button
                            type="button"
                            onClick={() => {
                              setContratoParaAssinar(contrato);
                              setNomeSignatario(cliente.nome_razao_social || "");
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 border border-sky-500/20 transition cursor-pointer"
                            title="Anexar contrato assinado devolvido pelo cliente"
                          >
                            <Upload className="h-3.5 w-3.5 text-sky-600" />
                            <span>Registrar Assinado</span>
                          </button>
                        )}

                        {/* Botão Conferir Integridade */}
                        <button
                          type="button"
                          onClick={() => {
                            setContratoParaVerificar(contrato);
                            setResultadoIntegridade(null);
                            fileInputConferenciaRef.current?.click();
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
                          title="Verificar se um PDF corresponde ao registro no BD deste contrato"
                        >
                          <Hash className="h-3.5 w-3.5 text-slate-500" />
                          <span>Conferir Hash</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Botão Emitir Cópia Autêntica com Assinatura do Sistema */}
                        <button
                          type="button"
                          onClick={() => handleEmitirCopiaAutentica(contrato)}
                          disabled={processandoDownloadId === contrato.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                          title="Baixar Cópia Autêntica certificada com assinatura e selo do sistema"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>
                            {processandoDownloadId === contrato.id
                              ? "Emitindo..."
                              : isAssinado
                                ? "Baixar Cópia Autêntica"
                                : "Baixar Via Original"}
                          </span>
                        </button>

                        {/* Botão Excluir ou Cancelar Contrato */}
                        <button
                          type="button"
                          onClick={() => {
                            setContratoParaGerenciar(contrato);
                            setMotivoCancelamento("Cancelado pelo operador");
                            setModalGerenciarAberto(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300/40 dark:border-rose-900/50 transition cursor-pointer"
                          title="Excluir contrato definitivamente ou marcar como cancelado"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Excluir ou Cancelar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input invisível para conferência de arquivo */}
          <input
            type="file"
            ref={fileInputConferenciaRef}
            onChange={handleVerificarArquivoPdf}
            accept="application/pdf"
            className="hidden"
          />

          {/* Painel de Resultado da Conferência de Integridade */}
          {resultadoIntegridade && (
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                resultadoIntegridade.integro
                  ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                  : "bg-red-50/80 dark:bg-red-950/30 border-red-500/30 text-red-900 dark:text-red-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  {resultadoIntegridade.integro ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span>Conferência Positiva: Documento Íntegro</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-5 w-5 text-red-600" />
                      <span>Alerta de Inconsistência de Hash</span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setResultadoIntegridade(null)}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs">{resultadoIntegridade.mensagem}</p>

              <div className="text-[10px] font-mono space-y-1 bg-white/50 dark:bg-slate-900/50 p-2 rounded-lg">
                <div>Hash Calculado: {resultadoIntegridade.hashCalculado}</div>
                <div>
                  Hash Armazenado:{" "}
                  {resultadoIntegridade.hashArmazenado || "Nenhum hash assinado registrado"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Custódia forense permanente com certificação SHA-256 e selo SGD.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Submodal de Registro de Contrato Assinado */}
      {contratoParaAssinar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-sky-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Registrar Contrato Assinado Devolvido
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setContratoParaAssinar(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Signatário:
                </label>
                <input
                  type="text"
                  value={nomeSignatario}
                  onChange={(e) => setNomeSignatario(e.target.value)}
                  placeholder="Nome completo do signatário"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Método de Assinatura:
                </label>
                <select
                  value={metodoAssinatura}
                  onChange={(e) => setMetodoAssinatura(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="digital">
                    Assinatura Digital (Certificado / Token / ICP-Brasil)
                  </option>
                  <option value="manuscrita">Assinatura Manuscrita Digitalizada</option>
                  <option value="aceite_plataforma">Aceite Eletrônico na Plataforma</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo PDF Assinado Devolvido:
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setArquivoPdfAssinado(f);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-white hover:file:bg-emerald-600 cursor-pointer"
                />
                {arquivoPdfAssinado && (
                  <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Arquivo selecionado: {arquivoPdfAssinado.name} (
                    {(arquivoPdfAssinado.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Garantia de Integridade Forense:
                </p>
                <p>
                  Ao salvar, o sistema calculará o hash criptográfico SHA-256 do arquivo e o gravará
                  imutavelmente no banco de dados. Qualquer cópia emitida no futuro terá a
                  assinatura digital do sistema para conferência de autenticidade.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setContratoParaAssinar(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarAssinatura}
                disabled={!arquivoPdfAssinado || processandoAssinaturaId === contratoParaAssinar.id}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {processandoAssinaturaId === contratoParaAssinar.id
                  ? "Calculando Hash e Salvando..."
                  : "Salvar no BD e Gerar Hash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submodal de Inserção Direta de Contrato Já Assinado */}
      {modalInserirAssinadoAberto && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-sky-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Inserir Contrato Assinado pelo Cliente
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalInserirAssinadoAberto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Número do Contrato:
                </label>
                <input
                  type="text"
                  value={novoNumeroContrato}
                  onChange={(e) => setNovoNumeroContrato(e.target.value)}
                  placeholder="Ex: CTR-0001/2026"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Signatário:
                </label>
                <input
                  type="text"
                  value={novoNomeSignatario}
                  onChange={(e) => setNovoNomeSignatario(e.target.value)}
                  placeholder="Nome completo do signatário"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Método de Assinatura:
                  </label>
                  <select
                    value={novoMetodoAssinatura}
                    onChange={(e) => setNovoMetodoAssinatura(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="digital">
                      Assinatura Digital (Gov.br / ICP-Brasil / Token)
                    </option>
                    <option value="manuscrita">Assinatura Manuscrita Digitalizada</option>
                    <option value="aceite_plataforma">Aceite Eletrônico na Plataforma</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Data da Assinatura:
                  </label>
                  <input
                    type="date"
                    value={novaDataAssinatura}
                    onChange={(e) => setNovaDataAssinatura(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo PDF do Contrato Assinado:
                </label>
                <input
                  ref={fileInputInserirAssinadoRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setNovoArquivoPdfAssinado(f);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer"
                />
                {novoArquivoPdfAssinado && (
                  <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                    Arquivo selecionado: {novoArquivoPdfAssinado.name} (
                    {(novoArquivoPdfAssinado.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 space-y-1 text-[11px] text-sky-900 dark:text-sky-200">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-sky-600" />
                  <span>Cadeia de Custódia e Autenticidade Forense</span>
                </p>
                <p className="text-[10.5px] opacity-90">
                  O documento será gravado com selo de autenticidade SGD e hash criptográfico
                  SHA-256. Qualquer via baixada receberá a certificação digital do sistema.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalInserirAssinadoAberto(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarInserirAssinado}
                disabled={!novoArquivoPdfAssinado || inserindoAssinado}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 transition shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {inserindoAssinado ? "Calculando Hash e Salvando..." : "Salvar Contrato Assinado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submodal de Pergunta: Atualização vs Novo Contrato Adicional */}
      {modalConfirmarEmissaoAberto && contratoParaAtualizar && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Emissão de Contrato — Definição do Tipo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalConfirmarEmissaoAberto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Cliente:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {cliente.nome_razao_social}
                  </strong>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Contrato anterior registrado:{" "}
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {contratoParaAtualizar.numero_contrato}
                  </strong>{" "}
                  (Selo: {contratoParaAtualizar.selo_autenticidade})
                </span>
              </div>

              <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                Este novo documento é uma <strong>atualização</strong> do contrato anterior ou é um{" "}
                <strong>novo contrato adicional</strong>?
              </p>

              {/* Opção 1: Atualização */}
              <button
                type="button"
                onClick={() =>
                  executarEmissaoContrato({
                    isAtualizacao: true,
                    contratoAnterior: contratoParaAtualizar,
                  })
                }
                className="w-full text-left p-3.5 rounded-xl border-2 border-amber-500/40 hover:border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer transition space-y-1 group active:scale-98"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 dark:text-amber-200 text-xs flex items-center gap-1.5">
                    <RefreshCw className="h-4 w-4 text-amber-600 group-hover:rotate-180 transition-transform duration-300" />
                    <span>É uma Atualização (Invalida o Anterior)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md bg-amber-200/50 dark:bg-amber-900/50">
                    Substituição
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-normal">
                  O contrato anterior ({contratoParaAtualizar.numero_contrato}) será invalidado e
                  marcado como <strong>Substituído por Atualização</strong> no sistema. O histórico
                  forense e hashes são preservados no banco de dados.
                </p>
              </button>

              {/* Opção 2: Novo Contrato Adicional */}
              <button
                type="button"
                onClick={() =>
                  executarEmissaoContrato({
                    isAtualizacao: false,
                  })
                }
                className="w-full text-left p-3.5 rounded-xl border-2 border-emerald-500/40 hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer transition space-y-1 group active:scale-98"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-1.5">
                    <Plus className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <span>É um Novo Contrato Adicional (Mantém Todos Válidos)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-200/50 dark:bg-emerald-900/50">
                    Contrato Paralelo
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/80 leading-normal">
                  Mantém todos os contratos existentes deste cliente 100% válidos e vigentes,
                  criando este documento como um contrato adicional independente.
                </p>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalConfirmarEmissaoAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Teste ou Cancelamento de Contrato */}
      {modalGerenciarAberto && contratoParaGerenciar && (
        <div
          className="fixed inset-0 z-[100001] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs select-none animate-in fade-in duration-150"
          onClick={() => {
            if (!processandoAcao) {
              setModalGerenciarAberto(false);
              setContratoParaGerenciar(null);
            }
          }}
        >
          <div
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 p-5 shadow-2xl space-y-4 text-slate-800 dark:text-slate-100 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Excluir ou Cancelar Contrato
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {contratoParaGerenciar.numero_contrato} • Selo:{" "}
                    {contratoParaGerenciar.selo_autenticidade}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!processandoAcao) {
                    setModalGerenciarAberto(false);
                    setContratoParaGerenciar(null);
                  }
                }}
                disabled={processandoAcao}
                className="h-8 w-8 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center border border-slate-300 dark:border-slate-700 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Escolha o que deseja realizar com este contrato do cliente{" "}
                <strong>{cliente.nome_razao_social}</strong>:
              </p>

              {/* Opção 1: Excluir Definitivamente */}
              <div className="p-3.5 rounded-2xl border-2 border-rose-500/40 hover:border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 space-y-2 transition">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-900 dark:text-rose-200 text-xs flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                    <span>Excluir Definitivamente (Remover do Banco de Dados)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-md bg-rose-200/50 dark:bg-rose-900/50">
                    Definitivo
                  </span>
                </div>
                <p className="text-[11px] text-rose-800/90 dark:text-rose-300/80 leading-normal">
                  Remove permanentemente este contrato e os documentos vinculados do banco de dados.
                </p>
                <button
                  type="button"
                  onClick={handleConfirmarExcluirTeste}
                  disabled={processandoAcao}
                  className="w-full mt-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-98 transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{processandoAcao ? "Excluindo..." : "Confirmar Exclusão Definitiva"}</span>
                </button>
              </div>

              {/* Opção 2: Marcar como Cancelado (Histórico) */}
              <div className="p-3.5 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                    <Ban className="h-4 w-4 text-slate-500" />
                    <span>Marcar como Cancelado (Preserva Histórico)</span>
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700">
                    Custódia
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  O contrato deixa de vigorar e é marcado com status <strong>Cancelado</strong>,
                  mantendo o histórico de auditoria forense arquivado.
                </p>
                <div className="pt-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Motivo do cancelamento:
                  </label>
                  <input
                    type="text"
                    value={motivoCancelamento}
                    onChange={(e) => setMotivoCancelamento(e.target.value)}
                    placeholder="Ex: Emitido com valor incorreto / Solicitação do cliente"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-slate-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleConfirmarCancelar}
                  disabled={processandoAcao}
                  className="w-full mt-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 active:scale-98 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>
                    {processandoAcao ? "Processando..." : "Confirmar Cancelamento no Sistema"}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setModalGerenciarAberto(false);
                  setContratoParaGerenciar(null);
                }}
                disabled={processandoAcao}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
