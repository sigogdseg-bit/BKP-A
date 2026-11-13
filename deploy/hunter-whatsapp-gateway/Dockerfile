# ── STAGE 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Instala git e ferramentas de compilação necessárias para dependências do Baileys
RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY scripts/ ./scripts/
RUN npm ci && node scripts/patch-baileys.mjs --check

COPY src/ ./src/
RUN npm run build

# ── STAGE 2: Produção Leve ───────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV WHATSAPP_SESSION_DIR=/data/session

# Cria pasta de dados persistentes
RUN mkdir -p /data/session

COPY package.json package-lock.json ./
COPY scripts/ ./scripts/
RUN npm ci --omit=dev && node scripts/patch-baileys.mjs --check

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["node", "--max-old-space-size=180", "dist/server.js"]
