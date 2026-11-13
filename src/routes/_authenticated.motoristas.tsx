import { createFileRoute } from "@tanstack/react-router";
import { MotoristasPage } from "@/features/motoristas/components/MotoristasPage";
import { useAuth } from "@/features/auth/context/AuthContext";

export const Route = createFileRoute("/_authenticated/motoristas")({
  component: MotoristasRoute,
});

function MotoristasRoute() {
  const { session } = useAuth();
  const clienteId = session?.clienteId || "";

  return <MotoristasPage clienteId={clienteId} />;
}
