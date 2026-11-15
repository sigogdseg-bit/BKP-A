import type React from "react";
import {
  Cpu,
  CreditCard,
  FileText,
  Headphones,
  MapPin,
  Palette,
  Radio,
  Shield,
  Smartphone,
  Users,
  Wrench,
  Activity,
  Layers,
  Wallet,
} from "lucide-react";
import type { CardColorKey, CardThemeConfig } from "@/shared/lib/card-theme";

export type HubModuleIcon = React.ComponentType<{ className?: string }>;

export interface ModuloTema {
  gradient: string;
  glowRgb: string;
  textHover: string;
  borderHover: string;
  iconHoverBg: string;
  iconHoverBorder: string;
  iconHoverText: string;
  badgeHoverBg: string;
  badgeHoverBorder: string;
  badgeHoverText: string;
  dotHoverBg: string;
  shadowHover: string;
}

/**
 * Mapeamento de ícones dos módulos Hunter
 */
export function resolverIconeModulo(to: string, title: string): HubModuleIcon {
  const rota = to.toLowerCase();
  const t = title.toLowerCase();

  if (rota.includes("financeiro") || t.includes("financeiro") || t.includes("caixa")) return Wallet;
  if (rota.includes("atendimento") || t.includes("atendimento")) return Headphones;
  if (rota.includes("central-seguranca") || t.includes("segurança")) return Shield;
  if (rota.includes("clientes") || t.includes("clientes")) return Users;
  if (rota.includes("dispositivos") || t.includes("dispositivos")) return Smartphone;
  if (rota.includes("logs") || t.includes("logs")) return FileText;
  if (rota.includes("manutencao") || t.includes("manutenção")) return Wrench;
  if (rota.includes("monitor-gps") || t.includes("mapa") || t.includes("gps")) return MapPin;
  if (rota.includes("mensalidade") || t.includes("mensalidade") || t.includes("cobrança"))
    return CreditCard;
  if (rota.includes("rastreador") || t.includes("rastreador")) return Radio;
  if (rota.includes("usuarios") || t.includes("usuários")) return Cpu;
  if (rota.includes("temas") || t.includes("temas")) return Palette;
  if (rota.includes("telemetria") || t.includes("telemetria")) return Activity;

  return Layers;
}

/**
 * Paleta cromática avançada e vibrante dos módulos Hunter
 */
export function resolverTemaModulo(to: string, title: string, customGradient?: string): ModuloTema {
  const rota = to.toLowerCase();
  const t = title.toLowerCase();

  // 1. Atendimento ao Cliente (Esmeralda Suporte / Verde Laser)
  if (rota.includes("atendimento") || t.includes("atendimento")) {
    return {
      gradient: customGradient || "from-emerald-500 via-orange-600 to-green-700",
      glowRgb: "16, 185, 129",
      textHover: "group-hover:text-orange-300",
      borderHover: "group-hover:border-orange-500/50",
      iconHoverBg: "group-hover:bg-orange-500/20",
      iconHoverBorder: "group-hover:border-orange-400/50",
      iconHoverText: "group-hover:text-orange-200",
      badgeHoverBg: "group-hover:bg-orange-500/20",
      badgeHoverBorder: "group-hover:border-orange-500/40",
      badgeHoverText: "group-hover:text-orange-300",
      dotHoverBg: "group-hover:bg-orange-400",
      shadowHover: "hover:shadow-orange-950/40",
    };
  }

  // 2. Central de Segurança (Vermelho Sangue / Escudo Blindado)
  if (rota.includes("central-seguranca") || t.includes("segurança")) {
    return {
      gradient: customGradient || "from-red-600 via-rose-700 to-zinc-900",
      glowRgb: "220, 38, 38",
      textHover: "group-hover:text-rose-300",
      borderHover: "group-hover:border-rose-500/50",
      iconHoverBg: "group-hover:bg-rose-500/20",
      iconHoverBorder: "group-hover:border-rose-400/50",
      iconHoverText: "group-hover:text-rose-200",
      badgeHoverBg: "group-hover:bg-rose-500/20",
      badgeHoverBorder: "group-hover:border-rose-500/40",
      badgeHoverText: "group-hover:text-rose-300",
      dotHoverBg: "group-hover:bg-rose-400",
      shadowHover: "hover:shadow-rose-950/40",
    };
  }

  // 3. Clientes e Planos (Azul Safira / Royal Corporativo)
  if (rota.includes("clientes") || t.includes("clientes")) {
    return {
      gradient: customGradient || "from-blue-600 via-sky-500 to-indigo-700",
      glowRgb: "37, 99, 235",
      textHover: "group-hover:text-blue-300",
      borderHover: "group-hover:border-blue-500/50",
      iconHoverBg: "group-hover:bg-blue-500/20",
      iconHoverBorder: "group-hover:border-blue-400/50",
      iconHoverText: "group-hover:text-blue-200",
      badgeHoverBg: "group-hover:bg-blue-500/20",
      badgeHoverBorder: "group-hover:border-blue-500/40",
      badgeHoverText: "group-hover:text-blue-300",
      dotHoverBg: "group-hover:bg-blue-400",
      shadowHover: "hover:shadow-blue-950/40",
    };
  }

  // 4. Dispositivos Autorizados (Âmbar Ouro / Laranja Hardware)
  if (rota.includes("dispositivos") || t.includes("dispositivos")) {
    return {
      gradient: customGradient || "from-amber-500 via-orange-500 to-yellow-600",
      glowRgb: "245, 158, 11",
      textHover: "group-hover:text-amber-300",
      borderHover: "group-hover:border-amber-500/50",
      iconHoverBg: "group-hover:bg-amber-500/20",
      iconHoverBorder: "group-hover:border-amber-400/50",
      iconHoverText: "group-hover:text-amber-200",
      badgeHoverBg: "group-hover:bg-amber-500/20",
      badgeHoverBorder: "group-hover:border-amber-500/40",
      badgeHoverText: "group-hover:text-amber-300",
      dotHoverBg: "group-hover:bg-amber-400",
      shadowHover: "hover:shadow-amber-950/40",
    };
  }

  // 5. Logs do Sistema (Bronze Titânio Grafite)
  if (rota.includes("logs") || t.includes("logs")) {
    return {
      gradient: customGradient || "from-slate-500 via-zinc-600 to-slate-700",
      glowRgb: "148, 163, 184",
      textHover: "group-hover:text-slate-300",
      borderHover: "group-hover:border-slate-500/50",
      iconHoverBg: "group-hover:bg-slate-500/20",
      iconHoverBorder: "group-hover:border-slate-400/50",
      iconHoverText: "group-hover:text-slate-200",
      badgeHoverBg: "group-hover:bg-slate-500/20",
      badgeHoverBorder: "group-hover:border-slate-500/40",
      badgeHoverText: "group-hover:text-slate-300",
      dotHoverBg: "group-hover:bg-slate-400",
      shadowHover: "hover:shadow-slate-950/40",
    };
  }

  // 6. Manutenção Preventiva (Laranja Fogo / Sunset Flame)
  if (rota.includes("manutencao") || t.includes("manutenção")) {
    return {
      gradient: customGradient || "from-orange-500 via-amber-500 to-red-500",
      glowRgb: "249, 115, 22",
      textHover: "group-hover:text-orange-300",
      borderHover: "group-hover:border-orange-500/50",
      iconHoverBg: "group-hover:bg-orange-500/20",
      iconHoverBorder: "group-hover:border-orange-400/50",
      iconHoverText: "group-hover:text-orange-200",
      badgeHoverBg: "group-hover:bg-orange-500/20",
      badgeHoverBorder: "group-hover:border-orange-500/40",
      badgeHoverText: "group-hover:text-orange-300",
      dotHoverBg: "group-hover:bg-orange-400",
      shadowHover: "hover:shadow-orange-950/40",
    };
  }

  // 7. Mapa Operacional (Laranja Tático GD)
  if (rota.includes("monitor-gps") || t.includes("mapa") || t.includes("gps")) {
    return {
      gradient: customGradient || "from-orange-500 via-amber-500 to-orange-600",
      glowRgb: "249, 115, 22",
      textHover: "group-hover:text-orange-300",
      borderHover: "group-hover:border-orange-500/50",
      iconHoverBg: "group-hover:bg-orange-500/20",
      iconHoverBorder: "group-hover:border-orange-400/50",
      iconHoverText: "group-hover:text-orange-200",
      badgeHoverBg: "group-hover:bg-orange-500/20",
      badgeHoverBorder: "group-hover:border-orange-500/40",
      badgeHoverText: "group-hover:text-orange-300",
      dotHoverBg: "group-hover:bg-orange-400",
      shadowHover: "hover:shadow-orange-950/40",
    };
  }

  // 7.1. Financeiro e Fluxo de Caixa (Esmeralda Nobre / Ouro Imperial)
  if (rota.includes("financeiro") || t.includes("financeiro") || t.includes("caixa")) {
    return {
      gradient: customGradient || "from-orange-500 via-amber-500 to-orange-600",
      glowRgb: "249, 115, 22",
      textHover: "group-hover:text-orange-300",
      borderHover: "group-hover:border-orange-500/50",
      iconHoverBg: "group-hover:bg-orange-500/20",
      iconHoverBorder: "group-hover:border-orange-400/50",
      iconHoverText: "group-hover:text-orange-200",
      badgeHoverBg: "group-hover:bg-orange-500/20",
      badgeHoverBorder: "group-hover:border-orange-500/40",
      badgeHoverText: "group-hover:text-orange-300",
      dotHoverBg: "group-hover:bg-orange-400",
      shadowHover: "hover:shadow-orange-950/40",
    };
  }

  // 8. Mensalidades e Cobrança (Laranja Âmbar Nobre)
  if (rota.includes("mensalidade") || t.includes("mensalidade") || t.includes("cobrança")) {
    return {
      gradient: customGradient || "from-amber-500 via-orange-500 to-amber-600",
      glowRgb: "245, 158, 11",
      textHover: "group-hover:text-orange-300",
      borderHover: "group-hover:border-orange-500/50",
      iconHoverBg: "group-hover:bg-orange-500/20",
      iconHoverBorder: "group-hover:border-orange-400/50",
      iconHoverText: "group-hover:text-orange-200",
      badgeHoverBg: "group-hover:bg-orange-500/20",
      badgeHoverBorder: "group-hover:border-orange-500/40",
      badgeHoverText: "group-hover:text-orange-300",
      dotHoverBg: "group-hover:bg-orange-400",
      shadowHover: "hover:shadow-orange-950/40",
    };
  }

  // 9. Rastreadores J16 (Rosa Choque / Framboesa Nobre)
  if (rota.includes("rastreador") || t.includes("rastreador")) {
    return {
      gradient: customGradient || "from-pink-600 via-rose-600 to-red-700",
      glowRgb: "225, 29, 72",
      textHover: "group-hover:text-rose-300",
      borderHover: "group-hover:border-rose-500/50",
      iconHoverBg: "group-hover:bg-rose-500/20",
      iconHoverBorder: "group-hover:border-rose-400/50",
      iconHoverText: "group-hover:text-rose-200",
      badgeHoverBg: "group-hover:bg-rose-500/20",
      badgeHoverBorder: "group-hover:border-rose-500/40",
      badgeHoverText: "group-hover:text-rose-300",
      dotHoverBg: "group-hover:bg-rose-400",
      shadowHover: "hover:shadow-rose-950/40",
    };
  }

  // 10. Temas dos Cards e Módulos (Prisma Cromático Neon / Fúcsia)
  if (rota.includes("temas") || t.includes("temas")) {
    return {
      gradient: customGradient || "from-fuchsia-500 via-orange-500 to-amber-500",
      glowRgb: "236, 72, 153",
      textHover: "group-hover:text-fuchsia-300",
      borderHover: "group-hover:border-fuchsia-500/50",
      iconHoverBg: "group-hover:bg-fuchsia-500/20",
      iconHoverBorder: "group-hover:border-fuchsia-400/50",
      iconHoverText: "group-hover:text-fuchsia-200",
      badgeHoverBg: "group-hover:bg-fuchsia-500/20",
      badgeHoverBorder: "group-hover:border-fuchsia-500/40",
      badgeHoverText: "group-hover:text-fuchsia-300",
      dotHoverBg: "group-hover:bg-fuchsia-400",
      shadowHover: "hover:shadow-fuchsia-950/40",
    };
  }

  // 11. Usuários e Acessos (Púrpura Violeta / Ametista Nobre)
  if (rota.includes("usuarios") || t.includes("usuários")) {
    return {
      gradient: customGradient || "from-violet-600 via-purple-700 to-indigo-800",
      glowRgb: "139, 92, 246",
      textHover: "group-hover:text-violet-300",
      borderHover: "group-hover:border-violet-500/50",
      iconHoverBg: "group-hover:bg-violet-500/20",
      iconHoverBorder: "group-hover:border-violet-400/50",
      iconHoverText: "group-hover:text-violet-200",
      badgeHoverBg: "group-hover:bg-violet-500/20",
      badgeHoverBorder: "group-hover:border-violet-500/40",
      badgeHoverText: "group-hover:text-violet-300",
      dotHoverBg: "group-hover:bg-violet-400",
      shadowHover: "hover:shadow-violet-950/40",
    };
  }

  // Fallback
  return {
    gradient: customGradient || "from-orange-500 via-amber-500 to-orange-600",
    glowRgb: "249, 115, 22",
    textHover: "group-hover:text-orange-300",
    borderHover: "group-hover:border-orange-500/50",
    iconHoverBg: "group-hover:bg-orange-500/20",
    iconHoverBorder: "group-hover:border-orange-400/50",
    iconHoverText: "group-hover:text-orange-200",
    badgeHoverBg: "group-hover:bg-orange-500/20",
    badgeHoverBorder: "group-hover:border-orange-500/40",
    badgeHoverText: "group-hover:text-orange-300",
    dotHoverBg: "group-hover:bg-orange-400",
    shadowHover: "hover:shadow-orange-950/40",
  };
}

export const CARD_COLOR_PALETTES: Record<CardColorKey, ModuloTema> = {
  blue: {
    gradient: "from-blue-600 via-indigo-600 to-sky-500",
    glowRgb: "37, 99, 235",
    textHover: "group-hover:text-blue-300",
    borderHover: "group-hover:border-blue-500/50",
    iconHoverBg: "group-hover:bg-blue-500/20",
    iconHoverBorder: "group-hover:border-blue-400/50",
    iconHoverText: "group-hover:text-blue-200",
    badgeHoverBg: "group-hover:bg-blue-500/20",
    badgeHoverBorder: "group-hover:border-blue-500/40",
    badgeHoverText: "group-hover:text-blue-300",
    dotHoverBg: "group-hover:bg-blue-400",
    shadowHover: "hover:shadow-blue-950/40",
  },
  orange: {
    gradient: "from-orange-500 via-amber-500 to-red-500",
    glowRgb: "249, 115, 22",
    textHover: "group-hover:text-orange-300",
    borderHover: "group-hover:border-orange-500/50",
    iconHoverBg: "group-hover:bg-orange-500/20",
    iconHoverBorder: "group-hover:border-orange-400/50",
    iconHoverText: "group-hover:text-orange-200",
    badgeHoverBg: "group-hover:bg-orange-500/20",
    badgeHoverBorder: "group-hover:border-orange-500/40",
    badgeHoverText: "group-hover:text-orange-300",
    dotHoverBg: "group-hover:bg-orange-400",
    shadowHover: "hover:shadow-orange-950/40",
  },
  red: {
    gradient: "from-red-600 via-rose-600 to-amber-600",
    glowRgb: "239, 68, 68",
    textHover: "group-hover:text-red-300",
    borderHover: "group-hover:border-red-500/50",
    iconHoverBg: "group-hover:bg-red-500/20",
    iconHoverBorder: "group-hover:border-red-400/50",
    iconHoverText: "group-hover:text-red-200",
    badgeHoverBg: "group-hover:bg-red-500/20",
    badgeHoverBorder: "group-hover:border-red-500/40",
    badgeHoverText: "group-hover:text-red-300",
    dotHoverBg: "group-hover:bg-red-400",
    shadowHover: "hover:shadow-red-950/40",
  },
  green: {
    gradient: "from-emerald-500 via-orange-600 to-green-700",
    glowRgb: "16, 185, 129",
    textHover: "group-hover:text-orange-300",
    borderHover: "group-hover:border-orange-500/50",
    iconHoverBg: "group-hover:bg-orange-500/20",
    iconHoverBorder: "group-hover:border-orange-400/50",
    iconHoverText: "group-hover:text-orange-200",
    badgeHoverBg: "group-hover:bg-orange-500/20",
    badgeHoverBorder: "group-hover:border-orange-500/40",
    badgeHoverText: "group-hover:text-orange-300",
    dotHoverBg: "group-hover:bg-orange-400",
    shadowHover: "hover:shadow-orange-950/40",
  },
  purple: {
    gradient: "from-purple-600 via-fuchsia-600 to-indigo-600",
    glowRgb: "168, 85, 247",
    textHover: "group-hover:text-purple-300",
    borderHover: "group-hover:border-purple-500/50",
    iconHoverBg: "group-hover:bg-purple-500/20",
    iconHoverBorder: "group-hover:border-purple-400/50",
    iconHoverText: "group-hover:text-purple-200",
    badgeHoverBg: "group-hover:bg-purple-500/20",
    badgeHoverBorder: "group-hover:border-purple-500/40",
    badgeHoverText: "group-hover:text-purple-300",
    dotHoverBg: "group-hover:bg-purple-400",
    shadowHover: "hover:shadow-purple-950/40",
  },
  cyan: {
    gradient: "from-amber-400 via-orange-500 to-amber-600",
    glowRgb: "249, 115, 22",
    textHover: "group-hover:text-orange-300",
    borderHover: "group-hover:border-orange-500/50",
    iconHoverBg: "group-hover:bg-orange-500/20",
    iconHoverBorder: "group-hover:border-orange-400/50",
    iconHoverText: "group-hover:text-orange-200",
    badgeHoverBg: "group-hover:bg-orange-500/20",
    badgeHoverBorder: "group-hover:border-orange-500/40",
    badgeHoverText: "group-hover:text-orange-300",
    dotHoverBg: "group-hover:bg-orange-400",
    shadowHover: "hover:shadow-orange-950/40",
  },
  amber: {
    gradient: "from-amber-400 via-yellow-500 to-amber-600",
    glowRgb: "245, 158, 11",
    textHover: "group-hover:text-amber-300",
    borderHover: "group-hover:border-amber-500/50",
    iconHoverBg: "group-hover:bg-amber-500/20",
    iconHoverBorder: "group-hover:border-amber-400/50",
    iconHoverText: "group-hover:text-amber-200",
    badgeHoverBg: "group-hover:bg-amber-500/20",
    badgeHoverBorder: "group-hover:border-amber-500/40",
    badgeHoverText: "group-hover:text-amber-300",
    dotHoverBg: "group-hover:bg-amber-400",
    shadowHover: "hover:shadow-amber-950/40",
  },
  pink: {
    gradient: "from-pink-500 via-rose-500 to-red-500",
    glowRgb: "236, 72, 153",
    textHover: "group-hover:text-pink-300",
    borderHover: "group-hover:border-pink-500/50",
    iconHoverBg: "group-hover:bg-pink-500/20",
    iconHoverBorder: "group-hover:border-pink-400/50",
    iconHoverText: "group-hover:text-pink-200",
    badgeHoverBg: "group-hover:bg-pink-500/20",
    badgeHoverBorder: "group-hover:border-pink-500/40",
    badgeHoverText: "group-hover:text-pink-300",
    dotHoverBg: "group-hover:bg-pink-400",
    shadowHover: "hover:shadow-pink-950/40",
  },
};

export function resolverTemaPorCor(cor: CardColorKey): ModuloTema {
  return CARD_COLOR_PALETTES[cor] || CARD_COLOR_PALETTES.blue;
}

export function resolverTemaCardComConfig(
  to: string,
  title: string,
  config: CardThemeConfig,
  index?: number,
  customGradient?: string,
): ModuloTema {
  if (config.mode === "color") {
    return resolverTemaModulo(to, title, customGradient);
  }

  const hash = (to + title).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const cardIndex = index !== undefined ? index : hash;

  if (config.mode === "mono") {
    return resolverTemaPorCor(config.monoColor);
  }
  if (config.mode === "duo") {
    const cor = config.duoColors[Math.abs(cardIndex) % 2];
    return resolverTemaPorCor(cor);
  }
  if (config.mode === "trio") {
    const cor = config.trioColors[Math.abs(cardIndex) % 3];
    return resolverTemaPorCor(cor);
  }
  if (config.mode === "quad") {
    const cor = config.quadColors[Math.abs(cardIndex) % 4];
    return resolverTemaPorCor(cor);
  }

  return resolverTemaModulo(to, title, customGradient);
}
