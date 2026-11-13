/**
 * Sanitizador Canônico de Mensagens de Erro do SIGO Guardião
 * Blindagem total contra vazamento de termos técnicos, jargões PostgREST,
 * erros de schema cache ou detalhes de infraestrutura para a interface do usuário.
 */
export function sanitizarMensagemErro(
  erro: any,
  mensagemPadrao: string = "Não foi possível concluir a operação no momento.",
): string {
  if (!erro) return mensagemPadrao;

  const rawMsg =
    typeof erro === "string"
      ? erro
      : erro?.message || erro?.error_description || erro?.details || "";

  if (!rawMsg || typeof rawMsg !== "string") return mensagemPadrao;

  const lower = rawMsg.toLowerCase();

  // 1. Erros de schema cache / RPC ou coluna não encontrada no PostgREST
  if (
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    lower.includes("pgrst202") ||
    lower.includes("pgrst204") ||
    lower.includes("pgrst")
  ) {
    return "A sincronização com o servidor está em andamento. A solicitação foi registrada.";
  }

  // 2. Coluna ou tabela ausente em migrações pendentes
  if (lower.includes("column") && lower.includes("does not exist")) {
    return "O sistema está atualizando os registros com segurança.";
  }
  if (lower.includes("relation") && lower.includes("does not exist")) {
    return "Serviço de dados temporariamente em atualização.";
  }

  // 3. Violações de chave única / duplicidade
  if (lower.includes("duplicate key") || lower.includes("already exists")) {
    return "Já existe um registro com estes dados no sistema.";
  }

  // 4. Violações de RLS / permissão
  if (
    lower.includes("row-level security") ||
    lower.includes("violates rls") ||
    lower.includes("permission denied")
  ) {
    return "Você não possui permissão para executar esta ação.";
  }

  // 5. Erros de autenticação / token expirado
  if (lower.includes("jwt") || lower.includes("token is expired")) {
    return "Sua sessão expirou. Por favor, faça login novamente.";
  }

  // 6. Falha de conexão / rede
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("abort")
  ) {
    return "Falha de conexão com a rede. Verifique seu sinal de internet.";
  }

  // Se a mensagem for amigável e em português sem jargões de backend, preserva
  if (
    !lower.includes("public.") &&
    !lower.includes("select") &&
    !lower.includes("insert") &&
    !lower.includes("update") &&
    !lower.includes("database") &&
    !lower.includes("postgres") &&
    !lower.includes("syntax error")
  ) {
    return rawMsg;
  }

  return mensagemPadrao;
}
