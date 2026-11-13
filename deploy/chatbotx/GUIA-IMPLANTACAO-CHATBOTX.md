# Manual de Implantação do ChatbotX como Microsserviço — SIGO Guardião

Este guia orienta a instalação e conexão do **ChatbotX** (alternativa open source ao ManyChat com 9 canais: WhatsApp, Telegram, Instagram, Messenger, TikTok, Zalo, e-mail, webchat e API) como microsserviço desacoplado do **SIGO Guardião**.

---

## 1. Por que rodar como Microsserviço Isolado?

| Característica           | SIGO Guardião                                             | ChatbotX (Microsserviço)                        |
| :----------------------- | :-------------------------------------------------------- | :---------------------------------------------- |
| **Ambiente de Execução** | Cloudflare Pages / Workers (Serverless Edge)              | Docker Compose (Containers Persistentes 24/7)   |
| **Banco de Dados**       | Supabase (PostgreSQL + RLS estrito de segurança veicular) | TimescaleDB próprio + Redis + S3 RustFS         |
| **Uso de Memória**       | < 128 MB (Edge instantâneo)                               | 2 GB a 4 GB RAM (filas, workers de IA, brokers) |
| **Comunicação**          | Webhooks assinados com token de alta entropia             | API REST + Webhooks + Protocolo MCP             |

Ao manter o ChatbotX isolado, uma sobrecarga de mensagens no WhatsApp jamais interfere no rastreamento veicular e na segurança dos carros em tempo real.

---

## 2. Requisitos de Infraestrutura

- **Sistema Operacional:** Ubuntu 22.04 LTS ou 24.04 LTS.
- **Hardware Mínimo:** 2 vCPUs e 2 GB de RAM (Recomendado: 4 GB de RAM).
- **Docker:** Docker Engine + Docker Compose Plugin instalados.
- **Portas Liberadas:**
  - `80/TCP` (HTTP para validação Let's Encrypt do Caddy)
  - `443/TCP` (HTTPS com certificado SSL automático)
  - `3123/TCP` (Opcional caso não use Caddy ou use proxy reverso externo como Nginx/Traefik)

---

## 3. Passo a Passo de Instalação (3 Minutos)

### Passo 1: Transferir os arquivos para o servidor ou clonar

No servidor VPS (ou pasta dedicada):

```bash
# Criar diretório do serviço
mkdir -p /opt/chatbotx
cd /opt/chatbotx

# Copie os arquivos da pasta deploy/chatbotx deste repositório para o servidor:
# - docker-compose.yml
# - .env.example -> renomear para .env
# - Caddyfile
```

### Passo 2: Configurar o arquivo `.env`

```bash
cp .env.example .env
nano .env
```

Gere chaves de alta entropia para os segredos:

```bash
# Gerar chaves aleatórias seguras:
openssl rand -base64 32
openssl rand -hex 32
```

Preencha no `.env`:

- `CHATBOTX_PUBLIC_URL=https://chat.hunter.oficial.tec.br`
- `CHATBOTX_DOMAIN=chat.hunter.oficial.tec.br`
- `BETTER_AUTH_SECRET=sua_chave_base64_gerada`
- `ENCRYPTION_KEY=sua_chave_hex_64_chars`
- `HUNTER_WEBHOOK_SECRET=token_secreto_para_comunicar_com_sigo_guardiao`

### Passo 3: Iniciar a Stack

```bash
docker compose pull
docker compose up -d
```

Verifique os logs:

```bash
docker compose logs -f builder worker
```

Acesse no navegador:
`https://chat.hunter.oficial.tec.br` (ou `http://SEU_IP:3123` caso não use domínio com Caddy).

---

## 4. Configuração dos Canais de Comunicação

### WhatsApp (Via QR Code ou Meta Cloud API)

1. No painel do ChatbotX, vá em **Channels** -> **WhatsApp**.
2. Escolha o provedor de conexão (Web QR Code ou WhatsApp Cloud API oficial da Meta).
3. Aponte a câmera do WhatsApp para autenticar o número de suporte/alertas do SIGO Guardião.

### Telegram

1. Abra o Telegram e procure por `@BotFather`.
2. Digite `/newbot`, defina o nome (ex: `SIGO Guardiao Alertas`) e username.
3. Copie o `Bot Token` gerado e cole em **Channels** -> **Telegram** no ChatbotX.

---

## 5. Fluxos de Alertas Automatizados do SIGO Guardião

Quando um hardware J16 detecta uma violação, o SIGO Guardião dispara um webhook POST com o seguinte formato:

### Exemplo de Payload disparado pelo SIGO Guardião:

```json
{
  "evento": "ALERTA_J16",
  "tipo": "POWERALM",
  "titulo": "🚨 ALERTA: Corte de Bateria Externa",
  "placa": "AXH0E44",
  "veiculo": "Volvo XC60",
  "imei": "863874085222366",
  "telefone_destinatario": "5511999999999",
  "data_hora": "13/10/2026 23:45:00",
  "endereco": "Av. Paulista, 1578 - São Paulo/SP",
  "link_rastreamento": "https://sigo.oficial.tec.br/compartilhar/token-exemplo"
}
```

No construtor de fluxos do ChatbotX:

1. Crie um **Webhook Trigger** ouvindo o evento `ALERTA_J16`.
2. Adicione uma ação de envio de mensagem no WhatsApp:
   ```text
   🚨 *ALERTA SIGO GUARDIÃO* 🚨

   Veículo: *{{veiculo}}* (Placa: *{{placa}}*)
   Alarme: *Corte de Bateria Externa Detectado*
   Horário: {{data_hora}}
   Localização: {{endereco}}

   Acompanhe ao vivo pelo link seguro:
   {{link_rastreamento}}
   ```

---

## 6. Consulta via Agente de IA com MCP

O ChatbotX possui suporte nativo a **Model Context Protocol (MCP)** e **Tools de IA**.  
Configurando a ferramenta de telemetria do SIGO Guardião no ChatbotX, o cliente pode perguntar no WhatsApp:

- _"Onde está o meu caminhão agora?"_
- _"A ignição do meu Volvo está ligada?"_

O agente de IA consulta a API fechada do Hunter e responde em linguagem natural amigável ao cliente.
