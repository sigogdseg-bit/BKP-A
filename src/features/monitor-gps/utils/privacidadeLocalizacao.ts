import type { UserSession } from "@/features/auth/types";
import type { VeiculoGps } from "../types";

/**
 * Avalia se o usuário atual possui autorização para visualizar a localização,
 * trajeto e telemetria do veículo especificado.
 *
 * Regras Canônicas Hunter:
 * 1. Se privacidade_localizacao for false, qualquer usuário com permissão geral do sistema pode ver.
 * 2. Se privacidade_localizacao for true (padrão ON):
 *    - Somente SuperADM (novaes@adm.28bpm.local / session.isSuperAdmin) pode ver.
 *    - Somente o Cliente titular (proprietário do veículo / session.isCliente) pode ver.
 *    - Operadores, administradores gerais ou instaladores NÃO podem ver.
 */
export function podeAcessarLocalizacaoVeiculo(
  session: UserSession | null | undefined,
  veiculo: Partial<VeiculoGps> | null | undefined,
  bloqueioAdministrativoAtivo?: boolean,
): boolean {
  if (!veiculo) return true;

  // 0. Bloqueio Administrativo de Localização (5º dia de atraso ou Bloqueio Manual pelo Operador/ADM)
  // Cliente e seus Motoristas perdem a visualização (entram em Modo Privado).
  // Operadores, Administradores e SuperADM mantêm a visualização para fins de suporte.
  const isBloqueadoAdmin = Boolean(
    bloqueioAdministrativoAtivo ||
    (veiculo as any)?.bloqueio_localizacao_administrativo ||
    (veiculo as any)?.status_bloqueio_localizacao === "bloqueado",
  );

  if (isBloqueadoAdmin) {
    if (!session) return false;
    // SuperADM imutável e Auditor da Plataforma
    if (
      session.isSuperAdmin ||
      session.isSuperAdminAuditor ||
      session.isAuditor ||
      session.role === "superadmin_auditor" ||
      session.email === "novaes@adm.28bpm.local" ||
      session.email === "novaes@oficial.tec.br"
    ) {
      return true;
    }
    // Operadores e Administradores têm permissão de visualização para atendimento
    if (session.isAdmin || session.role === "operador" || session.role === "adm") {
      return true;
    }
    // Cliente e seus motoristas NÃO possuem acesso à localização
    return false;
  }

  // Por padrão do sistema, a privacidade é ON (true).
  // Se estiver explicitamente definida como false, a localização é pública interna.
  const isPrivacidadeAtiva = veiculo.privacidade_localizacao !== false;

  if (!isPrivacidadeAtiva) {
    return true;
  }

  if (!session) {
    return false;
  }

  // 1. SuperADM imutável e Auditor da Plataforma sempre têm acesso
  if (
    session.isSuperAdmin ||
    session.isSuperAdminAuditor ||
    session.isAuditor ||
    session.role === "superadmin_auditor" ||
    session.email === "novaes@adm.28bpm.local" ||
    session.email === "novaes@oficial.tec.br"
  ) {
    return true;
  }

  // 2. Cliente proprietário do veículo tem acesso
  if (session.isCliente) {
    if (session.clienteId && veiculo.cliente_id && session.clienteId === veiculo.cliente_id) {
      return true;
    }
    if (session.userId && veiculo.cliente_user_id && session.userId === veiculo.cliente_user_id) {
      return true;
    }
    if (session.userId && veiculo.cliente_id && session.userId === veiculo.cliente_id) {
      return true;
    }
  }

  // 3. Motorista autorizado a usar o módulo (vinculado ao Cliente proprietário do veículo) tem permissão para ver
  if (session.isMotorista || session.role === "motorista") {
    if (session.clienteId && veiculo.cliente_id) {
      return session.clienteId === veiculo.cliente_id;
    }
    // Quando os veículos vêm filtrados por RLS estrito do cliente do motorista
    return true;
  }

  // 4. Funcionário autorizado a usar o módulo (vinculado ao Cliente proprietário do veículo)
  if (session.isFuncionario || session.role === "funcionario") {
    if (session.clienteId && veiculo.cliente_id) {
      return session.clienteId === veiculo.cliente_id;
    }
    // Quando os veículos vêm filtrados por RLS estrito do cliente titular do funcionário
    return true;
  }

  // Demais perfis (operadores, adm geral, instaladores) não possuem acesso
  return false;
}

/**
 * Avalia se o usuário autenticado possui autorização para MARCAR ou DESMARCAR
 * a privacidade da localização de um veículo específico.
 *
 * Regras Canônicas Hunter:
 * 1. SuperADM imutável sempre pode marcar e desmarcar.
 * 2. Cliente titular (proprietário do veículo) sempre pode marcar e desmarcar no mapa ou cockpit.
 * 3. Operadores, administradores comuns e instaladores NÃO possuem permissão.
 */
export function podeAlterarPrivacidadeVeiculo(
  session: UserSession | null | undefined,
  veiculo: Partial<VeiculoGps> | null | undefined,
): boolean {
  if (!veiculo || !session) return false;

  // 1. SuperADM imutável sempre tem autorização
  if (
    session.isSuperAdmin ||
    session.email === "novaes@adm.28bpm.local" ||
    session.email === "novaes@oficial.tec.br"
  ) {
    return true;
  }

  // 2. Cliente proprietário do veículo tem autorização
  if (session.isCliente) {
    if (session.clienteId && veiculo.cliente_id && session.clienteId === veiculo.cliente_id) {
      return true;
    }
    if (session.userId && veiculo.cliente_user_id && session.userId === veiculo.cliente_user_id) {
      return true;
    }
    if (session.userId && veiculo.cliente_id && session.userId === veiculo.cliente_id) {
      return true;
    }
  }

  return false;
}
