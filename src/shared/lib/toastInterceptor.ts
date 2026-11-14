import { toast } from "sonner";
import { sanitizarMensagemErro } from "@/shared/utils/erroAmigavel";

/**
 * Interceptor Global de Toasts do GD Rastreamento
 * Garante fisicamente em tempo de execução que NENHUM erro contendo
 * jargões de backend (schema cache, PGRST, tabelas, colunas, SQL)
 * seja renderizado na tela do usuário, mesmo que algum ponto do código
 * tente chamar toast.error(err.message).
 */
let interceptorAtivo = false;

export function ativarInterceptorGlobalDeToast() {
  if (interceptorAtivo || typeof window === "undefined") return;
  interceptorAtivo = true;

  // Intercepta toast.error
  const originalError = toast.error;
  if (typeof originalError === "function") {
    toast.error = ((message: any, data?: any) => {
      const mensagemLimpa = sanitizarMensagem(message);
      return originalError(mensagemLimpa, data);
    }) as typeof toast.error;
  }

  // Intercepta toast.warning
  const originalWarning = toast.warning;
  if (typeof originalWarning === "function") {
    toast.warning = ((message: any, data?: any) => {
      const mensagemLimpa = sanitizarMensagem(message);
      return originalWarning(mensagemLimpa, data);
    }) as typeof toast.warning;
  }

  // Intercepta toast.info
  const originalInfo = toast.info;
  if (typeof originalInfo === "function") {
    toast.info = ((message: any, data?: any) => {
      const mensagemLimpa = sanitizarMensagem(message);
      return originalInfo(mensagemLimpa, data);
    }) as typeof toast.info;
  }
}

function sanitizarMensagem(msg: any): any {
  if (!msg) return msg;
  if (typeof msg === "string") {
    return sanitizarMensagemErro(msg);
  }
  if (typeof msg === "object" && (msg.message || msg.details || msg.hint)) {
    return sanitizarMensagemErro(msg);
  }
  return msg;
}

// Ativação automática ao importar o módulo
ativarInterceptorGlobalDeToast();
