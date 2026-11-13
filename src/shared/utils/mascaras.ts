/**
 * Formata dinamicamente telefone celular ou fixo brasileiro:
 * - Até 10 dígitos: (XX) XXXX-XXXX
 * - 11 dígitos: (XX) XXXXX-XXXX
 */
export function formatarTelefone(valor: string): string {
  // Pedido do usuário: "quero com a mascara ao digitar no campo tel ou cel"
  const digits = valor.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Formata dinamicamente documento brasileiro (CPF ou CNPJ):
 * - Até 11 dígitos: CPF (000.000.000-00)
 * - 12 a 14 dígitos: CNPJ (00.000.000/0001-00)
 */
export function formatarCpfCnpj(valor: string): string {
  const digits = valor.replace(/\D/g, "").slice(0, 14);
  if (!digits) return "";

  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}
