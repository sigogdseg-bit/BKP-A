// alertasCatalogo.ts — GD Rastreamento
// Catálogo Canônico Auditado de Alertas Efetivamente Monitorados no Sistema
// (Zero itens deduzidos ou irreais: cada chave corresponde a emissor real em trigger SQL, cron, gateway GPS ou serviço ativo)

export type CategoriaAlertaCatalogo = "veiculo" | "conta";

export interface CanalAlertaItemPreferencia {
  ativo?: boolean;
  app: boolean;
  whatsapp: boolean;
  ligacao?: boolean;
  /** Lista opcional de telefones específicos para este alerta (undefined = usa contatos ativos globais) */
  destinatarios?: string[];
  /** Lista opcional de telefones específicos somente para WhatsApp deste alerta */
  destinatarios_whatsapp?: string[];
  /** Lista opcional de telefones específicos somente para Ligação deste alerta */
  destinatarios_ligacao?: string[];
}

export interface ContatoAlertaConta {
  id: string;
  nome: string;
  telefone: string;
  tipo: "cliente" | "motorista" | "adicional";
  ativo: boolean;
  padrao?: boolean;
}

export interface AlertaCatalogoItem {
  chave: string;
  categoria: CategoriaAlertaCatalogo;
  titulo: string;
  desc: string;
  origemMonitoramento: string;
  tituloEquipe?: string;
  descEquipe?: string;
  origemTecnica?: string;
  restritoEquipeTecnica?: boolean;
  padraoAtivo: boolean;
  padraoCanais: CanalAlertaItemPreferencia;
  suportaLigacao: boolean;
  financeiro?: boolean;
  notaExclusao?: boolean;
  aliases?: string[];
}

export interface RegraEntregaResolvida {
  chaveCanonica: string;
  categoria: CategoriaAlertaCatalogo;
  financeiro: boolean;
  ativo: boolean;
  app: boolean;
  whatsapp: boolean;
  ligacao: boolean;
  telefonesWhatsapp: string[];
  telefonesLigacao: string[];
}

/**
 * Normaliza telefone brasileiro para comparação e disparo (ex: 5524992494030).
 */
export function normalizarTelefoneDigitosBR(telefone?: string | null): string {
  if (!telefone) return "";
  let digitos = String(telefone).replace(/\D/g, "");
  if (!digitos) return "";

  if (digitos.startsWith("021") && digitos.length >= 13) {
    digitos = digitos.slice(3);
  } else if (digitos.startsWith("0") && digitos.length >= 11) {
    digitos = digitos.slice(1);
  }

  if (digitos.startsWith("55") && digitos.length >= 12) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return digitos;
}

/**
 * 16 Alertas Veiculares e de Hardware efetivamente monitorados pelo sistema:
 * Triggers SQL de telemetria, CRON Cloudflare Workers, Gateway GT06/J16 e Monitor GPS.
 */
export const ALERTAS_VEICULO_CATALOGO: AlertaCatalogoItem[] = [
  {
    chave: "movimento_fora_horario",
    categoria: "veiculo",
    titulo: "Movimento fora do horário",
    desc: "Deslocamento fora da janela habitual configurada no veículo",
    origemMonitoramento: "Monitoramento GPS e Horários de Uso",
    origemTecnica: "Trigger Telemetria SQL e Monitor GPS",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "ignicao_fora_horario",
    categoria: "veiculo",
    titulo: "Ignição fora do horário",
    desc: "Partida do motor em horários incomuns ou fins de semana bloqueados",
    origemMonitoramento: "Sensor de Ignição do Rastreador e Horários",
    origemTecnica: "Trigger Telemetria SQL e Monitor GPS",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "guincho",
    categoria: "veiculo",
    titulo: "Movimento com Ignição Desligada (Guincho)",
    desc: "Veículo em movimento com motor desligado — possível reboque não autorizado",
    origemMonitoramento: "Sensor de Movimento com Ignição Desligada",
    origemTecnica: "Trigger Telemetria SQL, Monitor GPS e Gateway GT06/J16 (0x09)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["movimento_indevido"],
  },
  {
    chave: "saida_area",
    categoria: "veiculo",
    titulo: "Saída de área segura (Geofence)",
    desc: "Veículo saindo de cercas virtuais e áreas protegidas cadastradas",
    origemMonitoramento: "Cercas Virtuais e Áreas Seguras",
    origemTecnica: "Trigger Telemetria SQL e Reconciliador Servidor",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["cerca_saida"],
  },
  {
    chave: "entrada_area",
    categoria: "veiculo",
    titulo: "Entrada em área segura",
    desc: "Confirmação de chegada em locais e áreas monitoradas cadastradas",
    origemMonitoramento: "Cercas Virtuais e Áreas Seguras",
    origemTecnica: "Trigger Telemetria SQL e Reconciliador Servidor",
    padraoAtivo: false,
    padraoCanais: { ativo: false, app: false, whatsapp: false, ligacao: false },
    suportaLigacao: true,
    aliases: ["cerca_entrada"],
  },
  {
    chave: "excesso_velocidade",
    categoria: "veiculo",
    titulo: "Excesso de velocidade",
    desc: "Velocidade superior ao limite configurado nas regras do veículo",
    origemMonitoramento: "Monitoramento de Velocidade do Veículo",
    origemTecnica: "Trigger Telemetria SQL, Monitor GPS e Gateway GT06/J16 (0x06)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "desvio_rota",
    categoria: "veiculo",
    titulo: "Desvio de rota monitorada",
    desc: "Veículo saindo do corredor planejado da rota monitorada ativa",
    origemMonitoramento: "Rotas Monitoradas no Mapa",
    origemTecnica: "Monitor GPS e Rotas Monitoradas",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["rota_monitorada"],
  },
  {
    chave: "suspeita_jammer",
    categoria: "veiculo",
    titulo: "Suspeita de Jammer / Silenciamento Súbito",
    desc: "Perda abrupta de sinal em trânsito suspeita de bloqueador celular/GPS",
    origemMonitoramento: "Monitoramento Contínuo de Sinal",
    origemTecnica: "CRON verificar_jammers_servidor e Monitor GPS",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["jammer"],
  },
  {
    chave: "perda_comunicacao",
    categoria: "veiculo",
    titulo: "Perda de comunicação",
    desc: "Rastreador sem sinal de dados acima do limite de minutos configurado",
    origemMonitoramento: "Supervisor de Conexão do Rastreador",
    origemTecnica: "CRON verificar_perda_comunicacao_servidor",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "bateria_desconectada",
    categoria: "veiculo",
    titulo: "Corte / Desconexão da bateria principal",
    desc: "Corte ou desconexão da alimentação 12V principal do veículo",
    origemMonitoramento: "Sensor de Alimentação Principal do Veículo",
    origemTecnica: "Gateway GT06/J16 (POWERALM / Tensão Externa Zero)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "baixa_tensao",
    categoria: "veiculo",
    titulo: "Baixa tensão da bateria",
    desc: "Queda na tensão da bateria do veículo ou bateria interna fraca",
    origemMonitoramento: "Sensor de Tensão da Bateria",
    origemTecnica: "Gateway GT06/J16 (Low Battery 0x0E) e Monitor GPS",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "colisao_impacto",
    categoria: "veiculo",
    titulo: "Impacto / Colisão Detectada",
    desc: "Sensor de choque ou aceleração G anômala detectado pelo rastreador",
    origemMonitoramento: "Sensor de Impacto e Vibração do Rastreador",
    origemTecnica: "Gateway J16 (Alarme Shock / Vibração 0x03)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["impacto", "vib_impacto"],
  },
  {
    chave: "panico",
    categoria: "veiculo",
    titulo: "Botão de Pânico / Emergência SOS",
    desc: "Acionamento emergencial do botão SOS pelo condutor do veículo",
    origemMonitoramento: "Botão de Pânico e Emergência SOS",
    origemTecnica: "Gateway GT06/J16 (Alarme SOS 0x01) e Central",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["sos", "sos_panico"],
  },
  {
    chave: "violacao_dispositivo",
    categoria: "veiculo",
    titulo: "Violação Física / Remoção do Rastreador",
    desc: "Tentativa de abertura, desligamento forçado ou violação do hardware",
    origemMonitoramento: "Sensor Anti-Violação do Rastreador",
    origemTecnica: "Gateway GT06/J16 (Alarme Tamper 0x0C)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["tamper", "desmontagem"],
  },
  {
    chave: "capotamento_inclinacao",
    categoria: "veiculo",
    titulo: "Capotamento / Inclinação Crítica",
    desc: "Tombamento ou inclinação severa em rampa acentuada detectada na cinemática",
    origemMonitoramento: "Sensor Inercial de Inclinação e Tombamento",
    origemTecnica: "Analisador Cinemático 3-Eixos e Força-G",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["inclinacao", "capotamento", "parada_repentina_colisao", "comportamento_anormal"],
  },
  {
    chave: "corte_nao_autorizado_sms",
    categoria: "veiculo",
    titulo: "Defesa Ativa: Sabotagem de Relé via SMS",
    desc: "Corte ou desbloqueio não autorizado via SMS revertido automaticamente",
    origemMonitoramento: "Defesa Interna da Central Técnica",
    origemTecnica: "Gateway Defesa Ativa (auditarIntegridadeEstadoEReverter)",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["desbloqueio_nao_autorizado_sms"],
  },
];

/**
 * 14 Alertas Operacionais e de Conta efetivamente emitidos pelo sistema
 * (7 de conta para Clientes + 7 operacionais exclusivos da Equipe Técnica).
 */
export const ALERTAS_CONTA_OPERACIONAL_CATALOGO: AlertaCatalogoItem[] = [
  {
    chave: "nf_pronta_download",
    categoria: "conta",
    titulo: "Nova Nota Fiscal Disponível para Download",
    desc: "Aviso imediato e anexo quando um comprovante de abastecimento ou despesa é enviado",
    origemMonitoramento: "Sistema de Notas Fiscais",
    origemTecnica: "nfStorageService (notificarUploadNF)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    notaExclusao: true,
  },
  {
    chave: "alerta_nf_expurgo",
    categoria: "conta",
    titulo: "Aviso de Expurgo de Nota Fiscal (24h, 6h e 30 min)",
    desc: "Lembretes escalonados antes da exclusão automática definitiva do comprovante",
    origemMonitoramento: "Controle Automático de Retenção (48h)",
    origemTecnica: "RPC SQL hunter_processar_ciclo_vida_nfs",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    notaExclusao: true,
    aliases: ["alerta_nf_expurgo_24h", "alerta_nf_expurgo_6h", "alerta_nf_expurgo_30m"],
  },
  {
    chave: "cobranca",
    categoria: "conta",
    titulo: "Cobrança e Mensalidades do Plano",
    desc: "Lembretes de vencimento, faturas e confirmações financeiras (restrito ao titular)",
    origemMonitoramento: "Módulo de Mensalidades e Financeiro",
    origemTecnica: "Módulo de Mensalidades e Financeiro",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    financeiro: true,
    aliases: ["financeiro"],
  },
  {
    chave: "manutencao",
    categoria: "conta",
    titulo: "Manutenção Preventiva e Revisões",
    desc: "Alertas de revisões agendadas, vencimentos de quilometragem e ordens de serviço",
    origemMonitoramento: "Módulo de Manutenções Preventivas",
    origemTecnica: "Módulo de Manutenções Preventivas",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "instalacao",
    categoria: "conta",
    titulo: "Instalação e Agendamento Técnico",
    desc: "Notificações de solicitações, agendamentos e atualizações de instalação",
    origemMonitoramento: "Agenda de Instalações Técnicas",
    origemTecnica: "Módulo de Instalações e Agendamento",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["agendamento"],
  },
  {
    chave: "atendimento",
    categoria: "conta",
    titulo: "Suporte e Meus Chamados",
    desc: "Avisos quando a equipe abrir, responder ou concluir um atendimento seu",
    origemMonitoramento: "Central de Suporte ao Cliente",
    tituloEquipe: "Chamados e Atendimento ao Cliente",
    descEquipe: "Abertura e movimentação de atendimentos e providências da conta",
    origemTecnica: "Módulo de Atendimento e Suporte (/atendimento)",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["chamado", "suporte"],
  },
  {
    chave: "chat",
    categoria: "conta",
    titulo: "Mensagens no Chat Interno",
    desc: "Notificações de novas mensagens não lidas no chat interno do sistema",
    origemMonitoramento: "Chat Interno do Sistema",
    origemTecnica: "Chat Interno e Canal Realtime",
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: false, ligacao: false },
    suportaLigacao: true,
  },
  {
    chave: "cadastros_convites_veiculos",
    categoria: "conta",
    titulo: "Novos Cadastros, Parceiros e Solicitações de Veículos",
    desc: "Auto-cadastro de clientes, instaladores, revendedores, vendedores e pedidos de novos veículos",
    origemMonitoramento: "Portal de Convites e Onboarding da Central",
    origemTecnica: "API de Convites e Solicitação de Veículos",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: [
      "novo_instalador_auto_cadastro",
      "novo_cliente_auto_cadastro",
      "novo_revendedor_cadastro",
      "novo_vendedor_cadastro",
      "nova_solicitacao_veiculo_cliente",
    ],
  },
  {
    chave: "propostas_contratos",
    categoria: "conta",
    titulo: "Propostas Comerciais e Assinatura de Contratos",
    desc: "Emissão de novas propostas comerciais e assinatura eletrônica de contratos pelos clientes",
    origemMonitoramento: "Módulo Comercial e Contratos Eletrônicos",
    origemTecnica: "API de Propostas Comerciais e Contratos Digitais",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: [
      "notificacao_proposta_emitida",
      "notificacao_contrato_assinado_cliente",
      "notificacao_contrato_assinado_recebido",
    ],
  },
  {
    chave: "pagamento_informado",
    categoria: "conta",
    titulo: "Pagamento de Mensalidade Informado pelo Cliente",
    desc: "Confirmação enviada pelo cliente com comprovante para baixa financeira na central",
    origemMonitoramento: "Recebimento de Comprovantes e Mensalidades",
    origemTecnica: "API de Mensalidades e Financeiro",
    restritoEquipeTecnica: true,
    financeiro: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["mensalidade_pagamento_informado"],
  },
  {
    chave: "degustacao_bot",
    categoria: "conta",
    titulo: "Auto-Cadastro e Reativação de Degustação (Bot WhatsApp)",
    desc: "Aviso imediato quando novo usuário de degustação 24h ou reativação é criado via WhatsApp",
    origemMonitoramento: "Autoatendimento WhatsApp Assistente GD",
    origemTecnica: "Fluxo de Degustação WhatsApp Automático",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: [
      "degustacao_criada",
      "degustacao_reativada",
      "degustacao_cadastrada_whatsapp",
      "degustacao_reativada_whatsapp",
      "degustacao_revalidada_whatsapp",
    ],
  },
  {
    chave: "atendimento_humano_bot",
    categoria: "conta",
    titulo: "Solicitação de Atendimento Humano e Leads Regionais (Bot)",
    desc: "Pedidos de transbordo para atendente humano ou indicação de vendedor no bot WhatsApp",
    origemMonitoramento: "Central de Atendimento Automático WhatsApp",
    origemTecnica: "Fluxo de Transbordo Humano e Leads WhatsApp",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: [
      "transbordo_humano_whatsapp",
      "lead_sem_vendedor_whatsapp",
      "indicacao_vendedor_whatsapp",
    ],
  },
  {
    chave: "relatorio_gerencial",
    categoria: "conta",
    titulo: "Relatório Gerencial Diário de Métricas e Free Tier",
    desc: "Despacho diário de indicadores da operação, inadimplência, chips e governança de infraestrutura",
    origemMonitoramento: "Rotina Diária de Governança e Métricas",
    origemTecnica: "Motor de Relatório Gerencial Automático",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["gerencial", "relatorio_diario_metricas"],
  },
  {
    chave: "comandos_j16",
    categoria: "conta",
    titulo: "Retorno de Comandos Agendados J16 / Hardware",
    desc: "Confirmação quando rastreador em repouso acorda e responde ao comando agendado",
    origemMonitoramento: "Supervisão Técnica de Comandos TCP/GPRS",
    origemTecnica: "Spooler e Fila Sequencial J16",
    restritoEquipeTecnica: true,
    padraoAtivo: true,
    padraoCanais: { ativo: true, app: true, whatsapp: true, ligacao: false },
    suportaLigacao: true,
    aliases: ["comando_concluido", "comando_j16_concluido", "retorno_comando_j16"],
  },
];

export const CATALOGO_COMPLETO_ALERTAS: AlertaCatalogoItem[] = [
  ...ALERTAS_VEICULO_CATALOGO,
  ...ALERTAS_CONTA_OPERACIONAL_CATALOGO,
];

const MAPA_ALIASES_ALERTA = new Map<string, AlertaCatalogoItem>();
for (const item of CATALOGO_COMPLETO_ALERTAS) {
  MAPA_ALIASES_ALERTA.set(item.chave, item);
  for (const alias of item.aliases || []) {
    MAPA_ALIASES_ALERTA.set(alias, item);
  }
}

export function normalizarTipoAlerta(tipoRaw?: string | null): string {
  if (!tipoRaw) return "alerta";
  const limpo = String(tipoRaw).trim().toLowerCase();
  const encontrado = MAPA_ALIASES_ALERTA.get(limpo);
  return encontrado ? encontrado.chave : limpo;
}

export function obterItemCatalogoAlerta(tipoRaw?: string | null): AlertaCatalogoItem | null {
  if (!tipoRaw) return null;
  const limpo = String(tipoRaw).trim().toLowerCase();
  return MAPA_ALIASES_ALERTA.get(limpo) || null;
}

export function ehAlertaFinanceiroRestrito(tipoRaw?: string | null): boolean {
  const item = obterItemCatalogoAlerta(tipoRaw);
  return Boolean(item?.financeiro);
}

export function ehAlertaSigiloDefesaSms(tipoRaw?: string | null): boolean {
  if (!tipoRaw) return false;
  const norm = normalizarTipoAlerta(tipoRaw);
  return norm === "corte_nao_autorizado_sms" || norm === "desbloqueio_nao_autorizado_sms";
}

export function ehAlertaOperacionalEquipe(tipoRaw?: string | null): boolean {
  if (!tipoRaw) return false;
  const item = obterItemCatalogoAlerta(tipoRaw);
  return Boolean(item?.categoria === "conta" && item?.restritoEquipeTecnica);
}

/**
 * Identifica alertas internos restritos à equipe técnica (defesa ativa contra sabotagem via SMS
 * e eventos operacionais internos de gestão), nunca exibidos ou entregues para clientes.
 */
export function ehAlertaRestritoEquipeTecnica(tipoRaw?: string | null): boolean {
  if (!tipoRaw) return false;
  const item = obterItemCatalogoAlerta(tipoRaw);
  if (item?.restritoEquipeTecnica) return true;
  const norm = normalizarTipoAlerta(tipoRaw);
  return norm === "corte_nao_autorizado_sms" || norm === "desbloqueio_nao_autorizado_sms";
}

/**
 * Filtra itens do catálogo de alertas conforme o perfil do usuário conectado.
 */
export function filtrarAlertasCatalogoVisiveis<
  T extends { restritoEquipeTecnica?: boolean; chave?: string },
>(itens: T[], isEquipeTecnica: boolean): T[] {
  if (!Array.isArray(itens)) return [];
  if (isEquipeTecnica) return itens;
  return itens.filter(
    (item) => !item.restritoEquipeTecnica && !ehAlertaRestritoEquipeTecnica(item.chave),
  );
}

/**
 * Filtra lista de contatos respeitando a Blindagem Administrativa:
 * Alertas financeiros (cobranca / plano) nunca são enviados a motoristas.
 */
export function filtrarContatosPermitidosPorTipo(
  contatos: ContatoAlertaConta[],
  tipoRaw?: string | null,
): ContatoAlertaConta[] {
  if (!Array.isArray(contatos)) return [];
  const financeiro = ehAlertaFinanceiroRestrito(tipoRaw);
  if (!financeiro) return contatos;
  return contatos.filter((c) => c.tipo !== "motorista");
}

function resolverTelefonesCanal(params: {
  listaCustomizada?: string[];
  contatosPermitidos: ContatoAlertaConta[];
  mapaTipoPorDigitos: Map<string, string>;
  financeiro: boolean;
  telefoneFallbackTitular?: string | null;
}): string[] {
  const resultado = new Set<string>();

  if (Array.isArray(params.listaCustomizada)) {
    for (const raw of params.listaCustomizada) {
      const d = normalizarTelefoneDigitosBR(raw);
      if (d.length < 10) continue;
      if (params.financeiro && params.mapaTipoPorDigitos.get(d) === "motorista") {
        continue;
      }
      resultado.add(d);
    }
    return Array.from(resultado);
  }

  for (const c of params.contatosPermitidos) {
    if (c.ativo === false) continue;
    const d = normalizarTelefoneDigitosBR(c.telefone);
    if (d.length >= 10) {
      resultado.add(d);
    }
  }

  if (
    resultado.size === 0 &&
    params.contatosPermitidos.length === 0 &&
    params.telefoneFallbackTitular
  ) {
    const d = normalizarTelefoneDigitosBR(params.telefoneFallbackTitular);
    if (
      d.length >= 10 &&
      (!params.financeiro || params.mapaTipoPorDigitos.get(d) !== "motorista")
    ) {
      resultado.add(d);
    }
  }

  return Array.from(resultado);
}

/**
 * Resolve de forma determinística e desacoplada a regra de entrega de qualquer alerta
 * (Veicular ou de Conta/Operacional), respeitando opt-in/opt-out, canais independentes
 * (App, WhatsApp, Ligação) e seleção granular de telefones destinatários.
 */
export function resolverRegraEntregaAlerta(params: {
  tipo: string;
  alertasAtivos?: Record<string, any> | null;
  canaisGlobais?: {
    app?: boolean;
    whatsapp?: boolean;
    ligacao?: boolean;
    por_alerta?: Record<string, CanalAlertaItemPreferencia>;
  } | null;
  alertasOperacionais?: Record<string, CanalAlertaItemPreferencia> | null;
  notificarNfPendente?: boolean | null;
  canaisNotificacaoNf?: { push?: boolean; whatsapp?: boolean; ligacao?: boolean } | null;
  contatosVeiculo?: ContatoAlertaConta[] | null;
  contatosConta?: ContatoAlertaConta[] | null;
  telefoneFallbackTitular?: string | null;
}): RegraEntregaResolvida {
  const rawLimpo = String(params.tipo || "alerta")
    .trim()
    .toLowerCase();
  const item = obterItemCatalogoAlerta(rawLimpo);
  const chaveCanonica = item?.chave || rawLimpo;
  const categoria: CategoriaAlertaCatalogo = item?.categoria || "veiculo";
  const financeiro = Boolean(item?.financeiro);

  const defaultAtivo = item ? item.padraoAtivo : true;
  const defaultCanais = item
    ? item.padraoCanais
    : { ativo: true, app: true, whatsapp: true, ligacao: false };

  let ativo = defaultAtivo;
  let app = defaultCanais.app;
  let whatsapp = defaultCanais.whatsapp;
  let ligacao = Boolean(defaultCanais.ligacao);
  let regraItem: CanalAlertaItemPreferencia | undefined;

  if (categoria === "veiculo") {
    const porAlerta =
      params.canaisGlobais?.por_alerta ||
      params.alertasAtivos?.canais_alertas?.por_alerta ||
      params.alertasAtivos?.canais_por_alerta ||
      undefined;
    regraItem = porAlerta?.[chaveCanonica] || porAlerta?.[rawLimpo];

    const flagAtivoDireto =
      params.alertasAtivos?.[chaveCanonica] !== undefined
        ? params.alertasAtivos[chaveCanonica]
        : params.alertasAtivos?.[rawLimpo];

    if (typeof regraItem?.ativo === "boolean") {
      ativo = regraItem.ativo;
    } else if (typeof flagAtivoDireto === "boolean") {
      ativo = flagAtivoDireto;
    } else if (regraItem) {
      ativo = Boolean(regraItem.app || regraItem.whatsapp || regraItem.ligacao);
    }

    if (!ativo) {
      app = false;
      whatsapp = false;
      ligacao = false;
    } else if (regraItem) {
      app = regraItem.app !== undefined ? Boolean(regraItem.app) : defaultCanais.app;
      whatsapp =
        regraItem.whatsapp !== undefined ? Boolean(regraItem.whatsapp) : defaultCanais.whatsapp;
      ligacao =
        regraItem.ligacao !== undefined
          ? Boolean(regraItem.ligacao)
          : Boolean(defaultCanais.ligacao);
    } else {
      const temPorAlerta = Boolean(porAlerta && Object.keys(porAlerta).length > 0);
      if (temPorAlerta) {
        // Quando por_alerta já foi configurado para outros alertas do veículo,
        // chaves ainda ausentes (ex: entrada_area ou alertas recém-adicionados) NÃO herdam ligacao global=true.
        app = Boolean(defaultCanais.app);
        whatsapp = Boolean(defaultCanais.whatsapp);
        ligacao = Boolean(defaultCanais.ligacao);
      } else {
        const globalApp = params.canaisGlobais?.app ?? params.alertasAtivos?.canais_alertas?.app;
        const globalWhats =
          params.canaisGlobais?.whatsapp ?? params.alertasAtivos?.canais_alertas?.whatsapp;
        const globalLig =
          params.canaisGlobais?.ligacao ?? params.alertasAtivos?.canais_alertas?.ligacao;
        app = globalApp !== undefined ? Boolean(globalApp) : defaultCanais.app;
        whatsapp = globalWhats !== undefined ? Boolean(globalWhats) : defaultCanais.whatsapp;
        ligacao = globalLig !== undefined ? Boolean(globalLig) : Boolean(defaultCanais.ligacao);
      }
    }
  } else {
    const ops = params.alertasOperacionais || {};
    regraItem = ops[chaveCanonica] || ops[rawLimpo];

    if (regraItem) {
      if (typeof regraItem.ativo === "boolean") {
        ativo = regraItem.ativo;
      } else {
        ativo = Boolean(regraItem.app || regraItem.whatsapp || regraItem.ligacao);
      }

      if (!ativo) {
        app = false;
        whatsapp = false;
        ligacao = false;
      } else {
        app = regraItem.app !== undefined ? Boolean(regraItem.app) : defaultCanais.app;
        whatsapp =
          regraItem.whatsapp !== undefined ? Boolean(regraItem.whatsapp) : defaultCanais.whatsapp;
        ligacao =
          regraItem.ligacao !== undefined
            ? Boolean(regraItem.ligacao)
            : Boolean(defaultCanais.ligacao);
      }
    } else if (chaveCanonica === "nf_pronta_download" || chaveCanonica === "alerta_nf_expurgo") {
      const geralNf = params.notificarNfPendente !== false;
      const canaisNf = params.canaisNotificacaoNf || {};
      ativo =
        geralNf &&
        (canaisNf.push !== false || canaisNf.whatsapp !== false || canaisNf.ligacao === true);
      app = ativo && canaisNf.push !== false;
      whatsapp = ativo && canaisNf.whatsapp !== false;
      ligacao = ativo && canaisNf.ligacao === true;
    } else if (chaveCanonica === "chat") {
      // Chat respeita opt-in explícito: nunca dispara WhatsApp ou Ligação sem configuração expressa
      ativo = defaultAtivo;
      app = defaultCanais.app;
      whatsapp = defaultCanais.whatsapp;
      ligacao = Boolean(defaultCanais.ligacao);
    }
  }

  const contatosDoAlertaAtivo = Array.isArray(params.alertasAtivos?.whatsapp_destinatarios)
    ? (params.alertasAtivos?.whatsapp_destinatarios as ContatoAlertaConta[])
    : null;
  const listaVeiculo =
    Array.isArray(params.contatosVeiculo) && params.contatosVeiculo.length > 0
      ? params.contatosVeiculo
      : contatosDoAlertaAtivo;
  const baseContatos =
    categoria === "veiculo" && Array.isArray(listaVeiculo) && listaVeiculo.length > 0
      ? listaVeiculo
      : Array.isArray(params.contatosConta)
        ? params.contatosConta
        : Array.isArray(listaVeiculo)
          ? listaVeiculo
          : [];

  const mapaTipoPorDigitos = new Map<string, string>();
  for (const c of baseContatos) {
    const d = normalizarTelefoneDigitosBR(c.telefone);
    if (d) mapaTipoPorDigitos.set(d, c.tipo);
  }

  const contatosPermitidos = filtrarContatosPermitidosPorTipo(baseContatos, chaveCanonica);

  const listaCustomWhats = Array.isArray(regraItem?.destinatarios_whatsapp)
    ? regraItem.destinatarios_whatsapp
    : Array.isArray(regraItem?.destinatarios)
      ? regraItem.destinatarios
      : undefined;

  const listaCustomLig = Array.isArray(regraItem?.destinatarios_ligacao)
    ? regraItem.destinatarios_ligacao
    : Array.isArray(regraItem?.destinatarios)
      ? regraItem.destinatarios
      : undefined;

  const telefonesWhatsapp = resolverTelefonesCanal({
    listaCustomizada: listaCustomWhats,
    contatosPermitidos,
    mapaTipoPorDigitos,
    financeiro,
    telefoneFallbackTitular: params.telefoneFallbackTitular,
  });

  const telefonesLigacao = resolverTelefonesCanal({
    listaCustomizada: listaCustomLig,
    contatosPermitidos,
    mapaTipoPorDigitos,
    financeiro,
    telefoneFallbackTitular: params.telefoneFallbackTitular,
  });

  return {
    chaveCanonica,
    categoria,
    financeiro,
    ativo,
    app,
    whatsapp,
    ligacao,
    telefonesWhatsapp,
    telefonesLigacao,
  };
}
