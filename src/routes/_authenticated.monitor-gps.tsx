import React, { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GpsMonitorView } from "@/features/monitor-gps/components/GpsMonitorView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/monitor-gps")({
  component: MonitorGpsRoute,
});

function MonitorGpsRoute() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const isAcaoMontarRota =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("acao") === "montar-rota";

  useEffect(() => {
    if (isAcaoMontarRota && !podeAcessarModulo(session, "monitor-gps")) {
      navigate({ to: "/rotas", replace: true });
    }
  }, [isAcaoMontarRota, session, navigate]);

  if (!podeAcessarModulo(session, "monitor-gps")) {
    if (isAcaoMontarRota) {
      return null;
    }
    const msg = session?.isMotorista
      ? "O acesso ao Mapa Operacional não foi autorizado no cadastro deste motorista. Entre em contato com o gestor da frota para solicitar liberação."
      : "O módulo de rastreamento veicular e mapa operacional não foi liberado para o seu perfil.";
    return <AcessoModuloRestrito moduloNome="Mapa Operacional e Telemetria" mensagem={msg} />;
  }

  return <GpsMonitorView />;
}
