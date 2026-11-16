#!/usr/bin/env bash
# deploy.sh — Deploy automatizado do Micro-Gateway WhatsApp no Fly.io (Custo Zero)
set -e

APP_NAME="gd-whatsapp-gateway"
REGION="gru"
FLYCTL="$HOME/.fly/bin/flyctl"

if ! command -v "$FLYCTL" &> /dev/null; then
  FLYCTL="flyctl"
fi

echo "🚀 [GD SEGURANÇA WHATSAPP] Iniciando deploy no Fly.io..."

# 1. Verifica ou cria o app no Fly.io
if ! $FLYCTL status --app "$APP_NAME" &> /dev/null; then
  echo "📦 Criando aplicação $APP_NAME na região $REGION..."
  $FLYCTL apps create "$APP_NAME"
fi

# 2. Cria o volume persistente de 1 GB se não existir
if ! $FLYCTL volumes list --app "$APP_NAME" | grep -q "gd_whatsapp_data"; then
  echo "💾 Criando volume persistente gd_whatsapp_data (1 GB) em $REGION..."
  $FLYCTL volumes create gd_whatsapp_data --app "$APP_NAME" --region "$REGION" --size 1 --yes
fi

# 3. Executa o deploy da máquina de 256 MB
echo "⚡ Enviando build e subindo máquina..."
$FLYCTL deploy --app "$APP_NAME"

echo ""
echo "✅ [SUCESSO] WhatsApp Gateway está no ar!"
echo "📲 Acesse https://$APP_NAME.fly.dev/qrcode no seu navegador para escanear o QR Code."
