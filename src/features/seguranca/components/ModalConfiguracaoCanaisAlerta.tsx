import { useState, useEffect } from "react";
import {
  Bell,
  MessageSquare,
  PhoneCall,
  Check,
  Smartphone,
  Info,
  X,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { normalizarTelefoneDigitosBR } from "@/features/monitor-gps/constants/alertasCatalogo";
import {
  carregarConfigAlertasEquipe,
  salvarConfigAlertasEquipe,
} from "@/features/monitor-gps/services/protecaoVeiculoService";
import {
  obterCanaisAlerta,
  salvarCanaisAlerta,
  type CanaisAlertaComandoAguardo,
} from "../services/comandosEmAguardoService";

interface ModalConfiguracaoCanaisAlertaProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: (canais: CanaisAlertaComandoAguardo) => void;
}

export function ModalConfiguracaoCanaisAlerta({
  aberto,
  onClose,
  onSalvo,
}: ModalConfiguracaoCanaisAlertaProps) {
  const [canais, setCanais] = useState<CanaisAlertaComandoAguardo>(() => obterCanaisAlerta());
  const [telefone, setTelefone] = useState<string>(() => obterCanaisAlerta().telefoneDestino || "");
  const [salvando, setSalvando] = useState(false);
  const [testandoWhatsapp, setTestandoWhatsapp] = useState(false);
  const [testandoLigacao, setTestandoLigacao] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    const atuais = obterCanaisAlerta();
    setCanais(atuais);
    setTelefone(atuais.telefoneDestino || "");

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        const uid = data?.user?.id;
        if (!ativo || !uid) return;
        const cfg = await carregarConfigAlertasEquipe(uid);
        if (!ativo) return;
        const regraJ16 = cfg?.alertasOperacionais?.comandos_j16;
        if (regraJ16) {
          const telSalvo =
            regraJ16.destinatarios_ligacao?.[0] ||
            regraJ16.destinatarios_whatsapp?.[0] ||
            atuais.telefoneDestino ||
            "";
          setCanais((prev) => ({
            ...prev,
            app: Boolean(regraJ16.ativo !== false && regraJ16.app),
            whatsapp: Boolean(regraJ16.ativo !== false && regraJ16.whatsapp),
            ligacao: Boolean(regraJ16.ativo !== false && regraJ16.ligacao),
            telefoneDestino: telSalvo || prev.telefoneDestino,
          }));
          if (telSalvo) {
            setTelefone(telSalvo);
          }
        }
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aberto, onClose]);

  if (!aberto || typeof document === "undefined") {
    return null;
  }

  const alternarCanal = (canal: "app" | "whatsapp" | "ligacao") => {
    setCanais((prev) => ({
      ...prev,
      [canal]: !prev[canal],
    }));
  };

  const handleSalvar = async () => {
    const limpo = telefone.replace(/\D/g, "");
    const limpoBR = normalizarTelefoneDigitosBR(telefone);
    const novos: CanaisAlertaComandoAguardo = {
      ...canais,
      telefoneDestino: limpo || telefone.trim() || undefined,
    };

    setSalvando(true);
    try {
      salvarCanaisAlerta(novos);

      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const cfgAtual = await carregarConfigAlertasEquipe(uid);
          const regraAtual = cfgAtual.alertasOperacionais.comandos_j16 || {
            ativo: true,
            app: true,
            whatsapp: true,
            ligacao: false,
          };
          const algumCanalAtivo = Boolean(novos.app || novos.whatsapp || novos.ligacao);
          await salvarConfigAlertasEquipe({
            userId: uid,
            alertasOperacionais: {
              ...cfgAtual.alertasOperacionais,
              comandos_j16: {
                ...regraAtual,
                ativo: algumCanalAtivo,
                app: novos.app,
                whatsapp: novos.whatsapp,
                ligacao: novos.ligacao,
                ...(limpoBR.length >= 10
                  ? {
                      destinatarios_whatsapp: [limpoBR],
                      destinatarios_ligacao: [limpoBR],
                    }
                  : {}),
              },
            },
            alertasEquipe: cfgAtual.alertasEquipe,
            contatosAlertas: cfgAtual.contatosAlertas,
          });
        }
      } catch {
        // Sincronização em nuvem melhor-esforço sem bloquear atualização local imediata
      }

      if (onSalvo) {
        onSalvo(novos);
      }
      toast.success("Preferências de mensagens e canais salvas com sucesso!");
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const handleTestarWhatsapp = async () => {
    const numLimpo = telefone.replace(/\D/g, "");
    if (!numLimpo || numLimpo.length < 10) {
      toast.error("Informe um número de telefone com DDD válido para testar o WhatsApp.");
      return;
    }
    setTestandoWhatsapp(true);
    try {
      const res = await enviarMensagemWhatsappOperador({
        telefone: numLimpo,
        categoriaMensagem: "alerta",
        tipoContato: "usuario",
        mensagem:
          `📡 *GD RASTREAMENTO — TESTE DE MENSAGEM DO RASTREADOR*\n\n` +
          `✅ Teste de canal WhatsApp efetuado com sucesso!\n` +
          `⏰ *Horário:* ${formatarHoraBrasil(new Date(), true)}\n` +
          `🎯 As respostas dos comandos agendados serão entregues neste número.`,
      });
      if (res.sucesso) {
        toast.success("Mensagem de teste WhatsApp enviada com sucesso!");
      } else {
        toast.error(`Falha no envio do teste WhatsApp: ${res.erro || "Verifique o gateway"}`);
      }
    } catch (err: any) {
      toast.error(`Erro ao enviar teste: ${err?.message || String(err)}`);
    } finally {
      setTestandoWhatsapp(false);
    }
  };

  const handleTestarLigacao = async () => {
    const numLimpo = telefone.replace(/\D/g, "");
    if (!numLimpo || numLimpo.length < 10) {
      toast.error("Informe um número de telefone com DDD válido para testar a ligação.");
      return;
    }
    setTestandoLigacao(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const res = await fetch("/api/alerta/ligacao", {
        method: "POST",
        headers,
        body: JSON.stringify({
          telefone: numLimpo,
          motivo: "Teste de chamada do módulo rastreador",
          forcar: true,
        }),
      });
      const dados = (await res.json().catch(() => ({}))) as {
        sucesso?: boolean;
        detalhe?: string;
        erro?: string;
      };
      if (res.ok && dados.sucesso) {
        toast.success("Chamada de teste disparada com sucesso para o seu telefone!");
      } else {
        toast.error(
          `Falha ao disparar ligação de teste: ${dados.erro || dados.detalhe || `HTTP ${res.status}`}`,
        );
      }
    } catch (err: any) {
      toast.error(`Erro ao disparar ligação de teste: ${err?.message || "Verifique sua conexão"}`);
    } finally {
      setTestandoLigacao(false);
    }
  };

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-canais-comandos"
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      >
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto my-auto p-5 sm:p-6 shadow-2xl space-y-5 text-slate-800 dark:text-slate-100">
          {/* Header do Modal */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 id="titulo-canais-comandos" className="text-base font-black tracking-tight">
                  Canais e Notificações de Comandos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configure como deseja receber os retornos dos comandos agendados em repouso.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar configuração"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="Fechar configuração"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Seletores dos 3 Canais nos Mesmos Moldes da Proteção */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Canais Disponíveis
            </div>

            {/* 1. App e Web Push */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs">
              <div className="space-y-0.5">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-emerald-500" />
                  <span>App e Notificação Web Push</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Banner flutuante militar, alerta sonoro tático e notificação nativa no navegador
                  ou celular.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={canais.app}
                onClick={() => alternarCanal("app")}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  canais.app
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800"
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>App</span>
                {canais.app && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            </div>

            {/* 2. WhatsApp */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs">
              <div className="space-y-0.5">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Mensagem WhatsApp (Gateway Baileys)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Disparo automático no seu WhatsApp com dados do veículo, placa, IMEI e resposta do
                  hardware.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={canais.whatsapp}
                onClick={() => alternarCanal("whatsapp")}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  canais.whatsapp
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
                {canais.whatsapp && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            </div>

            {/* 3. Ligação */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs">
              <div className="space-y-0.5">
                <div className="text-xs font-black flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5 text-amber-500" />
                  <span>Ligação de Alarme (MacroDroid)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Chamada telefônica prioritária para despertar imediato da equipe tática.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={canais.ligacao}
                onClick={() => alternarCanal("ligacao")}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  canais.ligacao
                    ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800"
                }`}
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span>Ligação</span>
                {canais.ligacao && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            </div>
          </div>

          {/* Configuração do Destinatário (Telefone para WhatsApp / Ligação) */}
          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <label
              htmlFor="telefone-comandos-j16"
              className="text-xs font-bold flex items-center gap-1.5"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-500" />
              <span>Número do Destinatário (WhatsApp e Ligação)</span>
            </label>
            <input
              id="telefone-comandos-j16"
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="Ex: 24992494830 ou 5524992494830 (com DDD)"
              className="w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleTestarWhatsapp}
                disabled={testandoWhatsapp || !telefone.trim()}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {testandoWhatsapp ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                <span>Testar Envio WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleTestarLigacao}
                disabled={testandoLigacao || !telefone.trim()}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {testandoLigacao ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PhoneCall className="h-3 w-3" />
                )}
                <span>Testar Ligação</span>
              </button>
            </div>
          </div>

          {/* Modelo de Notificação Despachada (Prévia Factual) */}
          <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-200 border border-slate-800 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              <span>Conteúdo Enviado no Alerta (Exemplo Factual)</span>
            </div>
            <div className="text-[11px] font-mono leading-relaxed bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 text-emerald-400 space-y-1">
              <div>📡 GD RASTREAMENTO — RETORNO DE COMANDO J16</div>
              <div className="text-slate-300">🚗 Veículo: ABC-1234 (Toyota Hilux)</div>
              <div className="text-slate-400">🔑 IMEI: 869890084959182</div>
              <div className="text-amber-300">⚡ Comando Agendado: ACCALM,ON,2#</div>
              <div className="text-emerald-300 font-black">✅ Resposta da MCU: "ACCALM:ON"</div>
              <div className="text-slate-500 text-[10px]">⏰ Horário: 06/11/2026 14:35:10</div>
            </div>
          </div>

          {/* Botões do Rodapé */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span>{salvando ? "Salvando..." : "Salvar Preferências e Fechar"}</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
