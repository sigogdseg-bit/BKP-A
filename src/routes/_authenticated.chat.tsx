import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/features/chat/components/ChatView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatRoute,
});

function ChatRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "chat")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Chat em Tempo Real"
        mensagem="O módulo de chat não foi liberado para o seu perfil."
      />
    );
  }

  return <ChatView />;
}
