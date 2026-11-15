// RelatorioGerencialModal.tsx — GD Rastreamento
// Configuração do Relatório Gerencial Diário (Métricas, Destinatários, Horário e Canais)
// Design Canônico: Modos Claro (#eaf0f8 / Neumórfico) e Escuro (Slate-900)

import { useState, useEffect } from "react";
import {
  FileText,
  X,
  Clock,
  Smartphone,
  Bell,
  MessageSquare,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Save,
  Truck,
  ShieldAlert,
  DollarSign,
  Cpu,
  Radio,
  Server,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { useCardTheme } from "@/shared/lib/card-theme";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  relatorioGerencialConfigService,
  RelatorioGerencialConfig,
  CONFIG_PADRAO_RELATORIO,
  DestinatarioRelatorio,
} from "../services/relatorioGerencialConfigService";

interface RelatorioGerencialModalProps {
  aberto: boolean;
  onClose: () => void;
}

export function RelatorioGerencialModal({ aberto, onClose }: RelatorioGerencialModalProps) {
  const { session } = useAuth();
  const cardTheme = useCardTheme(session?.userId);
  const isNeumorph = (cardTheme.variant ?? "neumorphic") === "neumorphic";

  const [config, setConfig] = useState<RelatorioGerencialConfig>(CONFIG_PADRAO_RELATORIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [disparando, setDisparando] = useState(false);

  // Novo telefone temporário
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  useEffect(() => {
    if (aberto) {
      setCarregando(true);
      relatorioGerencialConfigService
        .carregar()
        .then((dados) => {
          setConfig(dados);
        })
        .finally(() => {
          setCarregando(false);
        });
    }
  }, [aberto]);

  if (!aberto || !session?.isSuperAdmin) return null;

  // Adicionar destinatário
  const handleAdicionarTelefone = () => {
    const telLimpo = novoTelefone.replace(/\D/g, "");
    if (!telLimpo || telLimpo.length < 10) {
      toast.error("Informe um número de telefone válido com DDD (ex: 24 99999-9999)");
      return;
    }

    const ddiCompleto = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
    const nomeFinal = novoNome.trim() || `Destinatário ${config.telefones.length + 1}`;

    const existe = config.telefones.some((t) => t.telefone.replace(/\D/g, "") === ddiCompleto);
    if (existe) {
      toast.warning("Este número já está na lista de destinatários.");
      return;
    }

    const novoItem: DestinatarioRelatorio = {
      nome: nomeFinal,
      telefone: ddiCompleto,
      padrao: false,
    };

    setConfig((prev) => ({
      ...prev,
      telefones: [...prev.telefones, novoItem],
    }));

    setNovoNome("");
    setNovoTelefone("");
    toast.success(`Destinatário "${nomeFinal}" adicionado.`);
  };

  // Remover destinatário
  const handleRemoverTelefone = (index: number) => {
    if (config.telefones.length <= 1) {
      toast.warning("É necessário manter pelo menos um número de telefone configurado.");
      return;
    }
    setConfig((prev) => ({
      ...prev,
      telefones: prev.telefones.filter((_, i) => i !== index),
    }));
    toast.info("Destinatário removido.");
  };

  // Salvar configuração
  const handleSalvar = async () => {
    if (!config.enviar_whatsapp && !config.enviar_push) {
      toast.error("Selecione ao menos um canal de notificação (WhatsApp ou Push).");
      return;
    }

    if (config.telefones.length === 0) {
      toast.error("Cadastre ao menos um telefone para recebimento.");
      return;
    }

    setSalvando(true);
    const res = await relatorioGerencialConfigService.salvar(config);
    setSalvando(false);

    if (res.sucesso) {
      toast.success("Configurações do Relatório Gerencial salvas com sucesso!");
      onClose();
    } else {
      toast.error(`Falha ao salvar: ${res.mensagem}`);
    }
  };

  // Disparo manual imediato
  const handleDispararAgora = async () => {
    setDisparando(true);
    const toastId = toast.loading(
      "Gerando e disparando Relatório Gerencial para os canais configurados...",
    );
    try {
      // Salva antes de disparar para sincronizar as seções
      await relatorioGerencialConfigService.salvar(config);
      const res = await relatorioGerencialConfigService.dispararAgora();

      if (res.sucesso) {
        toast.success("Relatório gerencial despachado com sucesso!", { id: toastId });
      } else {
        toast.error(`Erro no disparo: ${res.mensagem}`, { id: toastId });
      }
    } catch {
      toast.error("Falha na comunicação ao disparar relatório.", { id: toastId });
    } finally {
      setDisparando(false);
    }
  };

  // Classes de layout canônico claro/escuro
  const modalBoxClass = isNeumorph
    ? "bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-[8px_8px_24px_#c3cfe2] dark:shadow-[8px_8px_30px_rgba(0,0,0,0.8)] border border-slate-300/60 dark:border-slate-800"
    : "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl";

  const cardSectionClass = isNeumorph
    ? "p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/60 border border-slate-300/50 dark:border-slate-800/80 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4)]"
    : "p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800";

  const inputClass = isNeumorph
    ? "py-2 px-3 rounded-xl bg-[#eaf0f8] dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.5)] border border-slate-300/50 dark:border-slate-800 outline-none focus:ring-2 focus:ring-[#00CFCC] transition"
    : "py-2 px-3 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-orange-500/50 transition";

  const btnSecondaryClass = isNeumorph
    ? "px-3 py-2 rounded-xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700 hover:shadow-[3px_3px_6px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition flex items-center justify-center gap-1.5 cursor-pointer"
    : "px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer";

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div
          className={`relative w-full max-w-2xl rounded-3xl overflow-hidden my-auto max-h-[90vh] flex flex-col ${modalBoxClass}`}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200/60 dark:border-slate-800/80 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-2xl ${
                  isNeumorph
                    ? "bg-[#eaf0f8] dark:bg-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none text-indigo-600 dark:text-indigo-400"
                    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                }`}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                  Relatório Gerencial Diário
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    SuperADM
                  </span>
                </h3>
                <p className="text-xs opacity-70">
                  Configure o horário, destinatários, canais e seções incluídas no relatório
                  matinal.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl opacity-70 hover:opacity-100 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo com Rolagem */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm">
            {carregando ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                <Sparkles className="h-6 w-6 animate-spin text-indigo-500" />
                <span>Carregando configurações...</span>
              </div>
            ) : (
              <>
                {/* 1. Status Geral e Horário */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Status Geral */}
                  <div className={cardSectionClass}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2
                          className={`h-4 w-4 ${
                            config.ativo ? "text-orange-500" : "text-slate-400"
                          }`}
                        />
                        <span className="font-bold text-xs">Envio Automático Diário</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.ativo}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, ativo: e.target.checked }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                    <p className="text-[11px] opacity-70 mt-1">
                      {config.ativo
                        ? "Ativo: o relatório será despachado todo dia no horário programado."
                        : "Desativado: nenhum envio automático será disparado."}
                    </p>
                  </div>

                  {/* Horário de Envio */}
                  <div className={cardSectionClass}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-indigo-500" />
                        <span className="font-bold text-xs">Horário de Envio (Brasília)</span>
                      </div>
                      <input
                        type="time"
                        value={config.horario_envio}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, horario_envio: e.target.value }))
                        }
                        className={`w-28 text-center font-black ${inputClass}`}
                      />
                    </div>
                    <p className="text-[11px] opacity-70 mt-1">
                      Horário matinal canônico recomendado: 10:00 (após rotinas financeiras).
                    </p>
                  </div>
                </div>

                {/* 2. Canais de Notificação */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider opacity-80 mb-2 flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-indigo-500" />
                    Canais de Notificação
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Canal WhatsApp */}
                    <div
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          enviar_whatsapp: !prev.enviar_whatsapp,
                        }))
                      }
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                        config.enviar_whatsapp
                          ? isNeumorph
                            ? "bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-400/50 text-emerald-800 dark:text-emerald-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/40 dark:border-slate-800 opacity-60"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="font-bold text-xs">
                            WhatsApp (Micro-Gateway Baileys Oracle)
                          </p>
                          <p className="text-[10px] opacity-75">
                            Mensagem formatada com ícones e status
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.enviar_whatsapp}
                        readOnly
                        className="rounded text-emerald-600"
                      />
                    </div>

                    {/* Canal Push VAPID */}
                    <div
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          enviar_push: !prev.enviar_push,
                        }))
                      }
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                        config.enviar_push
                          ? isNeumorph
                            ? "bg-indigo-500/10 dark:bg-indigo-950/30 border-indigo-400/50 text-indigo-800 dark:text-indigo-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
                          : isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/40 dark:border-slate-800 opacity-60"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <div>
                          <p className="font-bold text-xs">Notificação Push (VAPID)</p>
                          <p className="text-[10px] opacity-75">
                            Alerta direto na barra de notificações do celular/PC
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.enviar_push}
                        readOnly
                        className="rounded text-indigo-600"
                      />
                    </div>

                    {/* Cópia de Mensagens dos Parceiros para o SuperADM */}
                    <div
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          copia_whatsapp_parceiros: !(prev.copia_whatsapp_parceiros ?? true),
                        }))
                      }
                      className={`sm:col-span-2 p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                        (config.copia_whatsapp_parceiros ?? true)
                          ? isNeumorph
                            ? "bg-blue-500/10 dark:bg-blue-950/30 border-blue-400/50 text-blue-800 dark:text-blue-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                            : "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300"
                          : isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/40 dark:border-slate-800 opacity-60"
                            : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="font-bold text-xs">Cópia de Mensagens dos Parceiros</p>
                          <p className="text-[10px] opacity-75">
                            Receber no WhatsApp cópia em tempo real de mensagens enviadas por
                            revendedores e vendedores
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.copia_whatsapp_parceiros ?? true}
                        readOnly
                        className="rounded text-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Telefones Destinatários */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-indigo-500" />
                      Números de Telefone para Recebimento (WhatsApp)
                    </h4>
                    <span className="text-[10px] opacity-60">
                      {config.telefones.length} número(s) configurado(s)
                    </span>
                  </div>

                  {/* Lista de Destinatários Existentes */}
                  <div className="space-y-2 mb-3">
                    {config.telefones.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2.5 px-3.5 rounded-xl border ${
                          item.padrao
                            ? isNeumorph
                              ? "bg-indigo-500/5 border-indigo-300/40 dark:border-indigo-800/60"
                              : "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800"
                            : isNeumorph
                              ? "bg-[#eaf0f8] dark:bg-slate-900 border-slate-300/50 dark:border-slate-800"
                              : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Smartphone className="h-4 w-4 text-indigo-500" />
                          <div>
                            <span className="font-bold text-xs flex items-center gap-1.5">
                              {item.nome}
                              {item.padrao && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                  Padrão S.Adm
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] opacity-70 block font-mono">
                              +{item.telefone}
                            </span>
                          </div>
                        </div>

                        {/* Ação de Exclusão (não permite se for o único) */}
                        <button
                          type="button"
                          onClick={() => handleRemoverTelefone(idx)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Remover telefone"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Formulário para Adicionar Novo Número */}
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome / Cargo (ex: Diretor Operacional)"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className={`flex-1 ${inputClass}`}
                    />
                    <input
                      type="tel"
                      placeholder="DDD + Telefone (ex: 24 99249-4030)"
                      value={novoTelefone}
                      onChange={(e) => setNovoTelefone(e.target.value)}
                      className={`w-full sm:w-56 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={handleAdicionarTelefone}
                      className={`w-full sm:w-auto ${btnSecondaryClass}`}
                    >
                      <Plus className="h-3.5 w-3.5 text-orange-500" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>

                {/* 4. Opções de Seções do Relatório (Marcar / Desmarcar) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-indigo-500" />
                      Seções do Relatório (Marcar / Desmarcar)
                    </h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              frota: true,
                              alertas: true,
                              financeiro: true,
                              infraestrutura: true,
                              chips: true,
                              gateways: true,
                              dre: true,
                            },
                          }))
                        }
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                      >
                        Marcar Todas
                      </button>
                      <span className="opacity-30">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              frota: false,
                              alertas: false,
                              financeiro: false,
                              infraestrutura: false,
                              chips: false,
                              gateways: false,
                              dre: false,
                            },
                          }))
                        }
                        className="text-[10px] text-slate-500 hover:underline font-bold"
                      >
                        Desmarcar Todas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* 1. Frota */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.frota
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Truck className="h-4 w-4 text-orange-500" />
                        <div>
                          <span className="font-bold text-xs block">Frota e Rastreadores</span>
                          <span className="text-[10px] opacity-70">
                            Total de veículos, online, offline e sem sinal
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.frota}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              frota: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 2. Alertas */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.alertas
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="h-4 w-4 text-rose-500" />
                        <div>
                          <span className="font-bold text-xs block">Alertas e Segurança</span>
                          <span className="text-[10px] opacity-70">
                            Violações de cerca, velocidade e pânico
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.alertas}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              alertas: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 3. Financeiro */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.financeiro
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <DollarSign className="h-4 w-4 text-amber-500" />
                        <div>
                          <span className="font-bold text-xs block">Financeiro e Mensalidades</span>
                          <span className="text-[10px] opacity-70">
                            Mensalidades abertas, pagas e inadimplentes
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.financeiro}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              financeiro: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 4. Infraestrutura */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.infraestrutura
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Cpu className="h-4 w-4 text-cyan-500" />
                        <div>
                          <span className="font-bold text-xs block">Limites Free Tier e Infra</span>
                          <span className="text-[10px] opacity-70">
                            Consumo Supabase, Oracle Cloud, Cloudflare e Edge
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.infraestrutura}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              infraestrutura: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 5. Chips M2M */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.chips
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Radio className="h-4 w-4 text-purple-500" />
                        <div>
                          <span className="font-bold text-xs block">Chips M2M e Estoque</span>
                          <span className="text-[10px] opacity-70">
                            Chips ativos, em teste, estoque e cancelados
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.chips}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              chips: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 6. Gateways */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.gateways
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Server className="h-4 w-4 text-blue-500" />
                        <div>
                          <span className="font-bold text-xs block">Gateways de Integração</span>
                          <span className="text-[10px] opacity-70">
                            WhatsApp Baileys, Gateway GPS J16 e Webhooks
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.gateways}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              gateways: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>

                    {/* 7. DRE da Rede e Parceiros */}
                    <label
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        config.secoes_ativas.dre
                          ? isNeumorph
                            ? "bg-[#eaf0f8] dark:bg-slate-900 border-indigo-400/50 shadow-[2px_2px_4px_#c3cfe2] dark:shadow-none"
                            : "bg-indigo-50/40 dark:bg-slate-900 border-indigo-300 dark:border-indigo-800"
                          : "opacity-50 border-slate-300/40 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <div>
                          <span className="font-bold text-xs block">Demonstrativo DRE da Rede</span>
                          <span className="text-[10px] opacity-70">
                            Faturamento da carteira, repasse matriz, franquias e comissões
                          </span>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.secoes_ativas.dre}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            secoes_ativas: {
                              ...prev.secoes_ativas,
                              dre: e.target.checked,
                            },
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                    </label>
                  </div>
                </div>

                {/* Status do último envio */}
                {config.ultimo_envio_em && (
                  <div className="text-[11px] opacity-60 flex items-center gap-2 p-2 rounded-xl bg-slate-500/5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Último envio realizado em:{" "}
                      {new Date(config.ultimo_envio_em).toLocaleString("pt-BR")}
                      {config.ultimo_status && ` (${config.ultimo_status})`}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodapé Fixo */}
          <div className="p-4 sm:p-5 border-t border-slate-200/60 dark:border-slate-800/80 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDispararAgora}
              disabled={disparando || salvando || carregando}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                isNeumorph
                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-400/40 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                  : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20"
              }`}
              title="Disparar relatório agora para os canais selecionados"
            >
              <Play className={`h-3.5 w-3.5 ${disparando ? "animate-spin" : ""}`} />
              <span>{disparando ? "Disparando..." : "Disparar Agora (Teste)"}</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 sm:flex-none ${btnSecondaryClass}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando || carregando}
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 text-white cursor-pointer ${
                  isNeumorph
                    ? "bg-indigo-600 hover:bg-indigo-700 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none"
                    : "bg-indigo-600 hover:bg-indigo-700 shadow-md"
                }`}
              >
                <Save className="h-4 w-4" />
                <span>{salvando ? "Salvando..." : "Salvar Configurações"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
