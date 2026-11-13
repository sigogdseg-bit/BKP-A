import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/motorista")({
  beforeLoad: () => {
    throw redirect({ to: "/abastecimento" });
  },
  component: () => null,
});
