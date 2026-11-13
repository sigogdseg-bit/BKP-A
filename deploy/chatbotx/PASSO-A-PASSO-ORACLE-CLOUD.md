# Guia de Implantação Gratuita do ChatbotX na Oracle Cloud (Always Free)

Este guia ensina como obter um servidor na nuvem com **até 24 GB de RAM e 4 CPUs 100% gratuito para sempre** na Oracle Cloud e subir o **ChatbotX** com um único comando.

---

## Passo 1: Criar a Conta Gratuita na Oracle Cloud

1. Acesse: **[https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)**
2. Clique no botão **"Start for free"** (Começar de graça).
3. Preencha seus dados:
   - **Região de Origem (Home Region):** Escolha **Brazil East (Sao Paulo)** ou **Brazil Southeast (Vinhedo)** para menor latência.
   - Forneça um cartão de crédito para verificação de identidade (a Oracle faz uma cobrança temporária de US$ 1 e estorna imediatamente para validar que você é uma pessoa real).

---

## Passo 2: Criar a Máquina Virtual Gratuita (Instância)

1. No painel da Oracle Cloud, clique no menu superior esquerdo (três barras) e vá em:  
   **Compute (Computação)** ➔ **Instances (Instâncias)**.
2. Clique no botão azul **"Create Instance" (Criar Instância)**.
3. Configure os seguintes campos:
   - **Nome:** `chatbotx-sigo-guardiao`
   - **Imagem e Forma (Image and Shape):**
     - Clique em _Edit (Editar)_.
     - Imagem: Selecione **Canonical Ubuntu** (versão 24.04 ou 22.04).
     - Forma (Shape): Escolha **Ampere (ARM)** ➔ `VM.Standard.A1.Flex` com **2 a 4 OCPUs** e **8 a 16 GB de RAM** (Tudo 100% elegível para _Always Free_).
   - **Rede (Networking):** Deixe a VCN padrão criada e certifique-se de que a opção _"Assign a public IPv4 address"_ (Atribuir endereço IPv4 público) esteja marcada como **Yes**.
   - **Chaves SSH (Add SSH keys):**
     - Selecione **"Generate a key pair for me"** e clique no botão **"Save Private Key" (Salvar Chave Privada)** para baixar o arquivo no seu computador.
4. Clique no botão **"Create" (Criar)** no final da página.
5. Em cerca de 1 a 2 minutos, o status mudará para **RUNNING (Em execução)** e você verá o **Public IP Address (Endereço IP Público)** da máquina.

---

## Passo 3: Liberar as Portas na Rede da Oracle (Security List)

Por padrão, a nuvem da Oracle bloqueia conexões externas que não sejam SSH (porta 22). Para acessar o ChatbotX, libere as portas:

1. Na página da sua Instância, clique no link da **Virtual Cloud Network (VCN)** (abaixo de _Instance details_).
2. Clique em **Security Lists (Listas de Segurança)** ➔ **Default Security List**.
3. Clique em **Add Ingress Rules (Adicionar Regras de Entrada)** e adicione:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Destination Port Range:** `80, 443, 3123`
   - **Description:** `ChatbotX Web e SSL`
4. Clique em **Add Ingress Rules**.

---

## Passo 4: Conectar via SSH e Rodar o Script em 1 Comando

Abra o Terminal no seu Mac e execute:

```bash
# 1. Dê permissão segura à chave que você baixou
chmod 400 ~/Downloads/ssh-key-*.key

# 2. Conecte na máquina (substitua pelo IP da sua instância)
ssh -i ~/Downloads/ssh-key-*.key ubuntu@SEU_IP_PUBLICO
```

Assim que estiver conectado dentro da máquina da Oracle Cloud, cole este **único comando**:

```bash
curl -fsSL https://raw.githubusercontent.com/sigogdseg-bit/main/main/deploy/chatbotx/instalar-oracle-cloud.sh | sudo bash
```

---

## Passo 5: O que o script fará automaticamente

O script irá:

1. Instalar o **Docker** e o **Docker Compose**.
2. Abrir o firewall do Linux nas portas `80`, `443` e `3123`.
3. Gerar senhas de alta segurança no `.env`.
4. Baixar e subir todos os containers do ChatbotX.
5. Ao final, mostrará o link do painel: `http://SEU_IP_PUBLICO:3123`.

Abra esse link no navegador, crie o seu usuário administrador e escaneie o QR Code do WhatsApp!
