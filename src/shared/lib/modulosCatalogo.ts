// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Catálogo Canônico de Módulos Granulares do Sistema
// ─────────────────────────────────────────────────────────────────────────────
// Cada funcionalidade é um módulo isolado e independente, permitindo
// tanto o uso de pacotes comerciais fechados quanto a seleção livre/aleatória
// por cliente ou plano.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuloSistema {
  id: string;
  nome: string;
  descricao: string;
  categoria: "Operacional" | "Telemetria" | "Segurança" | "Gestão";
  pacoteMinimo: "basico" | "pro" | "master";
}

export const CATALOGO_MODULOS: ModuloSistema[] = [
  {
    id: "gps_realtime",
    nome: "Rastreamento em Tempo Real (2D)",
    descricao: "Localização ao vivo, rumo, ignição e status operacional",
    categoria: "Operacional",
    pacoteMinimo: "basico",
  },
  {
    id: "bloqueio_remoto",
    nome: "Bloqueio e Desbloqueio Remoto (Relé J16)",
    descricao: "Corte emergencial de combustível e restauração da partida",
    categoria: "Segurança",
    pacoteMinimo: "basico",
  },
  {
    id: "laudos_pdf",
    nome: "Laudos Oficiais com Assinatura SHA-256",
    descricao: "Emissão de relatórios em PDF com cadeia de custódia inalterável",
    categoria: "Operacional",
    pacoteMinimo: "basico",
  },
  {
    id: "atendimento_suporte",
    nome: "Central de Atendimento e Chamados",
    descricao: "Registro de ocorrências, registro automático e providências",
    categoria: "Gestão",
    pacoteMinimo: "basico",
  },
  {
    id: "modo_3d",
    nome: "Modo 3D SIGO Guardião (WebGL)",
    descricao: "Perspectiva isométrica a 60 graus com rotação livre e visualização 3D",
    categoria: "Operacional",
    pacoteMinimo: "pro",
  },
  {
    id: "viagens_historico",
    nome: "Histórico e Ciclo de Viagens",
    descricao:
      "Consolidação de percursos por ligar e desligar da ignição com km e velocidade média",
    categoria: "Telemetria",
    pacoteMinimo: "pro",
  },
  {
    id: "refazer_trajeto",
    nome: "Refazer Trajeto (Playback 2D e 3D)",
    descricao: "Player de reconstituição da rota com velocímetro ao vivo e acompanhamento 3D",
    categoria: "Telemetria",
    pacoteMinimo: "pro",
  },
  {
    id: "cercas_eletronicas",
    nome: "Cercas Eletrônicas e Perímetros",
    descricao: "Criação de áreas delimitadas com alertas imediatos de entrada e saída",
    categoria: "Segurança",
    pacoteMinimo: "pro",
  },
  {
    id: "reboque_guincho",
    nome: "Alerta de Reboque e Guincho",
    descricao: "Detecção de deslocamento indevido com a ignição desligada",
    categoria: "Segurança",
    pacoteMinimo: "pro",
  },
  {
    id: "sensores_inercia",
    nome: "Sensores Físicos (G-Sensor e Inclinação)",
    descricao: "Telemetria contínua de força G, vibração e graus de inclinação do chassi",
    categoria: "Telemetria",
    pacoteMinimo: "master",
  },
  {
    id: "alertas_acidente",
    nome: "Detecção de Colisão e Capotamento",
    descricao: "Disparo automático de alerta crítico em impactos e inclinações severas",
    categoria: "Segurança",
    pacoteMinimo: "master",
  },
  {
    id: "manutencao_preventiva",
    nome: "Manutenção Preventiva e Revisões",
    descricao: "Avisos de troca de óleo, pastilhas e agendamento de serviços pelo aplicativo",
    categoria: "Gestão",
    pacoteMinimo: "master",
  },
  {
    id: "mensalidades",
    nome: "Controle de Mensalidades e Finanças",
    descricao: "Gestão de faturamento, carnês, Pix e vencimentos de clientes",
    categoria: "Gestão",
    pacoteMinimo: "basico",
  },
];

// Pacotes Fechados Predefinidos
export const PACOTES_MODULOS = {
  basico: ["gps_realtime", "bloqueio_remoto", "laudos_pdf", "atendimento_suporte", "mensalidades"],
  pro: [
    "gps_realtime",
    "bloqueio_remoto",
    "laudos_pdf",
    "atendimento_suporte",
    "mensalidades",
    "modo_3d",
    "viagens_historico",
    "refazer_trajeto",
    "cercas_eletronicas",
    "reboque_guincho",
  ],
  master: CATALOGO_MODULOS.map((m) => m.id),
};
