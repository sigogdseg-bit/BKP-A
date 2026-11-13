// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Aba Canônica de Estatísticas, Projeções e Gráficos Ativos de Receitas
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { TransacaoFinanceira, ProjecaoMensal } from "../types";
import {
  calcularProjecaoMensal12Meses,
  calcularMetricasExecutivas,
} from "../services/projecaoFinanceiraService";

interface EstatisticasFinanceirasTabProps {
  transacoes: TransacaoFinanceira[];
  mrrBase?: number;
  onSelecionarMes?: (ano: number, mes: number) => void;
}

export function EstatisticasFinanceirasTab({
  transacoes,
  mrrBase = 0,
  onSelecionarMes,
}: EstatisticasFinanceirasTabProps) {
  const [horizonte, setHorizonte] = useState<6 | 12>(12);
  const [mesHover, setMesHover] = useState<ProjecaoMensal | null>(null);

  // 1. Gera projeção de 6 ou 12 meses com transporte de saldo
  const projecoes = useMemo(() => {
    return calcularProjecaoMensal12Meses(transacoes, mrrBase, horizonte);
  }, [transacoes, mrrBase, horizonte]);

  // 2. Calcula métricas executivas
  const metricas = useMemo(() => {
    return calcularMetricasExecutivas(transacoes, projecoes, mrrBase);
  }, [transacoes, projecoes, mrrBase]);

  // 3. Composição de receitas por categoria
  const composicaoReceitas = useMemo(() => {
    let mensalidades = 0;
    let taxasInstalacao = 0;
    let avulsas = 0;

    for (const t of transacoes) {
      if (t.tipo !== "entrada") continue;
      const v = Number(t.valor) || 0;
      if (t.categoria === "mensalidade") {
        mensalidades += v;
      } else if (
        t.categoria === "repasse_instalador" ||
        t.descricao.toLowerCase().includes("taxa")
      ) {
        taxasInstalacao += v;
      } else {
        avulsas += v;
      }
    }

    const total = mensalidades + taxasInstalacao + avulsas || 1;
    return {
      mensalidades: { valor: mensalidades, pct: (mensalidades / total) * 100 },
      taxasInstalacao: { valor: taxasInstalacao, pct: (taxasInstalacao / total) * 100 },
      avulsas: { valor: avulsas, pct: (avulsas / total) * 100 },
      total,
    };
  }, [transacoes]);

  // Cálculos visuais para o Gráfico de Barras de Receitas
  const maiorReceita = useMemo(() => {
    const max = Math.max(...projecoes.map((p) => p.receitasTotal), 100);
    return max * 1.15; // 15% de margem no topo
  }, [projecoes]);

  // Cálculos visuais para o Gráfico de Curva de Caixa Acumulado
  const dadosCurva = useMemo(() => {
    const saldos = projecoes.map((p) => p.saldoFinalProjetado);
    const minSaldo = Math.min(0, ...saldos);
    const maxSaldo = Math.max(100, ...saldos);
    const amplitude = maxSaldo - minSaldo || 1;

    const larguraSvg = 700;
    const alturaSvg = 180;
    const paddingX = 40;
    const paddingY = 20;

    const pontos = projecoes.map((p, idx) => {
      const x = paddingX + (idx / Math.max(1, projecoes.length - 1)) * (larguraSvg - paddingX * 2);
      const normalizado = (p.saldoFinalProjetado - minSaldo) / amplitude;
      const y = alturaSvg - paddingY - normalizado * (alturaSvg - paddingY * 2);
      return { x, y, p };
    });

    const linhaD = pontos.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, "");

    const areaD =
      pontos.length > 0
        ? `${linhaD} L ${pontos[pontos.length - 1].x} ${alturaSvg - paddingY} L ${pontos[0].x} ${alturaSvg - paddingY} Z`
        : "";

    // Posição y da linha zero
    const normalizadoZero = (0 - minSaldo) / amplitude;
    const zeroY = alturaSvg - paddingY - normalizadoZero * (alturaSvg - paddingY * 2);

    return { pontos, linhaD, areaD, zeroY, minSaldo, maxSaldo, larguraSvg, alturaSvg };
  }, [projecoes]);

  return (
    <div className="space-y-4 select-none">
      {/* Cabeçalho do Módulo de Inteligência Financeira */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shadow-xs">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Estatísticas e Projeções de Receitas</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Realtime e Preditivo
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Projeção de faturamento recorrente, despesas fixas e curva de liquidez acumulada com
              caixa transportado
            </p>
          </div>
        </div>

        {/* Alternador de Horizonte Temporal */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-xs self-stretch sm:self-auto justify-center shadow-xs">
          <button
            onClick={() => setHorizonte(6)}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              horizonte === 6
                ? "bg-emerald-500 text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            6 Meses
          </button>
          <button
            onClick={() => setHorizonte(12)}
            className={`px-3 py-1 rounded-lg font-bold transition ${
              horizonte === 12
                ? "bg-emerald-500 text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            12 Meses
          </button>
        </div>
      </div>

      {/* Cards de Métricas Executivas (KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* MRR Atual */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span>MRR (Receita Recorrente)</span>
            </span>
            <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              R$ {metricas.mrrAtual.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <span>Base mensal ativa contratada</span>
            </div>
          </div>
        </div>

        {/* ARR Projetado */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
            <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
              <span>ARR (Projeção Anual)</span>
            </span>
            <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400">
              R$ {metricas.arrProjetado.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <span>MRR anualizado x12</span>
            </div>
          </div>
        </div>

        {/* Despesas Fixas Recorrentes */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
            <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <span>Despesas Fixas Recorrentes</span>
            </span>
            <Layers className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
              - R$ {metricas.despesasRecorrentesFixas.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Chips M2M, servidores e parcelas
            </div>
          </div>
        </div>

        {/* Lucro Operacional Projetado */}
        <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
            <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <span>Margem Operacional</span>
            </span>
            <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div
              className={`text-xl sm:text-2xl font-black font-mono ${
                metricas.lucroOperacionalProjetado >= 0
                  ? "text-purple-600 dark:text-purple-300"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {metricas.margemMediaProjetada.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Lucro: R$ {metricas.lucroOperacionalProjetado.toFixed(2)} / mês
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos Ativos: Bloco 1 (Evolução de Receitas) e Bloco 2 (Composição) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Gráfico 1: Evolução e Projeção de Receitas Mês a Mês */}
        <div className="lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Evolução e Projeção de Receitas ({horizonte} Meses)</span>
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Passe o cursor sobre as barras para ver detalhes. Clique para filtrar a competência.
              </p>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 inline-block" />
                <span>Receita Liquidada</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/60 dark:bg-sky-400/60 inline-block" />
                <span>Receita Prevista</span>
              </span>
            </div>
          </div>

          {/* Área do Gráfico de Barras Ativas */}
          <div className="relative pt-6 pb-2">
            {/* Tooltip Ativo */}
            {mesHover && (
              <div className="absolute top-0 right-2 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-950/95 border border-slate-300 dark:border-slate-700 shadow-xl text-xs z-10 flex items-center gap-3">
                <span className="font-bold text-slate-900 dark:text-slate-200">
                  {mesHover.mesRotulo}:
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  Total: R$ {mesHover.receitasTotal.toFixed(2)}
                </span>
                <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                  (Liquidado: R$ {mesHover.receitasRealizadas.toFixed(2)} · Previsto: R${" "}
                  {mesHover.receitasPrevistas.toFixed(2)})
                </span>
              </div>
            )}

            <div className="flex items-end justify-between gap-1.5 sm:gap-2 h-48 sm:h-56 px-2 border-b border-slate-300/60 dark:border-slate-800">
              {projecoes.map((p) => {
                const alturaTotal = Math.max(8, (p.receitasTotal / maiorReceita) * 100);
                const alturaRealizada =
                  p.receitasTotal > 0 ? (p.receitasRealizadas / p.receitasTotal) * alturaTotal : 0;
                const alturaPrevista = alturaTotal - alturaRealizada;

                const isAtivoHover = mesHover?.chaveMes === p.chaveMes;

                return (
                  <div
                    key={p.chaveMes}
                    onMouseEnter={() => setMesHover(p)}
                    onMouseLeave={() => setMesHover(null)}
                    onClick={() => onSelecionarMes && onSelecionarMes(p.ano, p.mes)}
                    className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                  >
                    {/* Barra Composta */}
                    <div
                      style={{ height: `${alturaTotal}%` }}
                      className={`w-full max-w-[42px] rounded-t-lg overflow-hidden flex flex-col justify-end transition-all duration-200 ${
                        isAtivoHover
                          ? "ring-2 ring-emerald-400 scale-[1.03] shadow-lg shadow-emerald-500/20"
                          : "group-hover:brightness-110"
                      }`}
                    >
                      {/* Parcela Prevista (Topo da Barra) */}
                      {alturaPrevista > 0 && (
                        <div
                          style={{
                            height: `${(alturaPrevista / alturaTotal) * 100}%`,
                          }}
                          className="w-full bg-sky-400/50 group-hover:bg-sky-400/70 transition"
                        />
                      )}
                      {/* Parcela Realizada (Base da Barra) */}
                      {alturaRealizada > 0 && (
                        <div
                          style={{
                            height: `${(alturaRealizada / alturaTotal) * 100}%`,
                          }}
                          className="w-full bg-emerald-500"
                        />
                      )}
                    </div>

                    {/* Rótulo do Mês */}
                    <div className="mt-2 text-center">
                      <span
                        className={`text-[10px] block font-mono ${
                          p.isPassadoOuAtual
                            ? "text-slate-800 dark:text-slate-300 font-bold"
                            : "text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"
                        }`}
                      >
                        {p.mesRotulo}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Gráfico 2: Composição das Receitas (Donut) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>Origem das Receitas</span>
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Distribuição por modalidade de faturamento
            </p>
          </div>

          {/* Gráfico Donut em SVG Nativo */}
          <div className="flex items-center justify-center py-2">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {/* Círculo base cinza */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="3.2"
                />

                {/* Segmento 1: Mensalidades (Esmeralda) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="3.4"
                  strokeDasharray={`${composicaoReceitas.mensalidades.pct} ${100 - composicaoReceitas.mensalidades.pct}`}
                  strokeDashoffset="0"
                />

                {/* Segmento 2: Taxas de Instalação (Púrpura) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#a855f7"
                  strokeWidth="3.4"
                  strokeDasharray={`${composicaoReceitas.taxasInstalacao.pct} ${100 - composicaoReceitas.taxasInstalacao.pct}`}
                  strokeDashoffset={`${-composicaoReceitas.mensalidades.pct}`}
                />

                {/* Segmento 3: Avulsas (Safira) */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke="#0ea5e9"
                  strokeWidth="3.4"
                  strokeDasharray={`${composicaoReceitas.avulsas.pct} ${100 - composicaoReceitas.avulsas.pct}`}
                  strokeDashoffset={`${-(composicaoReceitas.mensalidades.pct + composicaoReceitas.taxasInstalacao.pct)}`}
                />
              </svg>

              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                  Total
                </span>
                <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">
                  R$ {composicaoReceitas.total.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Legenda Explicativa */}
          <div className="space-y-2 text-xs border-t border-slate-300/60 dark:border-slate-800/80 pt-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                <span>Mensalidades</span>
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {composicaoReceitas.mensalidades.pct.toFixed(0)}% (R${" "}
                {composicaoReceitas.mensalidades.valor.toFixed(2)})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" />
                <span>Instalação / Ativação</span>
              </span>
              <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                {composicaoReceitas.taxasInstalacao.pct.toFixed(0)}% (R${" "}
                {composicaoReceitas.taxasInstalacao.valor.toFixed(2)})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="h-2 w-2 rounded-full bg-sky-500 inline-block" />
                <span>Receitas Avulsas</span>
              </span>
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                {composicaoReceitas.avulsas.pct.toFixed(0)}% (R${" "}
                {composicaoReceitas.avulsas.valor.toFixed(2)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico 3: Curva de Fluxo de Caixa e Saldo Acumulado Projetado (Caixa Transportado) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>Curva de Caixa Acumulado e Saldo Transportado ({horizonte} Meses)</span>
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Demonstrativo de liquidez acumulada: o saldo final de cada mês é transportado como
              saldo inicial do mês seguinte.
            </p>
          </div>

          <div className="text-xs text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">
              Saldo Projetado ao Fim do Período
            </span>
            <span
              className={`text-base font-black font-mono ${
                projecoes[projecoes.length - 1]?.saldoFinalProjetado >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              R$ {projecoes[projecoes.length - 1]?.saldoFinalProjetado.toFixed(2)}
            </span>
          </div>
        </div>

        {/* SVG da Curva Contínua Responsivo Sem Rolagem Horizontal */}
        <div className="w-full pt-2">
          <div className="w-full">
            <svg
              viewBox={`0 0 ${dadosCurva.larguraSvg} ${dadosCurva.alturaSvg}`}
              className="w-full h-44 sm:h-52 overflow-visible"
            >
              <defs>
                <linearGradient id="gradienteCaixa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Linha Zero Referência */}
              <line
                x1="30"
                y1={dadosCurva.zeroY}
                x2={dadosCurva.larguraSvg - 30}
                y2={dadosCurva.zeroY}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x="15"
                y={dadosCurva.zeroY + 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                R$ 0
              </text>

              {/* Área Sombreada */}
              {dadosCurva.areaD && <path d={dadosCurva.areaD} fill="url(#gradienteCaixa)" />}

              {/* Linha de Traçado */}
              {dadosCurva.linhaD && (
                <path
                  d={dadosCurva.linhaD}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pontos Marcadores Interativos */}
              {dadosCurva.pontos.map((pt) => {
                const isPositivo = pt.p.saldoFinalProjetado >= 0;
                return (
                  <g key={pt.p.chaveMes} className="group cursor-pointer">
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4.5"
                      fill={isPositivo ? "#10b981" : "#f43f5e"}
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="transition-all group-hover:r-6"
                    />

                    {/* Rótulo de Valor */}
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      textAnchor="middle"
                      fill={isPositivo ? "#059669" : "#e11d48"}
                      fontSize="9.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="opacity-90 group-hover:opacity-100"
                    >
                      R$ {pt.p.saldoFinalProjetado.toFixed(0)}
                    </text>

                    {/* Mês no Rodapé */}
                    <text
                      x={pt.x}
                      y={dadosCurva.alturaSvg - 4}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="9.5"
                      fontFamily="monospace"
                    >
                      {pt.p.mesRotulo}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Tabela de Detalhamento Mês a Mês das Projeções */}
      <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
            <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Demonstrativo Mensal de Projeções e Caixa Transportado</span>
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Valores em Reais (BRL)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[11px]">
                <th className="py-2 px-2">Competência</th>
                <th className="py-2 px-2 text-right">Caixa Anterior (Transportado)</th>
                <th className="py-2 px-2 text-right text-emerald-600 dark:text-emerald-400">
                  (+) Receitas Totais
                </th>
                <th className="py-2 px-2 text-right text-rose-600 dark:text-rose-400">
                  (-) Despesas Totais
                </th>
                <th className="py-2 px-2 text-right text-sky-600 dark:text-sky-400">
                  Resultado Mês
                </th>
                <th className="py-2 px-2 text-right font-bold text-slate-900 dark:text-slate-200">
                  Saldo Final Projetado
                </th>
                <th className="py-2 px-2 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300/60 dark:divide-slate-800/60">
              {projecoes.map((p) => {
                const isPositivo = p.saldoFinalProjetado >= 0;
                const isResPositivo = p.resultadoLiquidoMes >= 0;

                return (
                  <tr
                    key={p.chaveMes}
                    className="hover:bg-slate-200/50 dark:hover:bg-slate-800/30 transition"
                  >
                    <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>{p.mesRotulo}</span>
                      {p.isPassadoOuAtual && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-sans uppercase">
                          Atual
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-400">
                      R$ {p.caixaInicialTransportado.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-2 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                      + R$ {p.receitasTotal.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">
                      - R$ {p.despesasTotal.toFixed(2)}
                    </td>

                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        isResPositivo
                          ? "text-sky-600 dark:text-sky-300"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isResPositivo ? "+" : ""} R$ {p.resultadoLiquidoMes.toFixed(2)}
                    </td>

                    <td
                      className={`py-2.5 px-2 text-right font-black ${
                        isPositivo
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      R$ {p.saldoFinalProjetado.toFixed(2)}
                    </td>

                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => onSelecionarMes && onSelecionarMes(p.ano, p.mes)}
                        title="Ver livro-caixa deste mês"
                        className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
