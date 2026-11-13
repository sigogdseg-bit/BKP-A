// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Serviço de Demonstração e Sandbox Virtual (DJR-NEW)
// ─────────────────────────────────────────────────────────────────────────────
// Permite que Administradores e Operadores simulem jornadas completas:
// - Jornada do Cliente: Do link de convite ao uso do sistema com agendamento fantasma.
// - Jornada do Instalador: Do credenciamento técnico à instalação final da OS com kit fantasma.
// REGRA PÉTREA: Simula que gravou mas NUNCA grava nada no banco de dados real.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  EstadoDemonstracao,
  TipoJornadaDemonstracao,
  ClienteFantasma,
  InstaladorFantasma,
  KitFantasma,
  OrdemServicoFantasma,
} from "../types";

const CHAVE_STORAGE = "hunter_demonstracao_sandbox";
const EVENTO_MUDANCA = "hunter_demonstracao_mudanca";

export const CLIENTE_FANTASMA_PADRAO: ClienteFantasma = {
  id: "fantasma-cli-demo-001",
  nome_razao_social: "Carlos Eduardo — Cliente Demonstração",
  documento: "111.222.333-44",
  email: "cliente.demo@sigoguardiao.com.br",
  telefone: "(24) 99876-5432",
  plano: "Proteção Total e Rastreamento 24h",
  valor_plano: 79.9,
  dia_vencimento: 10,
  veiculos: [
    {
      id: "fantasma-veic-demo-001",
      placa: "DEM-2026",
      marca_modelo: "Toyota Corolla Cross XRE",
      cor: "Branco Pérola",
      ano: 2025,
      tipo_veiculo: "suv",
      rastreador_id: "fantasma-rast-demo-001",
      rastreador_imei: "1000",
    },
  ],
};

export const INSTALADOR_FANTASMA_PADRAO: InstaladorFantasma = {
  id: "fantasma-inst-demo-001",
  user_id: "fantasma-user-inst-001",
  nome: "Marcos Ribeiro — Instalador Credenciado",
  email: "instalador.demo@sigoguardiao.com.br",
  telefone: "(24) 99123-4567",
  chave_pix: "instalador.demo@sigoguardiao.com.br",
  endereco_instalacao: "Av. Alberto Braune, 120 - Centro, Nova Friburgo - RJ",
  valor_sem_bloqueador: "60,00",
  valor_com_bloqueador: "90,00",
  ativo: true,
};

export const KIT_FANTASMA_PADRAO: KitFantasma = {
  id: "fantasma-kit-demo-001",
  rastreador_id: "fantasma-rast-demo-001",
  imei: "1000",
  modelo: "J16 4G LTE Cat-1",
  serial: "1000",
  chip_id: "fantasma-chip-demo-001",
  chip_linha: "(24) 99000-1234",
  chip_operadora: "Vivo M2M IOT",
  chip_iccid: "89550000000000000000",
};

export const ORDEM_SERVICO_FANTASMA_PADRAO: OrdemServicoFantasma = {
  id: "fantasma-os-demo-001",
  numero_os: "OS-DEMO-2026",
  cliente_id: "fantasma-cli-demo-001",
  cliente_nome: "Carlos Eduardo — Cliente Demonstração",
  cliente_telefone: "(24) 99876-5432",
  veiculo_id: "fantasma-veic-demo-001",
  veiculo_placa: "DEM-2026",
  veiculo_modelo: "Toyota Corolla Cross XRE",
  veiculo_cor: "Branco Pérola",
  veiculo_ano: 2025,
  instalador_id: "fantasma-inst-demo-001",
  instalador_nome: "Marcos Ribeiro — Instalador Credenciado",
  rastreador_imei: "1000",
  chip_linha: "(24) 99000-1234",
  chip_operadora: "Vivo M2M IOT",
  data_agendamento: "17/10/2026",
  horario_agendamento: "14:00",
  endereco_instalacao: "Rua das Flores, 450 - Centro, Volta Redonda - RJ",
  status: "agendado",
  com_bloqueador: true,
  observacoes: "Instalação agendada pelo cliente durante a simulação.",
};

export const ESTADO_INICIAL_DEMONSTRACAO: EstadoDemonstracao = {
  ativo: false,
  jornadaAtual: null,
  etapaAtual: 1,
  iniciadoEm: new Date().toISOString(),
  cliente: { ...CLIENTE_FANTASMA_PADRAO },
  instalador: { ...INSTALADOR_FANTASMA_PADRAO },
  kit: { ...KIT_FANTASMA_PADRAO },
  ordemServico: { ...ORDEM_SERVICO_FANTASMA_PADRAO },
  etapasConcluidas: [],
};

let estadoMemoriaNode: EstadoDemonstracao | null = null;

// ── LEITURA E GRAVAÇÃO EM STORAGE VIRTUAL (ISOLAMENTO TOTAL) ──

export function obterEstadoDemonstracao(): EstadoDemonstracao {
  if (typeof window === "undefined") {
    return estadoMemoriaNode ? { ...estadoMemoriaNode } : { ...ESTADO_INICIAL_DEMONSTRACAO };
  }
  try {
    const salvo = sessionStorage.getItem(CHAVE_STORAGE);
    if (!salvo) return { ...ESTADO_INICIAL_DEMONSTRACAO };
    return JSON.parse(salvo);
  } catch {
    return { ...ESTADO_INICIAL_DEMONSTRACAO };
  }
}

export function salvarEstadoDemonstracao(estado: EstadoDemonstracao): void {
  if (typeof window === "undefined") {
    estadoMemoriaNode = { ...estado };
    return;
  }
  try {
    sessionStorage.setItem(CHAVE_STORAGE, JSON.stringify(estado));
    window.dispatchEvent(new CustomEvent(EVENTO_MUDANCA, { detail: estado }));
  } catch (err) {
    console.warn("[DemonstracaoService] Erro ao salvar estado:", err);
  }
}

export function isModoDemonstracaoAtivo(): boolean {
  if (typeof window === "undefined") {
    return Boolean(estadoMemoriaNode?.ativo);
  }
  // Checagem 1: parâmetro na URL (?demo=true)
  if (window.location.search.includes("demo=true")) return true;
  // Checagem 2: estado ativo no storage da sessão
  return obterEstadoDemonstracao().ativo;
}

export function obterJornadaAtual(): TipoJornadaDemonstracao | null {
  return obterEstadoDemonstracao().jornadaAtual;
}

// ── CICLO DE VIDA DA SIMULAÇÃO ──

export function iniciarDemonstracao(jornada: TipoJornadaDemonstracao): EstadoDemonstracao {
  const novoEstado: EstadoDemonstracao = {
    ...ESTADO_INICIAL_DEMONSTRACAO,
    ativo: true,
    jornadaAtual: jornada,
    etapaAtual: 1,
    iniciadoEm: new Date().toISOString(),
    etapasConcluidas: [],
  };
  salvarEstadoDemonstracao(novoEstado);
  return novoEstado;
}

export function reiniciarDemonstracao(): EstadoDemonstracao {
  const atual = obterEstadoDemonstracao();
  return iniciarDemonstracao(atual.jornadaAtual || "cliente");
}

export function encerrarDemonstracao(): void {
  if (typeof window === "undefined") {
    estadoMemoriaNode = null;
    return;
  }
  try {
    sessionStorage.removeItem(CHAVE_STORAGE);
    window.dispatchEvent(
      new CustomEvent(EVENTO_MUDANCA, {
        detail: { ...ESTADO_INICIAL_DEMONSTRACAO, ativo: false },
      }),
    );
  } catch {
    // Silencioso
  }
}

export function registrarEtapaConcluida(etapaNome: string): void {
  const estado = obterEstadoDemonstracao();
  if (!estado.ativo) return;
  const lista = Array.from(new Set([...estado.etapasConcluidas, etapaNome]));
  salvarEstadoDemonstracao({
    ...estado,
    etapasConcluidas: lista,
    etapaAtual: estado.etapaAtual + 1,
  });
}

// ── SIMULAÇÃO REALISTA DAS REQUISIÇÕES (SEM TOCAR NO SUPABASE REAL) ──

/**
 * Simula o cadastro do cliente via link de convite
 */
export async function simularAdesaoCliente(dados: {
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  plano?: string;
  diaVencimento?: number;
  veiculos: Array<{
    placa: string;
    modelo: string;
    cor: string;
    ano: string;
    tipo_veiculo: string;
  }>;
}): Promise<{ success: boolean; mensagem: string; clienteId: string }> {
  // Simula latência realista de rede (500ms)
  await new Promise((r) => setTimeout(r, 500));

  const estado = obterEstadoDemonstracao();
  const veiculosFormatados = dados.veiculos.map((v, idx) => ({
    id: `fantasma-veic-${idx + 1}`,
    placa: v.placa.toUpperCase() || "DEM-2026",
    marca_modelo: v.modelo || "Veículo Demonstração",
    cor: v.cor || "Preto",
    ano: Number(v.ano) || 2025,
    tipo_veiculo: v.tipo_veiculo || "carro",
    rastreador_imei: KIT_FANTASMA_PADRAO.imei,
  }));

  const novoCliente: ClienteFantasma = {
    ...estado.cliente,
    nome_razao_social: dados.nome || estado.cliente.nome_razao_social,
    documento: dados.documento || estado.cliente.documento,
    email: dados.email || estado.cliente.email,
    telefone: dados.telefone || estado.cliente.telefone,
    plano: dados.plano || estado.cliente.plano,
    dia_vencimento: dados.diaVencimento || estado.cliente.dia_vencimento,
    veiculos: veiculosFormatados.length > 0 ? veiculosFormatados : estado.cliente.veiculos,
  };

  const novaOs: OrdemServicoFantasma = {
    ...estado.ordemServico,
    cliente_nome: novoCliente.nome_razao_social,
    cliente_telefone: novoCliente.telefone,
    veiculo_placa: novoCliente.veiculos[0].placa,
    veiculo_modelo: novoCliente.veiculos[0].marca_modelo,
    veiculo_cor: novoCliente.veiculos[0].cor,
    veiculo_ano: novoCliente.veiculos[0].ano,
  };

  salvarEstadoDemonstracao({
    ...estado,
    cliente: novoCliente,
    ordemServico: novaOs,
    etapasConcluidas: [...estado.etapasConcluidas, "adesao_cliente_concluida"],
  });

  return {
    success: true,
    mensagem: "Cadastro simulado com sucesso. Nenhum dado foi persistido no banco real.",
    clienteId: novoCliente.id,
  };
}

/**
 * Simula o cadastro do instalador via link de convite
 */
export async function simularCadastroInstalador(dados: {
  nome: string;
  email: string;
  telefone: string;
  chavePix: string;
  enderecoInstalacao: string;
  valorSemBloqueador?: string;
  valorComBloqueador?: string;
}): Promise<{ success: boolean; mensagem: string }> {
  await new Promise((r) => setTimeout(r, 500));

  const estado = obterEstadoDemonstracao();
  const novoInstalador: InstaladorFantasma = {
    ...estado.instalador,
    nome: dados.nome || estado.instalador.nome,
    email: dados.email || estado.instalador.email,
    telefone: dados.telefone || estado.instalador.telefone,
    chave_pix: dados.chavePix || estado.instalador.chave_pix,
    endereco_instalacao: dados.enderecoInstalacao || estado.instalador.endereco_instalacao,
    valor_sem_bloqueador: dados.valorSemBloqueador || "60,00",
    valor_com_bloqueador: dados.valorComBloqueador || "90,00",
  };

  const novaOs: OrdemServicoFantasma = {
    ...estado.ordemServico,
    instalador_nome: novoInstalador.nome,
  };

  salvarEstadoDemonstracao({
    ...estado,
    instalador: novoInstalador,
    ordemServico: novaOs,
    etapasConcluidas: [...estado.etapasConcluidas, "cadastro_instalador_concluido"],
  });

  return {
    success: true,
    mensagem: "Credenciamento simulado com sucesso. Instalador pronto para atender.",
  };
}

/**
 * Simula a conclusão da ordem de serviço pelo instalador
 */
export async function simularConclusaoInstalacao(dados: {
  ordemId: string;
  fotos?: string[];
  assinatura?: string;
  observacoes?: string;
  comBloqueador?: boolean;
  circuitoCortado?: string;
  posicaoRele?: string;
  kmInstalacao?: number;
  posicaoInstalacao?: string;
  valorRepasse?: number;
}): Promise<{ success: boolean; mensagem: string }> {
  await new Promise((r) => setTimeout(r, 600));

  const estado = obterEstadoDemonstracao();
  const osConcluida: OrdemServicoFantasma = {
    ...estado.ordemServico,
    status: "concluido",
    fotos: dados.fotos || [],
    assinatura_cliente: dados.assinatura || "Assinatura Digital Coletada (Simulação)",
    observacoes: dados.observacoes || "Instalação concluída com sucesso no simulador.",
    com_bloqueador: dados.comBloqueador ?? estado.ordemServico.com_bloqueador,
    concluido_em: new Date().toISOString(),
  };

  salvarEstadoDemonstracao({
    ...estado,
    ordemServico: osConcluida,
    etapasConcluidas: [...estado.etapasConcluidas, "instalacao_concluida"],
  });

  return {
    success: true,
    mensagem: "Instalação finalizada com sucesso! Veículo ativado no ambiente de demonstração.",
  };
}

/**
 * Converte o registro fantasma no formato canônico da entidade Instalacao
 * para que a tela real de instalações renderize sem alterações ou mocks artificiais.
 */
export function obterInstalacaoFantasmaComoCanonical(): any {
  const estado = obterEstadoDemonstracao();
  const os = estado.ordemServico;
  const kit = estado.kit;
  const inst = estado.instalador;
  const cli = estado.cliente;

  return {
    id: os.id,
    instalador_id: inst.user_id,
    instalador_nome: inst.nome,
    instalador_chave_pix: inst.chave_pix,
    cliente_id: cli.id,
    cliente_nome: cli.nome_razao_social,
    cliente_documento: cli.documento,
    cliente_telefone: cli.telefone,
    veiculo_id: os.veiculo_id,
    placa: os.veiculo_placa,
    marca: "Toyota",
    modelo: os.veiculo_modelo,
    ano: os.veiculo_ano,
    cor: os.veiculo_cor,
    km_instalacao: 15420,
    rastreador_imei: kit.imei,
    rastreador_modelo: kit.modelo,
    chip_iccid: kit.chip_iccid,
    chip_operadora: kit.chip_operadora,
    posicao_instalacao: "Painel Central - Atrás do Quadro de Instrumentos",
    status: os.status === "concluido" ? "concluida" : "agendado",
    valor_instalacao: 90.0,
    status_pagamento: "pendente",
    bloqueador_instalado: os.com_bloqueador,
    com_bloqueador: os.com_bloqueador,
    tipo_bloqueador: "rele_combustivel",
    tipo_veiculo: "suv",
    instalador_valor_com_bloqueador: 90.0,
    instalador_valor_sem_bloqueador: 60.0,
    cliente_plano: cli.plano,
    cliente_tem_fidelidade: true,
    data_agendamento: os.data_agendamento,
    hora_agendamento: os.horario_agendamento,
    local_tipo: "oficina",
    local_endereco: inst.endereco_instalacao,
    kit_determinado_em: estado.iniciadoEm,
    kit_confirmado_instalador: Boolean(os.kit_confirmado_instalador),
    kit_confirmado_em: os.kit_confirmado_instalador ? estado.iniciadoEm : null,
    imei_confirmado: os.kit_confirmado_instalador ? kit.imei : null,
    foto_placa_url: os.fotos?.[0] || null,
    foto_rastreador_url: os.fotos?.[1] || null,
    foto_local_instalacao_url: os.fotos?.[2] || null,
    foto_bloqueador_url: os.fotos?.[3] || null,
    fotos_instalacao: {
      placa: os.fotos?.[0] || null,
      rastreador: os.fotos?.[1] || null,
      local_instalacao: os.fotos?.[2] || null,
      bloqueador: os.fotos?.[3] || null,
    },
    concluida_at: os.concluido_em || null,
    observacoes: os.observacoes,
    created_at: estado.iniciadoEm,
  };
}

/**
 * Converte o registro fantasma no formato de agendamento de cliente
 * para alimentar a aba de agendamentos no painel do instalador e operador.
 */
export function obterAgendamentoFantasmaComoCanonical(): any {
  const estado = obterEstadoDemonstracao();
  const os = estado.ordemServico;
  const inst = estado.instalador;
  const cli = estado.cliente;

  return {
    id: cli.id,
    user_id: "fantasma-user-cli-001",
    nome_razao_social: cli.nome_razao_social,
    documento: cli.documento,
    telefone: cli.telefone,
    email: cli.email,
    status: "aguardando_instalacao",
    plano: cli.plano,
    tem_fidelidade: true,
    status_agendamento: os.status === "concluido" ? "concluido" : "agendado",
    data_agendamento: os.data_agendamento,
    hora_agendamento: os.horario_agendamento,
    instalador_id: inst.user_id,
    instalador: {
      id: inst.user_id,
      nome: inst.nome,
      endereco_instalacao: inst.endereco_instalacao,
      valor_com_bloqueador: 90.0,
      valor_sem_bloqueador: 60.0,
    },
    veiculos: [
      {
        id: os.veiculo_id,
        placa: os.veiculo_placa,
        modelo: os.veiculo_modelo,
        tipo_veiculo: "suv",
      },
    ],
  };
}

/**
 * Converte os atores da demonstração (instalador e cliente) no formato de UsuarioCompleto
 * para exibição integrada na tela de Gestão de Usuários e Acessos quando o modo sandbox estiver ativo.
 */
export function obterUsuariosDemonstracaoComoCanonical(): any[] {
  const estado = obterEstadoDemonstracao();
  const inst = estado.instalador;
  const cli = estado.cliente;

  return [
    {
      id: inst.user_id,
      nome: inst.nome,
      email: inst.email,
      role: "instalador",
      ativo: inst.ativo,
      theme_preference: "light",
      created_at: estado.iniciadoEm,
      modulos: ["instalacoes"],
      valor_por_instalacao: 60,
      chave_pix: inst.chave_pix,
      endereco_instalacao: inst.endereco_instalacao,
      telefone: inst.telefone,
      celular: inst.telefone,
      ultimo_acesso: estado.iniciadoEm,
      tem_sessao_ativa: true,
      ultimo_logout: null,
    },
    {
      id: cli.id,
      nome: cli.nome_razao_social,
      email: cli.email,
      role: "cliente",
      ativo: true,
      theme_preference: "light",
      created_at: estado.iniciadoEm,
      modulos: ["rastreamento", "meus_veiculos"],
      plano: cli.plano,
      telefone: cli.telefone,
      celular: cli.telefone,
      ultimo_acesso: estado.iniciadoEm,
      tem_sessao_ativa: false,
      ultimo_logout: null,
    },
  ];
}
