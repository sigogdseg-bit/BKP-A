# Hunter WhatsApp Gateway (Micro-Serviço Baileys no Fly.io)

Micro-gateway ultra-leve e autônomo de WhatsApp projetado especificamente para rodar no **Free Tier permanente do Fly.io** (máquina compartilhada de 256 MB de RAM e 1 GB de volume persistente), com **Custo Zero ($0,00/mês)**.

---

## 1. Características e Vantagens

- **Consumo:** ~140 MB a 180 MB de memória RAM (cabe com folga no plano gratuito de 256 MB do Fly.io).
- **Sem Burocracia:** Não precisa de conta de desenvolvedor da Meta, nem aprovação de templates.
- **Persistência de Sessão:** A sessão do WhatsApp fica salva no volume montado em `/data/session`. Mesmo que a máquina reinicie ou você faça novo deploy, o WhatsApp continua conectado.
- **Interface Visual de Conexão:** A rota `/qrcode` exibe o QR Code para você conectar com a câmera do celular em 5 segundos.
- **API Segura:** Rota `/api/send` protegida por token de cabeçalho (`x-hunter-token`).
- **Normalização Automática de Telefones:** Trata DDD, adiciona 55 e formata para o padrão JID do WhatsApp.

---

## 2. Como Subir no Fly.io (Passo a Passo)

Abra o terminal na pasta `deploy/hunter-whatsapp-gateway`:

```bash
cd deploy/hunter-whatsapp-gateway
```

### Passo 1: Criar o App no Fly.io (Caso ainda não tenha criado)

```bash
~/.fly/bin/flyctl apps create hunter-whatsapp-gateway
```

### Passo 2: Criar o Volume Persistente de 1 GB em São Paulo (`gru`)

```bash
~/.fly/bin/flyctl volumes create whatsapp_data --app hunter-whatsapp-gateway --region gru --size 1
```

### Passo 3: Fazer o Deploy

```bash
~/.fly/bin/flyctl deploy
```

---

## 3. Conectando o WhatsApp

1. Acesse no navegador:
   `https://hunter-whatsapp-gateway.fly.dev/qrcode`
2. No seu celular:
   - Abra o WhatsApp.
   - Toque em **Configurações / Três pontinhos** -> **Aparelhos conectados** -> **Conectar um aparelho**.
3. Aponte a câmera para a tela do computador.
4. A tela atualizará automaticamente para:
   **"Conectado e Operacional: +55 (seu número)"**.

Pronto! O gateway agora está online 24 horas por dia para enviar mensagens do SIGO Guardião.

---

## 4. Como o SIGO Guardião Envia Mensagens

O backend ou Edge Worker do SIGO Guardião faz uma requisição HTTP POST simples:

```bash
curl -X POST https://hunter-whatsapp-gateway.fly.dev/api/send \
  -H "Content-Type: application/json" \
  -H "x-hunter-token: hunter-guardiao-whatsapp-secret-key-2026" \
  -d '{
    "numero": "11999999999",
    "mensagem": "🚨 Alerta de Segurança SIGO Guardião: Possível toque detectado no seu veículo!"
  }'
```

Resposta:

```json
{
  "sucesso": true,
  "messageId": "BAE5F1234567890",
  "destinatario": "5511999999999"
}
```
