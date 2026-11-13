// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Gerador Canônico de Scripts e Comandos de Hardware J16 / GT06
// Gera comandos padronizados para programação e implementação em dispositivos físicos
// Sanitização física comprovada: SZCS# sem '#' no final, Concox com '#' no final
// ─────────────────────────────────────────────────────────────────────────────

import { type ParametrosPadraoComparativo } from "./comparativoPadroesConstantes";
import { sanitizarComandoHardware } from "@/shared/lib/hunterHardwareComandos";

export interface ComandoDispositivoParametro {
  cmd: string;
  comando: string; // Alias ergonômico idêntico a cmd
  nome: string;
  descricao: string;
  categoria: "transmissao" | "curva" | "energia" | "sensores" | "reboot";
}

function criarItemComando(
  cmdCru: string,
  nome: string,
  descricao: string,
  categoria: "transmissao" | "curva" | "energia" | "sensores" | "reboot",
): ComandoDispositivoParametro {
  const cmd = sanitizarComandoHardware(cmdCru);
  return {
    cmd,
    comando: cmd,
    nome,
    descricao,
    categoria,
  };
}

export type ParametrosEntradaComandos = Partial<ParametrosPadraoComparativo>;

/**
 * Gera a sequência oficial de comandos de calibração e parametrização
 * para o hardware J16 / GT06 a partir dos parâmetros de rastreamento.
 */
export function gerarScriptComandosDispositivoJ16(
  p: ParametrosEntradaComandos,
  _nomePadrao?: string,
): ComandoDispositivoParametro[] {
  // Limites físicos comprovados do hardware J16 / GT06:
  // TIMER: T1 (movimento) = 5 a 300s; T2 (parado) = 5 a 3600s (padrão homologado Voxter de 1h)
  // HBT: T1 (movimento) = 30 a 300s; T2 (parado) = 60 a 600s (padrão homologado Voxter de 5 min)
  const timerMovimento = Math.min(300, Math.max(5, p.timerMovimento ?? 30));
  const timerParado = Math.min(3600, Math.max(5, p.timerParado ?? 3600));
  const hbtLigado = Math.min(300, Math.max(30, p.hbtLigado ?? 300));
  const hbtDesligado = Math.min(600, Math.max(60, p.hbtDesligado ?? 300));
  const anguloGrau = Math.min(90, Math.max(5, p.anguloGrau ?? 20));
  const anguloIntervalo = Math.min(60, Math.max(10, p.anguloIntervalo ?? 10));
  const anguloAtivo =
    p.anguloHabilitado !== false && (p.anguloHabilitado === true || anguloGrau > 0);
  const modoEconomiaParada = p.modoEconomiaParada ?? true;
  const sensibilidadeGSensor = Math.min(5, Math.max(1, p.sensibilidadeGSensor ?? 3));
  const pacoteEstendidoIexvol = p.pacoteEstendidoIexvol ?? true;

  const comandos: ComandoDispositivoParametro[] = [
    criarItemComando(
      `TIMER,${timerMovimento},${timerParado}#`,
      "Frequência de Transmissão (Timers)",
      `Transmissão a cada ${timerMovimento}s em movimento e ${timerParado}s parado`,
      "transmissao",
    ),
    criarItemComando(
      `HBT,${hbtLigado},${hbtDesligado}#`,
      "Heartbeat de Liveness (Keep-Alive)",
      `Ping a cada ${hbtLigado}s com ignição ON e ${hbtDesligado}s com ignição OFF`,
      "transmissao",
    ),
    criarItemComando(
      anguloAtivo ? "SZCS#ANGLE,SEND=1" : "SZCS#ANGLE,SEND=0",
      anguloAtivo ? "Habilitar Detecção de Curva" : "Desabilitar Detecção de Curva",
      anguloAtivo
        ? "Ativa o registrador de detecção angular de curvatura na MCU"
        : "Desativa disparos angulares (transmissão puramente temporal)",
      "curva",
    ),
  ];

  if (anguloAtivo) {
    const segAmos = Math.max(10, anguloIntervalo || 10);
    const grausStr = String(anguloGrau).padStart(3, "0");
    comandos.push(
      criarItemComando(
        `SZCS#ANGLEVALUE=${segAmos}-${grausStr}`,
        "Calibração de Curva e Jitter",
        `Janela física de checagem de ${segAmos}s e limiar de curvatura de ${anguloGrau}°`,
        "curva",
      ),
    );
  }

  comandos.push(
    criarItemComando(
      `SENDS,${modoEconomiaParada ? 1 : 0}#`,
      "Economia ao Parar (SENDS)",
      modoEconomiaParada
        ? "SENDS=1: Entra em modo de economia após 1 minuto de repouso na garagem"
        : "SENDS=0: Mantém GPS ativo continuamente mesmo estacionado",
      "energia",
    ),
  );

  comandos.push(
    criarItemComando(
      `LEVEL,${sensibilidadeGSensor}#`,
      "Sensibilidade do G-Sensor",
      `Calibra o acelerômetro interno no Nível ${sensibilidadeGSensor} (1=sensível, 5=firme)`,
      "sensores",
    ),
  );

  comandos.push(
    criarItemComando(
      pacoteEstendidoIexvol ? "SZCS#GT06IEXVOL=2" : "SZCS#GT06IEXVOL=0",
      "Pacote Estendido GT06 (0x94)",
      pacoteEstendidoIexvol
        ? "Transmite voltagem externa de bateria e odômetro acumulado no pacote GT06"
        : "Pacote GT06 básico compacto sem telemetria estendida",
      "sensores",
    ),
  );

  comandos.push(
    criarItemComando(
      "RESET#",
      "Reinicialização da MCU (Ajuste a Quente)",
      "Reinicia o microcontrolador do rastreador para aplicar todos os parâmetros na memória flash",
      "reboot",
    ),
  );

  return comandos;
}

/**
 * Converte a lista de comandos para uma string pronta para a área de transferência.
 * Suporta array de comandos ou objeto de parâmetros.
 */
export function formatarComandosParaCopia(
  origem: ComandoDispositivoParametro[] | ParametrosEntradaComandos,
  modo: "linhas" | "sms" | "sms_concatenado" = "linhas",
): string {
  const comandos = Array.isArray(origem) ? origem : gerarScriptComandosDispositivoJ16(origem);

  if (modo === "sms" || modo === "sms_concatenado") {
    return comandos.map((c) => c.cmd).join(";");
  }
  return comandos.map((c) => c.cmd).join("\n");
}

/**
 * Copia os comandos gerados para a área de transferência com suporte a SSR/Browser.
 */
export async function copiarComandosDispositivo(
  origem: ComandoDispositivoParametro[] | ParametrosEntradaComandos,
  modo: "linhas" | "sms" | "sms_concatenado" = "linhas",
): Promise<{ sucesso: boolean; total: number; texto: string }> {
  const comandos = Array.isArray(origem) ? origem : gerarScriptComandosDispositivoJ16(origem);
  const texto = formatarComandosParaCopia(comandos, modo);

  if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return { sucesso: true, total: comandos.length, texto };
    } catch {
      return { sucesso: false, total: comandos.length, texto };
    }
  }
  return { sucesso: true, total: comandos.length, texto };
}
