import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  ArrowLeft,
  Check,
  RotateCcw,
  Palette,
  Sparkles,
  Layers,
  Square,
  User,
  Sliders,
} from "lucide-react";
import {
  type CardThemeMode,
  type CardColorKey,
  type CardThemeConfig,
  DEFAULT_CARD_THEME_CONFIG,
  CARD_COLOR_OPTIONS,
  readCardThemeConfig,
  saveCardThemeConfig,
} from "@/shared/lib/card-theme";
import { HubModuleCard } from "@/shared/components/HubModuleCard";

export function ModuloTemasPage() {
  const { session } = useAuth();
  const [config, setConfig] = useState<CardThemeConfig>(() => readCardThemeConfig(session?.userId));

  useEffect(() => {
    setConfig(readCardThemeConfig(session?.userId));
  }, [session?.userId]);

  function aplicarConfiguracao(novaConfig: CardThemeConfig, mensagem?: string) {
    setConfig(novaConfig);
    saveCardThemeConfig(novaConfig, session?.userId);
    if (mensagem) {
      toast.success(mensagem);
    }
  }

  function handleSelectMode(mode: CardThemeMode) {
    const nova: CardThemeConfig = {
      ...config,
      mode,
    };
    let msg = "Modo de cor atualizado!";
    if (mode === "color") msg = "Modo Multicor (padrão dos módulos) ativado!";
    if (mode === "mono") msg = "Modo Monocromático ativado!";
    if (mode === "duo") msg = "Modo Duas Cores ativado!";
    if (mode === "trio") msg = "Modo Três Cores ativado!";
    if (mode === "quad") msg = "Modo Quatro Cores ativado!";
    aplicarConfiguracao(nova, msg);
  }

  function handleSetMonoColor(color: CardColorKey) {
    const nova: CardThemeConfig = {
      ...config,
      monoColor: color,
    };
    aplicarConfiguracao(nova, "Cor monocromática atualizada!");
  }

  function handleSetDuoColor(index: 0 | 1, color: CardColorKey) {
    const newColors: [CardColorKey, CardColorKey] = [...config.duoColors];
    newColors[index] = color;
    const nova: CardThemeConfig = {
      ...config,
      duoColors: newColors,
    };
    aplicarConfiguracao(nova);
  }

  function handleSetTrioColor(index: 0 | 1 | 2, color: CardColorKey) {
    const newColors: [CardColorKey, CardColorKey, CardColorKey] = [...config.trioColors];
    newColors[index] = color;
    const nova: CardThemeConfig = {
      ...config,
      trioColors: newColors,
    };
    aplicarConfiguracao(nova);
  }

  function handleSetQuadColor(index: 0 | 1 | 2 | 3, color: CardColorKey) {
    const newColors: [CardColorKey, CardColorKey, CardColorKey, CardColorKey] = [
      ...config.quadColors,
    ];
    newColors[index] = color;
    const nova: CardThemeConfig = {
      ...config,
      quadColors: newColors,
    };
    aplicarConfiguracao(nova);
  }

  function handleRestaurarPadrao() {
    aplicarConfiguracao(
      DEFAULT_CARD_THEME_CONFIG,
      "Tema restaurado para o padrão do sistema (Duas Cores: Ciano Ártico e Verde Esmeralda)!",
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/inicio"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs"
            title="Voltar para o Painel Geral"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-emerald-500" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-slate-900 dark:text-slate-100">
                Temas dos Cards e Módulos
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Personalize o esquema de cores e iluminação tátil dos cards operacionais da plataforma
              SIGO Guardião.
            </p>
          </div>
        </div>

        {/* Informações do usuário e Reset */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-500 font-medium">
            <User className="h-3.5 w-3.5" />
            <span className="truncate max-w-[150px] font-semibold">
              {session?.nome || "Operador"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleRestaurarPadrao}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition cursor-pointer shadow-xs"
            title="Restaurar modo padrão (Duas Cores: Ciano Ártico e Verde Esmeralda)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar Padrão
          </button>
        </div>
      </div>

      {/* Aviso de isolamento por usuário */}
      <div className="p-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-xs flex items-center justify-between gap-3 text-blue-600 dark:text-blue-300">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
          <span>
            <strong>Preferência Individual:</strong> O tema selecionado abaixo é salvo
            exclusivamente para a sua conta e não altera a visualização de outros operadores.
          </span>
        </div>
      </div>

      {/* Seção 1: As 5 Opções Principais de Distribuição de Cores */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-500" /> 1. Escolha a Distribuição de Cores dos
          Cards
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Opção 1: Color (Multicor dinâmico) */}
          <div
            onClick={() => handleSelectMode("color")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              config.mode === "color"
                ? "bg-white dark:bg-slate-900 border-emerald-500 text-slate-900 dark:text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500 text-white shadow-xs">
                Color
              </span>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  config.mode === "color"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {config.mode === "color" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm">Multicor (Color)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mantém os cards com a rica variação cromática individual já mapeada por módulo.
              </p>
            </div>
          </div>

          {/* Opção 2: Mono (1 cor) */}
          <div
            onClick={() => handleSelectMode("mono")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              config.mode === "mono"
                ? "bg-white dark:bg-slate-900 border-emerald-500 text-slate-900 dark:text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-500 dark:text-blue-400 border border-blue-500/40">
                1 Cor
              </span>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  config.mode === "mono"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {config.mode === "mono" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm">Monocromático</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Padrão azul ou personalizado. Todos os cards adotam a mesma cor sólida.
              </p>
            </div>
          </div>

          {/* Opção 3: 2 Cores */}
          <div
            onClick={() => handleSelectMode("duo")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              config.mode === "duo"
                ? "bg-white dark:bg-slate-900 border-emerald-500 text-slate-900 dark:text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-500 dark:text-orange-400 border border-orange-500/40">
                2 Cores
              </span>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  config.mode === "duo"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {config.mode === "duo" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm">2 Cores (Duo)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Padrão azul e laranja. Os cards alternam ciclicamente entre as 2 cores.
              </p>
            </div>
          </div>

          {/* Opção 4: 3 Cores */}
          <div
            onClick={() => handleSelectMode("trio")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              config.mode === "trio"
                ? "bg-white dark:bg-slate-900 border-emerald-500 text-slate-900 dark:text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/40">
                3 Cores
              </span>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  config.mode === "trio"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {config.mode === "trio" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm">3 Cores (Trio)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Padrão azul, vermelho e laranja. Alternância cíclica entre as 3 cores.
              </p>
            </div>
          </div>

          {/* Opção 5: 4 Cores */}
          <div
            onClick={() => handleSelectMode("quad")}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              config.mode === "quad"
                ? "bg-white dark:bg-slate-900 border-emerald-500 text-slate-900 dark:text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 border border-emerald-500/40">
                4 Cores
              </span>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  config.mode === "quad"
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300 dark:border-slate-700"
                }`}
              >
                {config.mode === "quad" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-sm">4 Cores (Quad)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Padrão azul, vermelho, verde e laranja. Alternância cíclica entre as 4 cores.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Seção 2: Seletores de Cores Customizáveis (exibidos conforme o modo selecionado) */}
      {config.mode !== "color" && (
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Personalização das Cores Escolhidas
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Clique em uma cor para personalizar
            </span>
          </div>

          {/* Seletor Mono */}
          {config.mode === "mono" && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Cor única de todos os cards:
              </span>
              <div className="flex flex-wrap gap-2">
                {CARD_COLOR_OPTIONS.map((opt) => {
                  const isSelected = config.monoColor === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleSetMonoColor(opt.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
                          ? "bg-slate-100 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30"
                          : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shadow-xs"
                        style={{ backgroundColor: opt.bgHex }}
                      />
                      <span>{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 ml-1 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seletor Duo (2 Cores) */}
          {config.mode === "duo" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  1ª Cor (Ímpares):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CARD_COLOR_OPTIONS.map((opt) => {
                    const isSelected = config.duoColors[0] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleSetDuoColor(0, opt.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                          isSelected
                            ? "bg-slate-100 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: opt.bgHex }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  2ª Cor (Pares):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CARD_COLOR_OPTIONS.map((opt) => {
                    const isSelected = config.duoColors[1] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleSetDuoColor(1, opt.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                          isSelected
                            ? "bg-slate-100 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: opt.bgHex }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Seletor Trio (3 Cores) */}
          {config.mode === "trio" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((slot) => {
                const currentColor = config.trioColors[slot as 0 | 1 | 2];
                return (
                  <div key={slot} className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cor {slot + 1} do ciclo:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_COLOR_OPTIONS.map((opt) => {
                        const isSelected = currentColor === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleSetTrioColor(slot as 0 | 1 | 2, opt.key)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                              isSelected
                                ? "bg-slate-100 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30"
                                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: opt.bgHex }}
                            />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Seletor Quad (4 Cores) */}
          {config.mode === "quad" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((slot) => {
                const currentColor = config.quadColors[slot as 0 | 1 | 2 | 3];
                return (
                  <div key={slot} className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cor {slot + 1} do ciclo:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {CARD_COLOR_OPTIONS.map((opt) => {
                        const isSelected = currentColor === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleSetQuadColor(slot as 0 | 1 | 2 | 3, opt.key)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                              isSelected
                                ? "bg-slate-100 dark:bg-slate-800 border-emerald-500 text-slate-900 dark:text-slate-100 ring-2 ring-emerald-500/30"
                                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: opt.bgHex }}
                            />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Seção 3: Demonstração ao Vivo dos Cards Interativos (Live Preview) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Square className="h-4 w-4 text-emerald-500" /> 2. Demonstração ao Vivo dos Cards
            Interativos (Live Preview)
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Passe o cursor sobre os cards para visualizar o feixe de luz dinâmico e o ponto focal
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HubModuleCard
            to="/inicio"
            title="Atendimento ao Cliente"
            desc="Chamados, providências com registro automático e conclusão."
            index={0}
            themeConfig={config}
          />
          <HubModuleCard
            to="/inicio"
            title="Central de Segurança"
            desc="Painel cibernético de segurança, status de RLS e integridade forense."
            index={1}
            themeConfig={config}
          />
          <HubModuleCard
            to="/inicio"
            title="Mapa Operacional"
            desc="Telemetria em tempo real, status de ignição e bloqueio remoto."
            index={2}
            themeConfig={config}
          />
          <HubModuleCard
            to="/inicio"
            title="Manutenção Preventiva"
            desc="Troca de óleo, pastilhas, controle de odômetro e agendamentos."
            index={3}
            themeConfig={config}
          />
          <HubModuleCard
            to="/inicio"
            title="Rastreadores J16"
            desc="Comandos SMS de ativação e protocolo Concox / GT06 4G."
            index={4}
            themeConfig={config}
          />
          <HubModuleCard
            to="/inicio"
            title="Usuários e Acessos"
            desc="Perfis de acesso, permissões e blindagem de segurança."
            index={5}
            themeConfig={config}
          />
        </div>
      </div>
    </div>
  );
}
