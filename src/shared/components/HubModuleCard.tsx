import React, { useState, useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useCardTheme, type CardThemeConfig } from "@/shared/lib/card-theme";
import {
  resolverIconeModulo,
  resolverTemaCardComConfig,
  type HubModuleIcon,
  type ModuloTema,
} from "./hub-module-theme";

export type { HubModuleIcon, ModuloTema };

export interface HubModuleCardProps {
  to: string;
  title: string;
  desc: string;
  gradient?: string;
  icon?: HubModuleIcon;
  search?: Record<string, string>;
  className?: string;
  footerInfo?: React.ReactNode;
  index?: number;
  themeConfig?: CardThemeConfig;
  userId?: string | null;
}

/**
 * Card Canônico, Elegante e Tátil de Módulos Hunter
 * - Comportamento uniforme de mouse em todo o sistema (claro e escuro)
 * - Efeito de colorir canônico do Cockpit de telemetria (spotlightColor e glow dinâmico)
 * - Inclinação tridimensional suave (3D parallax tilt)
 * - Ponto focal translúcido de alta precisão
 * - Relevo suave Neumorphic Soft UI com elevação tátil e sombras projetadas
 * - Cores temáticas exclusivas e vibrantes por módulo
 */
export const HubModuleCard = React.memo(function HubModuleCard({
  to,
  title,
  desc,
  gradient,
  icon,
  search,
  className = "",
  footerInfo,
  index,
  themeConfig,
  userId,
}: HubModuleCardProps) {
  const IconComponent = icon || resolverIconeModulo(to, title);
  const activeUserTheme = useCardTheme(userId);
  const configToUse = themeConfig || activeUserTheme;
  const tema = resolverTemaCardComConfig(to, title, configToUse, index, gradient);

  const cardRef = useRef<HTMLAnchorElement>(null);
  const [transformStyle, setTransformStyle] = useState("");
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    // Efeito de inclinação 3D sutil idêntico ao Cockpit
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const maxTilt = 4.5;
    const rotateX = -((y - centerY) / centerY) * maxTilt;
    const rotateY = ((x - centerX) / centerX) * maxTilt;

    setTransformStyle(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`,
    );

    setMousePos({ x, y });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setMousePos(null);
    setTransformStyle("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
  }, []);

  return (
    <Link
      ref={cardRef}
      to={to as any}
      search={search}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: transformStyle,
        transition: transformStyle ? "transform 0.1s ease-out" : "transform 0.35s ease-out",
        transformStyle: "preserve-3d",
      }}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-[24px] bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-[5px_5px_14px_#090d14] hover:shadow-[7px_7px_22px_#b5c4d9] dark:hover:shadow-[0_16px_35px_rgba(0,0,0,0.65)] hover:-translate-y-1.5 transition-all duration-300 ease-out focus:outline-hidden focus:ring-2 focus:ring-orange-500/40 cursor-pointer select-none active:scale-[0.99] ${tema.borderHover} ${className}`}
    >
      {/* Faixa superior com degradê temático que se expande e ganha brilho no hover */}
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tema.gradient} transition-all duration-300 group-hover:h-2 group-hover:shadow-[0_0_16px_rgba(${tema.glowRgb},0.85)]`}
      />

      {/* Esfumaçado ambiente no fundo (aura suave em repouso) */}
      <div
        className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-2xl transition-all duration-500 opacity-15 group-hover:opacity-40 group-hover:scale-125"
        style={{
          backgroundColor: `rgb(${tema.glowRgb})`,
        }}
      />

      {/* Efeito de Colorir Canônico do Cockpit: feixe luminoso dinâmico da cor exclusiva acompanhando o ponteiro */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: isHovered && mousePos ? 1 : 0,
          background: mousePos
            ? `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${tema.glowRgb}, 0.28), rgba(${tema.glowRgb}, 0.08) 45%, transparent 80%)`
            : "none",
        }}
      />

      {/* Ponto focal de brilho translúcido seguindo o cursor */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        style={{
          opacity: isHovered && mousePos ? 0.7 : 0,
          background: mousePos
            ? `radial-gradient(130px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.28), transparent 70%)`
            : "none",
        }}
      />

      {/* Cabeçalho do Card: Ícone com iluminação viva e Botão Tátil */}
      <div className="relative z-10 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf0f8] dark:bg-slate-800/80 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_5px_#0a0f18] border border-slate-300/40 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 transition-all duration-300 group-hover:scale-110 shrink-0 ${tema.iconHoverText}`}
          >
            <IconComponent className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full bg-[#eaf0f8] dark:bg-slate-800/80 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_5px_#0a0f18] border border-slate-300/40 dark:border-slate-700/50 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200 ${tema.badgeHoverText}`}
          >
            Acessar
            <ChevronRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>

        <div>
          <h2
            className={`text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 transition-colors duration-200 line-clamp-1 ${tema.textHover}`}
          >
            {title}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400 transition-colors duration-200 group-hover:text-slate-900 dark:group-hover:text-slate-200 line-clamp-2">
            {desc}
          </p>
        </div>
      </div>

      {/* Rodapé sutil com linha de apoio tática */}
      <div className="relative z-10 mt-4 pt-2.5 border-t border-slate-300/50 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
        {footerInfo ? (
          <span className="font-mono uppercase tracking-wider text-[9.5px] text-slate-600 dark:text-slate-400 font-semibold">
            {footerInfo}
          </span>
        ) : (
          <span />
        )}
        <span
          className={`h-2 w-2 rounded-full shadow-xs transition-all duration-300 group-hover:scale-125 ${tema.dotHoverBg}`}
        />
      </div>
    </Link>
  );
});
