import type { TipoVeiculo } from "../types";
export type { TipoVeiculo };

export interface TipoVeiculoConfig {
  id: TipoVeiculo;
  label: string;
  categoria: "leve" | "utilitario" | "pesado" | "duas_rodas" | "nautico";
  descricao: string;
}

export const LISTA_TIPOS_VEICULO: TipoVeiculoConfig[] = [
  { id: "carro", label: "Carro", categoria: "leve", descricao: "Passeio / Sedan / Hatch" },
  { id: "suv", label: "SUV", categoria: "leve", descricao: "Utilitário esportivo" },
  {
    id: "camionete",
    label: "Camionete",
    categoria: "utilitario",
    descricao: "Picape / Cabine dupla",
  },
  {
    id: "van",
    label: "Van",
    categoria: "utilitario",
    descricao: "Van / Furgão / Transporte",
  },
  {
    id: "ambulancia",
    label: "Ambulância",
    categoria: "utilitario",
    descricao: "Resgate / Emergência / Saúde",
  },
  { id: "caminhao", label: "Caminhão", categoria: "pesado", descricao: "Carga pesada / Truck" },
  { id: "onibus", label: "Ônibus", categoria: "pesado", descricao: "Coletivo / Rodoviário" },
  { id: "moto", label: "Moto", categoria: "duas_rodas", descricao: "Motocicleta / Scooter" },
  {
    id: "moto_eletrica",
    label: "Moto Elétrica",
    categoria: "duas_rodas",
    descricao: "Scooter Elétrica / Ciclomotor / E-Bike",
  },
  {
    id: "quadriciculo",
    label: "Quadriciclo",
    categoria: "utilitario",
    descricao: "ATV 4x4 Off-Road",
  },
  { id: "triciclo", label: "Triciclo", categoria: "duas_rodas", descricao: "Triciclo motorizado" },
  { id: "jetski", label: "Jet Ski", categoria: "nautico", descricao: "Embarcação náutica" },
  {
    id: "maquina",
    label: "Máquina",
    categoria: "pesado",
    descricao: "Maquinário Pesado / Agrícola / Industrial / Trator / Escavadeira",
  },
];

export function normalizarTipoVeiculo(tipo?: string | null): TipoVeiculo {
  if (!tipo) return "carro";
  const t = tipo.toLowerCase().trim();
  if (
    t === "moto_eletrica" ||
    t === "moto eletrica" ||
    t === "moto elétrica" ||
    t === "scooter eletrica" ||
    t === "scooter elétrica" ||
    t === "e-bike" ||
    t === "ebike" ||
    t === "ciclomotor"
  )
    return "moto_eletrica";
  if (
    t === "maquina" ||
    t === "máquina" ||
    t === "trator" ||
    t === "escavadeira" ||
    t === "retroescavadeira" ||
    t === "pa carregadeira" ||
    t === "pá carregadeira" ||
    t === "agricola" ||
    t === "agrícola" ||
    t === "colheitadeira" ||
    t === "empilhadeira"
  )
    return "maquina";
  if (t === "jetski" || t === "jet ski" || t === "embarcacao") return "jetski";
  if (t === "suv") return "suv";
  if (t === "camionete" || t === "picape" || t === "pickup") return "camionete";
  if (t === "van" || t === "furgao" || t === "furgão" || t === "furgonette") return "van";
  if (
    t === "ambulancia" ||
    t === "ambulância" ||
    t === "resgate" ||
    t === "samu" ||
    t === "uti movel" ||
    t === "uti móvel"
  )
    return "ambulancia";
  if (t === "caminhao" || t === "caminhão" || t === "carreta") return "caminhao";
  if (t === "onibus" || t === "ônibus" || t === "microonibus") return "onibus";
  if (t === "moto" || t === "motocicleta") return "moto";
  if (t === "quadriciculo" || t === "quadriciclo") return "quadriciculo";
  if (t === "triciclo") return "triciclo";
  return "carro";
}

export function obterRotuloTipoVeiculo(tipo?: string | null): string {
  const normalizado = normalizarTipoVeiculo(tipo);
  const found = LISTA_TIPOS_VEICULO.find((item) => item.id === normalizado);
  return found ? found.label : "Carro";
}

/**
 * Retorna o SVG 3D isométrico renderizado com perspectiva volumétrica, iluminação e sombras
 */
export function getVehicleSvg3DContent(tipo: TipoVeiculo, corStatus: string = "#10B981"): string {
  switch (tipo) {
    case "moto":
      return `
        <!-- Sombra 3D projetada no piso -->
        <ellipse cx="24" cy="28" rx="7" ry="17" fill="rgba(0,0,0,0.55)" filter="blur(2px)" />
        <!-- Pneu Traseiro com perfil 3D -->
        <rect x="21.5" y="32" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Pneu Dianteiro com perfil 3D -->
        <rect x="21.5" y="5" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Chassi e motor com detalhe cromado -->
        <path d="M20 20 L28 20 L26 31 L22 31 Z" fill="#1E293B" stroke="#334155" stroke-width="0.8"/>
        <!-- Tanque de combustível / Carenagem aerodinâmica 3D -->
        <path d="M24 12 C28 14 28 23 27 27 C26 29 22 29 21 27 C20 23 20 14 24 12 Z" fill="${corStatus}" />
        <path d="M24 13 C26 14 26 21 25.5 25 C25 26 24 26 23.5 25 C23 21 23 14 24 13 Z" fill="rgba(255,255,255,0.4)" />
        <!-- Guidão esportivo 3D -->
        <line x1="14" y1="15" x2="34" y2="15" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
        <circle cx="14" cy="15" r="1.5" fill="#334155"/>
        <circle cx="34" cy="15" r="1.5" fill="#334155"/>
        <!-- Farol Dianteiro LED com feixe de luz -->
        <polygon points="21,5 27,5 28,1 20,1" fill="#FFFFFF" opacity="0.95"/>
      `;

    case "moto_eletrica":
      return `
        <!-- Sombra 3D projetada no piso -->
        <ellipse cx="24" cy="28" rx="8" ry="17" fill="rgba(0,0,0,0.55)" filter="blur(2px)" />
        <!-- Pneu Traseiro com perfil 3D -->
        <rect x="21.5" y="32" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#06B6D4" stroke-width="0.8"/>
        <!-- Pneu Dianteiro com perfil 3D -->
        <rect x="21.5" y="5" width="5" height="11" rx="2.5" fill="#0A0F1D" stroke="#06B6D4" stroke-width="0.8"/>
        <!-- Pack de Bateria de Íons de Lítio Central com LED status elétrico -->
        <rect x="20" y="20" width="8" height="11" rx="2" fill="#0F172A" stroke="#06B6D4" stroke-width="1.2"/>
        <rect x="22" y="22" width="4" height="7" rx="1" fill="#06B6D4" opacity="0.85"/>
        <!-- Raio Elétrico indicador no pack de energia -->
        <path d="M24.5 23 L23 25.5 L24.5 25.5 L23.5 28 L25.5 25 L24 25 Z" fill="#FFFFFF" />
        <!-- Carenagem aerodinâmica e moderna Scooter / Moto Elétrica 3D -->
        <path d="M24 10 C29 13 29 22 28 27 C27 30 21 30 20 27 C19 22 19 13 24 10 Z" fill="${corStatus}" />
        <path d="M24 11 C27 13 27 20 26.5 24 C26 25 24 25 23.5 24 C22 20 22 13 24 11 Z" fill="rgba(255,255,255,0.4)" />
        <!-- Guidão Futurista 3D com manoplas ergonômicas -->
        <line x1="13" y1="14" x2="35" y2="14" stroke="#F8FAFC" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="13" cy="14" r="1.6" fill="#06B6D4"/>
        <circle cx="35" cy="14" r="1.6" fill="#06B6D4"/>
        <!-- Farol Full LED de Alta Intensidade -->
        <polygon points="20,4 28,4 27,1 21,1" fill="#E0F2FE" opacity="0.98"/>
        <circle cx="24" cy="3" r="1.5" fill="#38BDF8"/>
      `;

    case "jetski":
      return `
        <!-- Sombra e rastro de água 3D -->
        <ellipse cx="24" cy="27" rx="10" ry="18" fill="rgba(0,0,0,0.45)" filter="blur(2px)" />
        <path d="M18 41 L24 47 L30 41 Z" fill="${corStatus}" opacity="0.4" />
        <!-- Casco náutico em V aerodinâmico 3D -->
        <path d="M24 4 C32 12 33 34 29 42 C27 44 21 44 19 42 C15 34 16 12 24 4 Z" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <!-- Deck superior colorido com brilho de gelcoat -->
        <path d="M24 7 C30 14 30 32 27 38 C25 40 23 40 21 38 C18 32 18 14 24 7 Z" fill="${corStatus}"/>
        <path d="M24 8 C27 14 27 28 25 34 C24.5 35 23.5 35 23 34 C21 28 21 14 24 8 Z" fill="rgba(255,255,255,0.35)"/>
        <!-- Assento náutico duplo texturizado -->
        <rect x="21" y="21" width="6" height="15" rx="3" fill="#1E293B" stroke="#0F172A" stroke-width="0.8"/>
        <!-- Guidão marítimo -->
        <line x1="16" y1="16" x2="32" y2="16" stroke="#E2E8F0" stroke-width="2.2" stroke-linecap="round"/>
        <!-- Farol marítimo de proa -->
        <polygon points="22,6 26,6 25,3 23,3" fill="#FFFFFF"/>
      `;

    case "quadriciculo":
      return `
        <!-- Sombra 3D -->
        <rect x="11" y="7" width="26" height="34" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- 4 Rodas Off-road largas com cravos salientes -->
        <rect x="8" y="7" width="6" height="11" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="34" y="7" width="6" height="11" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="8" y="29" width="6" height="12" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <rect x="34" y="29" width="6" height="12" rx="2" fill="#0A0F1D" stroke="#334155" stroke-width="1"/>
        <!-- Chassi tubular ATV -->
        <rect x="13" y="11" width="22" height="26" rx="4" fill="#0F172A" stroke="#1E293B" stroke-width="1.2"/>
        <!-- Carenagem superior 3D -->
        <path d="M16 11 L32 11 L30 35 L18 35 Z" fill="${corStatus}"/>
        <!-- Assento central -->
        <rect x="20.5" y="18" width="7" height="14" rx="3.5" fill="#1E293B"/>
        <!-- Guidão com protetores de mão -->
        <line x1="13" y1="14" x2="35" y2="14" stroke="#F1F5F9" stroke-width="2.4" stroke-linecap="round"/>
        <!-- Faróis duplos LED -->
        <circle cx="18" cy="11" r="2" fill="#FFFFFF"/>
        <circle cx="30" cy="11" r="2" fill="#FFFFFF"/>
      `;

    case "triciclo":
      return `
        <!-- Sombra 3D -->
        <polygon points="24,6 38,40 10,40" fill="rgba(0,0,0,0.5)" filter="blur(2px)"/>
        <!-- Roda Dianteira Central -->
        <rect x="21.5" y="5" width="5" height="10" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- 2 Rodas Traseiras Largas -->
        <rect x="8" y="30" width="6.5" height="12" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <rect x="33.5" y="30" width="6.5" height="12" rx="2.5" fill="#0A0F1D" stroke="#1E293B" stroke-width="1"/>
        <!-- Corpo delta 3D aerodinâmico -->
        <path d="M24 10 L35 34 L32 40 L16 40 L13 34 Z" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Teto / Cockpit esportivo com reflexo -->
        <path d="M24 14 L30 30 L18 30 Z" fill="#0F172A"/>
        <path d="M24 15 L28 28 L20 28 Z" fill="rgba(255,255,255,0.3)"/>
        <!-- Guidão / Frente esportiva -->
        <line x1="16" y1="13" x2="32" y2="13" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round"/>
      `;

    case "caminhao":
      return `
        <!-- Sombra pesada 3D -->
        <rect x="11" y="4" width="26" height="42" rx="5" fill="rgba(0,0,0,0.6)" filter="blur(2.5px)"/>
        <!-- Chassi com rodagem dupla traseira -->
        <rect x="9" y="31" width="4" height="12" rx="1.5" fill="#090D16"/>
        <rect x="35" y="31" width="4" height="12" rx="1.5" fill="#090D16"/>
        <!-- Carroceria / Baú de Carga 3D -->
        <rect x="12" y="18" width="24" height="26" rx="2" fill="#1E293B" stroke="#334155" stroke-width="1.2"/>
        <line x1="12" y1="31" x2="36" y2="31" stroke="#0F172A" stroke-width="1"/>
        <!-- Cabine pesada frontal 3D -->
        <rect x="12" y="4" width="24" height="15" rx="3" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa panorâmico com reflexo -->
        <path d="M14 6 L34 6 L33 11 L15 11 Z" fill="#0F172A"/>
        <path d="M15 7 L27 7 L26 10 L16 10 Z" fill="rgba(255,255,255,0.4)"/>
        <!-- Defletores de ar no teto -->
        <rect x="16" y="13" width="16" height="4" rx="1" fill="#334155"/>
        <!-- Faróis de topo e milha -->
        <circle cx="14" cy="5" r="1.5" fill="#FFFFFF"/>
        <circle cx="34" cy="5" r="1.5" fill="#FFFFFF"/>
      `;

    case "onibus":
      return `
        <!-- Sombra 3D alongada -->
        <rect x="12" y="3" width="24" height="43" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2.5px)"/>
        <!-- Carroceria 3D monobloco alongada -->
        <rect x="13" y="3" width="22" height="42" rx="4.5" fill="${corStatus}" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Para-brisa frontal grande e inclinado -->
        <path d="M15 5 L33 5 L32 10 L16 10 Z" fill="#0F172A"/>
        <path d="M16 6 L28 6 L27 9 L17 9 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Janelas laterais de passageiros em vidro fumê -->
        <rect x="14.5" y="12" width="2" height="26" rx="0.5" fill="#0B132B"/>
        <rect x="31.5" y="12" width="2" height="26" rx="0.5" fill="#0B132B"/>
        <!-- Climatizador / Ar-condicionado no teto 3D -->
        <rect x="18" y="16" width="12" height="16" rx="2" fill="#1E293B" stroke="#334155" stroke-width="0.8"/>
        <!-- Faróis duplos de LED -->
        <circle cx="16" cy="4" r="1.5" fill="#FFFFFF"/>
        <circle cx="32" cy="4" r="1.5" fill="#FFFFFF"/>
      `;

    case "camionete":
      return `
        <!-- Sombra 3D -->
        <rect x="11" y="4" width="26" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Cabine Dupla 3D -->
        <rect x="13" y="4" width="22" height="24" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa frontal e traseiro -->
        <path d="M15 7 L33 7 L32 12 L16 12 Z" fill="#0F172A"/>
        <path d="M16 8 L27 8 L26 11 L17 11 Z" fill="rgba(255,255,255,0.4)"/>
        <rect x="16" y="24" width="16" height="3" rx="1" fill="#0F172A"/>
        <!-- Caçamba traseira aberta com protetor em relevo -->
        <rect x="13" y="28" width="22" height="15" rx="2" fill="#1E293B" stroke="#0F172A" stroke-width="1"/>
        <rect x="15" y="30" width="18" height="11" rx="1" fill="#0F172A"/>
        <line x1="18" y1="30" x2="18" y2="41" stroke="#334155" stroke-width="1"/>
        <line x1="24" y1="30" x2="24" y2="41" stroke="#334155" stroke-width="1"/>
        <line x1="30" y1="30" x2="30" y2="41" stroke="#334155" stroke-width="1"/>
        <!-- Faróis de LED dianteiros -->
        <rect x="14" y="4" width="4" height="2" rx="0.5" fill="#FFFFFF"/>
        <rect x="30" y="4" width="4" height="2" rx="0.5" fill="#FFFFFF"/>
      `;

    case "van":
      return `
        <!-- Sombra 3D alongada e encorpada -->
        <rect x="12" y="3.5" width="24" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2.2px)"/>
        <!-- Carroceria 3D Van / Furgão -->
        <rect x="13.5" y="3.5" width="21" height="40" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1.1"/>
        <!-- Para-brisa frontal amplo com coluna A -->
        <path d="M15.5 6 L32.5 6 L31.5 12 L16.5 12 Z" fill="#0B132B"/>
        <!-- Reflexo especular do vidro frontal -->
        <path d="M17 7 L28 7 L27 10.5 L17.5 10.5 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Vidros laterais dianteiros do motorista/passageiro -->
        <rect x="14" y="13" width="1.8" height="6" rx="0.5" fill="#0B132B"/>
        <rect x="32.2" y="13" width="1.8" height="6" rx="0.5" fill="#0B132B"/>
        <!-- Frisos longitudinais de reforço no teto da van -->
        <line x1="17.5" y1="15" x2="17.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="21.5" y1="15" x2="21.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="26.5" y1="15" x2="26.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <line x1="30.5" y1="15" x2="30.5" y2="38" stroke="#0F172A" stroke-width="1.2" opacity="0.4"/>
        <!-- Vigia traseira / Vidro duplo traseiro -->
        <rect x="16.5" y="39.5" width="6.5" height="2" rx="0.5" fill="#0B132B"/>
        <rect x="25" y="39.5" width="6.5" height="2" rx="0.5" fill="#0B132B"/>
        <!-- Faróis de LED dianteiros -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas verticais traseiras em LED -->
        <rect x="14" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
        <rect x="32.5" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
      `;

    case "ambulancia":
      return `
        <!-- Sombra 3D projetada no piso -->
        <rect x="12" y="3.5" width="24" height="41" rx="5" fill="rgba(0,0,0,0.55)" filter="blur(2.2px)"/>
        <!-- Carroceria 3D Furgão de Resgate / Ambulância -->
        <rect x="13.5" y="3.5" width="21" height="40" rx="4" fill="#F8FAFC" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Faixas reflexivas laterais de emergência -->
        <rect x="13.5" y="14" width="2.5" height="24" fill="#EF4444"/>
        <rect x="32" y="14" width="2.5" height="24" fill="#EF4444"/>
        <!-- Para-brisa frontal amplo -->
        <path d="M15.5 6 L32.5 6 L31.5 12 L16.5 12 Z" fill="#0B132B"/>
        <path d="M17 7 L28 7 L27 10.5 L17.5 10.5 Z" fill="rgba(255,255,255,0.5)"/>
        <!-- Barra de Giroflex de Emergência Luminosa (Sirene Vermelha e Azul) -->
        <rect x="18" y="13" width="12" height="3.5" rx="1.5" fill="#0F172A"/>
        <rect x="19" y="13.5" width="4.5" height="2.5" rx="1" fill="#EF4444"/>
        <circle cx="24" cy="14.7" r="1" fill="#FFFFFF"/>
        <rect x="24.5" y="13.5" width="4.5" height="2.5" rx="1" fill="#3B82F6"/>
        <!-- Cruz Vermelha Médica de Resgate no Teto -->
        <circle cx="24" cy="26" r="6" fill="#FEE2E2" stroke="#EF4444" stroke-width="0.8"/>
        <rect x="22.5" y="22.5" width="3" height="7" rx="0.5" fill="#EF4444"/>
        <rect x="20.5" y="24.5" width="7" height="3" rx="0.5" fill="#EF4444"/>
        <!-- Faróis de LED dianteiros de alta intensidade -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas traseiras de emergência -->
        <rect x="14" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
        <rect x="32.5" y="37" width="1.5" height="5" rx="0.5" fill="#EF4444"/>
      `;

    case "suv":
      return `
        <!-- Sombra volumétrica 3D -->
        <rect x="12" y="4" width="24" height="40" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Carroceria encorpada SUV 3D -->
        <rect x="13" y="4" width="22" height="38" rx="5" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa esportivo e vigia traseira -->
        <path d="M15 7 L33 7 L32 13 L16 13 Z" fill="#0F172A"/>
        <path d="M16 8 L27 8 L26 12 L17 12 Z" fill="rgba(255,255,255,0.4)"/>
        <rect x="16" y="35" width="16" height="3" rx="1" fill="#0F172A"/>
        <!-- Barras de teto longitudinais / Rack de expedição -->
        <rect x="14.5" y="14" width="1.8" height="20" rx="0.9" fill="#0F172A"/>
        <rect x="31.7" y="14" width="1.8" height="20" rx="0.9" fill="#0F172A"/>
        <!-- Teto solar panorâmico com reflexo de vidro -->
        <rect x="18" y="16" width="12" height="15" rx="2" fill="#090E17"/>
        <path d="M19 17 L28 17 L26 23 L19 23 Z" fill="rgba(255,255,255,0.2)"/>
        <!-- Faróis de LED dianteiros -->
        <polygon points="14,4 18,4 17,6 14,6" fill="#FFFFFF"/>
        <polygon points="34,4 30,4 31,6 34,6" fill="#FFFFFF"/>
      `;

    case "maquina":
      return `
        <!-- Sombra 3D de Maquinário Pesado -->
        <rect x="9" y="4" width="30" height="42" rx="6" fill="rgba(0,0,0,0.65)" filter="blur(2.5px)"/>
        <!-- Esteiras / Rodados Tratorados Laterais de Alta Carga com garras -->
        <rect x="8" y="6" width="6.5" height="38" rx="3" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <rect x="33.5" y="6" width="6.5" height="38" rx="3" fill="#0F172A" stroke="#334155" stroke-width="1.2"/>
        <!-- Garras das esteiras/pneus -->
        <line x1="8" y1="12" x2="14.5" y2="12" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="18" x2="14.5" y2="18" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="24" x2="14.5" y2="24" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="30" x2="14.5" y2="30" stroke="#475569" stroke-width="1.2"/>
        <line x1="8" y1="36" x2="14.5" y2="36" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="12" x2="40" y2="12" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="18" x2="40" y2="18" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="24" x2="40" y2="24" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="30" x2="40" y2="30" stroke="#475569" stroke-width="1.2"/>
        <line x1="33.5" y1="36" x2="40" y2="36" stroke="#475569" stroke-width="1.2"/>
        <!-- Chassi Central Blindado e Motor (Amarelo Ouro Industrial / Cor de Status) -->
        <rect x="13.5" y="5" width="21" height="40" rx="4" fill="${corStatus}" stroke="#0F172A" stroke-width="1.2"/>
        <!-- Concha / Lâmina Frontal de Ataque -->
        <path d="M12 4 L36 4 L34 8 L14 8 Z" fill="#F59E0B" stroke="#78350F" stroke-width="1"/>
        <!-- Cabine do Operador com Estrutura ROPS/FOPS Reforçada -->
        <rect x="16" y="20" width="16" height="18" rx="3" fill="#0B132B" stroke="#0F172A" stroke-width="1"/>
        <rect x="17.5" y="22" width="13" height="14" rx="2" fill="rgba(255,255,255,0.2)"/>
        <!-- Teto Reforçado da Cabine com Faróis de Trabalho Noturno -->
        <rect x="15" y="24" width="18" height="12" rx="2" fill="#F59E0B" stroke="#0F172A" stroke-width="1"/>
        <circle cx="17.5" cy="22" r="1.2" fill="#FEF08A"/>
        <circle cx="30.5" cy="22" r="1.2" fill="#FEF08A"/>
        <!-- Giroflex / Luz de Advertência Âmbar Central no Teto -->
        <circle cx="24" cy="27" r="2" fill="#F59E0B" stroke="#B45309" stroke-width="0.8"/>
        <!-- Escapamento Vertical Industrial -->
        <circle cx="16.5" cy="12" r="1.5" fill="#334155" stroke="#0F172A" stroke-width="0.8"/>
      `;

    case "carro":
    default:
      return `
        <!-- Sombra dinâmica 3D projetada no solo -->
        <rect x="12" y="4" width="24" height="40" rx="6" fill="rgba(0,0,0,0.55)" filter="blur(2px)"/>
        <!-- Carroceria Sedan / Esportiva 3D com linhas aerodinâmicas -->
        <rect x="13.5" y="4" width="21" height="38" rx="5" fill="${corStatus}" stroke="#0F172A" stroke-width="1"/>
        <!-- Para-brisa dianteiro aerodinâmico em vidro fumê escuro -->
        <path d="M15.5 7 L32.5 7 L31 14 L17 14 Z" fill="#0B132B"/>
        <!-- Reflexo especular no para-brisa dando brilho vítreo 3D -->
        <path d="M17 8 L28 8 L26 13 L18 13 Z" fill="rgba(255,255,255,0.45)"/>
        <!-- Teto do veículo com frisos aerodinâmicos -->
        <rect x="16" y="16" width="16" height="13" rx="2" fill="#0F172A" opacity="0.35"/>
        <!-- Vidro traseiro com curvatura -->
        <path d="M17 31 L31 31 L29.5 35 L18.5 35 Z" fill="#0B132B"/>
        <!-- Faróis de LED modernos com feixe frontal luminoso -->
        <polygon points="14.5,4 18,4 17.5,6.5 14.5,6" fill="#FFFFFF"/>
        <polygon points="33.5,4 30,4 30.5,6.5 33.5,6" fill="#FFFFFF"/>
        <!-- Lanternas traseiras em LED vermelho vítreo -->
        <rect x="15" y="40.5" width="4" height="1.5" rx="0.5" fill="#EF4444"/>
        <rect x="29" y="40.5" width="4" height="1.5" rx="0.5" fill="#EF4444"/>
      `;
  }
}

/**
 * Retorna o SVG completo do Pino 3D Glossy volumétrico (estilo Maps 3D)
 * Reproduz o pino 3D vertical com perspectiva isométrica,
 * extrusão lateral de profundidade com luz e sombra, furo anular com parede cilíndrica 3D,
 * e reflexos especulares curvados de vidro e resina brilhante.
 *
 * Cores canônicas:
 * - Vermelho: Rastreador Offline / Alerta / Bloqueado
 * - Azul: Rastreador Online com Ignição Desligada
 * - Verde: Rastreador Online com Ignição Ligada
 */
export function getGlossyPin3DSvg(corHex: string = "#EF4444", id: string = "hunter-pin"): string {
  const isBlue =
    corHex.includes("#2563EB") ||
    corHex.includes("#3B82F6") ||
    corHex.includes("#1D4ED8") ||
    corHex.includes("#60A5FA");
  const isGreen =
    corHex.includes("#10B981") ||
    corHex.includes("#059669") ||
    corHex.includes("#16A34A") ||
    corHex.includes("#34D399");

  const paleta = isGreen
    ? {
        gradTopo: "#34D399",
        gradCentro: "#10B981",
        gradBase: "#059669",
        flancoLuz: "#047857",
        flancoEscuro: "#064E3B",
        furoSombra: "#022C22",
        furoLuz: "#10B981",
      }
    : isBlue
      ? {
          gradTopo: "#60A5FA",
          gradCentro: "#2563EB",
          gradBase: "#1D4ED8",
          flancoLuz: "#1E40AF",
          flancoEscuro: "#1E3A8A",
          furoSombra: "#172554",
          furoLuz: "#2563EB",
        }
      : {
          gradTopo: "#FF4D4D",
          gradCentro: "#DC2626",
          gradBase: "#991B1B",
          flancoLuz: "#B91C1C",
          flancoEscuro: "#7F1D1D",
          furoSombra: "#5B1212",
          furoLuz: "#DC2626",
        };

  return `
    <svg width="100%" height="100%" viewBox="0 0 64 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradiente da Face Frontal 3D Perfeitamente Simétrica -->
        <linearGradient id="${id}-front" x1="32" y1="4" x2="32" y2="57.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="45%" stop-color="${paleta.gradCentro}"/>
          <stop offset="100%" stop-color="${paleta.gradBase}"/>
        </linearGradient>

        <!-- Gradiente de Profundidade e Borda Volumétrica 3D -->
        <linearGradient id="${id}-edge-light" x1="16" y1="4" x2="48" y2="57.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.gradTopo}"/>
          <stop offset="60%" stop-color="${paleta.flancoLuz}"/>
          <stop offset="100%" stop-color="${paleta.flancoEscuro}"/>
        </linearGradient>

        <!-- Gradiente da Parede Interna do Furo 3D -->
        <linearGradient id="${id}-hole-wall" x1="32" y1="13" x2="32" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${paleta.furoSombra}"/>
          <stop offset="70%" stop-color="${paleta.furoSombra}"/>
          <stop offset="100%" stop-color="${paleta.furoLuz}"/>
        </linearGradient>

        <!-- Brilho Especular Superior de Vidro / Resina (Arco Superior) -->
        <linearGradient id="${id}-spec-top" x1="20" y1="4" x2="44" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#FFFFFF" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- 1. Ponto de Contato Sutil no Asfalto na Ponta Exata do Pino -->
      <ellipse cx="32" cy="57" rx="5" ry="1" fill="rgba(0,0,0,0.45)" />

      <!-- 2. Corpo Frontal Principal do Pino 3D com Furo Anular Central (100% RETO E SIMÉTRICO) -->
      <path fill-rule="evenodd" clip-rule="evenodd" d="
        M 32 57.5
        C 28 48, 16 34, 16 21
        C 16 12.16, 23.16 5, 32 5
        C 40.84 5, 48 12.16, 48 21
        C 48 34, 36 48, 32 57.5
        Z
        M 32 27
        C 35.31 27, 38 24.31, 38 21
        C 38 17.69, 35.31 15, 32 15
        C 28.69 15, 26 17.69, 26 21
        C 26 24.31, 28.69 27, 32 27
        Z
      " fill="url(#${id}-front)" stroke="url(#${id}-edge-light)" stroke-width="1.2" />

      <!-- 3. Parede Interna do Furo Cilíndrico com Profundidade 3D -->
      <circle cx="32" cy="21" r="6" fill="none" stroke="url(#${id}-hole-wall)" stroke-width="1.3" />

      <!-- 4. Efeito Glossy / Vidro: Reflexo Especular Curvo no Topo (Arco Iluminado) -->
      <path d="
        M 21 15
        C 23 9, 27 6, 32 6
        C 37 6, 41 9, 43 15
        C 40 11, 36 9, 32 9
        C 28 9, 24 11, 21 15
        Z
      " fill="url(#${id}-spec-top)" />

      <!-- 5. Ponto de Luz Intensa (Hotspot Especular Branco Curvado) -->
      <ellipse cx="25" cy="13" rx="3.5" ry="2" transform="rotate(-30 25 13)" fill="#FFFFFF" opacity="0.85" />
    </svg>
  `;
}

/**
 * Calcula o ângulo da mini-placa para alinhamento longitudinal com a via
 * Garante que a placa fique perfeitamente paralela à rua e sempre legível (sem ponta-cabeça).
 */
export function calcularAnguloPlacaVia(anguloRumo: number): number {
  let anguloPlacaVia = (((anguloRumo - 90) % 360) + 360) % 360;
  if (anguloPlacaVia > 90 && anguloPlacaVia < 270) {
    anguloPlacaVia -= 180;
  }
  return anguloPlacaVia;
}

/**
 * Gera o HTML da Mini Placa Mercosul assentada no solo da via
 * Usado com rotationAlignment: "map" e pitchAlignment: "map" no MapLibre 3D
 */
export function gerarMiniPlacaSoloHtml(params: {
  placa: string;
  anguloRumo: number;
  isSelected?: boolean;
}): string {
  const { placa, anguloRumo, isSelected } = params;
  const anguloPlacaVia = calcularAnguloPlacaVia(anguloRumo);

  return `
    <div class="mini-placa-solo-mercosul" style="
      transform: rotate(${anguloPlacaVia}deg);
      transform-origin: center center;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      background: #FFFFFF;
      border: 1.2px solid ${isSelected ? "#2563EB" : "#0F172A"};
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.65)${isSelected ? ", 0 0 10px #2563EB80" : ""};
      overflow: hidden;
      white-space: nowrap;
      font-family: monospace;
      text-align: center;
      user-select: none;
      cursor: pointer;
    ">
      <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center;">
        <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
      </div>
      <div style="color: #0F172A; font-size: 11px; font-weight: 900; padding: 1px 6px; line-height: 14px; letter-spacing: 0.2px;">
        ${placa}
      </div>
    </div>
  `;
}

/**
 * Gera o HTML do Pino 3D Glossy flutuando verticalmente no ar acima do veículo
 * Usado com rotationAlignment: "viewport" e pitchAlignment: "viewport"
 */
export function gerarPinoFlutuanteHtml(params: {
  corStatus: string;
  temAlerta?: boolean;
  isEmRota?: boolean;
  isSelected?: boolean;
  cleanId?: string;
}): string {
  const { corStatus, temAlerta, isEmRota, isSelected, cleanId = "hunter" } = params;
  const pinSvg = getGlossyPin3DSvg(corStatus, `pin-${cleanId}`);

  return `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;">
      ${
        temAlerta
          ? `<div style="position: absolute; width: 56px; height: 56px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>`
          : isEmRota
            ? `<div style="position: absolute; width: 50px; height: 50px; border-radius: 50%; background: ${corStatus}30; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>`
            : ""
      }

      <!-- Pino 3D Glossy em pé (100% RETO E VERTICAL) com animação suave de levitação -->
      <div class="hunter-pin-floating" style="
        position: relative;
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4))${isSelected ? ` drop-shadow(0 0 16px ${corStatus})` : ""};
      ">
        ${pinSvg}
      </div>

      <!-- Sombra oval de flutuação / levitação que pulsa suavemente no ar -->
      <div class="hunter-pin-shadow" style="
        width: 18px;
        height: 5px;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%);
        border-radius: 50%;
        margin-top: 1px;
        z-index: 5;
      "></div>
    </div>
  `;
}

export type ModoPlacaMapa = "com_placa" | "auto" | "sem_placa";

/**
 * Formata o identificador visual do veículo (placa ou chassi).
 * Para veículos sem placa (como máquinas, tratores, motos elétricas), caso a placa não esteja informada,
 * utiliza os últimos 6 dígitos/caracteres do chassi para identificação no mapa e em cards.
 */
export function formatarPlacaOuChassi(placa?: string | null, chassi?: string | null): string {
  const p = (placa || "").trim().toUpperCase();
  const c = (chassi || "").trim().toUpperCase();
  if (p && !["SEM PLACA", "SEMPLACA", "A DEFINIR"].includes(p)) {
    return p;
  }
  if (c) {
    return c.length >= 6 ? c.slice(-6) : c;
  }
  return p || "SEM PLACA";
}

/**
 * Determina se a placa Mercosul deve ser exibida no mapa:
 * - "sem_placa": nunca exibe (apenas o ícone limpo na via)
 * - "com_placa": sempre exibe acima do ícone
 * - "auto" (padrão): exibe acima do ícone apenas se houver mais de um veículo no mapa
 */
export function deveExibirPlacaNoMapa(totalVeiculos: number): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return totalVeiculos > 1;
  }
  const modo = localStorage.getItem("@hunter_modo_placa_mapa") || "auto";
  if (modo === "sem_placa") return false;
  if (modo === "com_placa") return true;
  return totalVeiculos > 1;
}

/**
 * Gera o HTML completo de marcação 3D com orientação do rumo, halo de status e placa Mercosul.
 * Quando iconeGenerico é true, renderiza o Pino 3D vertical com a ponta exatamente na rua
 * e a placa posicionada ACIMA do ícone (quando habilitada).
 */
export function gerarMarcador3DHtml(params: {
  placa: string;
  chassi?: string | null;
  tipo?: string | null;
  corStatus: string;
  anguloRumo?: number;
  isSelected?: boolean;
  temAlerta?: boolean;
  isEmRota?: boolean;
  iconeGenerico?: boolean;
  mostrarPlaca?: boolean;
}): string {
  const {
    placa,
    chassi,
    tipo,
    corStatus,
    anguloRumo = 0,
    isSelected,
    temAlerta,
    isEmRota,
    iconeGenerico,
    mostrarPlaca,
  } = params;
  const tipoNormalizado = normalizarTipoVeiculo(tipo);
  const placaFormatada = formatarPlacaOuChassi(placa, chassi);
  const cleanId =
    (mostrarPlaca === false ? "marker" : placaFormatada.replace(/[^a-zA-Z0-9]/g, "")) || "marker";
  const exibirPlaca = mostrarPlaca !== false;

  if (iconeGenerico) {
    const pinSvg = getGlossyPin3DSvg(corStatus, `pin-${cleanId}`);

    return `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; user-select: none;">
        ${
          temAlerta
            ? `<div style="position: absolute; bottom: 0px; width: 50px; height: 50px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
            : isEmRota
              ? `<div style="position: absolute; bottom: 0px; width: 46px; height: 46px; border-radius: 50%; background: ${corStatus}30; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite; pointer-events: none;"></div>`
              : ""
        }

        <!-- Indicador direcional suave na via sob o pino (quando em movimento) -->
        ${
          isEmRota
            ? `<div class="hunter-generico-seta" style="
                position: absolute;
                bottom: 0px;
                transform: rotate(${anguloRumo}deg);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                z-index: 5;
              ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L17 14L12 11L7 14L12 2Z" fill="${corStatus}" opacity="0.9" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>
                </svg>
              </div>`
            : ""
        }

        <!-- 1. Placa Mercosul ACIMA do Ícone (apenas se mais de 1 veículo ou com placa ativa) -->
        ${
          exibirPlaca
            ? `
          <div class="mini-placa-mercosul" style="
            margin-bottom: 2px;
            background: #FFFFFF;
            border: 1.2px solid ${isSelected ? "#2563EB" : "#0F172A"};
            border-radius: 3.5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.35)${isSelected ? ", 0 0 8px #2563EB80" : ""};
            overflow: hidden;
            white-space: nowrap;
            font-family: monospace;
            text-align: center;
            pointer-events: none;
            z-index: 20;
          ">
            <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center; padding: 0 4px;">
              <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
            </div>
            <div style="color: #0F172A; font-size: 10px; font-weight: 900; padding: 0.5px 5.5px; line-height: 12px; letter-spacing: 0.2px;">
              ${placaFormatada}
            </div>
          </div>
        `
            : ""
        }

        <!-- 2. Pino 3D Glossy em pé (100% RETO E VERTICAL) com animação suave de levitação -->
        <div class="hunter-3d-pin-standing hunter-pin-floating" style="
          position: relative;
          width: 44px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35))${isSelected ? ` drop-shadow(0 0 12px ${corStatus})` : ""};
        ">
          ${pinSvg}
        </div>

        <!-- 3. Sombra de contato no solo exatamente sob a ponta do pino -->
        <div class="hunter-pin-shadow" style="
          width: 14px;
          height: 4px;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 75%);
          border-radius: 50%;
          margin-top: -2px;
          z-index: 5;
        "></div>
      </div>
    `;
  }

  // Ícone de Veículo 3D (modo veículo volumétrico)
  const svgContent = getVehicleSvg3DContent(tipoNormalizado, corStatus);

  return `
    <div style="position: relative; width: 84px; height: 84px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      ${
        temAlerta
          ? `<div style="position: absolute; width: 84px; height: 84px; border-radius: 50%; background: #EF444450; animation: ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>`
          : isEmRota
            ? `<div style="position: absolute; width: 80px; height: 80px; border-radius: 50%; background: ${corStatus}25; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>`
            : ""
      }
      
      <!-- Contêiner do Veículo e Placa Alinhados à Via com Rotação de Rumo -->
      <div class="vehicle-via-aligned" style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transform: rotate(${anguloRumo}deg);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      ">
        <div class="vehicle-3d-symbol" style="
          position: relative;
          width: 68px;
          height: 68px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45))${isSelected ? ` drop-shadow(0 0 14px ${corStatus})` : ""};
        ">
          <svg width="68" height="68" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            ${svgContent}
          </svg>
        </div>
        
        <!-- Mini Placa Mercosul Alinhada à Via como se fosse o Carro (apenas se habilitada) -->
        ${
          exibirPlaca
            ? `
        <div class="mini-placa-mercosul" style="
          position: relative;
          margin-top: -10px;
          background: #FFFFFF;
          border: 1.2px solid #0F172A;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.75);
          overflow: hidden;
          white-space: nowrap;
          font-family: monospace;
          text-align: center;
          z-index: 20;
          pointer-events: none;
        ">
          <div style="background: #003399; height: 3.5px; width: 100%; display: flex; align-items: center; justify-content: center;">
            <span style="color: #FFFFFF; font-size: 4px; font-weight: 900; line-height: 3.5px; letter-spacing: 0.5px;">BRASIL</span>
          </div>
          <div style="color: #0F172A; font-size: 11px; font-weight: 900; padding: 1px 6px; line-height: 14px; letter-spacing: 0.2px;">
            ${placaFormatada}
          </div>
        </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}
