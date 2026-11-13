import { createFileRoute } from "@tanstack/react-router";
import { InicioHubView } from "@/features/inicio/components/InicioHubView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { GpsMonitorView } from "@/features/monitor-gps/components/GpsMonitorView";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: InicioRoute,
});

function InicioRoute() {
  return <InicioHubView />;
}
