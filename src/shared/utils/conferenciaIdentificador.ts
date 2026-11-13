/**
 * Utilitário Canônico de Conferência de Identificadores (IMEI, Serial, Kit)
 * Regra Pétrea: Se o valor informado bater com o esperado, a validação é absoluta
 * e imediata, sem travas artificiais de tamanho mínimo (1, 2, 4, 15 ou mais dígitos).
 */

export interface ResultadoConferencia {
  confere: boolean;
  mensagem: string;
  valorFormatado: string;
}

export function conferirCorrespondenciaIdentificador(
  informado: string,
  esperado?: string | null,
): ResultadoConferencia {
  if (!informado || !informado.trim()) {
    return {
      confere: false,
      mensagem: "Código não informado.",
      valorFormatado: "",
    };
  }

  const infLimpo = informado.trim();
  const infUpper = infLimpo.toUpperCase();
  const infAlnum = infLimpo.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  const infDigitos = infLimpo.replace(/\D/g, "");

  // Se houver valor esperado (IMEI do kit/rastreador cadastrado):
  // Regra Suprema: Se for igual, VALIDA SEMPRE, sem bloqueio de comprimento mínimo.
  if (esperado && esperado.trim()) {
    const espLimpo = esperado.trim();
    const espUpper = espLimpo.toUpperCase();
    const espAlnum = espLimpo.replace(/[^0-9A-Z]/gi, "").toUpperCase();
    const espDigitos = espLimpo.replace(/\D/g, "");

    const bateu =
      infUpper === espUpper ||
      (infAlnum !== "" && espAlnum !== "" && infAlnum === espAlnum) ||
      (infDigitos !== "" && espDigitos !== "" && infDigitos === espDigitos);

    if (bateu) {
      return {
        confere: true,
        mensagem: `Código validado com sucesso: ${espLimpo}`,
        valorFormatado: espLimpo,
      };
    }

    return {
      confere: false,
      mensagem: `Código informado (${infLimpo}) diverge do esperado (${espLimpo}). Verifique o aparelho físico.`,
      valorFormatado: infLimpo,
    };
  }

  // Sem valor esperado (leitura avulsa):
  const valorFinal = infAlnum || infLimpo;
  return {
    confere: true,
    mensagem: `Código identificado: ${valorFinal}`,
    valorFormatado: valorFinal,
  };
}
