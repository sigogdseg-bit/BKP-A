// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Painel Consolidado de Revendedores e Vendedores (SuperADM / Adm)
// Padrão Visual Soberano GD Rastreamento (TiltCard, Relevo Tático e Ergonomia)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  UserPlus,
  Link2,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  X,
  Copy,
  Send,
  MessageCircle,
  Edit2,
  Search,
  Building,
  Briefcase,
  AlertCircle,
  Percent,
  LayoutGrid,
  List,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { TiltCard } from "@/shared/components/TiltCard";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { formatarTelefone } from "@/shared/utils/mascaras";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import {
  listarRevendedores,
  cadastrarRevendedor,
  atualizarRevendedor,
  excluirRevendedor,
  listarVendedores,
  cadastrarVendedor,
  atualizarVendedor,
  excluirVendedor,
  redefinirSenhaParceiro,
  gerarLinkConviteComercial,
} from "../services/revendedoresService";
import type { Revendedor, Vendedor, TipoConviteComercial } from "../types";
import { ModalEditarVendedor } from "./ModalEditarVendedor";

export type FiltroRede =
  | "todos"
  | "ativos"
  | "inativos"
  | "com_vendedores"
  | "com_clientes"
  | "com_faturamento"
  | "com_cota"
  | "com_comissao";

export function RevendedoresView() {
  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroRede, setFiltroRede] = useState<FiltroRede>("todos");
  const [parceiroParaExcluir, setParceiroParaExcluir] = useState<{
    tipo: "revendedor" | "vendedor";
    id: string;
    nome: string;
  } | null>(null);
  const [excluindoParceiro, setExcluindoParceiro] = useState(false);
  const [modoExibicao, setModoExibicao] = useState<"cards" | "lista">(() => {
    return (
      (localStorage.getItem("hunter_revendedores_modo_exibicao") as "cards" | "lista") || "lista"
    );
  });
  const [revendedorExpandidoId, setRevendedorExpandidoId] = useState<string | null>(null);

  // Modais
  const [modalNovoRevendedorAberto, setModalNovoRevendedorAberto] = useState(false);
  const [modalNovoVendedorAberto, setModalNovoVendedorAberto] = useState(false);
  const [modalLinkAberto, setModalLinkAberto] = useState(false);
  const [revendedorSelecionadoParaVendedor, setRevendedorSelecionadoParaVendedor] =
    useState<Revendedor | null>(null);

  // Formulário Novo Revendedor
  const [formNomeRev, setFormNomeRev] = useState("");
  const [formDocRev, setFormDocRev] = useState("");
  const [formEmailRev, setFormEmailRev] = useState("");
  const [formTelRev, setFormTelRev] = useState("");
  const [formBaseRev, setFormBaseRev] = useState<number>(40.0);
  const [formPixRev, setFormPixRev] = useState("");
  const [salvandoRev, setSalvandoRev] = useState(false);

  // Formulário Novo Vendedor
  const [formNomeVend, setFormNomeVend] = useState("");
  const [formDocVend, setFormDocVend] = useState("");
  const [formEmailVend, setFormEmailVend] = useState("");
  const [formTelVend, setFormTelVend] = useState("");
  const [formBaseVend, setFormBaseVend] = useState<number>(55.0);
  const [formPixVend, setFormPixVend] = useState("");
  const [salvandoVend, setSalvandoVend] = useState(false);

  // Formulário Edição Revendedor
  const [modalEditarRevendedorAberto, setModalEditarRevendedorAberto] = useState(false);
  const [revendedorEmEdicao, setRevendedorEmEdicao] = useState<Revendedor | null>(null);
  const [formEditNomeRev, setFormEditNomeRev] = useState("");
  const [formEditDocRev, setFormEditDocRev] = useState("");
  const [formEditEmailRev, setFormEditEmailRev] = useState("");
  const [formEditTelRev, setFormEditTelRev] = useState("");
  const [formEditBaseRev, setFormEditBaseRev] = useState<number>(40.0);
  const [formEditPixRev, setFormEditPixRev] = useState("");
  const [formEditAtivoRev, setFormEditAtivoRev] = useState(true);
  const [salvandoEditRev, setSalvandoEditRev] = useState(false);

  // Redefinição de Senha Revendedor
  const [novaSenhaRev, setNovaSenhaRev] = useState("");
  const [mostrarSenhaRev, setMostrarSenhaRev] = useState(false);
  const [redefinindoSenhaRev, setRedefinindoSenhaRev] = useState(false);

  // Edição de Vendedor da Equipe
  const [vendedorEmEdicao, setVendedorEmEdicao] = useState<Vendedor | null>(null);
  const [modalEditarVendedorAberto, setModalEditarVendedorAberto] = useState(false);

  // Formulário de Geração de Link
  const [tipoConviteLink, setTipoConviteLink] = useState<TipoConviteComercial>("revendedor");
  const [revendedorIdLink, setRevendedorIdLink] = useState<string>("");
  const [valorBaseRevendedorLink, setValorBaseRevendedorLink] = useState<number>(40.0);
  const [valorBaseVendedorLink, setValorBaseVendedorLink] = useState<number>(55.0);
  const [mensalidadeLink, setMensalidadeLink] = useState<number>(55.0);
  const [taxaInstalacaoLink, setTaxaInstalacaoLink] = useState<number>(0.0);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [mostrarCampoWhatsappLink, setMostrarCampoWhatsappLink] = useState(false);
  const [whatsappDestinoLink, setWhatsappDestinoLink] = useState("");
  const [enviandoWhatsappLink, setEnviandoWhatsappLink] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [listaRev, listaVend] = await Promise.all([listarRevendedores(), listarVendedores()]);
      setRevendedores(listaRev);
      setVendedores(listaVend);
    } catch {
      toast.error("Erro ao carregar rede de parceiros.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Totais consolidados para balões com filtro bidirecional
  const metricas = useMemo(() => {
    const totalRev = revendedores.length;
    const totalVend = vendedores.length;
    let totalClientes = 0;
    let totalFaturamento = 0;
    let cotaSistema = 0;
    let comissaoParceiros = 0;

    for (const r of revendedores) {
      totalClientes += r.total_clientes || 0;
      totalFaturamento += r.faturamento_total_mensal || 0;
      cotaSistema += r.cota_sistema_mensal || 0;
      comissaoParceiros += r.margem_revendedor_mensal || 0;
    }

    return {
      totalRev,
      totalVend,
      totalClientes,
      totalFaturamento,
      cotaSistema,
      comissaoParceiros,
    };
  }, [revendedores, vendedores]);

  // Lista filtrada de revendedores com suporte a todos os 6 infográficos
  const revendedoresFiltrados = useMemo(() => {
    return revendedores.filter((r) => {
      const termo = busca.toLowerCase();
      const bateBusca =
        r.nome.toLowerCase().includes(termo) ||
        (r.email && r.email.toLowerCase().includes(termo)) ||
        (r.documento && r.documento.includes(termo));

      if (!bateBusca) return false;

      if (filtroRede === "ativos") return r.ativo;
      if (filtroRede === "inativos") return !r.ativo;
      if (filtroRede === "com_vendedores") return (r.total_vendedores || 0) > 0;
      if (filtroRede === "com_clientes") return (r.total_clientes || 0) > 0;
      if (filtroRede === "com_faturamento") return (r.faturamento_total_mensal || 0) > 0;
      if (filtroRede === "com_cota") return (r.cota_sistema_mensal || 0) > 0;
      if (filtroRede === "com_comissao") return (r.margem_revendedor_mensal || 0) > 0;
      return true;
    });
  }, [revendedores, busca, filtroRede]);

  const handleConfirmarExclusaoParceiro = async () => {
    if (!parceiroParaExcluir) return;
    setExcluindoParceiro(true);
    try {
      const res =
        parceiroParaExcluir.tipo === "revendedor"
          ? await excluirRevendedor(parceiroParaExcluir.id)
          : await excluirVendedor(parceiroParaExcluir.id);

      if (res.sucesso) {
        toast.success(
          res.message ||
            `${
              parceiroParaExcluir.tipo === "revendedor" ? "Revendedor" : "Vendedor"
            } excluído com sucesso.`,
        );
        setParceiroParaExcluir(null);
        if (modalEditarRevendedorAberto) {
          setModalEditarRevendedorAberto(false);
          setRevendedorEmEdicao(null);
        }
        await carregarDados();
      } else {
        toast.error(res.erro || "Falha ao excluir parceiro.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao excluir parceiro.");
    } finally {
      setExcluindoParceiro(false);
    }
  };

  const handleSalvarRevendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNomeRev.trim()) {
      toast.error("Informe o nome do revendedor.");
      return;
    }
    setSalvandoRev(true);
    const res = await cadastrarRevendedor({
      nome: formNomeRev,
      documento: formDocRev,
      email: formEmailRev,
      telefone: formTelRev,
      valorBaseSistema: formBaseRev,
      chavePix: formPixRev,
    });
    setSalvandoRev(false);

    if (res.sucesso) {
      toast.success("Revendedor cadastrado com sucesso!");
      setModalNovoRevendedorAberto(false);
      setFormNomeRev("");
      setFormDocRev("");
      setFormEmailRev("");
      setFormTelRev("");
      setFormBaseRev(40.0);
      setFormPixRev("");
      carregarDados();
    } else {
      toast.error(res.erro || "Falha ao cadastrar revendedor.");
    }
  };

  const abrirModalEditarRevendedor = (rev: Revendedor) => {
    setRevendedorEmEdicao(rev);
    setFormEditNomeRev(rev.nome);
    setFormEditDocRev(rev.documento || "");
    setFormEditEmailRev(rev.email || "");
    setFormEditTelRev(rev.telefone || "");
    setFormEditBaseRev(Number(rev.valor_base_sistema) || 40.0);
    setFormEditPixRev(rev.chave_pix || "");
    setFormEditAtivoRev(Boolean(rev.ativo));
    setNovaSenhaRev("");
    setMostrarSenhaRev(false);
    setModalEditarRevendedorAberto(true);
  };

  const handleRedefinirSenhaRevendedor = async () => {
    if (!revendedorEmEdicao?.id) return;
    if (!novaSenhaRev || novaSenhaRev.trim().length < 6) {
      toast.error("A nova senha provisória deve conter no mínimo 6 caracteres.");
      return;
    }

    setRedefinindoSenhaRev(true);
    try {
      const res = await redefinirSenhaParceiro(
        "revendedor",
        revendedorEmEdicao.id,
        novaSenhaRev.trim(),
      );
      if (res.sucesso) {
        toast.success(
          "Senha do revendedor redefinida com sucesso! Ele será obrigado a alterá-la no primeiro acesso.",
        );
        setNovaSenhaRev("");
      } else {
        toast.error(res.erro || "Falha ao redefinir senha do revendedor.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao redefinir senha.");
    } finally {
      setRedefinindoSenhaRev(false);
    }
  };

  const handleSalvarEdicaoRevendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revendedorEmEdicao) return;
    if (!formEditNomeRev.trim()) {
      toast.error("Informe o nome do revendedor.");
      return;
    }
    setSalvandoEditRev(true);
    const res = await atualizarRevendedor(revendedorEmEdicao.id, {
      nome: formEditNomeRev,
      documento: formEditDocRev,
      email: formEditEmailRev,
      telefone: formEditTelRev,
      valorBaseSistema: formEditBaseRev,
      chavePix: formEditPixRev,
      ativo: formEditAtivoRev,
    });
    setSalvandoEditRev(false);

    if (res.sucesso) {
      toast.success("Parâmetros do revendedor atualizados com sucesso!");
      setModalEditarRevendedorAberto(false);
      setRevendedorEmEdicao(null);
      carregarDados();
    } else {
      toast.error(res.erro || "Falha ao atualizar revendedor.");
    }
  };

  const handleSalvarVendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revendedorSelecionadoParaVendedor) {
      toast.error("Selecione o revendedor responsável.");
      return;
    }
    if (!formNomeVend.trim()) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    setSalvandoVend(true);
    const res = await cadastrarVendedor({
      revendedorId: revendedorSelecionadoParaVendedor.id,
      nome: formNomeVend,
      documento: formDocVend,
      email: formEmailVend,
      telefone: formTelVend,
      valorBaseVendedor: formBaseVend,
      chavePix: formPixVend,
    });
    setSalvandoVend(false);

    if (res.sucesso) {
      toast.success("Vendedor cadastrado com sucesso!");
      setModalNovoVendedorAberto(false);
      setFormNomeVend("");
      setFormDocVend("");
      setFormEmailVend("");
      setFormTelVend("");
      setFormBaseVend(55.0);
      setFormPixVend("");
      carregarDados();
    } else {
      toast.error(res.erro || "Falha ao cadastrar vendedor.");
    }
  };

  const abrirModalGerarLinkParaRevendedor = (rev: Revendedor) => {
    setTipoConviteLink("vendedor");
    setRevendedorIdLink(rev.id);
    const base = Number(rev.valor_base_sistema) || 40.0;
    setValorBaseVendedorLink(base + 15.0);
    setMensalidadeLink(base + 15.0);
    setLinkGerado(null);
    setMostrarCampoWhatsappLink(false);
    setWhatsappDestinoLink("");
    setModalLinkAberto(true);
  };

  const abrirModalGerarLinkGeral = () => {
    setLinkGerado(null);
    setMostrarCampoWhatsappLink(false);
    setWhatsappDestinoLink("");
    const rev = revendedores.find((r) => r.id === revendedorIdLink) || revendedores[0];
    const base = rev ? Number(rev.valor_base_sistema) || 40.0 : 40.0;
    if (tipoConviteLink === "vendedor" && !revendedorIdLink && revendedores.length > 0) {
      setRevendedorIdLink(revendedores[0].id);
    }
    setValorBaseVendedorLink(base + 15.0);
    setMensalidadeLink(base + 15.0);
    setModalLinkAberto(true);
  };

  const handleGerarLink = async () => {
    if (tipoConviteLink === "vendedor") {
      if (!revendedorIdLink) {
        toast.error("O cadastro de vendedor deve ser obrigatoriamente vinculado a um revendedor.");
        return;
      }
      const revSel = revendedores.find((r) => r.id === revendedorIdLink);
      const baseMatriz = revSel ? Number(revSel.valor_base_sistema) || 40.0 : 40.0;
      if (valorBaseVendedorLink < baseMatriz) {
        toast.error(
          `A cota base do vendedor (R$ ${valorBaseVendedorLink.toFixed(2)}) não pode ser inferior à cota base da franquia (R$ ${baseMatriz.toFixed(2)}).`,
        );
        return;
      }
    }
    if (tipoConviteLink === "cliente" && revendedorIdLink) {
      const revSel = revendedores.find((r) => r.id === revendedorIdLink);
      const baseMatriz = revSel ? Number(revSel.valor_base_sistema) || 40.0 : 40.0;
      if (mensalidadeLink < baseMatriz) {
        toast.error(
          `A mensalidade proposta (R$ ${mensalidadeLink.toFixed(2)}) não pode ser inferior à cota base da franquia (R$ ${baseMatriz.toFixed(2)}).`,
        );
        return;
      }
    }
    setGerandoLink(true);
    const res = await gerarLinkConviteComercial({
      tipoConvite: tipoConviteLink,
      revendedorId: revendedorIdLink || null,
      valorMensalidadeProposta:
        tipoConviteLink === "cliente"
          ? mensalidadeLink
          : tipoConviteLink === "revendedor"
            ? valorBaseRevendedorLink
            : valorBaseVendedorLink,
      taxaInstalacaoProposta: tipoConviteLink === "cliente" ? taxaInstalacaoLink : null,
    });
    setGerandoLink(false);

    if (res.sucesso && res.link) {
      setLinkGerado(res.link);
      setMostrarCampoWhatsappLink(false);
      setWhatsappDestinoLink("");
      toast.success("Link gerado com sucesso!");
    } else {
      toast.error(res.erro || "Erro ao gerar link.");
    }
  };

  const copiarLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleEnviarWhatsappLink = async () => {
    const foneLimpo = whatsappDestinoLink.replace(/\D/g, "");
    if (foneLimpo.length < 10) {
      toast.error("Informe um número de WhatsApp válido com DDD.");
      return;
    }
    if (!linkGerado) return;

    setEnviandoWhatsappLink(true);
    try {
      let textoMsg = "";
      if (tipoConviteLink === "revendedor") {
        textoMsg =
          `Olá! Segue o seu link exclusivo de credenciamento como Revendedor Parceiro no GD Rastreamento:\n\n` +
          `${linkGerado}\n\n` +
          `Acesse o link acima para concluir o seu cadastro comercial e ter acesso à sua franquia.`;
      } else if (tipoConviteLink === "vendedor") {
        textoMsg =
          `Olá! Segue o seu link exclusivo de cadastro como Vendedor Parceiro no GD Rastreamento:\n\n` +
          `${linkGerado}\n\n` +
          `Acesse o link acima para concluir o seu cadastro comercial e iniciar suas vendas.`;
      } else {
        textoMsg =
          `Olá! Segue o seu link exclusivo para realizar o cadastro e ativar o rastreamento do seu veículo no GD Rastreamento:\n\n` +
          `${linkGerado}\n\n` +
          `Acesse o link acima para preencher os seus dados e os dados do(s) seu(s) veículo(s).`;
      }

      const res = await enviarMensagemWhatsappOperador({
        telefone: foneLimpo,
        mensagem: textoMsg,
        operadorNome: "GD Rastreamento",
        clienteNome: "Convidado Comercial",
      });

      if (res.sucesso) {
        toast.success("Link enviado com sucesso pelo WhatsApp do sistema!");
        setMostrarCampoWhatsappLink(false);
        setWhatsappDestinoLink("");
      } else {
        toast.info("Disparando via WhatsApp Web como contingência...");
        const urlWhats = new URL("https://api.whatsapp.com/send");
        urlWhats.searchParams.set("phone", `55${foneLimpo}`);
        urlWhats.searchParams.set("text", textoMsg);
        window.open(urlWhats.toString(), "_blank");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao despachar WhatsApp.");
    } finally {
      setEnviandoWhatsappLink(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none pb-28">
      {/* 1. Header Canônico GD Rastreamento */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs shrink-0">
            <Building className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 truncate">
                Rede de Revendedores e Vendedores
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Gestão Comercial
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Governança de franquias, valores base do sistema, comissões em cascata e links de
              onboarding.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={abrirModalGerarLinkGeral}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition shadow-xs w-full sm:w-auto cursor-pointer active:scale-95"
            title="Criar links de onboarding customizados para parceiros e clientes"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            <span>Gerar Link de Onboarding</span>
          </button>

          <button
            type="button"
            onClick={() => setModalNovoRevendedorAberto(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20 w-full sm:w-auto cursor-pointer active:scale-95"
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            <span>Novo Revendedor</span>
          </button>
        </div>
      </div>

      {/* 2. Balões Estatísticos Interativos com TiltCard e Filtro Bidirecional (Regra Pétrea) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(245, 158, 11, 0.28)"
          onClick={() =>
            setFiltroRede((prev) =>
              prev === "todos" ? "ativos" : prev === "ativos" ? "inativos" : "todos",
            )
          }
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "todos" || filtroRede === "ativos" || filtroRede === "inativos"
              ? "border-amber-500/60 ring-2 ring-amber-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Revendedores</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Building className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {metricas.totalRev}
            </p>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5 truncate">
              {filtroRede === "todos"
                ? "Todos (Clique: Ativos)"
                : filtroRede === "ativos"
                  ? "Ativos (Clique: Inativos)"
                  : filtroRede === "inativos"
                    ? "Inativos (Clique: Todos)"
                    : "Ver Revendedores"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(59, 130, 246, 0.25)"
          onClick={() =>
            setFiltroRede((prev) => (prev === "com_vendedores" ? "todos" : "com_vendedores"))
          }
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "com_vendedores"
              ? "border-blue-500/60 ring-2 ring-blue-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Vendedores</span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {metricas.totalVend}
            </p>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5 truncate">
              {filtroRede === "com_vendedores" ? "Filtro: Com equipes" : "Filtrar com equipe"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.25)"
          onClick={() =>
            setFiltroRede((prev) => (prev === "com_clientes" ? "todos" : "com_clientes"))
          }
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "com_clientes"
              ? "border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Clientes da Rede
            </span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {metricas.totalClientes}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5 truncate">
              {filtroRede === "com_clientes" ? "Filtro: Com clientes" : "Filtrar com clientes"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(99, 102, 241, 0.25)"
          onClick={() =>
            setFiltroRede((prev) => (prev === "com_faturamento" ? "todos" : "com_faturamento"))
          }
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "com_faturamento"
              ? "border-indigo-500/60 ring-2 ring-indigo-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-slate-300/60 dark:border-slate-800 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Faturamento Total
            </span>
            <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-slate-900 dark:text-white truncate">
              R$ {metricas.totalFaturamento.toFixed(2)}
            </p>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5 truncate">
              {filtroRede === "com_faturamento" ? "Filtro: Com faturamento" : "Filtrar faturamento"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => setFiltroRede((prev) => (prev === "com_cota" ? "todos" : "com_cota"))}
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "com_cota"
              ? "border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-emerald-500/30 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Cota Matriz</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300 truncate">
              R$ {metricas.cotaSistema.toFixed(2)}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 truncate">
              {filtroRede === "com_cota" ? "Filtro: Com cota matriz" : "Filtrar cota matriz"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(245, 158, 11, 0.35)"
          onClick={() =>
            setFiltroRede((prev) => (prev === "com_comissao" ? "todos" : "com_comissao"))
          }
          className={`bg-[#eaf0f8] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between transition cursor-pointer active:scale-95 ${
            filtroRede === "com_comissao"
              ? "border-amber-500/60 ring-2 ring-amber-500/40 shadow-[4px_4px_12px_#c3cfe2] dark:shadow-none"
              : "border-amber-500/30 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da]"
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Comissão Rede</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-amber-700 dark:text-amber-300 truncate">
              R$ {metricas.comissaoParceiros.toFixed(2)}
            </p>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5 truncate">
              {filtroRede === "com_comissao" ? "Filtro: Com comissão" : "Filtrar comissões"}
            </span>
          </div>
        </TiltCard>
      </div>

      {/* 3. Barra de Busca, Alternador de Exibição e Filtros de Status */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#eaf0f8]/80 dark:bg-slate-900/50 p-2.5 sm:p-3 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 w-full lg:w-auto flex-1 min-w-0">
          <div className="relative w-full min-w-0 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por revendedor, e-mail, documento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-amber-500 min-h-[38px]"
            />
          </div>

          {/* Alternador de Visualização Cards / Lista */}
          <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-950 p-1 rounded-xl border border-slate-300/70 dark:border-slate-800 shrink-0 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setModoExibicao("cards");
                localStorage.setItem("hunter_revendedores_modo_exibicao", "cards");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "cards"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir parceiros comerciais em formato de Cards táticos"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModoExibicao("lista");
                localStorage.setItem("hunter_revendedores_modo_exibicao", "lista");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "lista"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir parceiros comerciais em formato de Lista Detalhada"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
          </div>
        </div>

        {/* Pílulas de Filtro de Status e Filtro Ativo */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar touch-pan-x flex-nowrap shrink-0">
          {[
            { id: "todos", label: `Todos (${metricas.totalRev})` },
            { id: "ativos", label: `Ativos (${revendedores.filter((r) => r.ativo).length})` },
            { id: "inativos", label: `Inativos (${revendedores.filter((r) => !r.ativo).length})` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroRede(filtroRede === f.id ? "todos" : (f.id as any))}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition min-h-[36px] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 ${
                filtroRede === f.id
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-xs font-bold"
                  : "bg-white/90 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-xs"
              }`}
            >
              {f.label}
            </button>
          ))}

          {/* Tag de Filtro de Infográfico Ativo */}
          {filtroRede !== "todos" && filtroRede !== "ativos" && filtroRede !== "inativos" && (
            <button
              type="button"
              onClick={() => setFiltroRede("todos")}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/25 text-amber-900 dark:text-amber-200 border border-amber-500/40 flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer active:scale-95"
              title="Clique para limpar o filtro do infográfico"
            >
              <span>
                Filtro:{" "}
                {filtroRede === "com_vendedores"
                  ? "Com Equipe"
                  : filtroRede === "com_clientes"
                    ? "Com Clientes"
                    : filtroRede === "com_faturamento"
                      ? "Com Faturamento"
                      : filtroRede === "com_cota"
                        ? "Com Cota Matriz"
                        : "Com Comissão"}
              </span>
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Conteúdo: Visualização em Cards Táticos ou Tabela */}
      {carregando ? (
        <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-8 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
          Carregando rede de parceiros comerciais...
        </div>
      ) : revendedoresFiltrados.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-8 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
          Nenhum revendedor localizado para os critérios selecionados.
        </div>
      ) : modoExibicao === "cards" ? (
        /* MODO CARDS TÁTICOS (Com TiltCard) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {revendedoresFiltrados.map((rev) => {
            const isExpandido = revendedorExpandidoId === rev.id;
            const vendedoresDoRev = vendedores.filter((v) => v.revendedor_id === rev.id);

            return (
              <TiltCard
                key={rev.id}
                maxTilt={3}
                spotlightColor="rgba(245, 158, 11, 0.2)"
                className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3.5 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                          <Building className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                            {rev.nome}
                          </h3>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Base Sistema: R$ {Number(rev.valor_base_sistema).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0 ${
                        rev.ativo
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25"
                      }`}
                    >
                      {rev.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  {/* Informações de Contato e Chave PIX */}
                  <div className="mt-3 bg-white/80 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-300/60 dark:border-slate-800/60 space-y-1 text-[11px] shadow-xs">
                    {rev.documento && (
                      <div className="text-slate-600 dark:text-slate-300 font-mono">
                        <span className="font-semibold text-slate-400">Doc:</span> {rev.documento}
                      </div>
                    )}
                    {rev.email && (
                      <div className="text-slate-600 dark:text-slate-300 truncate">
                        <span className="font-semibold text-slate-400">Email:</span> {rev.email}
                      </div>
                    )}
                    {rev.telefone && (
                      <div className="text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-400">Tel:</span> {rev.telefone}
                      </div>
                    )}
                    {rev.chave_pix && (
                      <div className="text-amber-700 dark:text-amber-400 font-mono text-[10.5px] truncate">
                        <span className="font-semibold text-slate-400">PIX:</span> {rev.chave_pix}
                      </div>
                    )}
                  </div>

                  {/* Métricas Financeiras e Carteira */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 shadow-xs">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                        Equipe / Clientes
                      </span>
                      <span className="text-slate-900 dark:text-slate-100 font-bold font-mono">
                        {rev.total_vendedores || 0} vend. • {rev.total_clientes || 0} cli.
                      </span>
                    </div>

                    <div className="bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 shadow-xs">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                        Cota Matriz Mensal
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                        R$ {(rev.cota_sistema_mensal || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Destaque Tático: Cota Base da Matriz por Veículo */}
                  <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs">
                    <span className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                      Cota Base da Matriz:
                    </span>
                    <span className="font-mono font-black text-amber-700 dark:text-amber-400">
                      R$ {rev.valor_base_sistema.toFixed(2)} / un
                    </span>
                  </div>

                  {/* Sub-lista de Vendedores Expansível */}
                  {vendedoresDoRev.length > 0 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setRevendedorExpandidoId((prev) => (prev === rev.id ? null : rev.id))
                        }
                        className="w-full flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 py-1 px-2 rounded-lg bg-slate-200/50 dark:bg-slate-800/50 transition cursor-pointer"
                      >
                        <span>Vendedores da Equipe ({vendedoresDoRev.length})</span>
                        {isExpandido ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {isExpandido && (
                        <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {vendedoresDoRev.map((vend) => (
                            <div
                              key={vend.id}
                              className="flex items-center justify-between bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-300/60 dark:border-slate-800 text-xs shadow-xs"
                            >
                              <div className="min-w-0 flex-1 mr-2">
                                <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px]">
                                  {vend.nome}
                                </p>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Base: R$ {vend.valor_base_vendedor.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    vend.ativo
                                      ? "bg-emerald-500/15 text-emerald-600"
                                      : "bg-rose-500/15 text-rose-600"
                                  }`}
                                >
                                  {vend.ativo ? "Ativo" : "Inativo"}
                                </span>
                                <button
                                  type="button"
                                  title="Editar Vendedor e Redefinir Senha"
                                  onClick={() => {
                                    setVendedorEmEdicao(vend);
                                    setModalEditarVendedorAberto(true);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Excluir Vendedor"
                                  onClick={() =>
                                    setParceiroParaExcluir({
                                      tipo: "vendedor",
                                      id: vend.id,
                                      nome: vend.nome,
                                    })
                                  }
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Rodapé do Card com Ações Rápidas */}
                <div className="pt-2 border-t border-slate-300/60 dark:border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => abrirModalEditarRevendedor(rev)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                      title="Editar parâmetros e cota base do revendedor"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirModalGerarLinkParaRevendedor(rev)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                      title="Gerar link de onboarding para cadastrar vendedor nesta franquia"
                    >
                      <Link2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span>Link Vendedor</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRevendedorSelecionadoParaVendedor(rev);
                        setFormBaseVend(Math.max(50.0, rev.valor_base_sistema + 15));
                        setModalNovoVendedorAberto(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-blue-700 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                      title="Adicionar novo vendedor à equipe deste revendedor"
                    >
                      <Briefcase className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>+ Vendedor</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        atualizarRevendedor(rev.id, { ativo: !rev.ativo }).then((res) => {
                          if (res.sucesso) {
                            toast.success(
                              rev.ativo ? "Revendedor desativado." : "Revendedor ativado.",
                            );
                            carregarDados();
                          }
                        });
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition shadow-xs cursor-pointer active:scale-95 ${
                        rev.ativo
                          ? "text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30"
                          : "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30"
                      }`}
                    >
                      {rev.ativo ? "Desativar" : "Ativar"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setParceiroParaExcluir({
                          tipo: "revendedor",
                          id: rev.id,
                          nome: rev.nome,
                        })
                      }
                      className="p-1.5 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition shadow-xs cursor-pointer active:scale-95"
                      title="Excluir revendedor definitivamente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </TiltCard>
            );
          })}
        </div>
      ) : (
        /* MODO TABELA CONSOLIDADA */
        <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4">Revendedor</th>
                  <th className="py-3 px-4">Base Sistema</th>
                  <th className="py-3 px-4">Equipe / Clientes</th>
                  <th className="py-3 px-4">Faturamento Bruto</th>
                  <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">Cota Matriz</th>
                  <th className="py-3 px-4 text-amber-600 dark:text-amber-400">Margem Franquia</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                {revendedoresFiltrados.map((rev) => {
                  const isExpandido = revendedorExpandidoId === rev.id;
                  const vendedoresDoRev = vendedores.filter((v) => v.revendedor_id === rev.id);

                  return (
                    <React.Fragment key={rev.id}>
                      <tr className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              setRevendedorExpandidoId((prev) => (prev === rev.id ? null : rev.id))
                            }
                            className="p-1 rounded-lg hover:bg-slate-300/60 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
                            title="Expandir equipe de vendedores"
                          >
                            {isExpandido ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4 text-amber-500 shrink-0" />
                            <div>
                              <span>{rev.nome}</span>
                              {rev.email && (
                                <p className="text-[10px] text-slate-400 font-normal font-mono">
                                  {rev.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          R$ {Number(rev.valor_base_sistema).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {rev.total_vendedores || 0} vend.
                          </span>{" "}
                          •{" "}
                          <span className="text-slate-500">{rev.total_clientes || 0} clientes</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          R$ {(rev.faturamento_total_mensal || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {(rev.cota_sistema_mensal || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                          R$ {(rev.margem_revendedor_mensal || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                              rev.ativo
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/25"
                            }`}
                          >
                            {rev.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrirModalEditarRevendedor(rev)}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                              title="Editar parâmetros e cota base do revendedor"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirModalGerarLinkParaRevendedor(rev)}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold text-sky-700 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition cursor-pointer flex items-center gap-1 active:scale-95"
                              title="Gerar link de onboarding para cadastrar vendedor nesta franquia"
                            >
                              <Link2 className="h-3 w-3" />
                              <span>Link Vendedor</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevendedorSelecionadoParaVendedor(rev);
                                setFormBaseVend(Math.max(50.0, rev.valor_base_sistema + 15));
                                setModalNovoVendedorAberto(true);
                              }}
                              className="px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition cursor-pointer"
                            >
                              + Vendedor
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setParceiroParaExcluir({
                                  tipo: "revendedor",
                                  id: rev.id,
                                  nome: rev.nome,
                                })
                              }
                              className="p-1 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition cursor-pointer active:scale-95"
                              title="Excluir revendedor definitivamente"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Sub-tabela de Vendedores */}
                      {isExpandido && (
                        <tr className="bg-white/40 dark:bg-slate-950/40">
                          <td colSpan={9} className="p-3 pl-12">
                            <div className="border-l-2 border-amber-500/40 pl-3 space-y-2 font-sans">
                              <h4 className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5 text-blue-500" />
                                <span>Equipe de Vendedores ({vendedoresDoRev.length})</span>
                              </h4>

                              {vendedoresDoRev.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">
                                  Nenhum vendedor cadastrado nesta franquia.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {vendedoresDoRev.map((vend) => (
                                    <div
                                      key={vend.id}
                                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-xs shadow-xs flex items-center justify-between"
                                    >
                                      <div className="min-w-0 flex-1 mr-2">
                                        <p className="font-bold text-slate-900 dark:text-white truncate">
                                          {vend.nome}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-mono">
                                          Base Vendedor: R$ {vend.valor_base_vendedor.toFixed(2)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                            vend.ativo
                                              ? "bg-emerald-500/20 text-emerald-600"
                                              : "bg-rose-500/20 text-rose-600"
                                          }`}
                                        >
                                          {vend.ativo ? "Ativo" : "Inat."}
                                        </span>
                                        <button
                                          type="button"
                                          title="Editar Vendedor e Redefinir Senha"
                                          onClick={() => {
                                            setVendedorEmEdicao(vend);
                                            setModalEditarVendedorAberto(true);
                                          }}
                                          className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Excluir Vendedor"
                                          onClick={() =>
                                            setParceiroParaExcluir({
                                              tipo: "vendedor",
                                              id: vend.id,
                                              nome: vend.nome,
                                            })
                                          }
                                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Novo Revendedor (createPortal document.body) */}
      {modalNovoRevendedorAberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Cadastrar Novo Revendedor
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Crie a franquia e estipule a cota base devida à matriz.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNovoRevendedorAberto(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSalvarRevendedor}
                className="p-4 space-y-3.5 overflow-y-auto text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Franquia / Razão Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNomeRev}
                    onChange={(e) => setFormNomeRev(e.target.value)}
                    placeholder="Ex: Franquia Sul Fluminense Rastreadores"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      CNPJ ou CPF
                    </label>
                    <input
                      type="text"
                      value={formDocRev}
                      onChange={(e) => setFormDocRev(e.target.value)}
                      placeholder="00.000.000/0001-00"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={formTelRev}
                      onChange={(e) => setFormTelRev(e.target.value)}
                      placeholder="(24) 99999-8888"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    E-mail do Responsável
                  </label>
                  <input
                    type="email"
                    value={formEmailRev}
                    onChange={(e) => setFormEmailRev(e.target.value)}
                    placeholder="contato@franquia.com"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-500/10 dark:bg-amber-950/20 rounded-2xl border border-amber-500/30">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-amber-800 dark:text-amber-400 mb-1">
                      Valor Base do Sistema (R$) *
                    </label>
                    <MoedaInput
                      value={formBaseRev}
                      onChange={setFormBaseRev}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/50 font-black font-mono text-slate-900 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-500">
                      Padrão R$ 40,00 (alterável por franquia)
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Chave PIX p/ Repasses
                    </label>
                    <input
                      type="text"
                      value={formPixRev}
                      onChange={(e) => setFormPixRev(e.target.value)}
                      placeholder="pix@franquia.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalNovoRevendedorAberto(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoRev}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                  >
                    {salvandoRev ? "Salvando..." : "Salvar Revendedor"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL 2: Novo Vendedor para Franquia (createPortal document.body) */}
      {modalNovoVendedorAberto &&
        revendedorSelecionadoParaVendedor &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Cadastrar Vendedor
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Vinculado à franquia: {revendedorSelecionadoParaVendedor.nome}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalNovoVendedorAberto(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSalvarVendedor}
                className="p-4 space-y-3.5 overflow-y-auto text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo do Vendedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={formNomeVend}
                    onChange={(e) => setFormNomeVend(e.target.value)}
                    placeholder="Ex: Carlos Oliveira"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Documento (CPF)
                    </label>
                    <input
                      type="text"
                      value={formDocVend}
                      onChange={(e) => setFormDocVend(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={formTelVend}
                      onChange={(e) => setFormTelVend(e.target.value)}
                      placeholder="(24) 99999-7777"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    E-mail do Vendedor
                  </label>
                  <input
                    type="email"
                    value={formEmailVend}
                    onChange={(e) => setFormEmailVend(e.target.value)}
                    placeholder="vendedor@franquia.com"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-blue-500/10 dark:bg-blue-950/20 rounded-2xl border border-blue-500/30">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-blue-800 dark:text-blue-400 mb-1">
                      Valor Base do Vendedor (R$) *
                    </label>
                    <MoedaInput
                      value={formBaseVend}
                      onChange={setFormBaseVend}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-500/50 font-black font-mono text-slate-900 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-500">
                      Margem Franquia: R${" "}
                      {(
                        formBaseVend - revendedorSelecionadoParaVendedor.valor_base_sistema
                      ).toFixed(2)}
                      /mês
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Chave PIX do Vendedor
                    </label>
                    <input
                      type="text"
                      value={formPixVend}
                      onChange={(e) => setFormPixVend(e.target.value)}
                      placeholder="pix@vendedor.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalNovoVendedorAberto(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoVend}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
                  >
                    {salvandoVend ? "Salvando..." : "Salvar Vendedor"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL 3: Gerador de Links de Onboarding (createPortal document.body) */}
      {modalLinkAberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/30">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Gerar Link de Onboarding
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Crie links customizados para cadastro de parceiros e clientes.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalLinkAberto(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto text-xs">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Cadastro
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConviteLink("revendedor");
                        setLinkGerado(null);
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConviteLink === "revendedor"
                          ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Revendedor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConviteLink("vendedor");
                        setLinkGerado(null);
                        const revSel =
                          revendedores.find((r) => r.id === revendedorIdLink) || revendedores[0];
                        if (revSel) {
                          if (!revendedorIdLink) setRevendedorIdLink(revSel.id);
                          setValorBaseVendedorLink(revSel.valor_base_sistema + 15.0);
                        }
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConviteLink === "vendedor"
                          ? "bg-blue-600 text-white border-blue-600 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Vendedor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConviteLink("cliente");
                        setLinkGerado(null);
                        const revSel = revendedores.find((r) => r.id === revendedorIdLink);
                        if (revSel) {
                          setMensalidadeLink(revSel.valor_base_sistema + 15.0);
                        } else {
                          setMensalidadeLink(55.0);
                        }
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConviteLink === "cliente"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Cliente
                    </button>
                  </div>
                </div>

                {tipoConviteLink === "vendedor" && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Vincular à Franquia / Revendedor *
                    </label>
                    <select
                      required
                      value={revendedorIdLink}
                      onChange={(e) => {
                        const novoRevId = e.target.value;
                        setRevendedorIdLink(novoRevId);
                        const revSel = revendedores.find((r) => r.id === novoRevId);
                        if (revSel) {
                          setValorBaseVendedorLink(revSel.valor_base_sistema + 15.0);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
                    >
                      {!revendedorIdLink && (
                        <option value="" disabled>
                          Selecione o revendedor responsável *
                        </option>
                      )}
                      {revendedores.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome} (Base Matriz: R$ {r.valor_base_sistema.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      O vendedor deve ser obrigatoriamente subordinado a uma franquia.
                    </p>
                  </div>
                )}

                {tipoConviteLink === "cliente" && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Vínculo Comercial da Venda
                    </label>
                    <select
                      value={revendedorIdLink}
                      onChange={(e) => {
                        const novoRevId = e.target.value;
                        setRevendedorIdLink(novoRevId);
                        const revSel = revendedores.find((r) => r.id === novoRevId);
                        if (revSel) {
                          setMensalidadeLink(revSel.valor_base_sistema + 15.0);
                        } else {
                          setMensalidadeLink(55.0);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
                    >
                      <option value="">Venda Direta da Central (Sem Revendedor)</option>
                      {revendedores.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome} (Base: R$ {r.valor_base_sistema.toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Selecione uma franquia responsável ou mantenha como Venda Direta da Central.
                    </p>
                  </div>
                )}

                {tipoConviteLink === "revendedor" && (
                  <div className="p-3 bg-white/80 dark:bg-slate-950/60 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                      Cota Base da Matriz / Valor Base do Sistema (R$) *
                    </label>
                    <MoedaInput
                      value={valorBaseRevendedorLink}
                      onChange={setValorBaseRevendedorLink}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Cota mensal fixada pela matriz por cada veículo ativo desta franquia (padrão:
                      R$ 40,00).
                    </p>
                  </div>
                )}

                {tipoConviteLink === "vendedor" && (
                  <div className="p-3 bg-white/80 dark:bg-slate-950/60 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                      Cota Base do Vendedor / Custo do Revendedor (R$) *
                    </label>
                    <MoedaInput
                      value={valorBaseVendedorLink}
                      onChange={setValorBaseVendedorLink}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {revendedorIdLink ? (
                        <>
                          Base da franquia selecionada: R${" "}
                          {(
                            revendedores.find((r) => r.id === revendedorIdLink)
                              ?.valor_base_sistema || 40.0
                          ).toFixed(2)}
                          . Sugestão (+ R$ 15,00): R${" "}
                          {(
                            (revendedores.find((r) => r.id === revendedorIdLink)
                              ?.valor_base_sistema || 40.0) + 15.0
                          ).toFixed(2)}
                          .
                        </>
                      ) : (
                        "Cota base acordada com o vendedor para cálculo do repasse de margem (padrão: R$ 55,00)."
                      )}
                    </p>
                  </div>
                )}

                {tipoConviteLink === "cliente" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-white/80 dark:bg-slate-950/60 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Mensalidade Proposta (R$)
                      </label>
                      <MoedaInput
                        value={mensalidadeLink}
                        onChange={setMensalidadeLink}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Taxa de Instalação (R$)
                      </label>
                      <MoedaInput
                        value={taxaInstalacaoLink}
                        onChange={setTaxaInstalacaoLink}
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 col-span-2">
                      {revendedorIdLink ? (
                        <>
                          Base da franquia vinculada: R${" "}
                          {(
                            revendedores.find((r) => r.id === revendedorIdLink)
                              ?.valor_base_sistema || 40.0
                          ).toFixed(2)}
                          . Sugestão (+ R$ 15,00): R${" "}
                          {(
                            (revendedores.find((r) => r.id === revendedorIdLink)
                              ?.valor_base_sistema || 40.0) + 15.0
                          ).toFixed(2)}
                          . Margem estimada da franquia: R${" "}
                          {Math.max(
                            0,
                            mensalidadeLink -
                              (revendedores.find((r) => r.id === revendedorIdLink)
                                ?.valor_base_sistema || 40.0),
                          ).toFixed(2)}
                          /mês.
                        </>
                      ) : (
                        "Sugestão padrão do sistema: R$ 55,00."
                      )}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleGerarLink}
                  disabled={gerandoLink}
                  className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                >
                  <Link2 className="h-4 w-4" />
                  <span>{gerandoLink ? "Gerando Link..." : "Gerar Link de Cadastro"}</span>
                </button>

                {linkGerado && (
                  <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Link Pronto para Compartilhamento:</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-950 border border-emerald-500/20 font-mono text-[11px] break-all select-all text-slate-800 dark:text-slate-200">
                      {linkGerado}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copiarLink(linkGerado)}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMostrarCampoWhatsappLink((prev) => !prev)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95 ${
                          mostrarCampoWhatsappLink
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border border-slate-700"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50"
                        }`}
                        title="Abrir campo para informar número e enviar via WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>WhatsApp</span>
                      </button>
                    </div>

                    {mostrarCampoWhatsappLink && (
                      <div className="pt-2 border-t border-emerald-500/20 space-y-2 animate-in fade-in duration-150">
                        <label className="block text-[11px] font-bold text-emerald-900 dark:text-emerald-300">
                          Número de WhatsApp para Envio:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={whatsappDestinoLink}
                            onChange={(e) =>
                              setWhatsappDestinoLink(formatarTelefone(e.target.value))
                            }
                            placeholder="(00) 00000-0000"
                            className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-emerald-500/30 font-mono text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />
                          <button
                            type="button"
                            disabled={enviandoWhatsappLink || !whatsappDestinoLink.trim()}
                            onClick={handleEnviarWhatsappLink}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 shrink-0"
                          >
                            {enviandoWhatsappLink ? (
                              <span>Enviando...</span>
                            ) : (
                              <>
                                <Send className="h-3.5 w-3.5" />
                                <span>Enviar</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL 4: Editar Revendedor (createPortal document.body - Regra Pétrea) */}
      {modalEditarRevendedorAberto &&
        revendedorEmEdicao &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                    <Edit2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Editar Parâmetros da Franquia
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Atualize os dados e a cota base da matriz deste revendedor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalEditarRevendedorAberto(false);
                    setRevendedorEmEdicao(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={handleSalvarEdicaoRevendedor}
                className="p-4 space-y-3.5 overflow-y-auto text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo / Razão Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={formEditNomeRev}
                    onChange={(e) => setFormEditNomeRev(e.target.value)}
                    placeholder="Nome da franquia ou revendedor"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      CPF / CNPJ
                    </label>
                    <input
                      type="text"
                      value={formEditDocRev}
                      onChange={(e) => setFormEditDocRev(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={formEditTelRev}
                      onChange={(e) => setFormEditTelRev(e.target.value)}
                      placeholder="(24) 99999-9999"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    E-mail Comercial
                  </label>
                  <input
                    type="email"
                    value={formEditEmailRev}
                    onChange={(e) => setFormEditEmailRev(e.target.value)}
                    placeholder="contato@franquia.com.br"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>

                <div className="p-3 bg-amber-500/10 dark:bg-amber-950/20 rounded-2xl border border-amber-500/30 space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase text-amber-800 dark:text-amber-300">
                    Cota Base da Matriz / Valor Base do Sistema (R$) *
                  </label>
                  <MoedaInput
                    value={formEditBaseRev}
                    onChange={setFormEditBaseRev}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/40 text-slate-900 dark:text-slate-100 font-mono font-black text-sm"
                  />
                  <p className="text-[10.5px] text-slate-600 dark:text-slate-400">
                    Valor base repassado à matriz mensalmente por cada veículo ativo desta franquia.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Chave PIX
                    </label>
                    <input
                      type="text"
                      value={formEditPixRev}
                      onChange={(e) => setFormEditPixRev(e.target.value)}
                      placeholder="pix@revendedor.com"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Status da Franquia
                    </label>
                    <select
                      value={formEditAtivoRev ? "ativo" : "inativo"}
                      onChange={(e) => setFormEditAtivoRev(e.target.value === "ativo")}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-bold"
                    >
                      <option value="ativo">Ativo (Operacional)</option>
                      <option value="inativo">Inativo (Bloqueado)</option>
                    </select>
                  </div>
                </div>

                {/* SEÇÃO CANÔNICA: Redefinição de Senha e Troca Obrigatória no Primeiro Acesso */}
                <div className="pt-2 border-t border-slate-300/60 dark:border-slate-800">
                  <div className="p-3 bg-amber-500/10 dark:bg-amber-950/20 rounded-2xl border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold text-[11px] uppercase">
                        <Key className="h-4 w-4" />
                        <span>Redefinir Senha de Acesso</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
                          let randomStr = "";
                          for (let i = 0; i < 6; i++) {
                            randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
                          }
                          setNovaSenhaRev(`Sigo@${randomStr}`);
                          setMostrarSenhaRev(true);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[10px] font-bold transition cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Gerar Senha</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={mostrarSenhaRev ? "text" : "password"}
                        value={novaSenhaRev}
                        onChange={(e) => setNovaSenhaRev(e.target.value)}
                        placeholder="Digite a nova senha provisória"
                        className="w-full pl-3 pr-10 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-500/40 text-slate-900 dark:text-slate-100 font-mono text-xs shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarSenhaRev((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {mostrarSenhaRev ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-start gap-1.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-[10px] text-amber-900 dark:text-amber-200 leading-tight">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        <strong>Aviso:</strong> No primeiro acesso com esta senha, o sistema
                        obrigará o revendedor a criar sua própria senha definitiva antes de acessar
                        o painel.
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={
                        redefinindoSenhaRev || !novaSenhaRev || novaSenhaRev.trim().length < 6
                      }
                      onClick={handleRedefinirSenhaRevendedor}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-md shadow-amber-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {redefinindoSenhaRev ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Redefinindo Senha...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Confirmar Redefinição de Senha</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (revendedorEmEdicao) {
                        setParceiroParaExcluir({
                          tipo: "revendedor",
                          id: revendedorEmEdicao.id,
                          nome: revendedorEmEdicao.nome,
                        });
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
                    title="Excluir este revendedor definitivamente"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Excluir Franquia</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModalEditarRevendedorAberto(false);
                        setRevendedorEmEdicao(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={salvandoEditRev}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                    >
                      {salvandoEditRev ? "Salvando..." : "Salvar Alterações"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* MODAL 5: Editar Vendedor da Equipe (createPortal document.body - Regra Pétrea) */}
      {modalEditarVendedorAberto && vendedorEmEdicao && (
        <ModalEditarVendedor
          vendedor={vendedorEmEdicao}
          aberto={modalEditarVendedorAberto}
          onFechar={() => {
            setModalEditarVendedorAberto(false);
            setVendedorEmEdicao(null);
          }}
          onSucesso={() => carregarDados()}
          valorBaseMinimo={
            revendedores.find((r) => r.id === vendedorEmEdicao.revendedor_id)?.valor_base_sistema ||
            0
          }
        />
      )}

      {/* MODAL 6: Confirmação de Exclusão de Parceiro (createPortal document.body - Regra Pétrea) */}
      {parceiroParaExcluir &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in fade-in zoom-in-95 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    Confirmar Exclusão de{" "}
                    {parceiroParaExcluir.tipo === "revendedor" ? "Revendedor" : "Vendedor"}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Ação administrativa com efeito imediato
                  </p>
                </div>
              </div>

              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                Tem certeza que deseja excluir <strong>{parceiroParaExcluir.nome}</strong>?
                {parceiroParaExcluir.tipo === "revendedor" ? (
                  <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Esta operação removerá o cadastro da franquia e vendedores subordinados. A
                    carteira de clientes será preservada na central.
                  </span>
                ) : (
                  <span className="block mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    O acesso do vendedor será revogado e os clientes permanecerão vinculados à
                    franquia.
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                <button
                  type="button"
                  disabled={excluindoParceiro}
                  onClick={() => setParceiroParaExcluir(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={excluindoParceiro}
                  onClick={handleConfirmarExclusaoParceiro}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-600/20 active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {excluindoParceiro ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Sim, Excluir Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
