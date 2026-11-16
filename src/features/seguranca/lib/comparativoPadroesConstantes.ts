// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Constantes e Tipos de Padrões de Rastreamento J16 / GT06
// ─────────────────────────────────────────────────────────────────────────────

export interface ParametrosPadraoComparativo {
  nome: string;
  timerMovimento: number; // Segundos entre pings com ignição ON (ex: 5 a 60)
  timerParado: number; // Segundos entre pings com ignição OFF (ex: 300 a 3600)
  anguloHabilitado: boolean; // Inflexão de curva ativada (SZCS#ANGLE,SEND=1)
  anguloGrau: number; // Grau de curvatura (ex: 5° a 35°)
  anguloIntervalo: number; // Janela de checagem do ângulo em segundos (ex: 5s a 20s)
  hbtLigado: number; // Heartbeat em movimento (segundos)
  hbtDesligado: number; // Heartbeat em repouso (segundos)
  modoEconomiaParada: boolean; // SENDS=1 (desliga GPS contínuo na garagem) vs SENDS=0
  sensibilidadeGSensor: number; // LEVEL,1 (hiper-sensível) a LEVEL,5 (duro)
  pacoteEstendidoIexvol: boolean; // Voltagem e Odômetro MCU no pacote GT06 (0x94)
}

export type PerfilUsoOperacional = {
  horasMovimentoPorDia: number; // Ex: 2h, 4h, 8h, 12h
  diasPorMes: number; // 30 dias
  cenarioTrajeto: "urbano" | "rodovia" | "misto";
  tipoVeiculo: "carro" | "moto";
};

// Limite estrito de dados M2M contratado por veículo na operadora
export const TETO_FRANQUIA_M2M_MB = 20.0;

// Margem de segurança mínima de engenharia de telecom (Buffer de 20% obrigatório)
export const TETO_SEGURO_ENGENHARIA_MB = 16.0; // 80% de 20 MB

// ─────────────────────────────────────────────────────────────────────────────
// PREMISSA DE TELECOMUNICAÇÃO CELULAR M2M (COMPROVAÇÃO REAL NO LARA / ALGAR)
// ─────────────────────────────────────────────────────────────────────────────
// Em repouso (veículo desligado na garagem), cada transmissão de rádio (Heartbeat ou
// posição estática) acorda o rádio 4G LTE do modem e envolve:
// 1. Sinalização de canal físico LTE (RRC Connection) + contexto PDP / EPS Bearer
// 2. Pilha de rede TCP/IP completa (SYN/ACK, dados, ACK bidirecional do receptor 7003)
// 3. Bilhetagem por bloco de dados (CDR) na tarifação da operadora de telecomunicações
//
// Comprovação factual auditada no Lara (veículo parado 100% dos dias 24 e 25/10):
// - Com HBT a cada 240s (360 transmissões/dia): consumo medido = 1,46 MB/dia (~43,8 MB/mês) -> ESTOURO.
// - Com HBT a cada 600s (144 transmissões/dia): consumo projetado = 0,58 MB/dia (~17,4 MB/mês) -> SEGURO.
// - Com HBT a cada 900s (96 transmissões/dia): consumo projetado = 0,38 MB/dia (~11,5 MB/mês) -> ECONÔMICO.
//
// CORREÇÃO 25/10: O custo CDR real por evento INDIVIDUAL é ~512 bytes (0.5 KB) por transmissão
// (payload GT06 + overhead TCP/IP + cabeçalhos LTE + arredondamento CDR da operadora).
// O valor anterior de 4096 bytes era a MÉDIA PONDERADA MACRO incluindo reconexões, retransmissões
// e overhead acumulado — NÃO o custo individual de cada pacote.
export const BYTES_CDR_POR_EVENTO_INDIVIDUAL = 512; // 0.5 KB custo CDR real por transmissão individual
export const BYTES_FATURADOS_POR_EVENTO_REPOUSO_CELULAR = 4096; // 4 KB = custo médio ponderado macro (com overhead acumulado)
export const OVERHEAD_DNS_POR_RECONEXAO_BYTES = 180; // Consulta UDP porta 53 eliminada com IP fixo 167.234.233.82

// Custo basal fixo de rede M2M não influenciado pelos parâmetros do usuário:
// 1. Handshake TCP/IP (SYN/ACK) a cada transição de antena/torre da operadora: ~1.0 MB/mês
// 2. Keep-Alives de socket da operadora para impedir fechamento de porta NAT: ~0.8 MB/mês
// 3. Eventos físicos de ignição liga/desliga (fio laranja ACC diário): ~0.2 MB/mês
// 4. Retransmissões e timeouts TCP em áreas de sombra, túneis e subsolos: ~0.8 MB/mês
export const CONSUMO_BASAL_FIXO_OPERADORA_MB = 2.8;

export interface DiagnosticoTelecomRepouso {
  transmissoesRepousoPorDia: number;
  mbRepousoPorDia: number;
  mbRepousoPorMes: number;
  riscoEstouroRepouso: boolean;
  alertaMensagem: string;
}

export function calcularDiagnosticoTelecomRepouso(
  hbtDesligadoSegundos: number,
  timerParadoSegundos: number,
  horasRepousoDia: number = 20,
): DiagnosticoTelecomRepouso {
  const segundosRep = Math.max(0, horasRepousoDia) * 3600;
  const hbtValido = Math.max(60, hbtDesligadoSegundos || 600);
  const timerValido = Math.max(300, timerParadoSegundos || 3600);

  const hbtsDia = Math.floor(segundosRep / hbtValido);
  const pingsPosDia = Math.floor(segundosRep / timerValido);
  const transmissoesTotais = hbtsDia + pingsPosDia;

  const bytesDia = transmissoesTotais * BYTES_FATURADOS_POR_EVENTO_REPOUSO_CELULAR;
  const mbRepousoPorDia = Number((bytesDia / (1024 * 1024)).toFixed(3));
  const mbRepousoPorMes = Number((mbRepousoPorDia * 30).toFixed(2));
  const riscoEstouroRepouso = mbRepousoPorMes > TETO_SEGURO_ENGENHARIA_MB;

  let alertaMensagem = "Parâmetros de repouso seguros dentro da franquia de 20 MB.";
  if (mbRepousoPorMes > TETO_FRANQUIA_M2M_MB) {
    alertaMensagem = `CRÍTICO: O consumo em repouso (${mbRepousoPorMes} MB/mês) sozinho estoura a franquia de 20 MB sem o veículo rodar nem 1 km. Eleve o Heartbeat para pelo menos 600s (10 min).`;
  } else if (riscoEstouroRepouso) {
    alertaMensagem = `ATENÇÃO: O consumo em repouso (${mbRepousoPorMes} MB/mês) consome mais de 80% da franquia, deixando pouca margem para a condução.`;
  }

  return {
    transmissoesRepousoPorDia: transmissoesTotais,
    mbRepousoPorDia,
    mbRepousoPorMes,
    riscoEstouroRepouso,
    alertaMensagem,
  };
}

// Presets de teste para avaliação rápida do operador
export const PRESETS_COMPARATIVOS: {
  id: string;
  nome: string;
  rotuloCurto: string;
  descricao: string;
  params: ParametrosPadraoComparativo;
}[] = [
  {
    id: "super-economico",
    nome: "Super Econômico (Baixo Tráfego)",
    rotuloCurto: "Super Econômico",
    descricao: "Timer 30s, ângulo 25° e heartbeats estendidos. Máxima folga na franquia.",
    params: {
      nome: "Super Econômico",
      timerMovimento: 30,
      timerParado: 1800,
      anguloHabilitado: true,
      anguloGrau: 25,
      anguloIntervalo: 15,
      hbtLigado: 180,
      hbtDesligado: 600,
      modoEconomiaParada: true,
      sensibilidadeGSensor: 4,
      pacoteEstendidoIexvol: true,
    },
  },
  {
    id: "angulo-10-arriscado",
    nome: "Ângulo 10° (Armadilha de Jitter)",
    rotuloCurto: "Ângulo 10° (Jitter)",
    descricao: "Timer 10s e ângulo 10°. Demonstra como oscilações de reta disparam pings espúrios.",
    params: {
      nome: "Ângulo 10° (Arriscado)",
      timerMovimento: 10,
      timerParado: 1800,
      anguloHabilitado: true,
      anguloGrau: 10,
      anguloIntervalo: 8,
      hbtLigado: 120,
      hbtDesligado: 240,
      modoEconomiaParada: true,
      sensibilidadeGSensor: 3,
      pacoteEstendidoIexvol: true,
    },
  },
  {
    id: "sem-economia-garagem",
    nome: "Sem Economia na Garagem (SENDS=0)",
    rotuloCurto: "Sem Sleep Garagem",
    descricao: "Rastreador continua transmitindo periodicamente parado. Alto consumo em repouso.",
    params: {
      nome: "Sem Economia Garagem",
      timerMovimento: 15,
      timerParado: 600,
      anguloHabilitado: true,
      anguloGrau: 15,
      anguloIntervalo: 10,
      hbtLigado: 120,
      hbtDesligado: 120,
      modoEconomiaParada: false, // Disparo contínuo na garagem
      sensibilidadeGSensor: 2,
      pacoteEstendidoIexvol: true,
    },
  },
  {
    id: "sem-angulo",
    nome: "Sem Detecção de Curva (Desligado)",
    rotuloCurto: "Sem Ângulo Curva",
    descricao: "Ângulo desligado. Simula a perda de vértices e o corte em quarteirões.",
    params: {
      nome: "Sem Curvas (Timer Puro)",
      timerMovimento: 15,
      timerParado: 1800,
      anguloHabilitado: false,
      anguloGrau: 15,
      anguloIntervalo: 10,
      hbtLigado: 120,
      hbtDesligado: 240,
      modoEconomiaParada: true,
      sensibilidadeGSensor: 3,
      pacoteEstendidoIexvol: true,
    },
  },
];
