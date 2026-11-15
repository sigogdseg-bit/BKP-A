// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Hub Principal do Módulo Demonstração (DJR-NEW)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Sparkles,
  User,
  Wrench,
  Car,
  Radio,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  iniciarDemonstracao,
  reiniciarDemonstracao,
  obterEstadoDemonstracao,
  CLIENTE_FANTASMA_PADRAO,
  INSTALADOR_FANTASMA_PADRAO,
  KIT_FANTASMA_PADRAO,
  ORDEM_SERVICO_FANTASMA_PADRAO,
} from "../services/demonstracaoService";

export function DemonstracaoHubView() {
  const [iniciando, setIniciando] = useState<string | null>(null);

  const iniciarJornadaCliente = () => {
    setIniciando("cliente");
    iniciarDemonstracao("cliente");
    setTimeout(() => {
      window.location.href = "/cadastro-cliente?demo=true&token=convite-demonstracao-cliente";
    }, 200);
  };

  const iniciarJornadaInstalador = () => {
    setIniciando("instalador");
    iniciarDemonstracao("instalador");
    setTimeout(() => {
      window.location.href = "/cadastro-instalador?demo=true&token=convite-demonstracao-instalador";
    }, 200);
  };

  const irDiretoParaInstalacaoSimulada = () => {
    setIniciando("instalacao_direta");
    iniciarDemonstracao("instalador");
    setTimeout(() => {
      window.location.href = "/instalacao?demo=true";
    }, 200);
  };

  return (
    <div className="min-h-screen bg-[#fbf2e9] dark:bg-slate-950 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 select-none">
      {/* 1. Cabeçalho Executivo do Módulo */}
      <div className="w-full bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl border border-indigo-500/30 p-6 sm:p-8 text-white shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-mono font-bold flex items-center gap-1.5 uppercase">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                Ambiente de Demonstração e Treinamento
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-mono font-bold">
                100% Sandbox Isolado
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              Módulo de Demonstração Interativo
            </h1>
            <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
              Simule a jornada completa de cadastro e operação do cliente e do instalador técnico
              utilizando os módulos reais do sistema, com registros fantasmas pré-configurados e sem
              gravar ou alterar nenhum dado no banco de dados real.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-emerald-400" />
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-slate-200">
                  Proteção Ativa de Dados
                </div>
                <div className="text-[11px] text-slate-400">Zero persistência no BD real</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Seleção das Duas Jornadas Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: Jornada do Cliente */}
        <div className="rounded-3xl p-6 sm:p-7 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col justify-between hover:border-sky-500/50 transition duration-300 relative group overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-sky-600 dark:text-sky-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                <User className="h-7 w-7" />
              </div>
              <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-bold font-mono">
                Jornada A • Cliente
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">
                Simulação do Cliente (Onboarding)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Vivencie a experiência do cliente final desde o recebimento do link de convite até a
                escolha do plano, cadastro do veículo e acompanhamento do agendamento técnico.
              </p>
            </div>

            {/* Etapas da Jornada */}
            <div className="space-y-2 pt-2 border-t border-slate-300/40 dark:border-slate-800">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fluxo Simulado de Ponta a Ponta:
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>1. Abertura do link de convite e autorização instantânea</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>2. Preenchimento de dados pessoais, senha e plano</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>3. Cadastro de veículo com seletor 3D e placa</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  4. Agendamento pré-atribuído com o instalador fantasma:{" "}
                  <strong>{INSTALADOR_FANTASMA_PADRAO.nome.split("—")[0]}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>5. Visualização no painel sem gravar nada no banco real</span>
              </div>
            </div>

            {/* Badge de Registro Fantasma */}
            <div className="p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800/40 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between font-mono shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
              <div>
                <span className="text-slate-500 text-[10px] block">CLIENTE FANTASMA BASE:</span>
                <strong>{CLIENTE_FANTASMA_PADRAO.nome_razao_social}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 text-[10px] block">VEÍCULO:</span>
                <strong>{CLIENTE_FANTASMA_PADRAO.veiculos[0].placa}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={iniciarJornadaCliente}
            disabled={iniciando === "cliente"}
            className="w-full mt-6 py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#0284c7] flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <Play className="h-4 w-4 fill-white" />
            <span>
              {iniciando === "cliente"
                ? "Iniciando Simulador..."
                : "Iniciar Demonstração do Cliente"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* CARD 2: Jornada do Instalador */}
        <div className="rounded-3xl p-6 sm:p-7 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl flex flex-col justify-between hover:border-emerald-500/50 transition duration-300 relative group overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                <Wrench className="h-7 w-7" />
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold font-mono">
                Jornada B • Instalador Técnico
              </span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                Simulação do Instalador (Campo)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                Experimente o fluxo do técnico desde a abertura do link de credenciamento até a
                execução da ordem de serviço com kit atribuído, testes e assinatura digital.
              </p>
            </div>

            {/* Etapas da Jornada */}
            <div className="space-y-2 pt-2 border-t border-slate-300/40 dark:border-slate-800">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fluxo Simulado de Ponta a Ponta:
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>1. Abertura do link de credenciamento e preenchimento de PIX</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  2. Acesso à fila com cliente fantasma e kit fantasma atribuído (J16 + Chip M2M)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>3. Conferência de IMEI, fotos de instalação e checklist de chicote</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>4. Testes simulados de ignição e comando de bloqueio Concox</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>5. Conclusão da OS com assinatura digital e recibo simulado</span>
              </div>
            </div>

            {/* Badge de Registro Fantasma */}
            <div className="p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800/40 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between font-mono shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
              <div>
                <span className="text-slate-500 text-[10px] block">KIT FANTASMA ATRIBUÍDO:</span>
                <strong>IMEI {KIT_FANTASMA_PADRAO.imei}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 text-[10px] block">ORDEM DE SERVIÇO:</span>
                <strong>{ORDEM_SERVICO_FANTASMA_PADRAO.numero_os}</strong>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-6">
            <button
              type="button"
              onClick={iniciarJornadaInstalador}
              disabled={iniciando === "instalador"}
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#047857] flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-white" />
              <span>
                {iniciando === "instalador" ? "Iniciando..." : "Iniciar pelo Cadastro do Técnico"}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={irDiretoParaInstalacaoSimulada}
              disabled={iniciando === "instalacao_direta"}
              className="py-3 px-3 rounded-2xl bg-[#fbf2e9] hover:bg-[#dfe7f2] dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition active:shadow-[inset_2px_2px_4px_#c8d4e4] cursor-pointer border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
              title="Pular para o módulo de Instalações Técnicas com a OS fantasma já agendada"
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Ir Direto p/ Instalação</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Rodapé Explicativo e Garantia de Isolamento */}
      <div className="p-4 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-indigo-500 shrink-0" />
          <span>
            <strong>Como funciona o Sandbox:</strong> O sistema carrega os módulos reais com uma
            camada de isolamento em memória. Todas as ações de submissão retornam confirmação de
            sucesso imediato sem disparar chamadas de escrita no Supabase.
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            reiniciarDemonstracao();
            alert("Sandbox reinicializado para o estado inicial com sucesso.");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-800 hover:bg-[#dfe7f2] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-semibold transition shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#c8d4e4] cursor-pointer shrink-0 border border-slate-300/60 dark:border-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Restaurar Sandbox Base</span>
        </button>
      </div>
    </div>
  );
}
