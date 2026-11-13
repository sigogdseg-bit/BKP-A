#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SIGO GUARDIÃO — INSTALADOR AUTOMATIZADO CHATBOTX (ORACLE CLOUD ALWAYS FREE)
# Executa a instalação completa do Docker, Firewall e Stack ChatbotX em 1 comando
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "=========================================================="
echo "  SIGO GUARDIÃO — INSTALAÇÃO CHATBOTX NA ORACLE CLOUD     "
echo "=========================================================="

# 1. Checagem de privilégios de Root
if [ "$EUID" -ne 0 ]; then
  echo "[-] Por favor, execute como root (use: sudo bash instalar-oracle-cloud.sh)"
  exit 1
fi

echo "[1/6] Atualizando repositórios do Ubuntu..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release ufw netfilter-persistent iptables-persistent

# 2. Instalação oficial do Docker Engine e Docker Compose
echo "[2/6] Instalando Docker e Docker Compose..."
if ! command -v docker &> /dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "[+] Docker já instalado!"
fi

# 3. Liberação do Firewall da Oracle Cloud no Linux (iptables nativo da OCI)
echo "[3/6] Configurando regras de firewall para portas 80, 443 e 3123..."
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3123 -j ACCEPT || true
netfilter-persistent save || true

# 4. Criação da pasta de deploy
DIRETORIO_DESTINO="/opt/chatbotx"
echo "[4/6] Configurando diretório de trabalho em $DIRETORIO_DESTINO..."
mkdir -p "$DIRETORIO_DESTINO"
cd "$DIRETORIO_DESTINO"

# 5. Download dos arquivos de orquestração caso não existam
if [ ! -f "docker-compose.yml" ]; then
  echo "[+] Baixando docker-compose.yml do GD Segurança..."
  curl -fsSL https://raw.githubusercontent.com/sigogdseg-bit/main/main/deploy/chatbotx/docker-compose.yml -o docker-compose.yml
fi

if [ ! -f "Caddyfile" ]; then
  curl -fsSL https://raw.githubusercontent.com/sigogdseg-bit/main/main/deploy/chatbotx/Caddyfile -o Caddyfile || true
fi

# 6. Geração de senhas seguras no .env
if [ ! -f ".env" ]; then
  echo "[5/6] Gerando arquivo .env com credenciais de alta segurança..."
  SENHA_DB=$(openssl rand -hex 16)
  AUTH_SECRET=$(openssl rand -base64 32)
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  IP_PUBLICO=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "SEU_IP")

  cat <<EOF > .env
CHATBOTX_DOMAIN=$IP_PUBLICO
CHATBOTX_PUBLIC_URL=http://$IP_PUBLICO:3123
POSTGRES_USER=chatbotx
POSTGRES_PASSWORD=$SENHA_DB
POSTGRES_DB=chatbotx
BETTER_AUTH_SECRET=$AUTH_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
REALTIME_API_KEY=$(openssl rand -hex 16)
REALTIME_BROADCAST_SECRET=$(openssl rand -hex 32)
JAVASCRIPT_EXECUTOR_TOKEN=$(openssl rand -hex 16)
RUSTFS_ACCESS_KEY=chatbotx_admin
RUSTFS_SECRET_KEY=$(openssl rand -hex 16)
EOF
  echo "[+] .env gerado com sucesso!"
fi

# 7. Inicialização dos Containers
echo "[6/6] Subindo a stack completa do ChatbotX via Docker Compose..."
docker compose pull
docker compose up -d

echo ""
echo "=========================================================="
echo "  [SUCESSO] CHATBOTX ESTÁ ONLINE NA ORACLE CLOUD!         "
echo "=========================================================="
IP_FINAL=$(curl -s https://ifconfig.me || echo "IP_DA_SUA_MAQUINA")
echo ""
echo "  Painel de Controle:  http://$IP_FINAL:3123"
echo "  Status do Docker:    docker compose ps (em $DIRETORIO_DESTINO)"
echo "  Logs em tempo real:  docker compose logs -f"
echo ""
echo "  Próximo passo: Abra o link acima no navegador, crie a conta"
echo "  de Administrador e escaneie o QR Code do WhatsApp!"
echo "=========================================================="
