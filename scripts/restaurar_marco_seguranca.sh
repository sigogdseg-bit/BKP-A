#!/bin/bash
set -e

# ==============================================================================
# GD SEGURANÇA — RESTAURAÇÃO DE MARCO DE SEGURANÇA (A ou B)
# Restaura o código íntegro e seguro diretamente do repositório isolado
# de volta para a aplicação real, sem nenhuma modificação.
# Uso:
#   ./scripts/restaurar_marco_seguranca.sh      (restaura o marco ativo mais recente)
#   ./scripts/restaurar_marco_seguranca.sh A    (restaura especificamente BKP-A)
#   ./scripts/restaurar_marco_seguranca.sh B    (restaura especificamente BKP-B)
# ==============================================================================

echo "======================================================================"
echo " [GD Segurança] Restaurando Sistema a partir do Marco de Segurança"
echo "======================================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ESCOLHA_PARAM="$1"
TOKEN_GITHUB="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN_GITHUB" ]; then
  REMOTE_URL=$(git remote get-url bkp-a 2>/dev/null || git remote get-url origin 2>/dev/null || echo "")
  if [[ "$REMOTE_URL" =~ https://([^@]+)@ ]]; then
    TOKEN_GITHUB="${BASH_REMATCH[1]}"
  fi
fi

if [ -n "$TOKEN_GITHUB" ]; then
  REPO_A_URL="https://${TOKEN_GITHUB}@github.com/sigogdseg-bit/BKP-A.git"
  REPO_B_URL="https://${TOKEN_GITHUB}@github.com/sigogdseg-bit/BKP-B.git"
else
  REPO_A_URL="https://github.com/sigogdseg-bit/BKP-A.git"
  REPO_B_URL="https://github.com/sigogdseg-bit/BKP-B.git"
fi

# Garantir remotes
git remote get-url bkp-a >/dev/null 2>&1 || git remote add bkp-a "$REPO_A_URL"
git remote get-url bkp-b >/dev/null 2>&1 || git remote add bkp-b "$REPO_B_URL"

# Determinar qual marco restaurar
DADOS_RESTAURACAO=$(node -e '
const fs = require("fs");
const escolha = ("'"$ESCOLHA_PARAM"'").toUpperCase();
let data = null;
try {
  data = JSON.parse(fs.readFileSync("./MARCOS_DE_SEGURANCA.json", "utf8"));
} catch(e) {}

if (!data) {
  try {
    const pc = JSON.parse(fs.readFileSync("./PONTO_DE_CONTROLE.json", "utf8"));
    console.log(JSON.stringify({
      alvo: "BKP-B",
      remote: "bkp-b",
      versao: pc.versao,
      commit: pc.commit,
      tag: pc.tag_ponteiro || "ultimo-ponto-de-controle"
    }));
    process.exit(0);
  } catch(err) {
    console.error("Arquivos de marco não encontrados");
    process.exit(1);
  }
}

let alvo = "BKP-B";
if (escolha === "A" || escolha === "BKP-A") {
  alvo = "BKP-A";
} else if (escolha === "B" || escolha === "BKP-B") {
  alvo = "BKP-B";
} else {
  alvo = data.ativo_mais_recente || "BKP-B";
}

const info = (alvo === "BKP-A") ? data.bkp_a : data.bkp_b;
console.log(JSON.stringify({
  alvo: alvo,
  remote: (alvo === "BKP-A") ? "bkp-a" : "bkp-b",
  versao: info.versao,
  commit: info.commit,
  tag: info.tag_ponteiro
}));
')

ALVO_NOME=$(node -e "console.log(JSON.parse(process.argv[1]).alvo)" "$DADOS_RESTAURACAO")
ALVO_REMOTE=$(node -e "console.log(JSON.parse(process.argv[1]).remote)" "$DADOS_RESTAURACAO")
VERSAO_ALVO=$(node -e "console.log(JSON.parse(process.argv[1]).versao)" "$DADOS_RESTAURACAO")
COMMIT_ALVO=$(node -e "console.log(JSON.parse(process.argv[1]).commit)" "$DADOS_RESTAURACAO")
TAG_ALVO=$(node -e "console.log(JSON.parse(process.argv[1]).tag)" "$DADOS_RESTAURACAO")

echo "🎯 Alvo Selecionado: $ALVO_NOME"
echo "   Versão: $VERSAO_ALVO"
echo "   Commit: $COMMIT_ALVO"
echo "   Tag: $TAG_ALVO"

# 1. Fetch do repositório isolado
echo "📦 1/4 Sincronizando com o repositório seguro isolado sigogdseg-bit/$ALVO_NOME..."
git fetch "$ALVO_REMOTE" --tags

# 2. Checkout e reset para a árvore segura
echo "🔄 2/4 Restaurando código íntegro e imutável para a aplicação real..."
git checkout main
if git rev-parse "$ALVO_REMOTE/main" >/dev/null 2>&1; then
  git reset --hard "$ALVO_REMOTE/main"
elif git rev-parse "$TAG_ALVO" >/dev/null 2>&1; then
  git reset --hard "$TAG_ALVO"
else
  git reset --hard "$COMMIT_ALVO"
fi

# 3. Validação
echo "🧪 3/4 Executando suíte de testes de validação..."
npm test

echo "⚙️  4/4 Compilando build de produção..."
npm run build

echo "======================================================================"
echo "✅ SISTEMA RESTAURADO COM SUCESSO A PARTIR DO MARCO $ALVO_NOME!"
echo "   Versão: $VERSAO_ALVO"
echo "   Commit: $COMMIT_ALVO"
echo "   Origem: Repositório sigogdseg-bit/$ALVO_NOME"
echo "   Status: 100% Operacional, Íntegro e Estável"
echo "======================================================================"
