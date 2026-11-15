import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Apple,
  X,
  Share2,
  PlusSquare,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import {
  verificarSuporteWebPush,
  solicitarPermissaoNotificacao,
  type WebPushStatus,
} from "../lib/webPushService";
import { toast } from "sonner";

interface WebPushConfigModalProps {
  aberto: boolean;
  onFechar: () => void;
}

export function WebPushConfigModal({ aberto, onFechar }: WebPushConfigModalProps) {
  const [status, setStatus] = useState<WebPushStatus>({
    suportado: false,
    permissao: "default",
    serviceWorkerAtivo: false,
    isIos: false,
    isStandalone: false,
  });
  const [solicitando, setSolicitando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"status" | "ios" | "android">("status");

  useEffect(() => {
    if (aberto) {
      setStatus(verificarSuporteWebPush());
    }
  }, [aberto]);

  if (!aberto || typeof document === "undefined") return null;

  const handleSolicitarPermissao = async () => {
    setSolicitando(true);
    try {
      const perm = await solicitarPermissaoNotificacao();
      setStatus(verificarSuporteWebPush());
      if (perm === "granted") {
        toast.success("Notificações em segundo plano ativadas com sucesso!");
      } else if (perm === "denied") {
        toast.error(
          "Permissão de notificações bloqueada pelo navegador. Habilite nas configurações do dispositivo.",
        );
      }
    } finally {
      setSolicitando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
      <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 transition-colors">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Notificações no Dispositivo (Web Push API)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alertas entregues mesmo com o aplicativo fechado (Android e iOS)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-4 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAbaAtiva("status")}
            className={`pb-2.5 px-3 font-bold border-b-2 transition ${
              abaAtiva === "status"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Status e Ativação
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("ios")}
            className={`pb-2.5 px-3 font-bold border-b-2 transition flex items-center gap-1.5 ${
              abaAtiva === "ios"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Apple className="h-3.5 w-3.5" />
            <span>Guia iOS (Apple)</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("android")}
            className={`pb-2.5 px-3 font-bold border-b-2 transition flex items-center gap-1.5 ${
              abaAtiva === "android"
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Guia Android / APK</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {abaAtiva === "status" && (
            <div className="space-y-4">
              {/* Diagnóstico do Aparelho */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                    Permissão de Notificação
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    {status.permissao === "granted" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-orange-500" />
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          Autorizada (Ativa)
                        </span>
                      </>
                    ) : status.permissao === "denied" ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          Bloqueada no Navegador
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          Pendente de Ativação
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                    Motor em Segundo Plano
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-sky-500" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Service Worker (/sw.js)
                    </span>
                  </div>
                </div>
              </div>

              {/* Aviso Especial se for iOS fora da Tela de Início */}
              {status.isIos && !status.isStandalone && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Apple className="h-4 w-4" />
                    <span>Regra Obrigatória do iOS (Apple APNs)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    No iPhone/iPad, a Apple exige que o aplicativo seja adicionado à{" "}
                    <strong>Tela de Início</strong> antes de liberar notificações com o app fechado.
                    Consulte a aba <strong>Guia iOS</strong> acima.
                  </p>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="space-y-2 pt-2">
                {status.permissao !== "granted" ? (
                  <button
                    type="button"
                    onClick={handleSolicitarPermissao}
                    disabled={solicitando}
                    className="w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-orange-600/20 active:scale-[0.99] disabled:opacity-50"
                  >
                    <Bell className="h-4 w-4" />
                    <span>
                      {solicitando ? "Solicitando..." : "Ativar Notificações no Dispositivo"}
                    </span>
                  </button>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/25 text-orange-800 dark:text-orange-400 text-xs font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                    <span>
                      Notificações ativas no dispositivo. Alertas operacionais e mensagens são
                      entregues instantaneamente.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {abaAtiva === "ios" && (
            <div className="space-y-3 leading-relaxed text-slate-700 dark:text-slate-300">
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-white">
                Como receber alertas no iPhone / iPad com o app fechado:
              </div>

              <ol className="space-y-2.5 list-decimal list-inside text-[11px]">
                <li className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <strong>Acesse pelo Safari:</strong> Abra o endereço do GD Rastreamento no Safari
                  nativo do iOS (versão 16.4 ou superior).
                </li>
                <li className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white mb-1">
                    <Share2 className="h-3.5 w-3.5 text-sky-500" />
                    <span>Toque no botão Compartilhar:</span>
                  </div>
                  Na barra inferior do Safari, toque no ícone de compartilhamento (quadrado com seta
                  para cima).
                </li>
                <li className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white mb-1">
                    <PlusSquare className="h-3.5 w-3.5 text-orange-500" />
                    <span>Adicionar à Tela de Início:</span>
                  </div>
                  Role as opções e selecione <strong>Adicionar à Tela de Início</strong>.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                  <strong>Abra o App pela Tela de Início:</strong> Feche o Safari e toque no novo
                  ícone do GD Rastreamento na tela inicial do celular. Dentro dele, clique no botão{" "}
                  <strong>Ativar Notificações no Dispositivo</strong>.
                </li>
              </ol>
            </div>
          )}

          {abaAtiva === "android" && (
            <div className="space-y-3 leading-relaxed text-slate-700 dark:text-slate-300">
              <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30 font-semibold text-orange-800 dark:text-orange-300">
                Geração de App Android Nativo (APK) sem barra de URL
              </div>

              <div className="space-y-2 text-[11px]">
                <p>
                  O GD Rastreamento já possui a infraestrutura de{" "}
                  <strong>Digital Asset Links</strong> ativa no servidor em{" "}
                  <code>/.well-known/assetlinks.json</code> com status 200 OK.
                </p>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Passos para compilar o APK via PWABuilder:
                  </span>
                  <p>
                    1. Acesse <strong>pwabuilder.com</strong> e insira o domínio oficial do GD
                    Rastreamento Guardião.
                  </p>
                  <p>
                    2. Selecione <strong>Package for Stores ➔ Android</strong>.
                  </p>
                  <p>
                    3. Defina o Package ID como <code>br.tec.oficial.sigoguardiao</code>.
                  </p>
                  <p>
                    4. O PWABuilder gerará o pacote pronto (.apk) que rodará em tela cheia 100%
                    nativa, recebendo notificações em segundo plano através do Service Worker
                    integrado.
                  </p>
                </div>

                <a
                  href="https://www.pwabuilder.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Acessar PWABuilder</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onFechar}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
