# Rastreador GPS Voxter J16 4G Original — Manual do Usuário v1.1

> **Documento Canônico de Referência de Hardware e Telecomunicações**  
> **Certificação Anatel:** 00452-24-15524  
> **Fabricante / Distribuidor:** Voxter Brasil (`voxter.com.br` / `rastreadorj16.com.br`)  
> **Versão do Manual:** v1.1

---

## 1. Visão Geral e Especificações Técnicas

O **Rastreador GPS J16 4G** é um equipamento telemático veicular de alta sensibilidade com modem celular multi-banda e chipset de posicionamento por satélite dedicado.

### Especificações Físicas e Rádio

| Parâmetro                         | Especificação Oficial                            |
| :-------------------------------- | :----------------------------------------------- |
| **Dimensões**                     | 79 x 38 x 16 mm                                  |
| **Peso**                          | 43,2 g (incluindo bateria interna)               |
| **Bateria Interna**               | 300 mAh / 3,7V Li-ion recarregável               |
| **Faixa de Tensão Externa**       | 9V a 90V DC (suporte pleno a 12V e 24V veicular) |
| **Módulo Celular 4G**             | SIMCom A7670SA                                   |
| **Chipset GNSS / GPS**            | AT6558R                                          |
| **Bandas 4G LTE-FDD**             | B1 / B3 / B5 / B8                                |
| **Bandas 4G LTE-TDD**             | B34 / B38 / B39 / B40 / B41                      |
| **Bandas 3G WCDMA**               | B1 / B5 / B8                                     |
| **Bandas 2G GSM**                 | B3 / B8                                          |
| **Sensibilidade de Rastreamento** | -162 dBm                                         |
| **Sensibilidade de Navegação**    | -160 dBm                                         |
| **TTFF (Cold Start)**             | Média de 32 segundos                             |
| **Sensor de Movimento**           | Acelerômetro G-Sensor Triaxial                   |
| **Protocolo de Rede**             | TCP (Binário GT06 na porta 7002)                 |
| **Temperatura de Operação**       | -20°C a +60°C                                    |

---

## 2. Esquema de Fiação do Chicote (Conector Fêmea de 4 Vias)

O chicote principal padrão do J16 é composto por 4 vias com porta-fusível de lâmina (2A) na linha positiva:

|   Pino / Cor do Fio   | Função Técnica       | Instrução de Instalação no Veículo                                                                   |
| :-------------------: | :------------------- | :--------------------------------------------------------------------------------------------------- |
| **Vermelho** (Pino 4) | **Positivo (+)**     | Conectar à alimentação contínua (+12V ou +24V da bateria). Acompanha fusível 2A de proteção.         |
|  **Preto** (Pino 3)   | **Negativo (-)**     | Cátodo da alimentação. Conectar ao terra / chassi de ferro do veículo de forma independente.         |
| **Laranja** (Pino 2)  | **ACC / Pós-Chave**  | Entrada digital de ignição. Conectar à linha do comutador de ignição (+12V quando a chave é ligada). |
| **Amarelo** (Pino 1)  | **Bloqueio (Corte)** | Saída digital negativa (coletor aberto) para acionamento do relé de corte de combustível/energia.    |

### Orientações para Fiação do Relé 12V

- **Terminal 85:** Conectado ao fio **Amarelo** do chicote do rastreador (sinal de corte negativo).
- **Terminal 86:** Conectado à alimentação positiva (+12V pós-chave ou contínuo).
- **Terminal 30:** Conectado à entrada de energia da bomba de combustível ou relé principal do motor.
- **Terminal 87A (Normalmente Fechado - NF):** Conectado à saída de energia em direção à bomba de combustível.

---

## 3. Diagnóstico por LEDs Indicadores

O J16 possui 3 LEDs SMD visíveis na placa através da carcaça frontal:

### LED Amarelo (Sinal GSM / 4G)

- **Piscando constantemente:** Sem chip SIM ou erro de leitura do cartão M2M.
- **Piscando lentamente:** Buscando sinal de rede GSM/LTE da operadora.
- **Fixo (Aceso contínuo):** Conexão de dados GPRS/TCP ativa e comunicando online com o servidor.
- **Apagado:** Modem GSM em modo de hibernação / repouso.

### LED Azul (Sinal GPS / GNSS)

- **Piscando lentamente:** Buscando sinal dos satélites GPS no céu.
- **Fixo (Aceso contínuo):** Posicionamento GPS fixado com sucesso (Fix 3D / satélites bloqueados).
- **Apagado:** Módulo GNSS em modo de sono (_sleep_).

### LED Vermelho (Alimentação e Bateria)

- **Fixo (Aceso contínuo):** Alimentação externa ativa (12V/24V) e carregando a bateria interna.
- **Apagado:** Sem conexão elétrica externa (operando na bateria interna ou desconectado).

---

## 4. Tabela Canônica de Comandos SMS / GPRS (Manual Oficial Voxter)

> **Regra Sintática Fundamental Comprovada em Laboratório e Hardware Real:**
>
> 1. **Comandos de Registradores (`SZCS#` e `CXCS#`):** O `#` funciona internamente como separador de instrução. Portanto, estes comandos **NUNCA levam `#` no final** (exemplo correto: `SZCS#ACCLINE=1`, `SZCS#MTK_DISSLP=0`). Se um `#` for colocado no final (ex: `SZCS#ACCLINE=1#`), a MCU executa a instrução mas cospe um falso erro de sintaxe (`SETOK: ACCLINE=1 ERROR:`).
> 2. **Comandos Concox / GT06 Padrão:** Utilizam vírgula `,` e **TERMINAM OBRIGATORIAMENTE com sustenido `#`** para telemetria, rede e consultas gerais (ex: `TIMER,20,1800#`, `SERVER,1,...#`, `STATUS#`, `PARAM#`, `RELAY#`, `MILEAGE#`). **Comandos de acionamento do relé (`RELAY,1`, `RELAY,0`, `DYD`, `HFYD`) NUNCA levam sustenido `#` no final**. **Nunca misture os dois formatos** (ex: `TIMER` não leva `SZCS#`).

|   Nº   | Função                                     | Sintaxe Oficial           | Exemplo Prático                       | Observações do Fabricante                                                          |
| :----: | :----------------------------------------- | :------------------------ | :------------------------------------ | :--------------------------------------------------------------------------------- |
| **1**  | Configurar Servidor via DNS                | `SERVER,1,dns,porta,0#`   | `SERVER,1,gps.oficial.tec.br,7002,0#` | Modo TCP com porta 7002 (fallback universal).                                      |
| **2**  | Configurar Servidor via IP                 | `SERVER,0,ip,porta,0#`    | `SERVER,0,167.234.233.82,7002,0#`     | Padrão Canônico: Conexão direta por IP numérico (Oracle Always Free, zero DNS).    |
| **3**  | Configuração de APN M2M                    | `APN,nome,user,pass#`     | `APN,voxter.br,algar,1212#`           | APN de telemetria M2M.                                                             |
| **4**  | **Configurar Tempo de Envio**              | `TIMER,ligado,desligado#` | `TIMER,20,1800#`                      | **1º valor:** ignição ligada (20s). **2º valor:** ignição desligada (1800s / 30m). |
| **5**  | Configurar Timezone (Fuso)                 | `GMT,W/E,offset,min#`     | `GMT,W,0,0#`                          | Alinhamento com horário universal UTC/GMT-0.                                       |
| **6**  | Ignição Virtual Ligada                     | `SZCS#ACCLINE=0`          | `SZCS#ACCLINE=0`                      | Ativa detecção de ignição por acelerômetro G-Sensor.                               |
| **7**  | **Ignição Física Pura (Desligar Virtual)** | `SZCS#ACCLINE=1`          | `SZCS#ACCLINE=1`                      | **Recomendado:** lê estritamente o fio laranja pós-chave.                          |
| **8**  | **Habilitar Envio em Curva**               | `SZCS#ANGLE,SEND=1`       | `SZCS#ANGLE,SEND=1`                   | Habilita o algoritmo de amostragem angular da MCU.                                 |
| **9**  | **Detecção de Curva (Tempo e Ângulo)**     | `SZCS#ANGLEVALUE=X-Y`     | `SZCS#ANGLEVALUE=10-015`              | **X = 10** (segundos mín). **Y = 015** (ângulo da curva em graus). Exige X >= 10.  |
| **10** | **Sono da CPU MTK (Habilitar Sleep)**      | `SZCS#MTK_DISSLP=0`       | `SZCS#MTK_DISSLP=0`                   | **Crítico:** Se for `1`, o J16 nunca dorme e consome dados contínuos mesmo parado. |
| **11** | **Sono do Módulo GNSS/GPS**                | `SZCS#GPS_DISSLP=0`       | `SZCS#GPS_DISSLP=0`                   | Coloca o chip GPS em repouso ao desligar a chave para poupar a bateria veicular.   |
| **12** | **Sleep Modo Carro (4G Online)**           | `SZCS#SLPDISCONNECT=0`    | `SZCS#SLPDISCONNECT=0`                | **Carro:** Modem 4G fica conectado via TCP; comandos remotos respondem na hora.    |
| **13** | **Sleep Modo Moto (4G Offline)**           | `SZCS#SLPDISCONNECT=1`    | `SZCS#SLPDISCONNECT=1`                | **Moto:** Desliga o modem em repouso para não drenar baterias de 5Ah a 7Ah.        |
| **14** | **Tensão da Bateria Externa no Protocolo** | `SZCS#GT06IEXVOL=2`       | `SZCS#GT06IEXVOL=2`                   | Habilita o envio de voltagem externa analógica (12V/24V) nos pacotes GT06.         |
| **15** | **Bloqueio Imediato de Emergência**        | `SZCS#SOURCE,OFF,TYPE=1`  | `SZCS#SOURCE,OFF,TYPE=1`              | Corta a ignição imediatamente sem checar velocidade.                               |
| **16** | **Bloqueio Suave com Salvaguarda**         | `SZCS#SOURCE,OFF,TYPE=0`  | `SZCS#SOURCE,OFF,TYPE=0`              | Bloqueia apenas quando a velocidade for inferior a 20 km/h.                        |
| **17** | Reiniciar Rastreador                       | `RESET#`                  | `RESET#`                              | Reinicia a MCU sem apagar parâmetros gravados.                                     |
| **18** | Reset de Fábrica                           | `FACTORY#`                | `FACTORY#`                            | Restaura as configurações originais de fábrica.                                    |
| **19** | Apagar LEDs                                | `SZCS#LED_ENABLE=0`       | `SZCS#LED_ENABLE=0`                   | Modo discreto (apaga LEDs de status).                                              |
| **20** | Ligar LEDs                                 | `SZCS#LED_ENABLE=1`       | `SZCS#LED_ENABLE=1`                   | Reativa os LEDs SMD.                                                               |
| **21** | **Heartbeat / Ping da Plataforma**         | `HBT,ligado,desligado#`   | `HBT,120,300#` ou `HBT,60,3600#`      | Mantém o socket TCP vivo com a nuvem (Consulta: `PARAM#`).                         |
| **22** | Cadastrar Número S.O.S.                    | `SOS,A,numero#`           | `SOS,A,13122012031#`                  | Alertas de emergência por SMS (Consulta: `PARAM#`).                                |
| **23** | Cadastrar Número de Centro                 | `CENTER,A,numero#`        | `CENTER,A,13122012031#`               | Número administrativo autorizado (Consulta: `PARAM#`).                             |
| **24** | **Bloqueio de Combustível (Concox)**       | `RELAY,1`                 | `RELAY,1`                             | Aciona o relé de corte na saída amarela (Consulta: `STATUS#` ou `RELAY#`).         |
| **25** | **Desbloqueio de Combustível (Concox)**    | `RELAY,0`                 | `RELAY,0`                             | Desativa o corte e restabelece a bomba (Consulta: `STATUS#` ou `RELAY#`).          |
| **26** | **Duração de GPS Ativo Após Parada**       | `SENDS,minutos#`          | `SENDS,1#`                            | **Crucial:** Define quantos min o GPS vigia antes do sleep (1 min = economia máx). |
| **-**  | **Consulta de Parâmetros**                 | `PARAM#`                  | `PARAM#`                              | Retorna APN, IP, porta, DNS e configurações ativas.                                |
| **-**  | **Consulta de Status Geral**               | `STATUS#`                 | `STATUS#`                             | Retorna sinal GSM, satélites GPS, tensão da bateria e relé.                        |
| **-**  | **Consulta de Localização**                | `WHERE#`                  | `WHERE#`                              | Retorna coordenadas instantâneas por satélite.                                     |
| **-**  | **Consulta de Estado do Relé**             | `RELAY#`                  | `RELAY#`                              | Consulta o estado do relé (`Relay:CUT` ou `Relay:RESUME`).                         |

---

## 5. Diagnóstico de Erros Comprovado ao Vivo no Hardware (IMEI 863874085222366)

1. **Por que o J16 respondia `"SETOK: ACCLINE=1 ERROR:"`?**
   - **Causa Raiz Identificada:** O envio do comando era feito com `#` no final (`SZCS#ACCLINE=1#`). Como o microcontrolador usa o `#` para separar múltiplos comandos em lote, ao encontrar o `#` final a MCU executava o `ACCLINE=1`, mas esperava outro comando na sequência. Ao encontrar o fim da string (terminador nulo `\0`), o parser cuspia `ERROR:`.
   - **Comportamento Corrigido:** Enviando `SZCS#ACCLINE=1` (sem `#` final), o J16 responde perfeitamente limpo: `SETOK: ACCLINE=1`.

2. **Causa do Envio Contínuo de Dados a cada 20s com Carro Parado e Desligado:**
   - **Causa Raiz Identificada:** Ao consultar o registrador de fábrica com `CXCS#MTK_DISSLP`, o retorno foi `READOK: MTK_DISSLP=1` ("MTK Disable Sleep = 1"). A função de repouso da CPU estava **desabilitada de fábrica**.
   - **Solução:** O envio de `SZCS#MTK_DISSLP=0` reativou o sleep da CPU e imediatamente a MCU começou a emitir o pacote `0x94` (GT06 Sleep Mode) ao desligar a ignição.

3. **Curvas Inteligentes (`ANGLEVALUE`):**
   - Deve ser precedido de `SZCS#ANGLE,SEND=1`.
   - O intervalo X deve ser no mínimo 10 segundos (ex: `SZCS#ANGLEVALUE=10-015`). Intervalos curtos como `3-015` são rejeitados pelo firmware com `ERROR: ANGLEVALUE=...`.

4. **Capacidade de Receber Comandos em Modo Sleep:**
   - Com `SZCS#SLPDISCONNECT=0` (padrão para automóveis), **o modem 4G e a conexão TCP com o GD Rastreamento nunca são desconectados**.
   - Todos os comandos da plataforma (bloqueio, desbloqueio, consultas) chegam instantaneamente mesmo com o carro desligado e dormindo na garagem.

5. **Por que o J16 continuava transmitindo a cada 15s com o carro desligado na garagem há horas? (`SENDS,A#`):**
   - **Causa Raiz Comprovada:** O parâmetro `SENDS` do protocolo GT06 controla a **duração (em minutos)** que o chip receptor GNSS/GPS e a transmissão contínua rápida permanecem ativos após a ignição física ser desligada (`ACC:OFF`) ou após detecção de movimento/vibração.
   - De fábrica, o J16 vem configurado com **`SENDS:300`** (ou seja, **300 minutos = 5 HORAS COMPLETAS**)!
   - Como o carro havia sido guardado há cerca de 2 horas (menos de 5 horas), o temporizador `SENDS` continuava em contagem regressiva, forçando o hardware a manter o GPS ativo (`GPS:Successful positioning`) e transmitindo no intervalo de ignição ligada (`TIMER ON = 15s`).
   - **Solução Definitiva:** O envio do comando **`SENDS,1#`** (ou `SENDS,2#`) ajusta o tempo de vigília pós-parada para apenas 1 minuto. Exatamente 60 segundos após desligar a chave, o rastreador desliga o GPS (`GPS:OFF`), cessa imediatamente a transmissão a cada 15s, passa para o intervalo de repouso longo configurado em `TIMER OFF` (ex: 1800s / 30m) e mantém o modem 4G conectado (`GPRS:Online`).

---

## 6. Comandos de Engenharia Avançada (`SZCS#`) e Consultas (`CXCS#`)

| Comando                  |  Tipo   | Descrição Técnica e Efeito na MCU                                               |
| :----------------------- | :-----: | :------------------------------------------------------------------------------ |
| `SZCS#MTK_DISSLP=0`      | Config  | Ativa modo de sono da CPU MTK (reduz consumo de bateria e telemetria parada).   |
| `SZCS#GPS_DISSLP=0`      | Config  | Ativa repouso do satélite GPS quando veículo estiver parado e chave desligada.  |
| `SZCS#SLPDISCONNECT=0`   | Config  | Mantém conexão 4G aberta no sleep (modo Carro - recebe comandos imediatamente). |
| `SZCS#SLPDISCONNECT=1`   | Config  | Desconecta 4G no repouso total (modo Moto - economiza 100% da bateria da moto). |
| `SZCS#GT06IEXVOL=2`      | Config  | Ativa transmissão de voltagem da bateria externa nos pacotes GT06.              |
| `SZCS#SOURCE,OFF,TYPE=1` | Config  | Bloqueio imediato (corte instantâneo na ignição sem esperar < 20 km/h).         |
| `SZCS#SOURCE,OFF,TYPE=0` | Config  | Bloqueio padrão de fábrica com salvaguarda (< 20 km/h).                         |
| `CXCS#MTK_DISSLP`        | Leitura | Consulta status de repouso da CPU (`READOK: MTK_DISSLP=0` ou `1`).              |
| `CXCS#GPS_DISSLP`        | Leitura | Consulta status de repouso do GPS (`READOK: GPS_DISSLP=0` ou `1`).              |
| `CXCS#SLPDISCONNECT`     | Leitura | Consulta se 4G desconecta no repouso (`0` = conectado, `1` = desconectado).     |
| `CXCS#ACCLINE`           | Leitura | Consulta se ignição é física (`1`) ou virtual (`0`).                            |

---

## 7. Consultas Avançadas de Sistema (Diagnóstico Passivo Seguro)

Comandos seguros de somente-leitura (`Read-Only`), que não alteram parâmetros e extraem o estado de diagnóstico do J16:

| Comando    | Resposta Esperada                                  | Utilidade no GD Rastreamento                                                    |
| :--------- | :------------------------------------------------- | :------------------------------------------------------------------------------ |
| `PARAM#`   | `IMEI:XXXXX; TIMER:15,3600; HBT:120,300; ...`      | Conferência de APN, servidor, timers e heartbeat ativos na flash.               |
| `STATUS#`  | `Battery:4.2V; GPRS:Online; ACC:OFF; Relay:OFF...` | Nível da bateria interna, status do GPRS, satélites, pino ACC e relé.           |
| `VERSION#` | `Model:J16; Build:202X...; Firmware:...`           | Versão exata do firmware do chip de comunicação SIMCom A7670.                   |
| `SERVER#`  | `IP:167.234.233.82; Port:7002; Protocol:TCP...`    | Consulta imediata do servidor e porta TCP ativos no modem.                      |
| `RELAY#`   | `Relay:CUT` ou `Relay:RESUME`                      | Confirmação do estado físico do relé de bloqueio (se está cortado ou liberado). |
| `GPRSSET#` | `APN:...; User:...; Pass:...`                      | Consulta detalhada e isolada dos parâmetros de conexão de dados móveis.         |
| `SCXSZ#`   | Dados estruturados do microcontrolador             | Resumo simplificado da configuração atual gravada de fábrica.                   |

---

## 8. Configurações de Conectividade GPRS e Limpeza de APN

| Função                    | Sintaxe Oficial           | Observações                                                 |
| :------------------------ | :------------------------ | :---------------------------------------------------------- |
| **Configurar APN M2M**    | `APN,nome,usuario,senha#` | Grava credenciais da operadora móvel.                       |
| **Limpar / Resetar APN**  | `NAPN,,#`                 | Limpa APN gravada e restaura detecção automática pelo chip. |
| **Ligar Dados Móveis**    | `GPRSON,1#`               | Força a reativação do contexto PDP celular.                 |
| **Desligar Dados Móveis** | `GPRSON,0#`               | Desativa a conexão GPRS celular (apenas SMS).               |

---

## 9. Segurança, Âncoras e Alarmes por SMS

| Função                                      | Sintaxe Oficial                      | Resposta / Comportamento                                                                                                  |
| :------------------------------------------ | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| **Alterar Senha Proprietária MCU (ZHENCB)** | `zhencbpwd,senha_antiga,senha_nova#` | Comprovado pelo hardware: `zhencbpwd,161514,672904#` ➔ `"Password Modify Success!"`. Senha de fábrica da placa: `161514`. |
| **Cadastrar Administrador (Master)**        | `CENTER,A,DDD+Numero#`               | Cadastra o número autorizado a receber alertas de corte e guincho.                                                        |
| **Apagar Administrador**                    | `CENTER,D#`                          | Remove o número administrador.                                                                                            |
| **Ativar Alerta de Movimento / Guincho**    | `SENALM,ON,0#`                       | Dispara alerta se o veículo for deslocado com ignição desligada.                                                          |
| **Desativar Alerta de Movimento**           | `SENALM,OFF#`                        | Desliga o sensor de vibração para guincho.                                                                                |
| **Alerta de Excesso de Velocidade**         | `SPEED,ON,velocidade,1#`             | Ex: `SPEED,ON,110,1#` dispara alerta ao exceder 110 km/h.                                                                 |
| **Desativar Alerta de Velocidade**          | `SPEED,OFF#`                         | Desativa a fiscalização de velocidade máxima por hardware.                                                                |
| **Zerar Hodômetro Interno**                 | `MILEAGE=0#`                         | Zera a contagem de quilometragem acumulada na memória da MCU.                                                             |
| **Alarme de Bateria Veicular Cortada**      | `POWERALM,ON,0,5,10#`                | Notifica imediatamente em caso de sabotagem na alimentação 12V.                                                           |
| **Alarme de Bateria Interna Fraca**         | `BATALM,ON,0#`                       | Notifica quando a bateria de emergência cair abaixo do limite.                                                            |
| **Alarme Instantâneo de Ignição (ACCALM)**  | `ACCALM,ON,2#`                       | Dispara pacote 0x16 imediato (0xFE ligado / 0xFF desligado) via GPRS sem esperar o Heartbeat, eliminando o atraso/lag.    |
