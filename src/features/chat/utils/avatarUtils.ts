// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Utilitários de Avatar e Estilo Neumórfico do Chat
// Regra: "as imagens use a letra da inicial do usuario"
// ─────────────────────────────────────────────────────────────────────────────

const GRADIENTES_AVATAR: string[] = [
  "from-amber-400 to-orange-500",
  "from-blue-500 to-indigo-600",
  "from-emerald-400 to-teal-600",
  "from-rose-400 to-pink-600",
  "from-violet-500 to-purple-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-500 to-pink-600",
  "from-teal-400 to-cyan-600",
  "from-orange-400 to-amber-600",
  "from-indigo-500 to-blue-600",
];

/**
 * Obtém a inicial maiúscula do nome do usuário.
 */
export function obterInicialUsuario(nome?: string): string {
  if (!nome || !nome.trim()) return "U";
  const limpo = nome.trim().replace(/^[^a-zA-Z0-9À-ÿ]+/, "");
  return limpo ? limpo.charAt(0).toUpperCase() : "U";
}

/**
 * Retorna uma classe de gradiente determinística baseada no nome do usuário.
 */
export function obterGradienteAvatar(nome?: string): string {
  if (!nome) return GRADIENTES_AVATAR[0];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % GRADIENTES_AVATAR.length;
  return GRADIENTES_AVATAR[idx];
}
