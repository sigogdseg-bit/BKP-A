// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Barra de Controle do Modo Demonstração (Sandbox Virtual)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  Sparkles,
  RotateCcw,
  XCircle,
  ArrowRight,
  ShieldAlert,
  User,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import {
  isModoDemonstracaoAtivo,
  obterEstadoDemonstracao,
  encerrarDemonstracao,
  reiniciarDemonstracao,
  iniciarDemonstracao,
} from "../services/demonstracaoService";
import type { EstadoDemonstracao } from "../types";

export function BarraModoDemonstracao() {
  const [ativo, setAtivo] = useState(false);
  const [estado, setEstado] = useState<EstadoDemonstracao | null>(null);

  useEffect(() => {
    const atualizar = () => {
      const isAtivo = isModoDemonstracaoAtivo();
      setAtivo(isAtivo);
      if (isAtivo) {
        setEstado(obterEstadoDemonstracao());
      } else {
        setEstado(null);
      }
    };

    atualizar();

    window.addEventListener("hunter_demonstracao_mudanca", atualizar);
    window.addEventListener("storage", atualizar);

    return () => {
      window.removeEventListener("hunter_demonstracao_mudanca", atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, []);

  if (!ativo || !estado) return null;

  const isCliente = estado.jornadaAtual === "cliente";
  const isInstalador = estado.jornadaAtual === "instalador";

  const handleReiniciar = () => {
    if (window.confirm("Deseja reiniciar os dados desta simulação para o estado inicial?")) {
      reiniciarDemonstracao();
      window.location.reload();
    }
  };

  const handleAlternarJornada = () => {
    const novaJornada = isCliente ? "instalador" : "cliente";
    const destino =
      novaJornada === "cliente"
        ? "/cadastro-cliente?demo=true&token=convite-demonstracao-cliente"
        : "/cadastro-instalador?demo=true&token=convite-demonstracao-instalador";

    iniciarDemonstracao(novaJornada);
    window.location.href = destino;
  };

  const handleEncerrar = () => {
    if (
      window.confirm("Deseja encerrar o Modo Demonstração e retornar à operação normal do sistema?")
    ) {
      encerrarDemonstracao();
      window.location.href = "/demonstracao";
    }
  };

  return (
    <div className="relative z-[9990] w-full bg-gradient-to-r from-amber-600 via-purple-700 to-indigo-800 text-white shadow-lg border-b border-white/20 px-3 py-1.5 sm:px-4 sm:py-2 transition-all">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Lado Esquerdo: Identificação do Sandbox */}
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
          </span>

          <div className="flex items-center gap-1.5 font-bold tracking-wide">
            <Sparkles className="h-4 w-4 text-amber-300 shrink-0" />
            <span className="font-mono uppercase text-[11px] sm:text-xs">
              Modo Demonstração Ativo
            </span>
            <span className="hidden md:inline-block px-1.5 py-0.5 rounded bg-black/30 border border-white/20 text-[10px] font-mono text-amber-200">
              Sandbox Seguro: Zero Gravação no BD
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-white/15 border border-white/25 text-[10.5px]">
            {isCliente ? (
              <>
                <User className="h-3 w-3 text-sky-200" />
                <span>
                  Simulando: <strong>Jornada do Cliente</strong>
                </span>
              </>
            ) : isInstalador ? (
              <>
                <Wrench className="h-3 w-3 text-emerald-200" />
                <span>
                  Simulando: <strong>Jornada do Instalador</strong>
                </span>
              </>
            ) : (
              <span>Hub de Demonstração</span>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações de Controle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleAlternarJornada}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition active:scale-95 cursor-pointer border border-white/30"
            title={
              isCliente ? "Mudar para simulação do Instalador" : "Mudar para simulação do Cliente"
            }
          >
            {isCliente ? <Wrench className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              Mudar para {isCliente ? "Instalador" : "Cliente"}
            </span>
            <ArrowRight className="h-3 w-3 opacity-70" />
          </button>

          <button
            type="button"
            onClick={handleReiniciar}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/25 hover:bg-black/40 text-amber-200 text-[11px] font-semibold transition active:scale-95 cursor-pointer border border-white/20"
            title="Reiniciar os dados simulados desta jornada"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Reiniciar</span>
          </button>

          <button
            type="button"
            onClick={handleEncerrar}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-bold transition active:scale-95 cursor-pointer border border-red-400/40"
            title="Encerrar demonstração e voltar ao sistema real"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span>Sair do Modo Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
