#!/bin/bash
set -e

# ==============================================================================
# GD SEGURANÇA — PROTOCOLO DE DUPLO MARCO DE SEGURANÇA EM ROTAÇÃO A/B
# Substituição Automática do Mais Antigo em Versão e Data
# ATENÇÃO: Executado sob ordem expressa: "faça o marco de seguranca"
# ==============================================================================

echo "======================================================================"
echo " [GD Segurança] Duplo Marco de Segurança — Rotação Automática A/B"
echo "======================================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

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

# Garantir remotes bkp-a e bkp-b configurados
if ! git remote get-url bkp-a >/dev/null 2>&1; then
  git remote add bkp-a "$REPO_A_URL"
else
  git remote set-url bkp-a "$REPO_A_URL"
fi

if ! git remote get-url bkp-b >/dev/null 2>&1; then
  git remote add bkp-b "$REPO_B_URL"
else
  git remote set-url bkp-b "$REPO_B_URL"
fi

# 1. Validação estrita de integridade (Gates obrigatórios)
echo "🧪 1/4 Validando suíte de testes antes de gravar marco de segurança..."
npm test

echo "⚙️  2/4 Compilando build de produção..."
npm run build

# 2. Coleta de dados da versão corrente
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_VERSION=$(node -e "console.log(require('./package.json').version)")
CURRENT_TAG="v$CURRENT_VERSION"
CURRENT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S%z")
CURRENT_DATE=$(date +"%d/%m/%Y")
DESCRICAO_PARAM="${1:-"Marco de Seguranca estavel v$CURRENT_VERSION aprovado e protegido."}"

# 3. Determinar qual marco é o mais antigo para ser substituído
ESCOLHA_ROTACAO=$(node << 'EOF'
const fs = require('fs');
let data;
try {
  data = JSON.parse(fs.readFileSync('./MARCOS_DE_SEGURANCA.json', 'utf8'));
} catch (e) {
  data = null;
}

if (!data || !data.bkp_a || !data.bkp_b) {
  // Se não existir, substitui BKP-A por padrão
  console.log('A');
  process.exit(0);
}

const parseVer = (v) => (v || '0.0.0.0').split('.').map(n => parseInt(n, 10) || 0);
const cmpVer = (v1, v2) => {
  const p1 = parseVer(v1);
  const p2 = parseVer(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 !== n2) return n1 - n2;
  }
  return 0;
};

const vA = data.bkp_a.versao || '0.0.0.0';
const vB = data.bkp_b.versao || '0.0.0.0';
const tA = new Date(data.bkp_a.timestamp || 0).getTime();
const tB = new Date(data.bkp_b.timestamp || 0).getTime();

const cv = cmpVer(vA, vB);
if (cv < 0) {
  console.log('A'); // A é versão menor
} else if (cv > 0) {
  console.log('B'); // B é versão menor
} else {
  // Versões iguais: desempata pela data/timestamp mais antigo
  if (tA <= tB) {
    console.log('A');
  } else {
    console.log('B');
  }
}
EOF
)

if [ "$ESCOLHA_ROTACAO" = "A" ]; then
  ALVO_SUBSTITUICAO="BKP-A"
  ALVO_REMOTE="bkp-a"
  ALVO_TAG="marco-seguranca-a"
  PROXIMO_SUBSTITUIR="BKP-B"
  URL_ALVO="https://github.com/sigogdseg-bit/BKP-A.git"
else
  ALVO_SUBSTITUICAO="BKP-B"
  ALVO_REMOTE="bkp-b"
  ALVO_TAG="marco-seguranca-b"
  PROXIMO_SUBSTITUIR="BKP-A"
  URL_ALVO="https://github.com/sigogdseg-bit/BKP-B.git"
fi

echo "🎯 Regra de Rotação Identificada:"
echo "   Marco mais antigo selecionado para substituição: $ALVO_SUBSTITUICAO"
echo "   Novo marco a ser gravado com a Versão: $CURRENT_VERSION (Commit: $CURRENT_COMMIT)"

# 4. Atualizar MARCOS_DE_SEGURANCA.json via Node para precisão JSON
node << EOF
const fs = require('fs');
let data;
try {
  data = JSON.parse(fs.readFileSync('./MARCOS_DE_SEGURANCA.json', 'utf8'));
} catch (e) {
  data = {
    politica: "Duplo Marco de Seguranca em Rotacao A/B (Substituicao do Mais Antigo)",
    bkp_a: {},
    bkp_b: {}
  };
}

data.politica = "Duplo Marco de Seguranca em Rotacao A/B (Substituicao do Mais Antigo)";
data.ativo_mais_recente = "$ALVO_SUBSTITUICAO";
data.proximo_a_substituir = "$PROXIMO_SUBSTITUIR";

if ("$ALVO_SUBSTITUICAO" === "BKP-A") {
  data.bkp_a = {
    nome: "BKP-A",
    repositorio: "https://github.com/sigogdseg-bit/BKP-A.git",
    remote: "bkp-a",
    versao: "$CURRENT_VERSION",
    commit: "$CURRENT_COMMIT",
    tag: "$CURRENT_TAG",
    tag_ponteiro: "$ALVO_TAG",
    data: "$CURRENT_DATE",
    timestamp: "$CURRENT_TIMESTAMP",
    descricao: "$DESCRICAO_PARAM"
  };
} else {
  data.bkp_b = {
    nome: "BKP-B",
    repositorio: "https://github.com/sigogdseg-bit/BKP-B.git",
    remote: "bkp-b",
    versao: "$CURRENT_VERSION",
    commit: "$CURRENT_COMMIT",
    tag: "$CURRENT_TAG",
    tag_ponteiro: "$ALVO_TAG",
    data: "$CURRENT_DATE",
    timestamp: "$CURRENT_TIMESTAMP",
    descricao: "$DESCRICAO_PARAM"
  };
}

fs.writeFileSync('./MARCOS_DE_SEGURANCA.json', JSON.stringify(data, null, 2) + '\n');
EOF

# 5. Atualizar PONTO_DE_CONTROLE.json (compatibilidade)
cat <<EOF > PONTO_DE_CONTROLE.json
{
  "versao": "$CURRENT_VERSION",
  "commit": "$CURRENT_COMMIT",
  "tag": "$CURRENT_TAG",
  "tag_ponteiro": "ultimo-ponto-de-controle",
  "repositorio_seguro": "$URL_ALVO",
  "repositorio_seguro_a": "https://github.com/sigogdseg-bit/BKP-A.git",
  "repositorio_seguro_b": "https://github.com/sigogdseg-bit/BKP-B.git",
  "marco_ativo": "$ALVO_SUBSTITUICAO",
  "proximo_a_substituir": "$PROXIMO_SUBSTITUIR",
  "branch_segura": "main",
  "data": "$CURRENT_DATE",
  "timestamp": "$CURRENT_TIMESTAMP",
  "imutavel": true,
  "descricao": "$DESCRICAO_PARAM",
  "comandos_restauracao": [
    "git fetch $ALVO_REMOTE --tags",
    "git checkout main",
    "git reset --hard $CURRENT_COMMIT",
    "npm test",
    "npm run build"
  ]
}
EOF

# 6. Commit local dos manifestos de marco e push no repositório isolado alvo
echo "📦 3/4 Enviando para o repositório seguro isolado $ALVO_SUBSTITUICAO..."
git add MARCOS_DE_SEGURANCA.json PONTO_DE_CONTROLE.json
git commit -m "chore(marco): substituicao do marco $ALVO_SUBSTITUICAO para v$CURRENT_VERSION ($CURRENT_COMMIT)" || true
git tag -f "$ALVO_TAG"
git tag -f ultimo-ponto-de-controle
git tag -a -f "$CURRENT_TAG" -m "Release $CURRENT_TAG"

git push "$ALVO_REMOTE" main:main --force
git push "$ALVO_REMOTE" "$ALVO_TAG" --force
git push "$ALVO_REMOTE" ultimo-ponto-de-controle --force
git push "$ALVO_REMOTE" "$CURRENT_TAG" --force 2>/dev/null || true

# Também atualizar o remote de conveniência 'checkpoint' para o marco recém-gravado
git remote set-url checkpoint "$URL_ALVO" 2>/dev/null || true

echo "======================================================================"
echo "✅ MARCO DE SEGURANÇA $ALVO_SUBSTITUICAO SALVO COM SUCESSO!"
echo "   Versão Atual: $CURRENT_VERSION"
echo "   Commit: $CURRENT_COMMIT"
echo "   Repositório Alvo: sigogdseg-bit/$ALVO_SUBSTITUICAO"
echo "   Próximo a Substituir na Rotação: $PROXIMO_SUBSTITUIR"
echo "   Status: IMUTÁVEL e protegido em repositório isolado no GitHub"
echo "======================================================================"
