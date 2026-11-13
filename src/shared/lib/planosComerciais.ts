// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Catálogo Canônico dos Planos Comerciais SIGO Guardião (DJR-NEW)
// ─────────────────────────────────────────────────────────────────────────────
// Fonte única da verdade (Single Source of Truth) para planos comerciais:
// - PLANO BÁSICO (7 dias de histórico visíveis no app)
// - PLANO PRO (15 dias de histórico visíveis no app)
// - PLANO MASTER (30 dias de histórico visíveis no app)
//
// Regras pétreas:
// 1. Proibição estrita de inventar funcionalidades ou alterar nomenclaturas.
// 2. Não mencionar planos personalizados.
// 3. Exibir estritamente o histórico visível no app (sem menção a retenção de banco).
// 4. Sem uso de caractere comercial proibido — utilizar sempre a conjunção "e".
// ─────────────────────────────────────────────────────────────────────────────

export type TipoPlanoComercial = "basico" | "pro" | "master";

export interface ItemFuncionalidadePlano {
  nome: string;
  detalhe: string;
}

export interface DefinicaoPlanoComercial {
  id: TipoPlanoComercial;
  nome: string;
  rotulo: string;
  icone: string;
  diasHistoricoVisivel: number;
  inclusoTexto?: string;
  funcionalidades: ItemFuncionalidadePlano[];
}

export const PLANOS_COMERCIAIS_CATALOGO: DefinicaoPlanoComercial[] = [
  {
    id: "basico",
    nome: "Básico",
    rotulo: "PLANO BÁSICO",
    icone: "🟢",
    diasHistoricoVisivel: 7,
    funcionalidades: [
      {
        nome: "Rastreamento em tempo real (24h)",
        detalhe:
          "Posição contínua no mapa com ignição ligada ou desligada, velocidade instantânea e direção.",
      },
      {
        nome: "Bloqueio e Desbloqueio remoto seguro (se disponivel para o veiculo)",
        detalhe:
          "Protocolo de segurança anti-acidente (bloqueia somente com o veículo parado a 0 km/h).",
      },
      {
        nome: "Cercas virtuais (geofences)",
        detalhe:
          "Criação de áreas monitoradas com alertas de entrada e saída no app, Web Push e WhatsApp.",
      },
      {
        nome: "Trava virtual de estacionamento (Âncora)",
        detalhe: "Proteção imediata de 1 toque no local onde o veículo estacionou.",
      },
      {
        nome: "Auto-monitoramento interativo 24h via WhatsApp",
        detalhe: "Comandos LOCALIZACAO, BLOQUEIO, DESBLOQUEIO, STATUS e PIX.",
      },
      {
        nome: "Mensalidade",
        detalhe: "Acesso a faturas e pagamento instantâneo via PIX (QR Code e Copia e Cola).",
      },
      {
        nome: "Histórico de Trajetos",
        detalhe: "7 dias visíveis no aplicativo.",
      },
    ],
  },
  {
    id: "pro",
    nome: "Pro",
    rotulo: "PLANO PRO",
    icone: "🔵",
    diasHistoricoVisivel: 15,
    inclusoTexto: "Tudo incluso no Plano Básico, mais:",
    funcionalidades: [
      {
        nome: "Playback de viagens (Refazer Trajeto)",
        detalhe:
          "Reprodução animada dos trajetos percorridos pelo veículo, com paradas, tempo parado e velocidades.",
      },
      {
        nome: "Rotas e trajetos inteligentes",
        detalhe:
          "Planejamento viário pelas ruas reais com múltiplos pontos de parada, distância e tempo estimado.",
      },
      {
        nome: "Módulo de abastecimento",
        detalhe:
          "Registro de abastecimentos com leitor inteligente OCR de Notas Fiscais e cálculo de média km/l.",
      },
      {
        nome: "Manutenção preventiva",
        detalhe:
          "Programação de revisões periódicas atreladas automaticamente ao odômetro do veículo e datas.",
      },
      {
        nome: "Histórico de Trajetos",
        detalhe: "15 dias visíveis no aplicativo.",
      },
      {
        nome: "Compartilhamento de localização",
        detalhe: "Geração de link temporário com rotas para Waze, Google Maps e Apple Maps.",
      },
    ],
  },
  {
    id: "master",
    nome: "Master",
    rotulo: "PLANO MASTER",
    icone: "🟣",
    diasHistoricoVisivel: 30,
    inclusoTexto: "Tudo incluso no Plano Pro, mais:",
    funcionalidades: [
      {
        nome: "Score de condução do motorista",
        detalhe:
          "Avaliação de dirigibilidade (pontuação de 0 a 100 com base em aceleração, frenagem e velocidade).",
      },
      {
        nome: "Gestão de equipe e funcionários",
        detalhe:
          "Acessos secundários para encarregados com controle granular de permissões por módulo.",
      },
      {
        nome: "Relatórios executivos e analíticos",
        detalhe:
          "Emissão de demonstrativos em PDF com carimbo de autenticidade digital SGD e hash SHA-256.",
      },
      {
        nome: "Visualização com clusterização no mapa",
        detalhe: "Monitoramento de frotas inteiras na mesma tela sem sobreposição de marcadores.",
      },
      {
        nome: "Gestão de motoristas",
        detalhe: "Cadastro de condutores com controle de CNH e despesas vinculadas.",
      },
      {
        nome: "Desempenho da frota",
        detalhe:
          "Telemetria diária com KM rodado no dia, tempo em movimento versus tempo ocioso e velocidades média e máxima.",
      },
      {
        nome: "Histórico de Trajetos",
        detalhe: "30 dias visíveis no aplicativo.",
      },
    ],
  },
];

/**
 * Normaliza a string de identificação do plano
 */
export function normalizarTipoPlano(plano?: string | null): TipoPlanoComercial {
  const p = (plano || "").toLowerCase().trim();
  if (p === "pro") return "pro";
  if (p === "master") return "master";
  return "basico";
}

/**
 * Retorna os dias de histórico visíveis no aplicativo para o plano informado
 */
export function obterDiasHistoricoPorPlano(plano?: string | null): number {
  const tipo = normalizarTipoPlano(plano);
  if (tipo === "master") return 30;
  if (tipo === "pro") return 15;
  return 7;
}

/**
 * Retorna a definição completa de um plano
 */
export function obterDefinicaoPlano(plano?: string | null): DefinicaoPlanoComercial {
  const tipo = normalizarTipoPlano(plano);
  return PLANOS_COMERCIAIS_CATALOGO.find((p) => p.id === tipo) || PLANOS_COMERCIAIS_CATALOGO[0];
}

/**
 * Gera o texto oficial dos 3 planos comerciais formatado para mensagens de WhatsApp
 */
export function obterTextoPlanosComerciaisFormatado(): string {
  const blocos = PLANOS_COMERCIAIS_CATALOGO.map((p) => {
    const cabecalho = `${p.icone} *${p.rotulo}*`;
    const incluso = p.inclusoTexto ? `_${p.inclusoTexto}_\n` : "";
    const linhas = p.funcionalidades.map((f) => `• *${f.nome}:* ${f.detalhe}`).join("\n");
    return `${cabecalho}\n${incluso}${linhas}`;
  });

  return (
    "🛡️ *SIGO Guardião — Planos Comerciais Disponíveis*\n\n" +
    "Confira o que contempla cada plano em uso no sistema:\n\n" +
    blocos.join("\n\n") +
    "\n\n💡 *Dica:* Para montar e emitir uma proposta comercial personalizada via WhatsApp, envie *PROPOSTA*."
  );
}

/**
 * Gera o texto explicativo sobre o plano atual de um cliente para WhatsApp
 */
export function obterTextoPlanoClienteFormatado(
  plano?: string | null,
  diasCustom?: number,
): string {
  const def = obterDefinicaoPlano(plano);
  const diasVisiveis = diasCustom || def.diasHistoricoVisivel;

  let texto =
    `🛡️ *Seu Plano Contratado: ${def.icone} ${def.rotulo}*\n\n` +
    `• *Histórico de Trajetos:* *${diasVisiveis} dias visíveis* no aplicativo\n\n` +
    `*Funcionalidades Contempladas no seu plano:*\n`;

  if (def.inclusoTexto) {
    texto += `_${def.inclusoTexto}_\n`;
  }

  texto += def.funcionalidades.map((f) => `• *${f.nome}:* ${f.detalhe}`).join("\n");

  if (def.id === "basico") {
    texto +=
      "\n\n🚀 *Deseja fazer upgrade?*\n" +
      "Envie *PLANOS* para conferir as vantagens exclusivas do *Plano Pro* e *Plano Master* (com Playback animado, Relatórios executivos com SHA-256 e mais dias de histórico).";
  } else if (def.id === "pro") {
    texto +=
      "\n\n🚀 *Deseja fazer upgrade para o Plano Master?*\n" +
      "Envie *PLANOS* para conferir as vantagens do *Plano Master* (Score de condução, Relatórios executivos com SHA-256, Gestão de motoristas e 30 dias de histórico).";
  }

  return texto;
}

/**
 * Retorna o descritivo formal em texto corrido/tópicos para inserção em Contratos PDF
 */
export function obterDescritivoFuncionalidadesContrato(plano?: string | null): string {
  const def = obterDefinicaoPlano(plano);
  const prefixo = def.inclusoTexto ? `${def.inclusoTexto} ` : "";
  const lista = def.funcionalidades.map((f) => `${f.nome} (${f.detalhe})`).join("; ");
  return `${prefixo}${lista}.`;
}
