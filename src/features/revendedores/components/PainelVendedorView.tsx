// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Painel do Vendedor: Minhas Vendas e Clientes
// Padrão Visual Soberano GD Rastreamento (TiltCard, Relevo Tático e Ergonomia)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Briefcase,
  DollarSign,
  TrendingUp,
  Link2,
  CheckCircle2,
  Clock,
  Wrench,
  Copy,
  X,
  Search,
  Building,
  Receipt,
  Send,
  MessageCircle,
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
  gerarLinkConviteComercial,
  calcularSplitMensalidade,
} from "../services/revendedoresService";
import type { Vendedor, TipoConviteComercial } from "../types";
import { ModalDreParceiro } from "./ModalDreParceiro";
import { TabelaInstaladoresCredenciados } from "@/features/instalacoes/components/TabelaInstaladoresCredenciados";
import { PropostasTab } from "@/features/financeiro/components/PropostasTab";

interface VendedorComRevendedorInfo extends Vendedor {
  revendedor_nome?: string;
  valor_base_sistema?: number;
}

export function PainelVendedorView() {
  const { session } = useAuth();
  const [meuVendedor, setMeuVendedor] = useState<VendedorComRevendedorInfo | null>(null);
  const [meusClientes, setMeusClientes] = useState<any[]>([]);
  const [transacoesVendedor, setTransacoesVendedor] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<
    "clientes" | "propostas" | "instaladores" | "repasses" | "extrato"
  >(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("aba");
      if (
        param === "extrato" ||
        param === "repasses" ||
        param === "instaladores" ||
        param === "propostas"
      ) {
        return param;
      }
    }
    return "clientes";
  });

  // Modal Link
  const [modalLinkAberto, setModalLinkAberto] = useState(false);
  const [modalDreAberto, setModalDreAberto] = useState(false);
  const [tipoConvite, setTipoConvite] = useState<TipoConviteComercial>("cliente");
  const [mensalidadeLink, setMensalidadeLink] = useState<number>(70.0);
  const [taxaInstalacaoLink, setTaxaInstalacaoLink] = useState<number>(0.0);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [mostrarCampoWhatsappLink, setMostrarCampoWhatsappLink] = useState(false);
  const [whatsappDestinoLink, setWhatsappDestinoLink] = useState("");
  const [enviandoWhatsappLink, setEnviandoWhatsappLink] = useState(false);

  const abrirModalGerarLink = () => {
    const base = Number(meuVendedor?.valor_base_vendedor) || 55.0;
    setMensalidadeLink(base + 15.0);
    setTaxaInstalacaoLink(0.0);
    setLinkGerado(null);
    setMostrarCampoWhatsappLink(false);
    setWhatsappDestinoLink("");
    setModalLinkAberto(true);
  };

  // Carregamento de dados do Vendedor
  const carregarDadosVendedor = useCallback(async () => {
    setCarregando(true);
    try {
      let vendId = session?.vendedorId;

      // 1. Busca dados cadastrais do Vendedor
      if (!vendId && session?.userId) {
        const { data: v } = await supabase
          .from("vendedores")
          .select(
            `
            *,
            revendedores:revendedor_id (nome, valor_base_sistema)
          `,
          )
          .eq("user_id", session.userId)
          .maybeSingle();

        if (v) {
          vendId = v.id;
          const baseVend = Number(v.valor_base_vendedor) || 55.0;
          setMeuVendedor({
            ...v,
            valor_base_vendedor: baseVend,
            valor_base_sistema: Number(v.revendedores?.valor_base_sistema) || 40.0,
            revendedor_nome: v.revendedores?.nome,
          });
          setMensalidadeLink(baseVend + 15.0);
        }
      } else if (vendId) {
        const { data: v } = await supabase
          .from("vendedores")
          .select(
            `
            *,
            revendedores:revendedor_id (nome, valor_base_sistema)
          `,
          )
          .eq("id", vendId)
          .maybeSingle();

        if (v) {
          const baseVend = Number(v.valor_base_vendedor) || 55.0;
          setMeuVendedor({
            ...v,
            valor_base_vendedor: baseVend,
            valor_base_sistema: Number(v.revendedores?.valor_base_sistema) || 40.0,
            revendedor_nome: v.revendedores?.nome,
          });
          setMensalidadeLink(baseVend + 15.0);
        }
      }

      if (vendId) {
        const { data: clis } = await supabase
          .from("clientes")
          .select("*")
          .eq("vendedor_id", vendId)
          .order("created_at", { ascending: false });

        setMeusClientes(clis || []);

        // 2. Busca transações financeiras de comissão vinculadas ao vendedor
        const { data: trans } = await supabase
          .from("transacoes_financeiras" as any)
          .select("id, mensalidade_id, cliente_id, categoria, status, valor, data_pagamento")
          .eq("vendedor_id", vendId);

        setTransacoesVendedor(trans || []);
      }
    } catch {
      toast.error("Erro ao carregar dados do vendedor.");
    } finally {
      setCarregando(false);
    }
  }, [session?.userId, session?.vendedorId]);

  useEffect(() => {
    carregarDadosVendedor();
  }, [carregarDadosVendedor]);

  // Cálculos financeiros do Vendedor
  const resumoFinanceiro = useMemo(() => {
    const baseVend = meuVendedor?.valor_base_vendedor || 50.0;
    const baseSis = meuVendedor?.valor_base_sistema || 40.0;

    let faturamentoBruto = 0;
    let minhaComissaoTotal = 0;
    let totalTaxasInstalacaoRecebidas = 0;
    let totalRepassesInstaladoresPendentes = 0;

    for (const c of meusClientes) {
      const mensalidade = Number(c.valor_mensalidade) || 0;
      const taxa = Number(c.taxa_instalacao) || 0;

      const split = calcularSplitMensalidade({
        valorMensalidade: mensalidade,
        taxaInstalacao: taxa,
        baseSistema: baseSis,
        baseVendedor: baseVend,
        temRevendedor: Boolean(meuVendedor?.revendedor_id),
        temVendedor: true,
      });

      faturamentoBruto += mensalidade;
      minhaComissaoTotal += split.parteVendedor;

      // Se a venda foi do vendedor, a taxa de instalação pertence a ele
      if (split.destinatarioTaxa === "vendedor") {
        totalTaxasInstalacaoRecebidas += taxa;
      }

      if (c.repasse_instalador_status === "pendente") {
        totalRepassesInstaladoresPendentes += Number(c.valor_repasse_instalador) || 80.0;
      }
    }

    const custoBaseFranquia = Math.max(0, faturamentoBruto - minhaComissaoTotal);

    return {
      totalClientes: meusClientes.length,
      faturamentoBruto,
      custoBaseFranquia,
      minhaComissaoTotal,
      totalTaxasInstalacaoRecebidas,
      totalRepassesInstaladoresPendentes,
    };
  }, [meuVendedor, meusClientes]);

  const handleGerarLink = async () => {
    if (!meuVendedor) return;
    const base = Number(meuVendedor.valor_base_vendedor) || 55.0;
    if (tipoConvite === "cliente" && mensalidadeLink < base) {
      toast.error(
        `A mensalidade proposta (R$ ${mensalidadeLink.toFixed(2)}) não pode ser inferior à sua cota base (R$ ${base.toFixed(2)}).`,
      );
      return;
    }
    setGerandoLink(true);
    const res = await gerarLinkConviteComercial({
      tipoConvite,
      revendedorId: meuVendedor.revendedor_id,
      vendedorId: meuVendedor.id,
      valorMensalidadeProposta: tipoConvite === "cliente" ? mensalidadeLink : null,
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
      const textoMsg =
        `Olá! Segue o seu link exclusivo para realizar o cadastro e ativar o rastreamento do seu veículo no GD Rastreamento:\n\n` +
        `${linkGerado}\n\n` +
        `Acesse o link acima para preencher os seus dados e os dados do(s) seu(s) veículo(s).`;

      const res = await enviarMensagemWhatsappOperador({
        telefone: foneLimpo,
        mensagem: textoMsg,
        operadorNome: meuVendedor?.nome || "Vendedor GD Rastreamento",
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
      carregarDadosVendedor();
    } catch {
      toast.error("Erro ao atualizar repasse.");
    }
  };

  const copiarResumoExtrato = () => {
    const ganhoLiquidoEstimado =
      resumoFinanceiro.minhaComissaoTotal +
      resumoFinanceiro.totalTaxasInstalacaoRecebidas -
      resumoFinanceiro.totalRepassesInstaladoresPendentes;

    const texto = `GD RASTREAMENTO - DEMONSTRATIVO FINANCEIRO DO VENDEDOR
Faturamento Mensal da Carteira: R$ ${resumoFinanceiro.faturamentoBruto.toFixed(2)}
Minha Comissao Mensal Recorrente: R$ ${resumoFinanceiro.minhaComissaoTotal.toFixed(2)}
Taxas de Instalacao Recebidas: R$ ${resumoFinanceiro.totalTaxasInstalacaoRecebidas.toFixed(2)}
Mao de Obra a Pagar aos Instaladores: R$ ${resumoFinanceiro.totalRepassesInstaladoresPendentes.toFixed(2)}
--------------------------------------------------
GANHO LIQUIDO TOTAL ESTIMADO: R$ ${ganhoLiquidoEstimado.toFixed(2)}
Total de Clientes Ativos: ${meusClientes.length}`;

    navigator.clipboard.writeText(texto);
    toast.success("Demonstrativo do vendedor copiado para a área de transferência!");
  };

  const handleSalvarConfigDreVendedor = async (cfg: {
    ativo: boolean;
    horario: string;
    telefone: string;
  }): Promise<{ sucesso: boolean; erro?: string }> => {
    try {
      const { data, error } = await supabase.rpc("configurar_dre_whatsapp_vendedor" as any, {
        p_ativo: cfg.ativo,
        p_horario: cfg.horario,
        p_telefone: cfg.telefone,
      });

      if (!error && (data as any)?.sucesso !== false) {
        setMeuVendedor((prev: any) =>
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
      if (meuVendedor?.id) {
        await supabase
          .from("vendedores")
          .update({
            dre_whatsapp_ativo: cfg.ativo,
            dre_whatsapp_horario: cfg.horario,
            dre_whatsapp_telefone: cfg.telefone,
          })
          .eq("id", meuVendedor.id);

        setMeuVendedor((prev: any) =>
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs shrink-0">
            <Briefcase className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 truncate">
                {meuVendedor?.nome || "Minhas Vendas e Clientes"}
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                Vendedor Autorizado
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Gestão da sua carteira de clientes, comissões líquidas recorrentes e links de adesão
              comercial.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={abrirModalGerarLink}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-500/20 w-full sm:w-auto cursor-pointer active:scale-95"
        >
          <Link2 className="h-4 w-4 shrink-0" />
          <span>Gerar Link de Venda</span>
        </button>
      </div>

      {/* 2. Balões Estatísticos Interativos com TiltCard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(100, 116, 139, 0.25)"
          className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Minha Base de Custo
            </span>
            <div className="h-7 w-7 rounded-lg bg-slate-500/10 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <Building className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-slate-900 dark:text-white">
              R$ {(meuVendedor?.valor_base_vendedor || 50.0).toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5 truncate">
              Franquia: {meuVendedor?.revendedor_nome || "Central"}
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(59, 130, 246, 0.25)"
          onClick={() => setAbaAtiva("clientes")}
          className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Meus Clientes</span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {resumoFinanceiro.totalClientes}
            </p>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
              Veículos monitorados
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.35)"
          onClick={() => setAbaAtiva("extrato")}
          className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Minha Comissão</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300 truncate">
              R$ {resumoFinanceiro.minhaComissaoTotal.toFixed(2)}
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
          className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-rose-500/30 rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95"
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Repasse Instalador
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-black font-mono text-rose-700 dark:text-rose-300 truncate">
              R$ {resumoFinanceiro.totalRepassesInstaladoresPendentes.toFixed(2)}
            </p>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block mt-0.5">
              Mão de obra a quitar
            </span>
          </div>
        </TiltCard>
      </div>

      {/* 3. Abas de Navegação Estilizadas em Pílulas */}
      <div className="flex items-center gap-1.5 p-1.5 bg-[#eaf0f8]/80 dark:bg-slate-900/50 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setAbaAtiva("clientes")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "clientes"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Meus Clientes ({meusClientes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("propostas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "propostas"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Propostas Comerciais</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("repasses")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "repasses"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Repasse a Instaladores</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("extrato")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "extrato"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          <span>Extrato Financeiro</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("instaladores")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
            abaAtiva === "instaladores"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span>Instaladores Credenciados</span>
        </button>
      </div>

      {/* 4. Conteúdo das Abas */}

      {/* ABA 1: Meus Clientes */}
      {abaAtiva === "clientes" && (
        <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Mensalidade</th>
                  <th className="py-3 px-4">Minha Base</th>
                  <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                    Minha Comissão
                  </th>
                  <th className="py-3 px-4">Taxa Instalação</th>
                  <th className="py-3 px-4">Status Onboarding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                {carregando ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Carregando seus clientes...
                    </td>
                  </tr>
                ) : meusClientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Você ainda não possui clientes ativos. Gere um link de venda para cadastrar.
                    </td>
                  </tr>
                ) : (
                  meusClientes.map((c) => {
                    const mensalidade = Number(c.valor_mensalidade) || 0;
                    const baseVend = meuVendedor?.valor_base_vendedor || 50.0;
                    const comissao = Math.max(0, mensalidade - baseVend);

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-white">
                          {c.nome_razao_social}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          R$ {mensalidade.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-500">R$ {baseVend.toFixed(2)}</td>
                        <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {comissao.toFixed(2)}/mês
                        </td>
                        <td className="py-3 px-4">
                          R$ {Number(c.taxa_instalacao || 0).toFixed(2)}
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

      {/* ABA PROPOSTAS */}
      {abaAtiva === "propostas" && (
        <div className="space-y-4">
          <PropostasTab />
        </div>
      )}

      {/* ABA 2: Repasse a Instaladores */}
      {abaAtiva === "repasses" && (
        <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <div className="p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Repasse da Mão de Obra do Instalador
            </h3>
            <p className="text-[11px] text-slate-500">
              A taxa de instalação recebida do cliente deve ser repassada ao técnico responsável
              após a instalação.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Instalador Responsável</th>
                  <th className="py-3 px-4">Taxa Recebida</th>
                  <th className="py-3 px-4 text-rose-600 dark:text-rose-400">Repasse Instalador</th>
                  <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">Minha Sobra</th>
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
                      const repasse = Number(c.valor_repasse_instalador) || 80.0;
                      const sobra = Math.max(0, taxa - repasse);
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
                            {c.instalador_nome || (
                              <span className="text-slate-400 italic">Pendente</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-bold">R$ {taxa.toFixed(2)}</td>
                          <td className="py-3 px-4 font-bold text-rose-600 dark:text-rose-400">
                            R$ {repasse.toFixed(2)}
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
                              {isPago ? "Quitado" : "Aguardando Pagamento"}
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

      {/* ABA 3: Extrato Financeiro */}
      {abaAtiva === "extrato" && (
        <div className="space-y-4">
          <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-4 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/30">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Extrato de Comissões e Repasses
                </h3>
                <p className="text-[11px] text-slate-500">
                  Acompanhamento de repasses realizados pela Matriz e comissões da carteira.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalDreAberto(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-500/30 transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              title="Mostrar Demonstrativo Contábil e DRE do Vendedor"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Mostrar DRE</span>
            </button>
          </div>

          <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 overflow-hidden shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-200/60 dark:bg-slate-800/60 uppercase font-black tracking-wider text-[10px] text-slate-700 dark:text-slate-400 border-b border-slate-300/60 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Cliente / Contrato</th>
                    <th className="py-3 px-4">Mensalidade</th>
                    <th className="py-3 px-4">Minha Base</th>
                    <th className="py-3 px-4 text-emerald-600 dark:text-emerald-400">
                      Minha Comissão
                    </th>
                    <th className="py-3 px-4">Taxa Recebida</th>
                    <th className="py-3 px-4 text-rose-600 dark:text-rose-400">Custo Técnico</th>
                    <th className="py-3 px-4">Saldo Líquido</th>
                    <th className="py-3 px-4">Status Pagamento Matriz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800 font-mono">
                  {meusClientes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Nenhum contrato ativo para exibição de extrato.
                      </td>
                    </tr>
                  ) : (
                    meusClientes.map((c) => {
                      const mensalidade = Number(c.valor_mensalidade) || 0;
                      const taxa = Number(c.taxa_instalacao) || 0;
                      const baseVend = meuVendedor?.valor_base_vendedor || 50.0;
                      const baseSis = meuVendedor?.valor_base_sistema || 40.0;

                      const split = calcularSplitMensalidade({
                        valorMensalidade: mensalidade,
                        taxaInstalacao: taxa,
                        baseSistema: baseSis,
                        baseVendedor: baseVend,
                        temRevendedor: true,
                        temVendedor: true,
                      });

                      const custoInstalador =
                        taxa > 0 ? Number(c.valor_repasse_instalador) || 80.0 : 0;
                      const saldoLiquidoContrato = split.parteVendedor + taxa - custoInstalador;

                      const transacaoRepasse = transacoesVendedor.find(
                        (t) => t.cliente_id === c.id && t.categoria === "repasse_vendedor",
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
                          <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                            R$ {mensalidade.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-slate-500">R$ {baseVend.toFixed(2)}</td>
                          <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                            R$ {split.parteVendedor.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">R$ {taxa.toFixed(2)}</td>
                          <td className="py-3 px-4 text-rose-600 dark:text-rose-400">
                            - R$ {custoInstalador.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-700 dark:text-emerald-300">
                            R$ {saldoLiquidoContrato.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {isPagoPelaMatriz ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Comissão Paga pela Matriz</span>
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

      {/* ABA 4: Instaladores Credenciados */}
      {abaAtiva === "instaladores" && <TabelaInstaladoresCredenciados />}

      {/* MODAL: Gerar Link de Venda (createPortal document.body) */}
      {modalLinkAberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/30">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Gerar Link de Venda
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Link exclusivo atrelado à sua carteira para cadastro de clientes.
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
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Sua base é R$ {(Number(meuVendedor?.valor_base_vendedor) || 55.0).toFixed(2)}.
                      Sugestão (+ R$ 15,00): R${" "}
                      {((Number(meuVendedor?.valor_base_vendedor) || 55.0) + 15.0).toFixed(2)}.
                      Comissão recorrente estimada: R${" "}
                      {Math.max(
                        0,
                        mensalidadeLink - (Number(meuVendedor?.valor_base_vendedor) || 55.0),
                      ).toFixed(2)}
                      /mês.
                    </p>
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

                <button
                  type="button"
                  onClick={handleGerarLink}
                  disabled={gerandoLink}
                  className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
                >
                  <Link2 className="h-4 w-4" />
                  <span>{gerandoLink ? "Gerando Link..." : "Gerar Link de Venda"}</span>
                </button>

                {linkGerado && (
                  <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Link Pronto para Enviar ao Cliente:</span>
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

      {/* MODAL 2: Visualizar DRE do Vendedor e Configurar Envio Diário */}
      {modalDreAberto && (
        <ModalDreParceiro
          aberto={modalDreAberto}
          onClose={() => setModalDreAberto(false)}
          tipo="vendedor"
          nomeParceiro={meuVendedor?.nome || "Meu Cadastro"}
          subtitulo={
            meuVendedor?.revendedor_nome ? `Franquia ${meuVendedor.revendedor_nome}` : undefined
          }
          dados={{
            faturamentoMeusClientes: resumoFinanceiro.faturamentoBruto,
            custoBaseFranquia: resumoFinanceiro.custoBaseFranquia,
            minhaComissaoTotal: resumoFinanceiro.minhaComissaoTotal,
            totalRepasseInstaladorVendedor: resumoFinanceiro.totalRepassesInstaladoresPendentes,
            ganhoLiquidoEstimado:
              resumoFinanceiro.minhaComissaoTotal +
              resumoFinanceiro.totalTaxasInstalacaoRecebidas -
              resumoFinanceiro.totalRepassesInstaladoresPendentes,
            totalClientes: meusClientes.length,
          }}
          configInicial={{
            ativo: Boolean((meuVendedor as any)?.dre_whatsapp_ativo),
            horario: (meuVendedor as any)?.dre_whatsapp_horario || "09:00",
            telefone: (meuVendedor as any)?.dre_whatsapp_telefone || meuVendedor?.telefone || "",
          }}
          onSalvarConfig={handleSalvarConfigDreVendedor}
        />
      )}
    </div>
  );
}
