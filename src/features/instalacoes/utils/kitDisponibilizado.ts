/**
 * Utilitário Canônico de Verificação de Kit Disponibilizado
 * Garante que nenhuma ordem de instalação possa ser agendada ou executada
 * sem que o operador/almoxarifado tenha previamente disponibilizado e vinculado um rastreador/chip real.
 */

const VALORES_NAO_DISPONIBILIZADOS = [
  "AGUARDANDO ESTOQUE",
  "AGUARDANDO_ESTOQUE",
  "PENDENTE",
  "A DEFINIR",
  "A_DEFINIR",
  "SEM RASTREADOR",
  "SEM_RASTREADOR",
  "A CONFERIR",
  "A_CONFERIR",
  "NENHUM",
  "NAO INFORMADO",
  "NÃO INFORMADO",
  "",
];

export function ehPlaceholderImei(imei?: string | null): boolean {
  if (!imei) return true;
  return VALORES_NAO_DISPONIBILIZADOS.includes(imei.trim().toUpperCase());
}

export function temKitDisponibilizado(
  inst?: {
    rastreador_imei?: string | null;
    rastreador_id?: string | null;
    kit_determinado_em?: string | null;
    kit_id?: string | null;
    veiculo?: {
      rastreador_id?: string | null;
      rastreador_imei?: string | null;
    } | null;
  } | null,
): boolean {
  if (!inst) return false;

  // 1. Se tem ID de rastreador/kit atribuído diretamente na ordem
  const rId = (inst.rastreador_id || inst.kit_id || "").trim();
  if (rId && !ehPlaceholderImei(rId)) {
    return true;
  }

  // 2. Se tem data de determinação do kit pelo operador/almoxarifado
  if (inst.kit_determinado_em && inst.kit_determinado_em.trim()) {
    return true;
  }

  // 3. Se o veículo associado possui rastreador atribuído
  if (inst.veiculo) {
    const vRId = (inst.veiculo.rastreador_id || "").trim();
    if (vRId && !ehPlaceholderImei(vRId)) return true;

    const vImei = (inst.veiculo.rastreador_imei || "").trim().toUpperCase();
    if (vImei && !ehPlaceholderImei(vImei)) return true;
  }

  // 4. Se o IMEI do rastreador informado é um número/código real e não um placeholder
  const imei = (inst.rastreador_imei || "").trim().toUpperCase();
  if (imei && !ehPlaceholderImei(imei)) {
    return true;
  }

  return false;
}

export const MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO =
  "Não é possível agendar sem kit disponibilizado para este veículo. O operador deve vincular e disponibilizar o kit antes de definir a data de atendimento.";
