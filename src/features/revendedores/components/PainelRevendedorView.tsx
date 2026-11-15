// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Painel do Revendedor: Minha Franquia e Equipe
// Padrão Visual Soberano GD Rastreamento (TiltCard, Relevo Tático e Ergonomia)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Building,
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  Link2,
  UserPlus,
  CheckCircle2,
  Clock,
  Wrench,
  Copy,
  X,
  Search,
  AlertCircle,
  Percent,
  Receipt,
  Wallet,
  Send,
  MessageCircle,
  ShieldCheck,
  Edit2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { TiltCard } from "@/shared/components/TiltCard";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { formatarTelefone } from "@/shared/utils/mascaras";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listarVendedores,
  cadastrarVendedor,
  gerarLinkConviteComercial,
  calcularSplitMensalidade,
} from "../services/revendedoresService";
import type { Vendedor, Revendedor, TipoConviteComercial } from "../types";
import { ModalEditarVendedor } from "./ModalEditarVendedor";
import { ModalDreParceiro } from "./ModalDreParceiro";
import { TabelaInstaladoresCredenciados } from "@/features/instalacoes/components/TabelaInstaladoresCredenciados";
import { PropostasTab } from "@/features/financeiro/components/PropostasTab";

export function PainelRevendedorView() {
  const { session } = useAuth();
  const [meuRevendedor, setMeuRevendedor] = useState<Revendedor | null>(null);
  const [meusVendedores, setMeusVendedores] = useState<Vendedor[]>([]);
  const [meusClientes, setMeusClientes] = useState<any[]>([]);
  const [transacoesFranquia, setTransacoesFranquia] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<
    "vendedores" | "clientes" | "propostas" | "instaladores" | "repasses" | "extrato"
  >(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("aba");
      if (
        param === "extrato" ||
        param === "clientes" ||
        param === "propostas" ||
        param === "repasses" ||
        param === "instaladores"
      ) {
        return param;
      }
    }
    return "vendedores";
  });

  // Filtro do Extrato
  const [filtroExtrato, setFiltroExtrato] = useState<"todos" | "diretas" | "equipe">("todos");

  // Modais
  const [modalNovoVendedorAberto, setModalNovoVendedorAberto] = useState(false);
  const [modalLinkAberto, setModalLinkAberto] = useState(false);
  const [modalDreAberto, setModalDreAberto] = useState(false);
  const [vendedorEmEdicao, setVendedorEmEdicao] = useState<Vendedor | null>(null);
  const [modalEditarVendedorAberto, setModalEditarVendedorAberto] = useState(false);

  // Form Vendedor
  const [nomeVend, setNomeVend] = useState("");
  const [docVend, setDocVend] = useState("");
  const [emailVend, setEmailVend] = useState("");
  const [telVend, setTelVend] = useState("");
  const [baseVend, setBaseVend] = useState<number>(55.0);
  const [pixVend, setPixVend] = useState("");
  const [salvandoVend, setSalvandoVend] = useState(false);

  // Form Link
  const [tipoConvite, setTipoConvite] = useState<TipoConviteComercial>("cliente");
  const [baseVendedorLink, setBaseVendedorLink] = useState<number>(55.0);
  const [mensalidadeLink, setMensalidadeLink] = useState<number>(55.0);
  const [taxaInstalacaoLink, setTaxaInstalacaoLink] = useState<number>(0.0);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [mostrarCampoWhatsappLink, setMostrarCampoWhatsappLink] = useState(false);
  const [whatsappDestinoLink, setWhatsappDestinoLink] = useState("");
  const [enviandoWhatsappLink, setEnviandoWhatsappLink] = useState(false);

  const abrirModalGerarLink = () => {
    const baseMatriz = Number(meuRevendedor?.valor_base_sistema) || 40.0;
    setBaseVendedorLink(baseMatriz + 15.0);
    setMensalidadeLink(baseMatriz + 15.0);
    setTaxaInstalacaoLink(0.0);
    setLinkGerado(null);
    setMostrarCampoWhatsappLink(false);
    setWhatsappDestinoLink("");
    setModalLinkAberto(true);
  };

  const abrirModalNovoVendedor = () => {
    const baseMatriz = Number(meuRevendedor?.valor_base_sistema) || 40.0;
    setBaseVend(baseMatriz + 15.0);
    setNomeVend("");
    setDocVend("");
    setEmailVend("");
    setTelVend("");
    setPixVend("");
    setModalNovoVendedorAberto(true);
  };

  // Carregamento de dados da franquia
  const carregarDadosFranquia = useCallback(async () => {
    setCarregando(true);
    try {
      let revId = session?.revendedorId;

      // 1. Busca dados cadastrais do Revendedor
      if (!revId && session?.userId) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("*")
          .eq("user_id", session.userId)
          .maybeSingle();
        if (rev) {
          revId = rev.id;
          const baseMatriz = Number(rev.valor_base_sistema) || 40.0;
          setMeuRevendedor({
            ...rev,
            valor_base_sistema: baseMatriz,
          });
          setBaseVend(baseMatriz + 15.0);
          setBaseVendedorLink(baseMatriz + 15.0);
          setMensalidadeLink(baseMatriz + 15.0);
        }
      } else if (revId) {
        const { data: rev } = await supabase
          .from("revendedores")
          .select("*")
          .eq("id", revId)
          .maybeSingle();
        if (rev) {
          const baseMatriz = Number(rev.valor_base_sistema) || 40.0;
          setMeuRevendedor({
            ...rev,
            valor_base_sistema: baseMatriz,
          });
          setBaseVend(baseMatriz + 15.0);
          setBaseVendedorLink(baseMatriz + 15.0);
          setMensalidadeLink(baseMatriz + 15.0);
        }
      }

      if (revId) {
        // 2. Busca vendedores da equipe
        const vends = await listarVendedores(revId);
        setMeusVendedores(vends);

        // 3. Busca clientes vinculados ao revendedor ou seus vendedores
        const { data: clis } = await supabase
          .from("clientes")
          .select(
            `
            *,
            vendedores:vendedor_id (nome, valor_base_vendedor)
          `,
          )
          .eq("revendedor_id", revId)
          .order("created_at", { ascending: false });

        setMeusClientes(clis || []);

        // 4. Busca transações financeiras de repasse vinculadas à franquia
        const { data: trans } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, mensalidade_id, cliente_id, categoria, status, valor, data_pagamento")
          .eq("revendedor_id", revId);

        setTransacoesFranquia(trans || []);
      }
    } catch {
      toast.error("Erro ao carregar dados da franquia.");
    } finally {
      setCarregando(false);
    }
  }, [session?.userId, session?.revendedorId]);

  useEffect(() => {
    carregarDadosFranquia();
  }, [carregarDadosFranquia]);

  // Cálculos financeiros do Revendedor
  const resumoFinanceiro = useMemo(() => {
    const baseSis = meuRevendedor?.valor_base_sistema || 40.0;
    let faturamentoBruto = 0;
    let repasseAoMatriz = 0;
    let lucroLiquidoRevendedor = 0;
    let comissaoVendedores = 0;
    let totalTaxasInstalacaoRecebidas = 0;
    let totalRepassesInstaladoresPendentes = 0;

    for (const c of meusClientes) {
      const mensalidade = Number(c.valor_mensalidade) || 0;
      const taxa = Number(c.taxa_instalacao) || 0;
      const baseVend = c.vendedores?.valor_base_vendedor
        ? Number(c.vendedores.valor_base_vendedor)
        : undefined;

      const split = calcularSplitMensalidade({
        valorMensalidade: mensalidade,
        taxaInstalacao: taxa,
        baseSistema: baseSis,
        baseVendedor: baseVend,
        temRevendedor: true,
        temVendedor: Boolean(c.vendedor_id),
      });

      faturamentoBruto += mensalidade;
      repasseAoMatriz += split.parteSistema;
      lucroLiquidoRevendedor += split.parteRevendedor;
      comissaoVendedores += split.parteVendedor;

      // Taxas de instalação diretas pertencem ao revendedor
      if (split.destinatarioTaxa === "revendedor") {
        totalTaxasInstalacaoRecebidas += taxa;
      }

      // Repasse a instalador pendente
      if (c.repasse_instalador_status === "pendente") {
        totalRepassesInstaladoresPendentes += Number(c.valor_repasse_instalador) || 80.0;
      }
    }

    return {
      totalVendedores: meusVendedores.length,
      totalClientes: meusClientes.length,
      faturamentoBruto,
      repasseAoMatriz,
      lucroLiquidoRevendedor,
      comissaoVendedores,
      totalTaxasInstalacaoRecebidas,
      totalRepassesInstaladoresPendentes,
    };
  }, [meuRevendedor, meusVendedores, meusClientes]);

  const handleCadastrarVendedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meuRevendedor) {
      toast.error("Franquia não identificada.");
      return;
    }
    if (!nomeVend.trim()) {
      toast.error("Informe o nome do vendedor.");
      return;
    }
    if (baseVend < (meuRevendedor.valor_base_sistema || 40.0)) {
      toast.error(
        `A base do vendedor não pode ser inferior à sua base com a matriz (R$ ${meuRevendedor.valor_base_sistema.toFixed(2)}).`,
      );
      return;
    }

    setSalvandoVend(true);
    const res = await cadastrarVendedor({
      revendedorId: meuRevendedor.id,
      nome: nomeVend,
      documento: docVend,
      email: emailVend,
      telefone: telVend,
      valorBaseVendedor: baseVend,
      chavePix: pixVend,
    });
    setSalvandoVend(false);

    if (res.sucesso) {
      toast.success("Vendedor cadastrado com sucesso!");
      setModalNovoVendedorAberto(false);
      setNomeVend("");
      setDocVend("");
      setEmailVend("");
      setTelVend("");
      const baseMatriz = Number(meuRevendedor?.valor_base_sistema) || 40.0;
      setBaseVend(baseMatriz + 15.0);
      setPixVend("");
      carregarDadosFranquia();
    } else {
      toast.error(res.erro || "Falha ao cadastrar vendedor.");
    }
  };

  const handleGerarLink = async () => {
    if (!meuRevendedor) return;
    const baseMatriz = Number(meuRevendedor.valor_base_sistema) || 40.0;

    if (tipoConvite === "cliente" && mensalidadeLink < baseMatriz) {
      toast.error(
        `A mensalidade proposta (R$ ${mensalidadeLink.toFixed(2)}) não pode ser inferior ao seu custo com a matriz (R$ ${baseMatriz.toFixed(2)}).`,
      );
      return;
    }

    if (tipoConvite === "vendedor" && baseVendedorLink < baseMatriz) {
      toast.error(
        `A cota base do vendedor (R$ ${baseVendedorLink.toFixed(2)}) não pode ser inferior ao seu custo com a matriz (R$ ${baseMatriz.toFixed(2)}).`,
      );
      return;
    }

    setGerandoLink(true);
    const res = await gerarLinkConviteComercial({
      tipoConvite,
      revendedorId: meuRevendedor.id,
      valorMensalidadeProposta:
        tipoConvite === "cliente"
          ? mensalidadeLink
          : tipoConvite === "vendedor"
            ? baseVendedorLink
            : null,
      taxaInstalacaoProposta: tipoConvite === "cliente" ? taxaInstalacaoLink : null,
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
      if (tipoConvite === "vendedor") {
        textoMsg =
          `Olá! Segue o seu link exclusivo de cadastro como Vendedor na nossa equipe no GD Rastreamento:\n\n` +
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
        operadorNome: meuRevendedor?.nome || "Franquia Parceira GD Rastreamento",
        clienteNome: "Convidado Comercial",
      });

      if (res.sucesso) {
        toast.success("Link enviado com sucesso pelo WhatsApp do sistema!");
        setMostrarCampoWhatsappLink(false);
        setWhatsappDestinoLink("");
      } else {
        toast.info("Disparando via WhatsApp Web como contingência...");
        const msgUri = encodeURIComponent(textoMsg);
        window.open(`https://api.whatsapp.com/send?phone=55${foneLimpo}&text=${msgUri}`, "_blank");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao despachar WhatsApp.");
    } finally {
      setEnviandoWhatsappLink(false);
    }
  };

  const marcarRepassePago = async (clienteId: string) => {
    try {
      await supabase
        .from("clientes")
        .update({ repasse_instalador_status: "pago" })
        .eq("id", clienteId);
      toast.success("Repasse ao instalador marcado como pago!");
      carregarDadosFranquia();
    } catch {
      toast.error("Erro ao atualizar repasse.");
    }
  };

  const copiarResumoExtrato = () => {
    const liquidoEstimado =
      resumoFinanceiro.lucroLiquidoRevendedor +
      resumoFinanceiro.totalTaxasInstalacaoRecebidas -
      resumoFinanceiro.totalRepassesInstaladoresPendentes;

    const texto = `GD RASTREAMENTO - DEMONSTRATIVO FINANCEIRO DA FRANQUIA
Faturamento Mensal da Carteira: R$ ${resumoFinanceiro.faturamentoBruto.toFixed(2)}
Minha Margem Mensal Recorrente: R$ ${resumoFinanceiro.lucroLiquidoRevendedor.toFixed(2)}
Taxas de Instalacao Recebidas (Diretas): R$ ${resumoFinanceiro.totalTaxasInstalacaoRecebidas.toFixed(2)}
Repasse Obrigatorio a Matriz GD Rastreamento: R$ ${resumoFinanceiro.repasseAoMatriz.toFixed(2)}
Comissoes a Repassar aos Vendedores: R$ ${resumoFinanceiro.comissaoVendedores.toFixed(2)}
Mao de Obra a Pagar aos Instaladores: R$ ${resumoFinanceiro.totalRepassesInstaladoresPendentes.toFixed(2)}
--------------------------------------------------
LUCRO LIQUIDO ESTIMADO DA FRANQUIA: R$ ${liquidoEstimado.toFixed(2)}
Total de Contratos na Rede: ${meusClientes.length}`;

    navigator.clipboard.writeText(texto);
    toast.success("Demonstrativo financeiro copiado para a área de transferência!");
  };

  const handleSalvarConfigDreRevendedor = async (cfg: {
    ativo: boolean;
    horario: string;
    telefone: string;
  }): Promise<{ sucesso: boolean; erro?: string }> => {
    try {
      const { data, error } = await supabase.rpc("configurar_dre_whatsapp_revendedor" as any, {
        p_ativo: cfg.ativo,
        p_horario: cfg.horario,
        p_telefone: cfg.telefone,
      });

      if (!error && (data as any)?.sucesso !== false) {
        setMeuRevendedor((prev: any) =>
          prev
            ? {
                ...prev,
                dre_whatsapp_ativo: cfg.ativo,
                dre_whatsapp_horario: cfg.horario,
                dre_whatsapp_telefone: cfg.telefone,
              }
            : null,
        );
        return { sucesso: true };
      }

      // Fallback para update direto caso a RPC ainda não esteja no cache
      if (meuRevendedor?.id) {
        await supabase
          .from("revendedores")
          .update({
            dre_whatsapp_ativo: cfg.ativo,
            dre_whatsapp_horario: cfg.horario,
            dre_whatsapp_telefone: cfg.telefone,
          })
          .eq("id", meuRevendedor.id);

        setMeuRevendedor((prev: any) =>
          prev
            ? {
                ...prev,
                dre_whatsapp_ativo: cfg.ativo,
                dre_whatsapp_horario: cfg.horario,
                dre_whatsapp_telefone: cfg.telefone,
              }
            : null,
        );
        return { sucesso: true };
      }

      return { sucesso: false, erro: error?.message || "Falha ao salvar configuração." };
    } catch (e: any) {
      return { sucesso: false, erro: e?.message || String(e) };
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none pb-28">
      {/* 1. Header Canônico GD Rastreamento */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs shrink-0">
            <Building className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 truncate">
                {meuRevendedor?.nome || "Minha Franquia e Equipe"}
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Revendedor Autorizado
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Gestão da equipe de vendas, clientes da rede, cota base do sistema e repasses a
              instaladores.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={abrirModalGerarLink}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition shadow-xs w-full sm:w-auto cursor-pointer active:scale-95"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            <span>Gerar Link de Cadastro</span>
          </button>

          <button
            type="button"
            onClick={abrirModalNovoVendedor}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-lg shadow-amber-500/20 w-full sm:w-auto cursor-pointer active:scale-95"
          >
            <UserPlus className="h-4 w-4 shrink-0" />
            <span>Cadastrar Vendedor</span>
          </button>
        </div>
      </div>

      {/* 2. Balões Estatísticos Interativos com TiltCard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(245, 158, 11, 0.25)"
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Base Matriz</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Building className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-slate-900 dark:text-white">
              R$ {(meuRevendedor?.valor_base_sistema || 40.0).toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
              Custo fixo por veículo
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(59, 130, 246, 0.25)"
          onClick={() => setAbaAtiva("vendedores")}
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Meus Vendedores
            </span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {resumoFinanceiro.totalVendedores}
            </p>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
              Equipe ativa
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.25)"
          onClick={() => setAbaAtiva("clientes")}
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
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
              {resumoFinanceiro.totalClientes}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
              Diretos e equipe
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(99, 102, 241, 0.25)"
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition"
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
              R$ {resumoFinanceiro.faturamentoBruto.toFixed(2)}
            </p>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block mt-0.5">
              Mensalidades brutas
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => setAbaAtiva("extrato")}
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Minha Margem</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300 truncate">
              R$ {resumoFinanceiro.lucroLiquidoRevendedor.toFixed(2)}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5">
              Lucro recorrente/mês
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(244, 63, 94, 0.35)"
          onClick={() => setAbaAtiva("repasses")}
          className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-rose-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Mão de Obra</span>
            <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-rose-700 dark:text-rose-300 truncate">
              R$ {resumoFinanceiro.totalRepassesInstaladoresPendentes.toFixed(2)}
            </p>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block mt-0.5">
              Repasse instaladores
            </span>
          </div>
        </TiltCard>
      </div>

      {/* 3. Abas de Navegação Estilizadas em Pílulas */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#fbf2e9]/80 dark:bg-slate-900/50 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setAbaAtiva("vendedores")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "vendedores"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Equipe de Vendedores ({meusVendedores.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("clientes")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "clientes"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Carteira de Clientes ({meusClientes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("propostas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "propostas"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Propostas Comerciais</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("instaladores")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "instaladores"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Instaladores Credenciados</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("repasses")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "repasses"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Repasses a Instaladores</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("extrato")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "extrato"
              ? "bg-amber-500 text-slate-950 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          <span>Extrato Financeiro</span>
        </button>
      </div>

      {/* 4. Conteúdo das Abas */}

      {/* ABA 1: Equipe de Vendedores */}
      {abaAtiva === "vendedores" && (
        <div className="bg-[#fbf2e9] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Vendedor</th>
                  <th className="py-3 px-4">Base Vendedor</th>
                  <th className="py-3 px-4">Clientes Ativos</th>
                  <th className="py-3 px-4">Faturamento Bruto</th>
                  <th className="py-3 px-4 text-blue-600 dark:text-blue-400">Comissão Vendedor</th>
                  <th className="py-3 px-4 text-amber-600 dark:text-amber-400">Minha Margem</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                {carregando ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Carregando equipe de vendedores...
                    </td>
                  </tr>
                ) : meusVendedores.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Você ainda não cadastrou nenhum vendedor. Clique em "Cadastrar Vendedor" para
                      começar.
                    </td>
                  </tr>
                ) : (
                  meusVendedores.map((v) => (
                    <tr
                      key={v.id}
                      className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                        <div>
                          <span>{v.nome}</span>
                          {v.email && (
                            <p className="text-[10px] text-slate-400 font-normal font-mono">
                              {v.email}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                        R$ {v.valor_base_vendedor.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-sans">{v.total_clientes || 0} cliente(s)</td>
                      <td className="py-3 px-4">
                        R$ {(v.faturamento_total_mensal || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-bold text-blue-600 dark:text-blue-400">
                        R$ {(v.comissao_vendedor_mensal || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                        R$ {(v.repasse_revendedor_mensal || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            v.ativo
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                          }`}
                        >
                          {v.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          type="button"
                          title="Editar Vendedor e Redefinir Senha"
                          onClick={() => {
                            setVendedorEmEdicao(v);
                            setModalEditarVendedorAberto(true);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Editar</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: Carteira de Clientes */}
      {abaAtiva === "clientes" && (
        <div className="bg-[#fbf2e9] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Canal de Venda</th>
                  <th className="py-3 px-4">Mensalidade</th>
                  <th className="py-3 px-4">Taxa Instalação</th>
                  <th className="py-3 px-4 text-amber-600 dark:text-amber-400">Minha Parte</th>
                  <th className="py-3 px-4">Status Onboarding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                {meusClientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Nenhum cliente vinculado ainda.
                    </td>
                  </tr>
                ) : (
                  meusClientes.map((c) => {
                    const split = calcularSplitMensalidade({
                      valorMensalidade: c.valor_mensalidade,
                      baseSistema: meuRevendedor?.valor_base_sistema,
                      baseVendedor: c.vendedores?.valor_base_vendedor,
                      temRevendedor: true,
                      temVendedor: Boolean(c.vendedor_id),
                    });

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                          {c.nome_razao_social}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          {c.vendedores ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                              Vendedor: {c.vendedores.nome}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Venda Direta Revendedor
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          R$ {Number(c.valor_mensalidade || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          R$ {Number(c.taxa_instalacao || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                          R$ {split.parteRevendedor.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                            Etapa {c.etapa_onboarding || 6} de 6
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA: Propostas Comerciais da Franquia */}
      {abaAtiva === "propostas" && (
        <div className="space-y-4">
          <PropostasTab />
        </div>
      )}

      {/* ABA: Instaladores Credenciados */}
      {abaAtiva === "instaladores" && <TabelaInstaladoresCredenciados />}

      {/* ABA 3: Repasses a Instaladores */}
      {abaAtiva === "repasses" && (
        <div className="bg-[#fbf2e9] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Mão de Obra de Instalação e Ativação
              </h3>
              <p className="text-[11px] text-slate-500">
                A taxa de instalação recebida do cliente custeia o técnico instalador credenciado.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Instalador Responsável</th>
                  <th className="py-3 px-4">Taxa Cobrada</th>
                  <th className="py-3 px-4 text-rose-600 dark:text-rose-400">Repasse Técnico</th>
                  <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                    Sobra Franquia
                  </th>
                  <th className="py-3 px-4">Status Repasse</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                {meusClientes.filter((c) => Number(c.taxa_instalacao) > 0).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Nenhum contrato com taxa de instalação gerada.
                    </td>
                  </tr>
                ) : (
                  meusClientes
                    .filter((c) => Number(c.taxa_instalacao) > 0)
                    .map((c) => {
                      const taxa = Number(c.taxa_instalacao) || 0;
                      const custoInstalador = Number(c.valor_repasse_instalador) || 80.0;
                      const sobra = Math.max(0, taxa - custoInstalador);
                      const isPago = c.repasse_instalador_status === "pago";

                      return (
                        <tr
                          key={c.id}
                          className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                            {c.nome_razao_social}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {c.instalador_nome ? (
                              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                <Wrench className="h-3.5 w-3.5 text-slate-400" />
                                <span>{c.instalador_nome}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Aguardando atribuição</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold">R$ {taxa.toFixed(2)}</td>
                          <td className="py-3 px-4 font-bold text-rose-600 dark:text-rose-400">
                            R$ {custoInstalador.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                            R$ {sobra.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                isPago
                                  ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/25"
                                  : "bg-amber-500/15 text-amber-600 border border-amber-500/25"
                              }`}
                            >
                              {isPago ? "Pago ao Técnico" : "Pendente"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isPago && (
                              <button
                                type="button"
                                onClick={() => marcarRepassePago(c.id)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs cursor-pointer active:scale-95"
                              >
                                Marcar Pago
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 4: Extrato Financeiro */}
      {abaAtiva === "extrato" && (
        <div className="space-y-4">
          {/* Card Resumo do Extrato */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-4 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Extrato Consolidado da Franquia
                </h3>
                <p className="text-[11px] text-slate-500">
                  Discriminativo contrato a contrato com repasse a receber da Matriz e comissões da
                  equipe.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-950 p-1 rounded-xl border border-slate-300/70 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFiltroExtrato("todos")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                    filtroExtrato === "todos"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Todos ({meusClientes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroExtrato("diretas")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                    filtroExtrato === "diretas"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Vendas Diretas ({meusClientes.filter((c) => !c.vendedor_id).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroExtrato("equipe")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                    filtroExtrato === "equipe"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Vendedores ({meusClientes.filter((c) => Boolean(c.vendedor_id)).length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setModalDreAberto(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                title="Mostrar Demonstrativo Contábil e DRE da Franquia"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Mostrar DRE</span>
              </button>
            </div>
          </div>

          {/* Tabela de Extrato */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Cliente / Contrato</th>
                    <th className="py-3 px-4">Canal</th>
                    <th className="py-3 px-4">Mensalidade</th>
                    <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                      Cota da Matriz
                    </th>
                    <th className="py-3 px-4 text-blue-600 dark:text-blue-400">
                      Comissão Vendedor
                    </th>
                    <th className="py-3 px-4 text-amber-600 dark:text-amber-400">Minha Margem</th>
                    <th className="py-3 px-4">Status Repasse Matriz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                  {meusClientes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        Nenhum contrato localizado para este extrato.
                      </td>
                    </tr>
                  ) : (
                    meusClientes
                      .filter((c) => {
                        if (filtroExtrato === "diretas") return !c.vendedor_id;
                        if (filtroExtrato === "equipe") return Boolean(c.vendedor_id);
                        return true;
                      })
                      .map((c) => {
                        const mensalidade = Number(c.valor_mensalidade) || 0;
                        const taxa = Number(c.taxa_instalacao) || 0;
                        const baseSis = meuRevendedor?.valor_base_sistema || 40.0;
                        const baseVend = c.vendedores?.valor_base_vendedor
                          ? Number(c.vendedores.valor_base_vendedor)
                          : undefined;

                        const split = calcularSplitMensalidade({
                          valorMensalidade: mensalidade,
                          taxaInstalacao: taxa,
                          baseSistema: baseSis,
                          baseVendedor: baseVend,
                          temRevendedor: true,
                          temVendedor: Boolean(c.vendedor_id),
                        });

                        const transacaoRepasse = transacoesFranquia.find(
                          (t) => t.cliente_id === c.id && t.categoria === "repasse_revendedor",
                        );
                        const isPagoPelaMatriz = transacaoRepasse?.status === "pago";

                        return (
                          <tr
                            key={c.id}
                            className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition"
                          >
                            <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                              {c.nome_razao_social}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {c.vendedores ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                                  {c.vendedores.nome}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                  Venda Direta
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                              R$ {mensalidade.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                              R$ {split.parteSistema.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 font-bold text-blue-600 dark:text-blue-400">
                              R$ {split.parteVendedor.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                              R$ {split.parteRevendedor.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {isPagoPelaMatriz ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Repasse Pago pela Matriz</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                  <Clock className="h-3 w-3" />
                                  <span>Aguardando Repasse</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Cadastrar Vendedor */}
      {modalNovoVendedorAberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Cadastrar Vendedor na Minha Equipe
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Defina a base do vendedor acima de sua base de custo (R${" "}
                      {(meuRevendedor?.valor_base_sistema || 40).toFixed(2)}).
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
                onSubmit={handleCadastrarVendedor}
                className="p-4 space-y-3.5 overflow-y-auto text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Nome Completo do Vendedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={nomeVend}
                    onChange={(e) => setNomeVend(e.target.value)}
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
                      value={docVend}
                      onChange={(e) => setDocVend(e.target.value)}
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
                      value={telVend}
                      onChange={(e) => setTelVend(e.target.value)}
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
                    value={emailVend}
                    onChange={(e) => setEmailVend(e.target.value)}
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
                      value={baseVend}
                      onChange={setBaseVend}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-500/50 font-black font-mono text-slate-900 dark:text-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Sua base com a matriz é R${" "}
                      {(Number(meuRevendedor?.valor_base_sistema) || 40.0).toFixed(2)}. Sugestão (+
                      R$ 15,00): R${" "}
                      {((Number(meuRevendedor?.valor_base_sistema) || 40.0) + 15.0).toFixed(2)}.
                      Minha Margem: R${" "}
                      {(baseVend - (meuRevendedor?.valor_base_sistema || 40.0)).toFixed(2)}/mês
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Chave PIX do Vendedor
                    </label>
                    <input
                      type="text"
                      value={pixVend}
                      onChange={(e) => setPixVend(e.target.value)}
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

      {/* MODAL 2: Gerar Link pelo Revendedor */}
      {modalLinkAberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Gerar Link de Cadastro
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Envie convites para vendedores, clientes diretos ou instaladores.
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
                    Tipo de Convite
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConvite("cliente");
                        const baseMatriz = Number(meuRevendedor?.valor_base_sistema) || 40.0;
                        setMensalidadeLink(baseMatriz + 15.0);
                        setLinkGerado(null);
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConvite === "cliente"
                          ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Cliente Direto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConvite("vendedor");
                        const baseMatriz = Number(meuRevendedor?.valor_base_sistema) || 40.0;
                        setBaseVendedorLink(baseMatriz + 15.0);
                        setLinkGerado(null);
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConvite === "vendedor"
                          ? "bg-blue-600 text-white border-blue-600 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Vendedor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTipoConvite("instalador");
                        setLinkGerado(null);
                      }}
                      className={`p-2.5 rounded-xl font-bold border transition text-center cursor-pointer active:scale-95 ${
                        tipoConvite === "instalador"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                          : "bg-white dark:bg-slate-950 border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xs"
                      }`}
                    >
                      Instalador
                    </button>
                  </div>
                </div>

                {tipoConvite === "vendedor" && (
                  <div className="p-3 bg-white/80 dark:bg-slate-950/60 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                      Cota Base do Vendedor (R$) *
                    </label>
                    <MoedaInput
                      value={baseVendedorLink}
                      onChange={setBaseVendedorLink}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Sua base com a matriz é R${" "}
                      {(Number(meuRevendedor?.valor_base_sistema) || 40.0).toFixed(2)}. Sugestão (+
                      R$ 15,00): R${" "}
                      {((Number(meuRevendedor?.valor_base_sistema) || 40.0) + 15.0).toFixed(2)}.
                      Margem retida pela franquia: R${" "}
                      {Math.max(
                        0,
                        baseVendedorLink - (Number(meuRevendedor?.valor_base_sistema) || 40.0),
                      ).toFixed(2)}
                      /mês.
                    </p>
                  </div>
                )}

                {tipoConvite === "cliente" && (
                  <div className="space-y-3 p-3 bg-white/80 dark:bg-slate-950/60 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs">
                    <div className="grid grid-cols-2 gap-3">
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
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Sua base com a matriz é R${" "}
                      {(Number(meuRevendedor?.valor_base_sistema) || 40.0).toFixed(2)}. Sugestão (+
                      R$ 15,00): R${" "}
                      {((Number(meuRevendedor?.valor_base_sistema) || 40.0) + 15.0).toFixed(2)}.
                      Margem direta da franquia: R${" "}
                      {Math.max(
                        0,
                        mensalidadeLink - (Number(meuRevendedor?.valor_base_sistema) || 40.0),
                      ).toFixed(2)}
                      /mês.
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
                  <span>{gerandoLink ? "Gerando link..." : "Gerar Link de Cadastro"}</span>
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

      {/* MODAL 3: Editar Vendedor da Equipe (createPortal document.body - Regra Pétrea) */}
      {modalEditarVendedorAberto && vendedorEmEdicao && (
        <ModalEditarVendedor
          vendedor={vendedorEmEdicao}
          aberto={modalEditarVendedorAberto}
          onFechar={() => {
            setModalEditarVendedorAberto(false);
            setVendedorEmEdicao(null);
          }}
          onSucesso={() => carregarDadosFranquia()}
          valorBaseMinimo={meuRevendedor?.valor_base_sistema || 40}
        />
      )}

      {/* MODAL 4: Visualizar DRE da Franquia e Configurar Envio Diário */}
      {modalDreAberto && (
        <ModalDreParceiro
          aberto={modalDreAberto}
          onClose={() => setModalDreAberto(false)}
          tipo="revendedor"
          nomeParceiro={meuRevendedor?.nome || "Minha Franquia"}
          subtitulo="Revendedor Autorizado"
          dados={{
            faturamentoBruto: resumoFinanceiro.faturamentoBruto,
            repasseAoMatriz: resumoFinanceiro.repasseAoMatriz,
            lucroLiquidoRevendedor: resumoFinanceiro.lucroLiquidoRevendedor,
            comissaoVendedores: resumoFinanceiro.comissaoVendedores,
            totalTaxasInstalacaoRecebidas: resumoFinanceiro.totalTaxasInstalacaoRecebidas,
            totalRepassesInstaladoresPendentes: resumoFinanceiro.totalRepassesInstaladoresPendentes,
            totalContratos: meusClientes.length,
          }}
          configInicial={{
            ativo: Boolean((meuRevendedor as any)?.dre_whatsapp_ativo),
            horario: (meuRevendedor as any)?.dre_whatsapp_horario || "09:00",
            telefone:
              (meuRevendedor as any)?.dre_whatsapp_telefone || meuRevendedor?.telefone || "",
          }}
          onSalvarConfig={handleSalvarConfigDreRevendedor}
        />
      )}
    </div>
  );
}
