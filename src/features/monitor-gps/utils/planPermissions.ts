import type { UserSession } from "@/features/auth/types";
import type { PlanoCliente } from "@/integrations/supabase/types";

export interface RecursosPlano {
  modo3D: boolean;
  viagensConsolidadas: boolean;
  refazerTrajeto: boolean;
  montarRota: boolean;
  compartilharLocalizacao: boolean;
  telemetriaEletrica: boolean;
  rumoESatelites: boolean;
  sensoresFisicos: boolean;
  alertasAcidente: boolean;
  diasHistorico: number;
}

export function obterRecursosPorPlano(
  session: UserSession | null,
  planoVeiculo?: string,
): RecursosPlano {
  // Se for motorista, montar rota inteligente é SEMPRE permitido; telemetria do mapa depende de autorização no cadastro
  if (session?.isMotorista || session?.role === "motorista") {
    const temAcessoMapa = Boolean(session?.acessoMapaMotorista);
    return {
      modo3D: temAcessoMapa,
      viagensConsolidadas: temAcessoMapa,
      refazerTrajeto: temAcessoMapa,
      montarRota: true, // Montar rota SEMPRE liberado para o motorista!
      compartilharLocalizacao: false,
      telemetriaEletrica: temAcessoMapa,
      rumoESatelites: temAcessoMapa,
      sensoresFisicos: temAcessoMapa,
      alertasAcidente: temAcessoMapa,
      diasHistorico: temAcessoMapa ? 35 : 0,
    };
  }

  // Administradores, SuperADM, Auditor, Operadores e Motoristas autorizados possuem acesso pleno aos recursos do mapa
  if (
    session?.isSuperAdmin ||
    session?.isSuperAdminAuditor ||
    session?.isAuditor ||
    session?.role === "superadmin_auditor" ||
    session?.isAdmin ||
    session?.isOperador ||
    (session?.isMotorista && session?.acessoMapaMotorista)
  ) {
    return {
      modo3D: true,
      viagensConsolidadas: true,
      refazerTrajeto: true,
      montarRota: true,
      compartilharLocalizacao: true,
      telemetriaEletrica: true,
      rumoESatelites: true,
      sensoresFisicos: true,
      alertasAcidente: true,
      diasHistorico: 35,
    };
  }

  // Regra Hunter: Clientes novos possuem degustação do Plano Master por 30 dias a partir do cadastro
  const isTrialMaster = Boolean(session?.isTrialMaster);

  // Se o cliente logado tem plano definido ou se o veículo tem plano específico
  const planoContratado: PlanoCliente = (planoVeiculo ||
    session?.plano ||
    "basico") as PlanoCliente;
  const planoEfetivo: PlanoCliente = isTrialMaster ? "master" : planoContratado;

  switch (planoEfetivo) {
    case "master":
    case "personalizado":
      return {
        modo3D: true,
        viagensConsolidadas: true,
        refazerTrajeto: true,
        montarRota: true,
        compartilharLocalizacao: true,
        telemetriaEletrica: true,
        rumoESatelites: true,
        sensoresFisicos: true,
        alertasAcidente: true,
        diasHistorico: 35, // Buffer de segurança interno (promessa comercial de 30 dias)
      };

    case "pro":
      return {
        modo3D: true,
        viagensConsolidadas: true,
        refazerTrajeto: true,
        montarRota: true, // Rotas e trajetos inteligentes liberados no Plano Pro
        compartilharLocalizacao: true, // Compartilhamento liberado no Plano Pro
        telemetriaEletrica: true,
        rumoESatelites: true,
        sensoresFisicos: false,
        alertasAcidente: false,
        diasHistorico: 20, // Buffer de segurança interno (promessa comercial de 15 dias)
      };

    case "basico":
    default:
      return {
        modo3D: false,
        viagensConsolidadas: false,
        refazerTrajeto: false,
        montarRota: false,
        compartilharLocalizacao: false,
        telemetriaEletrica: false,
        rumoESatelites: false,
        sensoresFisicos: false,
        alertasAcidente: false,
        diasHistorico: 10, // Buffer de segurança interno (promessa comercial de 7 dias)
      };
  }
}
