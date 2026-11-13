// Hunter — Servico Canônico de Degustação Master e Sandbox Fictício
// Modo 100% isolado para avaliacao completa do sistema sem contaminar o banco real
// Proibicao Absoluta do caractere comercial proibido em todo o codigo e comentarios

import type { UserSession } from "@/features/auth/types";
import type { VeiculoGps, TrajetoViagem, PosicaoHistorico } from "@/features/monitor-gps/types";

const CHAVE_STORAGE_ESTADO = "hunter_degustacao_master_estado_v1";
const CHAVE_STORAGE_PRIMEIRO_ACESSO = "hunter_degustacao_primeiro_acesso_v1";
const DURACAO_DEGUSTACAO_MS = 24 * 60 * 60 * 1000; // Exatamente 24 horas

export interface EstadoDegustacaoMaster {
  veiculos: VeiculoGps[];
  comandosExecutados: Array<{
    veiculoId: string;
    comando: string;
    dataHora: string;
    sucesso: boolean;
  }>;
}

// 1. Frota Ficticia de Alta Fidelidade (Zero Dados Reais, Zero AXH0E44)
export const FROTA_DEGUSTACAO_MASTER_INICIAL: VeiculoGps[] = [
  {
    id: "deg-veic-001",
    cliente_id: "deg-cli-001",
    cliente_user_id: "deg-user-cli-001",
    cliente_nome: "Transportadora Alianca Logistica e Frotas",
    cliente_telefone: "(24) 99876-5432",
    cliente_plano: "Protecao Total e Rastreamento 24h",
    privacidade_localizacao: true,
    placa: "DEG-2026",
    chassi: "9BWZZZ377VT001234",
    marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
    cor: "Preto Crystal",
    ano: 2024,
    tipo_veiculo: "suv",
    ignicao: true,
    bloqueado: false,
    bloqueador_instalado: true,
    tipo_bloqueador: "rele_combustivel",
    bloqueador_detalhes: "Corte eletronico temporizado de bomba de combustivel",
    sinal_gsm: 96,
    rele_status: false,
    velocidade: 52,
    odometro: 18450.4,
    odometro_wgs84_km: 18450.4,
    odometro_cinematico_km: 18450.4,
    odometro_hardware_km: 18450.0,
    odometro_hardware_atualizado_em: new Date().toISOString(),
    latitude: -22.2858,
    longitude: -42.5311,
    voltagem: 13.8,
    bateria_veiculo_v: 13.8,
    bateria_rastreador_pct: 100,
    bateria_rastreador_status: "carregando",
    alimentacao_externa: true,
    satelites: 18,
    rumo: 145,
    inclinacao_graus: 1,
    vibracao_g: 0.05,
    alerta_acidente: false,
    alerta_tipo: undefined,
    ultima_atualizacao: new Date().toISOString(),
    status_operacional: "em_rota",
    rastreador_id: "deg-rast-001",
    rastreador_imei: "864201060012345",
  },
  {
    id: "deg-veic-002",
    cliente_id: "deg-cli-002",
    cliente_user_id: "deg-user-cli-002",
    cliente_nome: "Carlos Eduardo Mendes",
    cliente_telefone: "(24) 98111-2233",
    cliente_plano: "Protecao Total e Rastreamento 24h",
    privacidade_localizacao: true,
    placa: "FLX-1010",
    chassi: "9BG118744RC554321",
    marca_modelo: "GM Montana Premier 1.2 Turbo Flex",
    cor: "Prata Shark",
    ano: 2024,
    tipo_veiculo: "camionete",
    ignicao: false,
    bloqueado: false,
    bloqueador_instalado: true,
    tipo_bloqueador: "rele_combustivel",
    bloqueador_detalhes: "Rele auxiliar micro 12V 40A",
    sinal_gsm: 88,
    rele_status: false,
    velocidade: 0,
    odometro: 12380.2,
    odometro_wgs84_km: 12380.2,
    odometro_cinematico_km: 12380.2,
    odometro_hardware_km: 12380.0,
    odometro_hardware_atualizado_em: new Date().toISOString(),
    latitude: -22.523,
    longitude: -44.104,
    voltagem: 12.6,
    bateria_veiculo_v: 12.6,
    bateria_rastreador_pct: 98,
    bateria_rastreador_status: "completa",
    alimentacao_externa: true,
    satelites: 16,
    rumo: 0,
    inclinacao_graus: 0,
    vibracao_g: 0.0,
    alerta_acidente: false,
    alerta_tipo: undefined,
    ultima_atualizacao: new Date().toISOString(),
    status_operacional: "estacionado",
    rastreador_id: "deg-rast-002",
    rastreador_imei: "864201060054321",
  },
  {
    id: "deg-veic-003",
    cliente_id: "deg-cli-003",
    cliente_user_id: "deg-user-cli-003",
    cliente_nome: "Dra. Patricia Silveira",
    cliente_telefone: "(24) 99222-7788",
    cliente_plano: "Rastreamento e Telemetria Avancada",
    privacidade_localizacao: true,
    placa: "COR-4040",
    chassi: "9BRBB48E6M5987654",
    marca_modelo: "Toyota Corolla Cross XRE 2.0",
    cor: "Branco Polar",
    ano: 2025,
    tipo_veiculo: "suv",
    ignicao: true,
    bloqueado: false,
    bloqueador_instalado: true,
    tipo_bloqueador: "rele_combustivel",
    bloqueador_detalhes: "Corte eletronico temporizado",
    sinal_gsm: 94,
    rele_status: false,
    velocidade: 64,
    odometro: 9540.6,
    odometro_wgs84_km: 9540.6,
    odometro_cinematico_km: 9540.6,
    odometro_hardware_km: 9540.0,
    odometro_hardware_atualizado_em: new Date().toISOString(),
    latitude: -22.545,
    longitude: -44.172,
    voltagem: 14.1,
    bateria_veiculo_v: 14.1,
    bateria_rastreador_pct: 100,
    bateria_rastreador_status: "carregando",
    alimentacao_externa: true,
    satelites: 20,
    rumo: 85,
    inclinacao_graus: 2,
    vibracao_g: 0.08,
    alerta_acidente: false,
    alerta_tipo: undefined,
    ultima_atualizacao: new Date().toISOString(),
    status_operacional: "em_rota",
    rastreador_id: "deg-rast-003",
    rastreador_imei: "864201060098765",
  },
];

// Identifica se a sessao atual esta em Modo Degustacao Master
export function isModoDegustacao(session?: UserSession | null): boolean {
  if (!session) return false;
  if (session.isDegustacao) return true;
  if (session.role === "cliente_degustacao") return true;
  if (session.isSuperAdminAuditor) return true;
  if (session.isAuditor) return true;
  if (session.role === "superadmin_auditor") return true;
  if ((session.role as string) === "degustacao") return true;
  return false;
}

// Carrega o estado simulado em memoria e sessionStorage sem persistencia em banco real
export function carregarEstadoDegustacaoMaster(): EstadoDegustacaoMaster {
  if (typeof window === "undefined") {
    return {
      veiculos: [...FROTA_DEGUSTACAO_MASTER_INICIAL],
      comandosExecutados: [],
    };
  }

  try {
    const raw = sessionStorage.getItem(CHAVE_STORAGE_ESTADO);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.veiculos)) {
        return parsed as EstadoDegustacaoMaster;
      }
    }
  } catch {
    // quota ou parse error
  }

  const inicial: EstadoDegustacaoMaster = {
    veiculos: [...FROTA_DEGUSTACAO_MASTER_INICIAL],
    comandosExecutados: [],
  };

  try {
    sessionStorage.setItem(CHAVE_STORAGE_ESTADO, JSON.stringify(inicial));
  } catch {
    // ignora
  }

  return inicial;
}

export function salvarEstadoDegustacaoMaster(estado: EstadoDegustacaoMaster): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAVE_STORAGE_ESTADO, JSON.stringify(estado));
  } catch {
    // quota exceeded
  }
}

// Retorna veiculos da demonstracao master
export function obterVeiculosDegustacaoMaster(): VeiculoGps[] {
  const estado = carregarEstadoDegustacaoMaster();
  return estado.veiculos;
}

// Executa comando de bloqueio ou desbloqueio simulado com sucesso imediato na sessao
export function executarComandoBloqueioDegustacao(
  veiculoId: string,
  bloquear: boolean,
): { sucesso: boolean; mensagem: string; bloqueado: boolean } {
  const estado = carregarEstadoDegustacaoMaster();
  const vIndex = estado.veiculos.findIndex((v) => v.id === veiculoId);

  if (vIndex >= 0) {
    estado.veiculos[vIndex].bloqueado = bloquear;
    estado.veiculos[vIndex].rele_status = bloquear;
    estado.veiculos[vIndex].status_operacional = bloquear ? "bloqueado" : "estacionado";
  }

  estado.comandosExecutados.push({
    veiculoId,
    comando: bloquear ? "RELAY,1#" : "RELAY,0#",
    dataHora: new Date().toISOString(),
    sucesso: true,
  });

  salvarEstadoDegustacaoMaster(estado);

  return {
    sucesso: true,
    mensagem: bloquear
      ? "Comando de Bloqueio executado com sucesso no Modo Degustacao (Simulacao Master)."
      : "Comando de Desbloqueio executado com sucesso no Modo Degustacao (Simulacao Master).",
    bloqueado: bloquear,
  };
}

// 2. Viagens e Telemetria Ficticia para Playback e Refazer Trajeto
export function obterViagensDegustacaoMaster(veiculoId?: string): TrajetoViagem[] {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  const vId = veiculoId || "deg-veic-001";

  return [
    {
      id: "deg-viagem-001",
      veiculo_id: vId,
      inicio_at: `${ano}-${mes}-${dia}T08:15:00.000Z`,
      fim_at: `${ano}-${mes}-${dia}T09:20:00.000Z`,
      km_percorrido: 42.6,
      velocidade_media: 48,
      velocidade_maxima: 82,
      status: "concluido",
    },
    {
      id: "deg-viagem-002",
      veiculo_id: vId,
      inicio_at: `${ano}-${mes}-${dia}T11:00:00.000Z`,
      fim_at: `${ano}-${mes}-${dia}T11:45:00.000Z`,
      km_percorrido: 28.1,
      velocidade_media: 44,
      velocidade_maxima: 76,
      status: "concluido",
    },
    {
      id: "deg-viagem-003",
      veiculo_id: vId,
      inicio_at: `${ano}-${mes}-${dia}T14:10:00.000Z`,
      fim_at: `${ano}-${mes}-${dia}T15:05:00.000Z`,
      km_percorrido: 35.4,
      velocidade_media: 51,
      velocidade_maxima: 88,
      status: "concluido",
    },
  ];
}

// Pontos de telemetria simulados ao longo de via real
export function obterPontosViagemDegustacaoMaster(
  veiculoId?: string,
  inicioAt?: string,
  fimAt?: string | null,
): PosicaoHistorico[] {
  const coordsBase = [
    { lat: -22.2858, lng: -42.5311, vel: 0, ign: true },
    { lat: -22.2862, lng: -42.5325, vel: 28, ign: true },
    { lat: -22.287, lng: -42.534, vel: 42, ign: true },
    { lat: -22.2885, lng: -42.5362, vel: 55, ign: true },
    { lat: -22.2902, lng: -42.539, vel: 60, ign: true },
    { lat: -22.2925, lng: -42.542, vel: 68, ign: true },
    { lat: -22.294, lng: -42.5455, vel: 62, ign: true },
    { lat: -22.296, lng: -42.5488, vel: 50, ign: true },
    { lat: -22.2975, lng: -42.5512, vel: 35, ign: true },
    { lat: -22.2988, lng: -42.553, vel: 0, ign: false },
  ];

  const baseTime = inicioAt ? new Date(inicioAt).getTime() : Date.now() - 3600 * 1000;

  return coordsBase.map((c, i) => ({
    id: 9000 + i,
    latitude: c.lat,
    longitude: c.lng,
    velocidade: c.vel,
    ignicao: c.ign,
    odometro: 18450.0 + i * 0.4,
    bateria_veiculo_v: 13.8,
    bateria_rastreador_pct: 100,
    rumo: 145,
    inclinacao_graus: 1,
    vibracao_g: 0.05,
    data_hora_gps: new Date(baseTime + i * 60 * 1000).toISOString(),
  }));
}

// 3. Clientes Simulados para Gestao Comercial
export function obterClientesDegustacaoMaster(): any[] {
  return [
    {
      id: "deg-cli-001",
      nome_razao_social: "Transportadora Alianca Logistica e Frotas",
      documento: "12.345.678/0001-90",
      email: "diretoria@aliancalog.com.br",
      telefone: "(24) 99876-5432",
      plano: "Protecao Total e Rastreamento 24h",
      valor_plano: 239.7,
      dia_vencimento: 10,
      ativo: true,
      veiculos: [FROTA_DEGUSTACAO_MASTER_INICIAL[0]],
    },
    {
      id: "deg-cli-002",
      nome_razao_social: "Carlos Eduardo Mendes",
      documento: "111.222.333-44",
      email: "carlos.mendes@email.com",
      telefone: "(24) 98111-2233",
      plano: "Protecao Total e Rastreamento 24h",
      valor_plano: 79.9,
      dia_vencimento: 15,
      ativo: true,
      veiculos: [FROTA_DEGUSTACAO_MASTER_INICIAL[1]],
    },
    {
      id: "deg-cli-003",
      nome_razao_social: "Dra. Patricia Silveira",
      documento: "555.666.777-88",
      email: "patricia.silveira@clinica.med.br",
      telefone: "(24) 99222-7788",
      plano: "Rastreamento e Telemetria Avancada",
      valor_plano: 69.9,
      dia_vencimento: 5,
      ativo: true,
      veiculos: [FROTA_DEGUSTACAO_MASTER_INICIAL[2]],
    },
  ];
}

// 4. Metricas Ficticias do Financeiro e DRE
export function obterFinanceiroDegustacaoMaster(): any {
  return {
    faturamentoMensal: 48500.0,
    recebimentoPrevisto: 52100.0,
    taxaInadimplenciaPct: 2.1,
    veiculosAtivosTotal: 142,
    novasAtivacoesMes: 18,
    ticketMedio: 79.9,
    dreResumo: {
      receitaBruta: 48500.0,
      custoOperacionalChips: 4260.0,
      custoServidoresCloud: 1850.0,
      comissoesParceiros: 5800.0,
      lucroLiquido: 36590.0,
      margemLiquidaPct: 75.4,
    },
  };
}

// 5. Status de Defesa Cibernetica e Governanca
export function obterStatusSegurancaDegustacaoMaster(): any {
  return {
    statusGeral: "verde",
    eficienciaGlobal: "4.35",
    matrizRisco: {
      media: 4.35,
      total: 5.0,
      ponderada: 4.35,
    },
    modulosAtivosTotal: 12,
    vetoresAtaqueMitigadosTotal: 51,
    auditoriaRls: {
      totalTabelas: 38,
      tabelasProtegidas: 38,
      isolamentoTenantPct: 100,
    },
    anomaliasDetectadas: 0,
    bloqueiosAtivos: 0,
    honeypotsOperantes: 4,
  };
}

// 6. Governanca da Expiracao em 24h apos o 1º Acesso
function lerRegistroDegustacaoLocal(chaveUsuario: string): {
  primeiroAcessoEm: string | null;
  revalidadaEm: string | null;
} {
  if (typeof window === "undefined") {
    return { primeiroAcessoEm: null, revalidadaEm: null };
  }
  try {
    const raw = localStorage.getItem(chaveUsuario);
    if (!raw) return { primeiroAcessoEm: null, revalidadaEm: null };
    if (raw.trim().startsWith("{")) {
      const parsed = JSON.parse(raw);
      return {
        primeiroAcessoEm:
          typeof parsed?.primeiroAcessoEm === "string" ? parsed.primeiroAcessoEm : null,
        revalidadaEm: typeof parsed?.revalidadaEm === "string" ? parsed.revalidadaEm : null,
      };
    }
    // Compatibilidade com formato legado ISO puro
    return { primeiroAcessoEm: raw, revalidadaEm: null };
  } catch {
    return { primeiroAcessoEm: null, revalidadaEm: null };
  }
}

function gravarRegistroDegustacaoLocal(
  chaveUsuario: string,
  primeiroAcessoEm: string,
  revalidadaEm?: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      chaveUsuario,
      JSON.stringify({
        primeiroAcessoEm,
        revalidadaEm: revalidadaEm || null,
      }),
    );
  } catch {
    // quota
  }
}

function timestampValidoMs(iso?: string | null): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

export function verificarExpiracaoDegustacao(
  userId?: string,
  email?: string,
  primeiroAcessoForcadoIso?: string | null,
  opcoes?: {
    expiraEmIso?: string | null;
    revalidadaEmIso?: string | null;
    apenasConsultar?: boolean;
  },
): {
  expirado: boolean;
  minutosRestantes: number;
  horasRestantes: number;
  textoFormatado: string;
  expiraEmIso: string;
  primeiroAcessoEm: string;
} {
  const chaveUsuario = userId
    ? `${CHAVE_STORAGE_PRIMEIRO_ACESSO}_${userId}`
    : CHAVE_STORAGE_PRIMEIRO_ACESSO;
  const revalidadaEmIso = opcoes?.revalidadaEmIso ?? null;
  const revalidadaMs = timestampValidoMs(revalidadaEmIso);

  let primeiroAcessoStr =
    typeof primeiroAcessoForcadoIso === "string"
      ? !Number.isNaN(timestampValidoMs(primeiroAcessoForcadoIso))
        ? primeiroAcessoForcadoIso
        : null
      : null;

  // Se o valor forcado e mais antigo do que a ultima revalidacao, descarta para aguardar novo 1o acesso
  if (primeiroAcessoStr) {
    if (!Number.isNaN(revalidadaMs)) {
      if (timestampValidoMs(primeiroAcessoStr) < revalidadaMs) {
        primeiroAcessoStr = null;
      }
    }
  }

  if (primeiroAcessoStr) {
    gravarRegistroDegustacaoLocal(chaveUsuario, primeiroAcessoStr, revalidadaEmIso);
  }

  if (!primeiroAcessoStr) {
    if (primeiroAcessoForcadoIso !== null) {
      const localReg = lerRegistroDegustacaoLocal(chaveUsuario);
      if (localReg.primeiroAcessoEm) {
        if (!Number.isNaN(timestampValidoMs(localReg.primeiroAcessoEm))) {
          const localPrimeiroMs = timestampValidoMs(localReg.primeiroAcessoEm);
          let invalidadoPorRevalidacao = false;
          if (!Number.isNaN(revalidadaMs)) {
            if (localReg.revalidadaEm) {
              if (localReg.revalidadaEm !== revalidadaEmIso) {
                invalidadoPorRevalidacao = true;
              }
            } else if (localPrimeiroMs < revalidadaMs) {
              invalidadoPorRevalidacao = true;
            }
          }
          if (!invalidadoPorRevalidacao) {
            primeiroAcessoStr = localReg.primeiroAcessoEm;
          }
        }
      }
    }
  }

  // Se ainda nao houver registro de primeiro acesso (ou foi invalidado por revalidacao), inicializa agora
  if (!primeiroAcessoStr) {
    primeiroAcessoStr = new Date().toISOString();
    if (!opcoes?.apenasConsultar) {
      gravarRegistroDegustacaoLocal(chaveUsuario, primeiroAcessoStr, revalidadaEmIso);
    }
  }

  const primeiroAcessoMs = timestampValidoMs(primeiroAcessoStr);
  const expiraForcadaMs = timestampValidoMs(opcoes?.expiraEmIso);
  const expiraEmMs = !Number.isNaN(expiraForcadaMs)
    ? expiraForcadaMs
    : primeiroAcessoMs + DURACAO_DEGUSTACAO_MS;
  const agoraMs = Date.now();
  const deltaMs = expiraEmMs - agoraMs;

  const expirado = deltaMs <= 0;
  const minutosTotais = Math.max(0, Math.floor(deltaMs / (60 * 1000)));
  const horas = Math.floor(minutosTotais / 60);
  const minutos = minutosTotais % 60;

  const textoFormatado = expirado ? "Expirado" : `${horas}h ${String(minutos).padStart(2, "0")}m`;

  return {
    expirado,
    minutosRestantes: minutos,
    horasRestantes: horas,
    textoFormatado,
    expiraEmIso: new Date(expiraEmMs).toISOString(),
    primeiroAcessoEm: primeiroAcessoStr,
  };
}

export function iniciarPrimeiroAcessoDegustacaoSeNecessario(userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const chave = userId
      ? `${CHAVE_STORAGE_PRIMEIRO_ACESSO}_${userId}`
      : CHAVE_STORAGE_PRIMEIRO_ACESSO;
    const existente = lerRegistroDegustacaoLocal(chave);
    if (!existente.primeiroAcessoEm) {
      gravarRegistroDegustacaoLocal(chave, new Date().toISOString(), null);
    }
  } catch {
    // ignora
  }
}

function escolherTimestampMaisRecenteIso(a?: string | null, b?: string | null): string | null {
  const msA = timestampValidoMs(a);
  const msB = timestampValidoMs(b);
  if (!Number.isNaN(msA)) {
    if (!Number.isNaN(msB)) {
      return msA >= msB ? (a as string) : (b as string);
    }
    return a as string;
  }
  if (!Number.isNaN(msB)) return b as string;
  return null;
}

/**
 * Sincroniza o 1º acesso da degustação diretamente com o servidor (PostgreSQL RPC + fallback user_metadata),
 * garantindo que a contagem de 24h comece apenas no 1º login real e respeite revalidações entre dispositivos.
 */
export async function sincronizarPrimeiroAcessoDegustacaoServidor(
  supabaseClient: any,
  userId: string,
  profileData?: {
    degustacao_primeiro_acesso_em?: string | null;
    degustacao_expira_em?: string | null;
    degustacao_revalidada_em?: string | null;
  } | null,
  userMetadata?: Record<string, any> | null,
): Promise<{
  primeiroAcessoEm: string;
  expiraEmIso: string;
  revalidadaEmIso: string | null;
  expirado: boolean;
}> {
  if (supabaseClient) {
    if (typeof supabaseClient.rpc === "function") {
      try {
        const { data, error } = await supabaseClient.rpc("registrar_primeiro_acesso_degustacao", {
          p_user_id: userId,
        });
        if (!error) {
          if (data) {
            if (data.sucesso === true) {
              if (data.primeiro_acesso_em) {
                const expiraServidor = typeof data.expira_em === "string" ? data.expira_em : null;
                const revalidadaServidor =
                  typeof data.revalidada_em === "string" ? data.revalidada_em : null;
                const info = verificarExpiracaoDegustacao(
                  userId,
                  undefined,
                  data.primeiro_acesso_em,
                  {
                    expiraEmIso: expiraServidor,
                    revalidadaEmIso: revalidadaServidor,
                  },
                );
                return {
                  primeiroAcessoEm: info.primeiroAcessoEm,
                  expiraEmIso: expiraServidor || info.expiraEmIso,
                  revalidadaEmIso: revalidadaServidor,
                  expirado: typeof data.expirado === "boolean" ? data.expirado : info.expirado,
                };
              }
            }
          }
        }
      } catch {
        // Fallback caso RPC ainda nao tenha sido aplicada no ambiente remoto (PGRST202)
      }
    }
  }

  const revalidadaEmIso = escolherTimestampMaisRecenteIso(
    profileData?.degustacao_revalidada_em,
    userMetadata?.degustacao_revalidada_em,
  );
  const revalidadaMs = timestampValidoMs(revalidadaEmIso);

  let primeiroAcessoBanco =
    profileData?.degustacao_primeiro_acesso_em ??
    userMetadata?.degustacao_primeiro_acesso_em ??
    null;
  let expiraBanco = profileData?.degustacao_expira_em ?? userMetadata?.degustacao_expira_em ?? null;

  if (primeiroAcessoBanco) {
    if (!Number.isNaN(revalidadaMs)) {
      if (!Number.isNaN(timestampValidoMs(primeiroAcessoBanco))) {
        if (timestampValidoMs(primeiroAcessoBanco) < revalidadaMs) {
          primeiroAcessoBanco = null;
          expiraBanco = null;
        }
      }
    }
  }

  if (primeiroAcessoBanco) {
    if (!Number.isNaN(timestampValidoMs(primeiroAcessoBanco))) {
      const info = verificarExpiracaoDegustacao(userId, undefined, primeiroAcessoBanco, {
        expiraEmIso: expiraBanco,
        revalidadaEmIso,
      });
      return {
        primeiroAcessoEm: info.primeiroAcessoEm,
        expiraEmIso: expiraBanco || info.expiraEmIso,
        revalidadaEmIso,
        expirado: info.expirado,
      };
    }
  }

  // Primeiro acesso real (ou apos REVALIDA): inicia agora e tenta persistir no servidor em modo fallback
  const info = verificarExpiracaoDegustacao(userId, undefined, null, {
    revalidadaEmIso,
  });

  if (supabaseClient) {
    if (userId) {
      try {
        if (typeof supabaseClient.from === "function") {
          await supabaseClient
            .from("profiles")
            .update({
              degustacao_primeiro_acesso_em: info.primeiroAcessoEm,
              degustacao_expira_em: info.expiraEmIso,
            })
            .eq("id", userId);
        }
      } catch {
        // Silencioso caso schema remoto ainda nao tenha as colunas ou RLS bloqueie update direto
      }
      try {
        if (supabaseClient.auth) {
          if (typeof supabaseClient.auth.updateUser === "function") {
            await supabaseClient.auth.updateUser({
              data: {
                degustacao_primeiro_acesso_em: info.primeiroAcessoEm,
                degustacao_expira_em: info.expiraEmIso,
              },
            });
          }
        }
      } catch {
        // Silencioso se updateUser estiver indisponivel
      }
    }
  }

  return {
    primeiroAcessoEm: info.primeiroAcessoEm,
    expiraEmIso: info.expiraEmIso,
    revalidadaEmIso,
    expirado: info.expirado,
  };
}

// 7. Chancela de Simulacao Padronizada para PDFs (Laudo Pericial e Telemetria)
export function aplicarChancelaSimulacaoPdf(doc: any, tituloDocumento?: string): void {
  const pageCount = doc.internal.getNumberOfPages();
  const width = doc.internal.pageSize.width;
  const height = doc.internal.pageSize.height;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Faixa Superior Destacada de Alerta em Ambar / Laranja
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(0, 0, width, 5.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(
      "CHANCELA DE SIMULACAO · DOCUMENTO DEMONSTRATIVO SEM VALIDADE JURIDICA",
      width / 2,
      3.8,
      { align: "center" },
    );

    // Marca d'Agua Diagonal Semitransparente no Centro da Folha
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(242, 230, 215); // Bege suave de alto contraste legivel
    doc.text("CHANCELA DE SIMULACAO · DEMONSTRATIVO", width / 2 - 60, height / 2 + 10, {
      angle: 35,
    });
  }
}

// 8. Abastecimentos Ficticios com Dados Detalhados e OCR de NF-e
export function obterAbastecimentosDegustacaoMaster(): any[] {
  const hoje = new Date();
  const d1 = new Date(hoje.getTime() - 2 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const d2 = new Date(hoje.getTime() - 5 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const d3 = new Date(hoje.getTime() - 9 * 24 * 3600 * 1000).toISOString().split("T")[0];

  return [
    {
      id: "deg-abast-001",
      motorista_id: "deg-mot-001",
      veiculo_id: "deg-veic-001",
      cliente_id: "deg-cli-001",
      data_abastecimento: d1,
      km_atual: 18450,
      litros: 58.4,
      valor_total: 356.24,
      valor_por_litro: 6.1,
      combustivel: "diesel_s10",
      posto_nome: "Auto Posto Ipiranga Rota Sul",
      posto_cidade: "Volta Redonda/RJ",
      nf_numero: "000.045.912",
      nf_foto_url: null,
      nf_upload_em: new Date(hoje.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
      nf_baixado: true,
      nf_expirado: false,
      observacoes: "Tanque cheio para viagem de entrega operacional. Leitura OCR homologada.",
      created_at: new Date(hoje.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(hoje.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
      motorista_nome: "Marcos Aurelio de Souza",
      veiculo_placa: "DEG-2026",
    },
    {
      id: "deg-abast-002",
      motorista_id: "deg-mot-002",
      veiculo_id: "deg-veic-002",
      cliente_id: "deg-cli-001",
      data_abastecimento: d2,
      km_atual: 12380,
      litros: 44.0,
      valor_total: 268.4,
      valor_por_litro: 6.1,
      combustivel: "gasolina_aditivada",
      posto_nome: "Posto Shell Alvorada",
      posto_cidade: "Barra Mansa/RJ",
      nf_numero: "000.088.123",
      nf_foto_url: null,
      nf_upload_em: new Date(hoje.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
      nf_baixado: true,
      nf_expirado: false,
      observacoes: "Abastecimento semanal de rotina operacional.",
      created_at: new Date(hoje.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(hoje.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
      motorista_nome: "Roberto Carlos Ferreira",
      veiculo_placa: "FLX-1010",
    },
    {
      id: "deg-abast-003",
      motorista_id: "deg-mot-003",
      veiculo_id: "deg-veic-003",
      cliente_id: "deg-cli-001",
      data_abastecimento: d3,
      km_atual: 9540,
      litros: 38.5,
      valor_total: 226.76,
      valor_por_litro: 5.89,
      combustivel: "gasolina",
      posto_nome: "Posto Petrobras BR Mania",
      posto_cidade: "Resende/RJ",
      nf_numero: "000.104.521",
      nf_foto_url: null,
      nf_upload_em: new Date(hoje.getTime() - 9 * 24 * 3600 * 1000).toISOString(),
      nf_baixado: true,
      nf_expirado: false,
      observacoes: "Rota executiva de vistoria e acompanhamento.",
      created_at: new Date(hoje.getTime() - 9 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(hoje.getTime() - 9 * 24 * 3600 * 1000).toISOString(),
      motorista_nome: "Vanessa Cristina Lima",
      veiculo_placa: "COR-4040",
    },
  ];
}

// 9. Motoristas Ficticios com CNH e Score de Conducao
export function obterMotoristasDegustacaoMaster(): any[] {
  return [
    {
      id: "deg-mot-001",
      cliente_id: "deg-cli-001",
      user_id: "deg-user-mot-001",
      nome: "Marcos Aurelio de Souza",
      cpf: "123.456.789-00",
      data_nascimento: "1985-04-12",
      telefone: "(24) 99123-4567",
      email: "marcos.souza@transportes.com.br",
      cnh_numero: "04987654321",
      cnh_categoria: "D",
      cnh_validade: "2028-06-20",
      cnh_primeira_habilitacao: "2004-03-10",
      cnh_renach: "RJ123456789",
      cnh_observacoes: "Motorista senior de frotas rodoviarias. Treinamento defensivo atualizado.",
      cnh_foto_url: null,
      acesso_mapa: true,
      ativo: true,
      created_at: "2024-01-10T10:00:00.000Z",
      updated_at: "2024-01-10T10:00:00.000Z",
      cliente_nome: "Transportadora Alianca Logistica e Frotas",
    },
    {
      id: "deg-mot-002",
      cliente_id: "deg-cli-001",
      user_id: "deg-user-mot-002",
      nome: "Roberto Carlos Ferreira",
      cpf: "234.567.890-11",
      data_nascimento: "1990-08-25",
      telefone: "(24) 99234-5678",
      email: "roberto.ferreira@transportes.com.br",
      cnh_numero: "05876543210",
      cnh_categoria: "B",
      cnh_validade: "2027-11-15",
      cnh_primeira_habilitacao: "2009-09-15",
      cnh_renach: "RJ234567890",
      cnh_observacoes: "Condutor dedicado para entregas urbanas expressas.",
      cnh_foto_url: null,
      acesso_mapa: true,
      ativo: true,
      created_at: "2024-02-15T11:00:00.000Z",
      updated_at: "2024-02-15T11:00:00.000Z",
      cliente_nome: "Transportadora Alianca Logistica e Frotas",
    },
    {
      id: "deg-mot-003",
      cliente_id: "deg-cli-001",
      user_id: "deg-user-mot-003",
      nome: "Vanessa Cristina Lima",
      cpf: "345.678.901-22",
      data_nascimento: "1992-12-05",
      telefone: "(24) 99345-6789",
      email: "vanessa.lima@transportes.com.br",
      cnh_numero: "06765432109",
      cnh_categoria: "B",
      cnh_validade: "2029-03-30",
      cnh_primeira_habilitacao: "2011-05-18",
      cnh_renach: "RJ345678901",
      cnh_observacoes: "Supervisora operacional de campo e auditoria de rotas.",
      cnh_foto_url: null,
      acesso_mapa: true,
      ativo: true,
      created_at: "2024-03-01T09:00:00.000Z",
      updated_at: "2024-03-01T09:00:00.000Z",
      cliente_nome: "Transportadora Alianca Logistica e Frotas",
    },
  ];
}

// 10. Manutencao Preventiva e Revisoes Ficticias
export function obterItensManutencaoDegustacaoMaster(veiculoId?: string): any[] {
  const vId = veiculoId || "deg-veic-001";
  return [
    {
      id: "deg-manut-item-001",
      veiculo_id: vId,
      item: "Troca de Oleo do Motor Sintetico 5W30 e Filtro",
      item_manutencao: "Troca de Oleo do Motor Sintetico 5W30 e Filtro",
      categoria: "oleo_motor",
      intervalo_km: 10000,
      intervalo_meses: 6,
      ultimo_km: 10000,
      ultimo_km_realizado: 10000,
      ultima_data: "2026-05-10",
      ultima_data_realizada: "2026-05-10",
      proximo_km: 20000,
      proximo_km_alvo: 20000,
      proxima_data: "2026-11-10",
      proxima_data_alvo: "2026-11-10",
      alerta_km_antecedencia: 500,
      aviso_antecipado_km: 500,
      alerta_dias_antecedencia: 15,
      status: "proxima",
      custo_estimado: 380.0,
      observacoes: "Utilizar especificacao recomendada no manual da montadora.",
      created_at: "2026-01-01T10:00:00.000Z",
      cliente_id: "deg-cli-001",
      placa: "DEG-2026",
      marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
      tipo_veiculo: "suv",
      odometro_atual: 18450,
      horimetro_atual: 450,
      km_restante: 1550,
    },
    {
      id: "deg-manut-item-002",
      veiculo_id: vId,
      item: "Pastilhas de Freio Dianteiras e Discos",
      item_manutencao: "Pastilhas de Freio Dianteiras e Discos",
      categoria: "freios",
      intervalo_km: 25000,
      intervalo_meses: 12,
      ultimo_km: 0,
      ultimo_km_realizado: 0,
      ultima_data: "2025-10-01",
      ultima_data_realizada: "2025-10-01",
      proximo_km: 25000,
      proximo_km_alvo: 25000,
      proxima_data: "2026-10-01",
      proxima_data_alvo: "2026-10-01",
      alerta_km_antecedencia: 1000,
      aviso_antecipado_km: 1000,
      alerta_dias_antecedencia: 30,
      status: "em_dia",
      custo_estimado: 450.0,
      observacoes: "Inspecao de espessura minima das pastilhas e fluido de freio DOT 4.",
      created_at: "2026-01-01T10:00:00.000Z",
      cliente_id: "deg-cli-001",
      placa: "DEG-2026",
      marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
      tipo_veiculo: "suv",
      odometro_atual: 18450,
      horimetro_atual: 450,
      km_restante: 6550,
    },
    {
      id: "deg-manut-item-003",
      veiculo_id: vId,
      item: "Filtro de Ar do Motor e Filtro do Ar-Condicionado",
      item_manutencao: "Filtro de Ar do Motor e Filtro do Ar-Condicionado",
      categoria: "filtros",
      intervalo_km: 15000,
      intervalo_meses: 12,
      ultimo_km: 0,
      ultimo_km_realizado: 0,
      ultima_data: "2025-08-15",
      ultima_data_realizada: "2025-08-15",
      proximo_km: 15000,
      proximo_km_alvo: 15000,
      proxima_data: "2026-08-15",
      proxima_data_alvo: "2026-08-15",
      alerta_km_antecedencia: 500,
      aviso_antecipado_km: 500,
      alerta_dias_antecedencia: 15,
      status: "vencida",
      custo_estimado: 190.0,
      observacoes: "Substituicao preventiva para preservacao do sistema de climatizacao.",
      created_at: "2026-01-01T10:00:00.000Z",
      cliente_id: "deg-cli-001",
      placa: "DEG-2026",
      marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
      tipo_veiculo: "suv",
      odometro_atual: 18450,
      horimetro_atual: 450,
      km_restante: -3450,
    },
    {
      id: "deg-manut-item-004",
      veiculo_id: vId,
      item: "Alinhamento 3D e Balanceamento das 4 Rodas",
      item_manutencao: "Alinhamento 3D e Balanceamento das 4 Rodas",
      categoria: "pneus",
      intervalo_km: 10000,
      intervalo_meses: 6,
      ultimo_km: 10000,
      ultimo_km_realizado: 10000,
      ultima_data: "2026-06-01",
      ultima_data_realizada: "2026-06-01",
      proximo_km: 20000,
      proximo_km_alvo: 20000,
      proxima_data: "2026-12-01",
      proxima_data_alvo: "2026-12-01",
      alerta_km_antecedencia: 500,
      aviso_antecipado_km: 500,
      alerta_dias_antecedencia: 15,
      status: "em_dia",
      custo_estimado: 160.0,
      observacoes: "Garantir desgaste uniforme da banda de rodagem dos pneus.",
      created_at: "2026-01-01T10:00:00.000Z",
      cliente_id: "deg-cli-001",
      placa: "DEG-2026",
      marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
      tipo_veiculo: "suv",
      odometro_atual: 18450,
      horimetro_atual: 450,
      km_restante: 1550,
    },
  ];
}

export function obterVeiculosManutencaoDegustacaoMaster(): any[] {
  return [
    {
      id: "deg-veic-001",
      cliente_id: "deg-cli-001",
      placa: "DEG-2026",
      marca_modelo: "Volvo XC60 T6 Recharge Inscription Hibrido",
      tipo_veiculo: "suv",
      odometro_km: 18450,
      horimetro: 450,
      ano_fabricacao: 2024,
      ano: 2024,
      cor: "Preto Crystal",
      ativo: true,
      itens_alerta_count: 1,
      itens_vencidos_count: 1,
      total_itens_manutencao: 4,
      total_alertas_vencidos: 1,
      total_alertas_proximos: 1,
      status_geral_saude: "atencao",
    },
    {
      id: "deg-veic-002",
      cliente_id: "deg-cli-001",
      placa: "FLX-1010",
      marca_modelo: "GM Montana Premier 1.2 Turbo Flex",
      tipo_veiculo: "camionete",
      odometro_km: 12380,
      horimetro: 310,
      ano_fabricacao: 2024,
      ano: 2024,
      cor: "Prata Shark",
      ativo: true,
      itens_alerta_count: 0,
      itens_vencidos_count: 0,
      total_itens_manutencao: 4,
      total_alertas_vencidos: 0,
      total_alertas_proximos: 0,
      status_geral_saude: "em_dia",
    },
    {
      id: "deg-veic-003",
      cliente_id: "deg-cli-001",
      placa: "COR-4040",
      marca_modelo: "Toyota Corolla Cross XRE 2.0",
      tipo_veiculo: "suv",
      odometro_km: 9540,
      horimetro: 220,
      ano_fabricacao: 2025,
      ano: 2025,
      cor: "Branco Polar",
      ativo: true,
      itens_alerta_count: 1,
      itens_vencidos_count: 0,
      total_itens_manutencao: 4,
      total_alertas_vencidos: 0,
      total_alertas_proximos: 1,
      status_geral_saude: "atencao",
    },
  ];
}

export function obterAgendamentosManutencaoDegustacaoMaster(veiculoId?: string): any[] {
  const hoje = new Date();
  const dProx = new Date(hoje.getTime() + 3 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const dAnt = new Date(hoje.getTime() - 45 * 24 * 3600 * 1000).toISOString().split("T")[0];

  return [
    {
      id: "deg-agend-001",
      cliente_id: "deg-cli-001",
      veiculo_id: veiculoId || "deg-veic-001",
      item_manutencao: "Revisao Preventiva dos 20.000 km e Troca de Filtros",
      data_sugerida: dProx,
      data_agendamento: dProx,
      hora_agendamento: "14:30",
      turno: "tarde",
      oficina_parceira: "Auto Center Especializado Sul Fluminense",
      oficina_nome: "Auto Center Especializado Sul Fluminense",
      oficina_endereco: "Av. Paulo de Frontin, 720, Aterrado - Volta Redonda/RJ",
      oficina_telefone: "(24) 3348-1200",
      tipo_servico: "Revisao Preventiva dos 20.000 km e Troca de Filtros",
      status: "solicitado",
      observacoes: "Agendamento confirmado pela oficina com pecas originais reservadas.",
      placa: "DEG-2026",
      cliente_nome: "Transportadora Alianca Logistica e Frotas",
      created_at: new Date().toISOString(),
    },
    {
      id: "deg-agend-002",
      cliente_id: "deg-cli-001",
      veiculo_id: veiculoId || "deg-veic-001",
      item_manutencao: "Troca de Oleo e Alinhamento 3D dos 10.000 km",
      data_sugerida: dAnt,
      data_agendamento: dAnt,
      hora_agendamento: "09:00",
      turno: "manha",
      oficina_parceira: "Auto Center Especializado Sul Fluminense",
      oficina_nome: "Auto Center Especializado Sul Fluminense",
      oficina_endereco: "Av. Paulo de Frontin, 720, Aterrado - Volta Redonda/RJ",
      oficina_telefone: "(24) 3348-1200",
      tipo_servico: "Troca de Oleo e Alinhamento 3D dos 10.000 km",
      status: "concluido",
      observacoes: "Servico executado com sucesso e carimbo no manual do proprietario.",
      placa: "DEG-2026",
      cliente_nome: "Transportadora Alianca Logistica e Frotas",
      created_at: new Date(hoje.getTime() - 45 * 24 * 3600 * 1000).toISOString(),
    },
  ];
}

export function obterDespesasManutencaoDegustacaoMaster(veiculoId?: string): any[] {
  const hoje = new Date();
  const dAnt = new Date(hoje.getTime() - 45 * 24 * 3600 * 1000).toISOString().split("T")[0];

  return [
    {
      id: "deg-desp-001",
      veiculo_id: veiculoId || "deg-veic-001",
      cliente_id: "deg-cli-001",
      motorista_id: "deg-mot-001",
      motorista_nome: "Marcos Aurelio de Souza",
      veiculo_placa: "DEG-2026",
      data_despesa: dAnt,
      categoria: "manutencao",
      descricao: "Troca de Oleo do Motor Sintetico 5W30 e Alinhamento",
      valor: 480.0,
      km_atual: 10000,
      odometro_km: 10000,
      oficina_prestador: "Auto Center Especializado Sul Fluminense",
      fornecedor: "Auto Center Especializado Sul Fluminense",
      nf_numero: "000.012.890",
      nf_foto_url: null,
      nf_upload_em: new Date(hoje.getTime() - 45 * 24 * 3600 * 1000).toISOString(),
      nf_baixado: true,
      nf_expirado: false,
      observacoes: "Revisao programada preventiva cumprida com rigor.",
      created_at: new Date(hoje.getTime() - 45 * 24 * 3600 * 1000).toISOString(),
    },
  ];
}
