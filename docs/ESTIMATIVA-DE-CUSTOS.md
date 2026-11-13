# SIGO Guardião — Estimativa de Custos, Capacidade e Dimensionamento de Infraestrutura

> **Documento Oficial de Engenharia e Governança Operacional**  
> **Data de Atualização:** 23/10/2026  
> **Versão de Referência:** v2.1.1.2  
> **Base Amostral Auditada:** Veículos ativos `AXH0E44` e `LTK1A94` (telemetria em tempo real, consumo de banco, dados móveis M2M e micro-gateways).

---

## 1. Resumo Executivo de Capacidade no Plano Gratuito Atual (Custo Zero)

A plataforma opera integralmente no modelo **Free Tier** com altíssima eficiência. A auditoria direta do tráfego e banco de dados determinou a seguinte capacidade operacional sem incorrer em nenhum custo financeiro:

| Estratégia de Retenção de Dados                       | Capacidade de Veículos Ativos | Capacidade de Usuários Concorrentes | Custo Mensal de Servidores |
| :---------------------------------------------------- | :---------------------------: | :---------------------------------: | :------------------------: |
| **Retenção de 30 dias de posições (Recomendado)**     |     **15 a 20 veículos**      |     **50 a 70 acessos diários**     |        **R$ 0,00**         |
| **Retenção de 90 dias sem expurgo**                   |      **5 a 7 veículos**       |     **50 a 70 acessos diários**     |        **R$ 0,00**         |
| **Condensação inteligente de viagens (rotas salvas)** |     **30 a 40 veículos**      |    **80 a 100 acessos diários**     |        **R$ 0,00**         |

### Matriz de Capacidade por Componente de Infraestrutura (Free Tier Atual)

| Componente / Serviço                  |  Plano Atual   | Limite Gratuito               | Consumo Atual (2 Veículos)       | Capacidade Teórica Máxima                    | Gargalo?                 |
| :------------------------------------ | :------------: | :---------------------------- | :------------------------------- | :------------------------------------------- | :----------------------- |
| **Supabase — Armazenamento BD**       |    **Free**    | **500 MB** de armazenamento   | ~45 MB sistema + ~40 MB posições | **15 a 20 veículos** (com 30 dias histórico) | 🔴 **Sim (Principal)**   |
| **Supabase — Egress (Transferência)** |    **Free**    | **5.000 MB / mês** (5 GB)     | ~25 MB / mês (0,5%)              | **~350 a 400 veículos**                      | 🟢 **Não** (Ampla folga) |
| **Supabase — Realtime (WebSockets)**  |    **Free**    | **200 conexões / 2M msgs**    | ~15.000 msgs / mês               | **~80 veículos transmitindo 24h**            | 🟢 **Não** (Ampla folga) |
| **Supabase — Autenticação (Auth)**    |    **Free**    | **50.000 MAU**                | 3 usuários                       | **50.000 usuários cadastrados**              | 🟢 **Não** (Ampla folga) |
| **MapTiler — Mapas e Camadas**        |    **Free**    | **100.000 requisições / mês** | 0 req (stand-by / reserva)       | **~50 a 70 usuários ativos/dia**             | 🟢 **Não** (OSM + Esri)  |
| **Cloudflare — Workers & CDN**        |    **Free**    | **100.000 requisições / dia** | ~4.250 req / dia (4,2%)          | **~500 a 1.000 veículos**                    | 🟢 **Não** (Ampla folga) |
| **Fly.io — Gateway WhatsApp**         | **Free/Hobby** | **3 VMs / 160 GB tráfego**    | 1 VM ativa (94 MB RAM)           | **~300 a 500 veículos**                      | 🟢 **Não** (Ampla folga) |
| **Chips M2M Algar Telecom**           |  **Comodato**  | **20 MB / chip / mês**        | ~8 MB a 14 MB / chip             | **1 veículo por chip**                       | 🟢 **Estável** (1:1)     |

> **Diagnóstico de Gargalo:** O único limite relevante no plano gratuito é o **armazenamento do banco de dados (500 MB no Supabase)**. CPU, memória, tráfego de rede (egress) e requisições HTTP possuem folga para centenas de veículos.

---

## 2. Métricas Reais Auditadas da Operação (2 Veículos Ativos)

- **Volume de Telemetria:**
  - `AXH0E44`: **38.302 posições gravadas** (média de **~800 a 1.200 posições/dia** em dias de deslocamento ativo).
  - `LTK1A94`: **1.746 posições gravadas** (instalado em 19/10, média de **~350 a 580 posições/dia**).
  - **Últimas 24 horas:** **504 posições registradas** somando ambos os veículos.
  - **Tamanho físico do registro:** ~1,1 KB a 1,2 KB em disco (incluindo índices B-Tree de busca por data, placa e chassi).
  - **Consumo de banco mensal por veículo:** **~20 MB a 28 MB / mês**.

- **Consumo de Tráfego de Saída (Supabase Egress):**
  - Consumo mensal atual: **~25 MB** (de uma cota mensal inclusa de **5.000 MB**, correspondendo a apenas **0,5%** de uso).

- **Gateway WhatsApp no Fly.io (Micro-serviço Baileys):**
  - Memória RAM consumida: **94 MB** de um teto de 256 MB por máquina virtual gratuita.
  - Uptime contínuo de mais de 26 horas sem vazamentos de memória.

- **Mapas (MapTiler vs Provedores Diretos):**
  - O motor de mapas do SIGO Guardião opera sobre **OpenStreetMap** (Ruas e Noturno Tático) e **Esri ArcGIS World Imagery** (Satélite Real de alta resolução com overzoom até nível 21). Ambos são provedores públicos gratuitos e ilimitados.
  - A chave do **MapTiler** cadastrada (`dev@oficial.tec.br`) permanece como reserva técnica de redundância (consumo atual: 0 requisições).

---

## 3. Matriz de Limites e Capacidade dos Serviços Atuais

| Serviço / Componente     | Conta / Credencial       | Limite Gratuito (Free Tier)   | Consumo Atual (2 Veículos)       | Capacidade Máxima sem Upgrade                 |
| :----------------------- | :----------------------- | :---------------------------- | :------------------------------- | :-------------------------------------------- |
| **Supabase (Banco)**     | `hunter@oficial.tec.br`  | **500 MB** de armazenamento   | ~45 MB sistema + ~40 MB posições | **15 a 20 veículos** (com expurgo de 30 dias) |
| **Supabase (Egress)**    | `hunter@oficial.tec.br`  | **5.000 MB / mês** (5 GB)     | ~25 MB / mês (0,5%)              | **~350 a 400 veículos**                       |
| **Supabase (Realtime)**  | `hunter@oficial.tec.br`  | **200 conexões / 2M msgs**    | ~15.000 msgs / mês               | **~80 veículos ativos 24h**                   |
| **Supabase (Auth)**      | `hunter@oficial.tec.br`  | **50.000 usuários ativos**    | 3 usuários                       | **50.000 usuários**                           |
| **Cloudflare (Workers)** | `djrnovaes@yahoo.com.br` | **100.000 requisições / dia** | ~4.250 req / dia (4,2%)          | **~500 a 1.000 veículos**                     |
| **Fly.io (WhatsApp)**    | `dev@oficial.tec.br`     | **3 VMs / 160 GB tráfego**    | 1 VM ativa (94 MB RAM)           | **~300 a 500 veículos**                       |
| **MapTiler**             | `dev@oficial.tec.br`     | **100.000 requisições / mês** | 0 (reserva técnica)              | **~2.500 visualizações de mapa/mês**          |
| **Chips M2M (Algar)**    | Algar Telecom            | **20 MB a 50 MB / chip**      | ~8 MB a 14 MB / chip             | **1 chip por veículo**                        |

---

## 4. Tabela de Custos de Upgrade por Categoria

Caso a operação ultrapasse os limites gratuitos, seguem os valores comerciais oficiais para upgrade:

| Categoria / Provedor                                    |    Plano Atual     | Plano de Upgrade                         |               Custo Mensal Estimado               | Benefícios do Upgrade                                                                                                                                                                           |
| :------------------------------------------------------ | :----------------: | :--------------------------------------- | :-----------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Banco de Dados**<br>_(Supabase)_                   | **Free**<br>(R$ 0) | **Pro**                                  |      *_$25 USD / mês**<br>*(~R$ 142 / mês)_       | • Espaço sobe de 500 MB para **8 GB inclusos** (+250 veículos).<br>• Tráfego de saída (Egress) sobe para **250 GB**.<br>• Backups automáticos diários de 7 dias.<br>• Sem pausa de inatividade. |
| **2. Micro-Gateways**<br>_(Fly.io - WhatsApp)_          | **Free**<br>(R$ 0) | **Recurso Dedicado**<br>_(Scale por VM)_ | **$3 a $6 USD / mês**<br>_(~R$ 17 a R$ 34 / mês)_ | • Aumenta a memória da VM para **512 MB ou 1 GB RAM**.<br>• Suporta milhares de disparos simultâneos de WhatsApp sem travar.                                                                    |
| **3. Borda & CDN**<br>_(Cloudflare)_                    | **Free**<br>(R$ 0) | **Workers Paid**                         |       *_$5 USD / mês**<br>*(~R$ 28 / mês)_        | • 10 milhões de requisições / mês inclusas.<br>• Tempo de execução de CPU estendido para 50ms.<br>• _(Desnecessário para frotas abaixo de 1.000 veículos)_.                                     |
| **4. Mapas e Camadas**<br>_(MapTiler)_                  | **Free**<br>(R$ 0) | **Flex / Basic**                         |      *_$20 USD / mês**<br>*(~R$ 115 / mês)_       | • 500.000 requisições de mapa / mês.<br>• _(Dispensável: OpenStreetMap e Esri atendem de forma gratuita e ilimitada)_.                                                                          |
| **5. Conectividade M2M**<br>_(Algar / Multi-operadora)_ |    **Comodato**    | **Pacote M2M 20MB a 50MB**               |   **~R$ 6,50 a R$ 8,50**<br>_por veículo / mês_   | • Conectividade 4G dedicada por veículo para o rastreador J16.                                                                                                                                  |

---

## 5. Ordem Cronológica de Necessidade de Upgrade

1. **1º a ser contratado: Supabase Pro ($25/mês ≈ R$ 142/mês)**
   - **Gatilho:** Quando a frota ativa atingir entre **20 e 25 veículos**.
   - **Motivo:** O acúmulo de posições segundo a segundo se aproximará dos 500 MB.
   - **Efeito:** Expande o limite para 8 GB e resolve a infraestrutura para até **300 veículos**.

2. **2º a ser contratado: Fly.io (+ $3/mês ≈ R$ 17/mês)**
   - **Gatilho:** Quando o volume diário de alertas de velocidade, cerca e relatórios no WhatsApp ultrapassar centenas de disparos.
   - **Motivo:** Dobrar a memória do micro-gateway para 512 MB RAM.

3. **Categorias que dispensam upgrade comercial:**
   - **Cloudflare:** 100 mil requisições/dia atendem centenas de clientes sem custo.
   - **MapTiler:** A combinação OpenStreetMap + Esri Satélite garante mapas perfeitamente nítidos a custo zero.

---

## 6. Viabilidade Econômica e Margem de Lucro por Faixa de Veículos

Simulação financeira baseada em uma mensalidade média de **R$ 69,90/mês por veículo rastreado**:

| Faixa de Veículos | Faturamento Bruto | Custo Chips M2M (R$ 7,50/veic) |   Custo de Servidores / Nuvem    | **Lucro Líquido Mensal** | **Margem Líquida** |
| :---------------: | :---------------: | :----------------------------: | :------------------------------: | :----------------------: | :----------------: |
|  **10 Veículos**  |   **R$ 699,00**   |            R$ 75,00            |    **R$ 0,00** _(Free Tier)_     |      **R$ 624,00**       |     **89,2%**      |
|  **20 Veículos**  |  **R$ 1.398,00**  |           R$ 150,00            |    **R$ 0,00** _(Free Tier)_     |     **R$ 1.248,00**      |     **89,2%**      |
|  **50 Veículos**  |  **R$ 3.495,00**  |           R$ 375,00            |  **R$ 142,00** _(Supabase Pro)_  |     **R$ 2.978,00**      |     **85,2%**      |
| **100 Veículos**  |  **R$ 6.990,00**  |           R$ 750,00            | **R$ 160,00** _(Supabase + Fly)_ |     **R$ 6.080,00**      |     **86,9%**      |
| **300 Veículos**  | **R$ 20.970,00**  |          R$ 2.250,00           | **R$ 350,00** _(Infra completa)_ |     **R$ 18.370,00**     |     **87,6%**      |

---

## 7. Recomendações de Engenharia para Manter Custo Zero

1. **Expurgo Rotativo de Posições (30 Dias):**  
   Manter ativas as posições segundo a segundo dos últimos 30 dias na tabela `telemetria_posicoes`. Viagens concluídas, odômetros consolidados e relatórios financeiros permanecem salvos em tabelas leves permanentes.
2. **Heartbeat Inteligente com Ignição Desligada:**  
   Preservar a configuração do rastreador J16 para enviar pulsos a cada 10 a 30 minutos quando parado e a cada 30 a 60 segundos em movimento, economizando até 70% de dados e banco de dados.
