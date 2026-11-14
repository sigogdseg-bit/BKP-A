# PRD — GD Segurança (GD-SEGURANÇA / DJR-NEW)

> **Documento Oficial de Requisitos de Produto (Product Requirements Document)**  
> **Versão do Sistema:** `v1.0.0.0`  
> **Status da Auditoria:** 100% Auditado Factualmente via `/dev-analise`  
> **Data de Atualização:** 14 de Novembro de 2026  
> **Classificação de Integridade:** Produção Crítica / Grau de Defesa Militar

---

## 1. Visão Geral e Propósito

O **GD Segurança** é a plataforma canônica de rastreamento veicular, telemetria avançada, automonitoramento operacional, gestão de frotas e segurança cibernética do ecossistema Antigravity.

Projetado para operar em tempo real com tolerância zero a falhas e zero invenção de dados, o sistema atende desde proprietários de veículos particulares e frotistas corporativos até redes de franquias, revendedores e frotas táticas institucionais. O sistema integra hardware de telemetria 4G (protocolo Concox/GT06 e rastreadores J16 Voxter), fusão inercial de odômetros em 7 camadas matemáticas, bloqueio veicular com salvaguardas físicas de velocidade, faturamento recorrente, laudos de instalação com registros fotográficos e central de inteligência contra ameaças digitais.

---

## 2. Arquitetura e Stack Tecnológica

| Camada                  | Tecnologia Adotada                       | Finalidade no Sistema                                                               |
| :---------------------- | :--------------------------------------- | :---------------------------------------------------------------------------------- |
| **Apresentação / PWA**  | React 19.2 + Vite 8.0 + TypeScript 5.8.3 | Single Page Application (SPA) e Progressive Web App de alta performance             |
| **Roteamento**          | TanStack Router (Start) 1.170            | Roteamento baseado em arquivos com árvore de rotas tipadas (`src/routeTree.gen.ts`) |
| **Design System**       | Tailwind CSS 4.2 + Lucide Icons          | Modos Claro (Neumórfico suave #eaf0f8) e Noturno Tático (#0c121c / Slate-900)       |
| **Cartografia Dual**    | MapLibre GL 6.10 + Leaflet Engine        | Mapas híbridos 2D ultrarrápidos e 3D vetoriais com rotação de rumo                  |
| **Computação de Borda** | Servidor Nitro nativo (`src/server.ts`)  | Proxy reverso de mensageria, endpoints com `service_role` e Web Push VAPID          |
| **Banco de Dados**      | Supabase PostgreSQL 15                   | 60 tabelas públicas, 217 migrations SQL e reatividade contínua                      |
| **Segurança no Banco**  | Row Level Security (RLS) + 98 RPCs       | Políticas de linha e funções atômicas `SECURITY DEFINER`                            |
| **Mensageria Externa**  | Gateway Baileys (Fly.io) + Webhooks      | Envio de alertas de 1 toque e automonitoramento via WhatsApp sem custos de API      |
| **Qualidade e Testes**  | Node Test Runner (`node:test`) + `tsx`   | **1.275 testes automatizados (206 suítes) com 100% de aprovação**                   |

---

## 3. Perfis de Usuário e Matriz de Acesso (RBAC)

O sistema segrega estritamente o acesso em 10 perfis distintos, protegidos por guards de interface (`AuthContext.tsx`) e confirmados fisicamente no banco de dados por políticas de RLS e funções RPC:

| Perfil                      |    Nível de Acesso     | Escopo de Visualização e Operação                                                                                                                                                                           |
| :-------------------------- | :--------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SuperADM**                |    Total / Soberano    | Acesso irrestrito a configurações globais, bancada de comandos J16, DRE corporativo e expurgo.                                                                                                              |
| **Degustação Plano Master** | Cliente Fictício (24h) | Acesso completo às funcionalidades do Plano Master de Cliente (mapa 3D, rotas, frota, manutenção, motoristas) com dados fictícios isolados em sandbox, expiração em 24h e bloqueio a dados administrativos. |
| **Administrador**           |   Gestão Operacional   | Administração de clientes, frotas, mensalidades, faturamento, estoque de kits e relatórios.                                                                                                                 |
| **Operador**                |      Operacional       | Monitoramento GPS em tempo real, disparo de comandos seguros, chat e chamados de suporte.                                                                                                                   |
| **Cliente**                 |   Titular do Veículo   | Acesso estrito aos veículos de sua titularidade (`cliente_id`), bloqueio do seu carro e faturas.                                                                                                            |
| **Motorista**               |    Portal PWA Móvel    | Acesso exclusivo ao veículo designado, controle de CNH e lançamento de despesas/abastecimentos.                                                                                                             |
| **Instalador**              |    Técnico de Campo    | Acesso restrito às ordens de instalação atribuídas, checklist de bancada e laudos fotográficos.                                                                                                             |
| **Revendedor**              |  Franqueado Parceiro   | Gestão de sua carteira de clientes, comissões de mensalidade e demonstrativo financeiro (DRE).                                                                                                              |
| **Vendedor**                |   Comercial Parceiro   | Geração de propostas comerciais e links de auto-cadastro com piso mínimo protegido (+ R$ 15,00).                                                                                                            |
| **Funcionário**             |  Operador Corporativo  | Gestão de frotas e motoristas delegada pelo cliente empresarial contratante.                                                                                                                                |

---

## 4. Módulos e Funcionalidades do Sistema

### 4.1. Monitoramento GPS em Tempo Real, Rotas e Cockpit Veicular (`/monitor-gps`, `/rotas`, `/compartilhar/$token`)

- **Cockpit com 8 Motores de Odômetro:** Fusão comparativa entre WGS-84, Cinemático, J16 Flash EEPROM, Motor A Bayesiano 1D (Gauss + ZVU), Motor B Haversine, Motor C EKF Taylor 4ª ordem, Medidor 7 Média Fusional e Medidor 8 Motor D (Compensação Cinemática Retroativa para gaps GNSS com ignição ligada). `[IMPLEMENTADA]`
- **Alerta Preditivo de Descarga Parasita de Bateria:** Monitoramento inteligente de queda de voltagem (> 0.2V/h por mais de 3 horas com ignição desligada), prevenindo perda total de carga no veículo. `[IMPLEMENTADA]`
- **Cartografia Híbrida 2D/3D:** Alternância fluida entre camadas (Ruas, Noturno Tático, Satélite) com zoom expandido (níveis 19 a 21 sem tela cinza). `[IMPLEMENTADA]`
- **Bloqueio e Desbloqueio Seguro:** Protocolo em duas fases que impede o corte de combustível em velocidade superior a 0 km/h ou sem telemetria recente. `[IMPLEMENTADA]`
- **Âncora Virtual de 1 Toque:** Perímetro de segurança circular ativado ao estacionar, com compensação de dispersão métrica e detecção de reboque ou guincho. `[IMPLEMENTADA]`
- **Replay de Histórico e Viagens:** Linha do tempo animada com gráficos de elevação, velocidade, paradas e ignição. `[IMPLEMENTADA]`
- **Criação e Controle de Rotas (`/rotas`):** Módulo de planejamento de trajetos, definição de corredores autorizados e comparação entre rota planejada e executada. `[IMPLEMENTADA]`
- **Compartilhamento Público com Modo Stealth (`/compartilhar/$token`):** Geração de link com token temporário e QR Code; permite congelar coordenadas públicas sem afetar a central. `[IMPLEMENTADA]`
- **Leitura Manual MCU J16 (Comando `MILEAGE#`):** Leitura sob demanda canônica via SMS/GPRS ou bancada técnica da memória flash do equipamento J16 Voxter. Decisão arquitetural homologada: a leitura permanece intencional e manual sob demanda do operador ou técnico, preservando a franquia de dados celular dos chips M2M e evitando desgaste desnecessário de escrita na memória flash da MCU. `[IMPLEMENTADA]`

### 4.2. Gestão de Frotas, Veículos, Clientes e Motoristas (`/frota`, `/motoristas`, `/motorista`, `/clientes`, `/funcionarios`, `/abastecimento`, `/manutencao`)

- **Cadastro Completo de Veículos (`/frota`):** Controle de chassis, marcas, placas Mercosul, modelos e modos de horímetro (pós-chave ou vibração). `[IMPLEMENTADA]`
- **Gestão Cadastral e Jurídica de Clientes (`/clientes`):** Cadastro de pessoas físicas e jurídicas, veículos vinculados, contratos ativos e responsáveis operacionais. `[IMPLEMENTADA]`
- **Gestão de Funcionários de Frotas (`/funcionarios`):** Delegação e controle de permissões para operadores e condutores de frotistas empresariais. `[IMPLEMENTADA]`
- **Controle de Abastecimentos (`/abastecimento`):** Registro de abastecimentos, postos conveniados, odômetro do veículo, tipo de combustível e cálculo de média de consumo (km/l). `[IMPLEMENTADA]`
- **Gestão de Manutenções Preventivas e Corretivas (`/manutencao`):** Agendamentos por data e quilometragem, histórico de oficinas e controle de custos de peças. `[IMPLEMENTADA]`
- **Portal do Condutor PWA (`/motorista`):** Interface móvel adaptativa para checklist de partida, abastecimento e registro de despesas com fotos de comprovantes. `[IMPLEMENTADA]`
- **Gestão e Conciliação de Tags de Pedágio:** Conciliação geoespacial e temporal de passagens de pedágio (Sem Parar, ConectCar, Veloe) com a telemetria GPS e importação de extratos em CSV. `[IMPLEMENTADA]`
- **Monitoramento de Validade de CNH (`/motoristas`):** Alertas preventivos automáticos de vencimento e controle de pontuação. `[IMPLEMENTADA]`
- **Cálculo de Score de Condução:** Pontuação base 100 com penalidades proporcionais por frenagens bruscas e excessos de velocidade (> 90 km/h). `[IMPLEMENTADA]`

### 4.3. Instalações Técnicas, Credenciamento e Onboarding (`/instalacao`, `/cadastro-instalador`, `/onboarding/acompanhamento`)

- **Esteira de Atendimento Técnico e Ordens (`/instalacao`):** Interface tática de alta visibilidade com abas de contraste acentuado (padrão Rastreadores J16), badges numéricos em tempo real e layout flexível anti-overflow que impede o truncamento de placas, marcas, modelos e status operacionais nos cards veiculares. `[IMPLEMENTADA]`
- **Baixa Atômica de Estoque:** Descontos automáticos de chicotes, relés, rastreadores e chips M2M vinculados à ordem. `[IMPLEMENTADA]`
- **Liquidação de Mão de Obra:** Controle de repasses financeiros por instalação com chave PIX do instalador. `[IMPLEMENTADA]`
- **Auto-Cadastro por Convite (`/cadastro-instalador`):** Geração de link exclusivo para credenciamento autônomo de instaladores parceiros. `[IMPLEMENTADA]`
- **Acompanhamento de Onboarding (`/onboarding/acompanhamento`):** Painel do ciclo de vida de ativação de clientes, rastreadores e vínculos veiculares. `[IMPLEMENTADA]`

### 4.4. Suprimentos, Dispositivos e Chips M2M (`/estoque`, `/dispositivos`)

- **Gestão de Kits e Peças (`/estoque`):** Controle de saldo mínimo, composição de kits de instalação e histórico de movimentações. `[IMPLEMENTADA]`
- **Leitor Inteligente de NF-e (PDF/OCR):** Importação automatizada de dados de notas fiscais com extração dinâmica sob demanda para inclusão no estoque. `[IMPLEMENTADA]`
- **Controle de Chips M2M (`/dispositivos`):** Monitoramento de operadoras (Algar, Vivo, Claro) calibrado com as medições reais de consumo da fatura e portal da operadora, dia de virada de ciclo no dia 23 e chips livres com 0.00 MB. `[IMPLEMENTADA]`

### 4.5. Comercial, Parcerias, Franquias e Assinatura Digital (`/propostas`, `/revendedores`, `/minha-franquia`, `/minhas-vendas`, `/cadastro-cliente`, `/cadastro-parceiro`, `/demonstracao`, `/assinar`, `/verificar`)

- **Emissão de Propostas Comerciais (`/propostas`):** Gerador de propostas com numeração sequencial atômica, simulação de planos e carregamento assíncrono de PDF sob demanda. `[IMPLEMENTADA]`
- **Portal de Revendedores e Vendedores (`/revendedores`, `/minha-franquia`, `/minhas-vendas`):** Dashboard individualizado com controle de comissões, faturamento da carteira e DRE setorial. `[IMPLEMENTADA]`
- **Auto-Cadastro de Clientes por Convite (`/cadastro-cliente`):** Fluxo público de adesão autônoma de novos clientes com proteção de dados. `[IMPLEMENTADA]`
- **Auto-Cadastro de Parceiros Comerciais (`/cadastro-parceiro`):** Credenciamento público e seguro de revendedores e vendedores. `[IMPLEMENTADA]`
- **Ambiente de Demonstração Guiada (`/demonstracao`):** Showcase interativo com visualização funcional dos recursos do sistema para prospects. `[IMPLEMENTADA]`
- **Portal de Assinatura Digital de Contratos (`/assinar`):** Assinatura eletrônica com geolocalização do signatário, carimbo de data e hora e hash de integridade. `[IMPLEMENTADA]`
- **Portal Público de Validação Documental (`/verificar`):** Consulta pública de autenticidade documental por hash criptográfico SHA-256 via RPC segura. `[IMPLEMENTADA]`
- **Salvaguarda Comercial de Piso Mínimo:** Trava de segurança que impede a geração de links de venda com margem inferior a R$ 15,00 acima do custo base. `[IMPLEMENTADA]`
- **Redefinição Segura de Senha de Parceiros:** RPC com imposição de troca de senha no primeiro acesso e validação de CPF/CNPJ. `[IMPLEMENTADA]`

### 4.6. Financeiro, Mensalidades e DRE (`/financeiro`, `/mensalidades`)

- **Faturamento Recorrente de Mensalidades (`/mensalidades`):** Gestão de títulos, controle de inadimplência, juros diários e multas automáticas. `[IMPLEMENTADA]`
- **Lembrete Preventivo de Mensalidade via WhatsApp com PIX:** Notificação amigável de 1 a 3 dias antes do vencimento com chave PIX e valor detalhado. `[IMPLEMENTADA]`
- **Livro-Caixa e Gestão de Despesas (`/financeiro`):** Lançamentos com categorias contábeis, conversão cambial (USD) e parcelamentos. `[IMPLEMENTADA]`
- **Demonstrativo do Resultado do Exercício (DRE):** Apuração contábil de receitas, custos diretos de instalação, chips e margem líquida com exportações em PDF e Excel carregadas sob demanda. `[IMPLEMENTADA]`
- **Exportação Contábil SPED Fiscal:** Exportação oficial no layout SPED Fiscal (Blocos 0, C, D, E e 9) para integração com sistemas contábeis e EFD ICMS/IPI. `[IMPLEMENTADA]`

### 4.7. Central de Segurança, Defesa Cibernética e Bancada J16 (`/configuracao/central-seguranca`, `/configuracao/logs`, `/configuracao/rastreador-j16`)

- **21 Módulos de Auditoria em Tempo Real (`/configuracao/central-seguranca`):** Status de sockets TCP, polling a cada 30 segundos, matriz de risco e saúde do sistema. `[IMPLEMENTADA]`
- **Catálogo de 51 Vetores de Ataque Reais:** Monitoramento de SQL Injection, XSS, Spoofing GPS, Jammer e Replay em 9 categorias. `[IMPLEMENTADA]`
- **Bancada Especialista Rastreador J16 (`/configuracao/rastreador-j16`):** Painel de envio, auditoria e batch de comandos de telemetria, corte e parametrização direta do hardware Voxter J16. `[IMPLEMENTADA]`
- **Proteção Anti-Jammer Inteligente:** Detecção de inibidores de sinal condicionada a velocidade física comprovada. `[IMPLEMENTADA]`
- **Detecção Comportamental UEBA e Honeytokens:** Rastreamento de acessos anômalos e armadilhas para captura de credenciais sintéticas. `[IMPLEMENTADA]`
- **Trilha Forense Imutável (`/configuracao/logs`):** Registro completo de IPs, sessões, horários e ações em `system_activity_logs`. `[IMPLEMENTADA]`
- **Emissão de Laudo Pericial Forense Oficial com Selo SGD e QR Code:** Geração de laudo pericial oficial em PDF com numeração SGD atômica (ou `SGD-SIM-XXXXXXXX` em simulação), código curto verificador, QR Code para validação pública, hash forense SHA-256 e Chancela de Simulação obrigatória em modo de degustação e veículos de teste. `[IMPLEMENTADA]`

### 4.8. Mensageria, Alertas e Automação WhatsApp (`/api/whatsapp`, `/atendimento`, `/chat`)

- **Micro-Gateway Baileys de Custo Zero:** Envio de alertas de excesso de velocidade, entrada ou saída de cerca e acidentes via WhatsApp sem custos de API. `[IMPLEMENTADA]`
- **Templates de 1 Toque e Catálogo Unificado:** Envio de mensagens rápidas para clientes e condutores a partir de qualquer ponto do sistema. `[IMPLEMENTADA]`
- **Notificações Web Push VAPID em Segundo Plano:** Service Worker oficial (`/sw.js`) ativo para entrega de alertas com tela bloqueada. `[IMPLEMENTADA]`
- **Webhook de Ligação Telefônica de Emergência:** Acionamento de chamada direta ao operador para ocorrências críticas. `[IMPLEMENTADA]`
- **Chat Interno com Modo Supervisão (`/chat`, `/atendimento`):** Conversas em tempo real com indicador de presença e auditoria administrativa. `[IMPLEMENTADA]`

### 4.9. Configurações Globais, Temas e Gestão de Usuários (`/configuracoes`, `/configuracao/temas`, `/usuarios`, `/login`, `/inicio`)

- **Painel Geral de Configurações (`/configuracoes`):** Ajustes de parâmetros do sistema, prazos de alerta e tolerâncias de velocidade. `[IMPLEMENTADA]`
- **Personalização de Temas e Design System (`/configuracao/temas`):** Alternância e calibração de modos Claro (#eaf0f8) e Noturno Tático (#0c121c), com persistência em camada tripla. `[IMPLEMENTADA]`
- **Gestão Global de Usuários e Perfis (`/usuarios`):** Controle de contas, redefinição de acessos e concessão de privilégios RBAC. `[IMPLEMENTADA]`
- **Fluxos de Autenticação e Entrada Segura (`/login`, `/inicio`):** Validação de credenciais, controle de sessão ativa e redirecionamento por perfil. `[IMPLEMENTADA]`

---

## 5. Modelo de Dados e Banco de Dados (Supabase / Postgres)

- **Volume de Migrações:** 214 arquivos de migração DDL em `supabase/migrations/`.
- **Total de Tabelas no Schema `public`:** 60 tabelas ativas.
- **Stored Procedures e Funções:** 146 funções únicas catalogadas e 76 RPCs ativas invocadas no frontend e rotinas de borda (`SECURITY DEFINER` e `search_path = public, auth, pg_temp`).

### Principais Entidades e Relacionamentos:

```
[clientes] 1 ──── N [veiculos] 1 ──── N [telemetria_posicoes]
    │                    │
    ├──── N [contratos]   ├──── 1 [rastreadores] ──── 1 [chips]
    ├──── N [mensalidades]├──── N [eventos_veiculo]
    └──── N [funcionarios]└──── N [agendamentos_manutencao]
```

---

## 6. Integrações Externas e Comunicação

1. **Protocolo Concox / GT06 (Porta 7002):** Ingestão contínua de pacotes binários de telemetria enviados por rastreadores 4G.
2. **Fly.io + Baileys:** Micro-gateway de mensageria WhatsApp com persistência de sessões e chaves Signal.
3. **MapTiler / OpenStreetMap:** Servidores de tiles cartográficos de alta definição com chaves seguras.
4. **Web Push VAPID:** Infraestrutura padronizada IETF para notificações PWA no navegador e Android TWA.
5. **MacroDroid Gateway:** Integração local via webhook para discagem automática de alertas no celular do operador.

---

## 7. Regras de Negócio Inegociáveis (Regras Pétreas)

1. **Causa Raiz Obrigatória:** É proibido aplicar contornos sintomáticos ou mascaramentos; diagnósticos devem ser sustentados por evidências de código e banco.
2. **Zero Invenção de Dados:** Proibido o uso de mocks, dados sintéticos ou estimativas aleatórias em produção.
3. **Bloqueio Seguro Inegociável:** O corte de ignição é bloqueado no banco caso o veículo esteja em movimento (velocidade > 0 km/h) ou sem sinal recente.
4. **Isolamento de RLS:** Toda tabela com dados de clientes ou veículos deve possuir política de RLS vinculada ao `auth.uid()`.
5. **Preservação de Integridade:** Modificações devem preservar alterações preexistentes; commits e publicações dependem de autorização explícita (Gate 6).

---

## 8. Diagnóstico Consolidado da Implementação

| Módulo Funcional                          | Implementadas | Parciais | Não Implementadas |     Status Geral     |
| :---------------------------------------- | :-----------: | :------: | :---------------: | :------------------: |
| **Cockpit, Rotas e Monitoramento GPS**    |      20       |    0     |         0         |      `ESTÁVEL`       |
| **Gestão de Frotas, Veículos e Clientes** |      18       |    0     |         0         |      `ESTÁVEL`       |
| **Motoristas e Portal PWA**               |      10       |    0     |         0         |      `ESTÁVEL`       |
| **Instalações, Ordens e Onboarding**      |      15       |    0     |         0         |      `ESTÁVEL`       |
| **Estoque, Peças e Dispositivos**         |      11       |    0     |         0         |      `ESTÁVEL`       |
| **Comercial, Propostas e Assinatura**     |      18       |    0     |         0         |      `ESTÁVEL`       |
| **Financeiro, Mensalidades e DRE**        |      14       |    0     |         0         |      `ESTÁVEL`       |
| **Central de Segurança, Logs e J16**      |      15       |    0     |         0         |      `BLINDADO`      |
| **Mensageria, Push e WhatsApp**           |      12       |    0     |         0         |      `ESTÁVEL`       |
| **Configurações, Temas e Usuários**       |      13       |    0     |         0         |      `ESTÁVEL`       |
| **Total Geral**                           |    **146**    |  **0**   |       **0**       | **100,0% Concluído** |

---

## 9. Divergências Detectadas e Sanadas (Frontend vs Backend vs Documentação)

- **Saneamento de Consultas Supabase (Eliminação de Erros 400 e 404):** `[RESOLVIDO]` Corrigidas as consultas ao Supabase que geravam erros 400 e 404 no console das telas operacionais (rotas `get_meu_perfil_motorista`, verificação da coluna `transacoes_financeiras.fonte_pagamento`, resiliência na tabela `motorista_despesas` e interceptador RPC com fallback transparente).
- **Modernização da Esteira de Instalações e Calibração dos Chips M2M:** `[RESOLVIDO]` Interface tática em `/instalacao` padronizada com a bancada J16 e consumo dos chips M2M ajustado aos dados reais de faturamento da operadora Algar/Voxter, com virada no dia 23 e chips livres com 0.00 MB.
- **Sincronização do Inventário de Rotas:** `[RESOLVIDO]` O roteador possuía 14 rotas ativas em `src/routeTree.gen.ts` que não estavam catalogadas nominalmente nas seções do PRD; todas as 39 rotas ativas agora estão 100% catalogadas na Seção 4.
- **Volume de Migrações SQL:** `[RESOLVIDO]` Atualizada a contagem de migrações de 212 para 214 arquivos em `supabase/migrations/` após a calibração de consumo dos chips e saneamento de consultas.
- **Versão do TypeScript:** `[RESOLVIDO]` Calibrada a versão informada na stack para 5.8.3, em perfeita sintonia com o `package.json`.
- **Hardening na Tabela `documentos_emitidos`:** `[RESOLVIDO / HARDENED]` Leitura anônima direta restrita via migration `20261107190000_hunter_hardening_rls_documentos_emitidos.sql`, com verificação pública canalizada com exclusividade via RPC `hunter_verificar_autenticidade_contrato`.
- **Perfil Degustação Plano Master em Sandbox e Laudo Pericial com Selo SGD:** `[RESOLVIDO]` Alinhado o perfil de degustação para operar na experiência estrita do Cliente no Plano Master (mapa 3D, rotas, frota, manutenção, abastecimento e motoristas com a frota fictícia `DEG-2026`, `FLX-1010` e `COR-4040`), mantendo bloqueados os módulos e rotas administrativas internas (DRE, J16, Estoque, Logs e Central de Segurança), com expiração de 24h a partir do primeiro acesso e isolamento sandbox total.
- **Granularidade e Isolamento de Módulos no Modal de Cadastro (`v2.1.6.85`):** `[RESOLVIDO]` No modal de criação e edição de usuários (`UsuarioFormModal`), ao selecionar o perfil Degustação Plano Master (`superadmin_auditor`), a lista de módulos padrão restringe-se estritamente aos 6 módulos de cliente (`monitor-gps`, `manutencao`, `mensalidades`, `atendimento`, `temas` e `configuracoes`). Módulos administrativos internos são ocultados da grade e blindados na persistência contra qualquer marcação indevida.
- **Blindagem e Resiliência no Despacho de Alertas WhatsApp e Discador MacroDroid (`v2.1.6.87`):** `[RESOLVIDO]` Corrigido o pipeline de despacho de alertas em segundo plano no servidor (`despacharWhatsappAlertaServer`). Implementado controlador de tempo limite defensivo (AbortSignal de 7s) com fallback automático para o endpoint `/api/send` em caso de oscilação do endpoint principal. A chave de deduplicação anti-flood de 12h só é gravada no cache após confirmação real de entrega (`resEnvio.ok`), sendo expurgada imediatamente em caso de erro para permitir retentativas automáticas pelo reconciliador de eventos. Foi adicionada padronização dual dos parâmetros de envio (`recipient`/`numero` e `message`/`mensagem`), separação resiliente da discagem telefônica MacroDroid e auditoria completa em `system_activity_logs` tanto para sucesso quanto para falha.
- **Alimentação Completa da Frota Ativa e Telemetria em Sandbox no Modo Degustação Master (`v2.1.6.86`):** `[RESOLVIDO]` Eliminada a tela de bloqueio de espera de instalação física para o perfil Degustação (`isDegustacao`), disponibilizando de imediato a frota ativa simulada (`DEG-2026`, `FLX-1010` e `COR-4040`) em todas as rotas autorizadas do Plano Master. A sandbox foi enriquecida com dados fictícios de telemetria e trajetos históricos (playback), controle detalhado de abastecimentos com OCR de notas fiscais, itens de manutenção preventiva e revisões programadas, agendamentos em oficina credenciada, despesas operacionais e métricas de desempenho da frota (Frota Analytics com KM diário, ociosidade e score de condução). No modal de criação de usuários (`UsuarioFormModal`), foram integrados todos os 11 módulos de cliente do Plano Master com pré-seleção automática e isolamento das opções administrativas.
- **Isolamento de Mensalidades de Clientes, Informar Pagamento e Alerta Veicular com Placa Resiliente (`v2.1.6.88`):** `[RESOLVIDO]` Blindagem estrita no módulo financeiro (`MensalidadesView.tsx` e `mensalidadeService.ts`), garantindo que clientes autenticados (ou emulados) visualizem única e exclusivamente suas próprias faturas e indicadores de resumo financeiro, com ocultação compulsória de dados de terceiros. Criado o componente `ModalInformarPagamento.tsx` para envio de comprovante (imagem ou PDF), chave PIX com cópia em 1 toque e registro de observações. Implementado o endpoint seguro `POST /api/mensalidades/informar-pagamento`, disparando mensagem WhatsApp imediata para o SuperADM (`5524992494030`). Criado o banner permanente `BannerPagamentosAguardandoBaixa.tsx` no layout autenticado para notificar administradores no login e em tempo real sobre pagamentos pendentes de baixa. No backend (`src/server.ts`), implementada extração heurística de placas veiculares por Regex em `/api/push/disparar` e inferência de tipo canônico para assegurar o recebimento de alertas no WhatsApp mesmo quando omitidos no banco, e atualizada a trigger PostgreSQL `disparar_push_vapid_ao_inserir_notificacao` via migration `20261109140000_hunter_mensalidades_informar_pagamento_e_alerta_placa.sql`.
- **Resiliência de Schema em Mensalidades e Correção de Codificação nos Títulos de Planos no PDF de Propostas (`v2.1.6.89`):** `[RESOLVIDO]` Aplicado padrão de defesa em profundidade (Expand and Contract) em `listarMensalidades` e `/api/mensalidades/aguardando-baixa`, garantindo a seleção estável das colunas base para que a listagem de mensalidades nunca retorne vazia devido a divergências de schema de colunas ainda não migradas no Supabase. No gerador de PDF de Propostas Comerciais (`propostaPdfService.ts`), eliminada a interpolação de emojis nos títulos dos planos que gerava caracteres corrompidos (`Ø=ßâ`, `Ø=Ý5`, `Ø=ßã`), passando a renderizar os rótulos limpos e oficiais (`PLANO BÁSICO`, `PLANO PRO`, `PLANO MASTER`) com as barras laterais coloridas de cada plano intactas e elegantes.
- **Auto-Cadastro de Usuário Degustação via WhatsApp com Parâmetro TESTE (`v2.1.6.90`):** `[RESOLVIDO]` Implementado o fluxo conversacional interativo completo no WhatsApp para cadastro autônomo de usuários de degustação (Plano Master 24h) através do comando `TESTE` (e variações: `DEGUSTACAO`, `DEGUSTAÇÃO`, `TESTAR`, `EXPERIMENTAR`, `TESTE GRATIS`). A máquina de estados em `whatsappAutoMonitoramentoService.ts` guia o lead em 4 etapas (Nome Completo, E-mail com validação e checagem de duplicidade, Celular com DDD com atalho 'SIM' para utilizar o próprio número do WhatsApp, e Senha com no mínimo 6 caracteres). Ao concluir, o sistema cria o usuário no Supabase Auth com confirmação automática de e-mail com Plano Master, frota ativa simulada (`DEG-2026`, `FLX-1010`, `COR-4040`) e os 11 módulos de cliente concedidos. O WhatsApp devolve na hora a mensagem com link `https://sigoguardiao.oficial.tec.br`, login, senha e instruções completas, despachando simultaneamente uma notificação imediata para o SuperADM (`5524992494030`).
- **Otimização da Mensagem de Proposta no WhatsApp (Foco em Valor Promocional e Abertura do PDF):** `[RESOLVIDO]` Eliminada a sobrecarga de textos auxiliares extensos que poluíam o chat do WhatsApp (tabelas brutas, aviso técnico de CAN/LIN e enquadramento jurídico extenso), mantendo o detalhamento completo no documento oficial em PDF. A mensagem enviada ao cliente foi reformulada com tom amigável e personalizado, destacando que a proposta possui valor promocional exclusivo e convidando o cliente a abrir e conferir o PDF anexo. Tanto na emissão pelo painel web (`PropostasTab.tsx` e `ModalNovaProposta.tsx`) quanto no auto-atendimento interativo (`whatsappAutoMonitoramentoService.ts`), o PDF da proposta é gerado e despachado em anexo junto à mensagem.
- **Perfil Canônico `cliente_degustacao` e Atendimento ao Público pelo Guardião Virtual (`v2.1.6.91`):** `[RESOLVIDO]` Substituição mandatória da role de degustação para `cliente_degustacao` (eliminando o uso de `superadmin_auditor` para degustadores). Criação da migration `20261109150000_hunter_role_cliente_degustacao.sql` adicionando o valor ao enum `public.hunter_role`. Implementação completa da SKILL dev-bot (v1.0) para atendimento ágil e empático ao público em geral no WhatsApp do GD Rastreamento, preservando 100% dos fluxos de usuários cadastrados (SuperADM, Operadores, Revendedores, Vendedores e Clientes). Visitantes não cadastrados passam a ser atendidos pelo Guardião Virtual com persona prestativa, respostas curtas em tópicos, catálogo factual de planos (Básico R$ 45, Pro R$ 55 e Master R$ 65), explicação de como funciona o rastreamento, atalho para degustação 24h, transbordo imediato para operador humano com notificação em tempo real ao SuperADM (5524992494030), fallback progressivo em 3 etapas e encerramento com pesquisa rápida de satisfação (1 a 5). Instalação universal das skills `claude-cs` e `dev-bot` no Antigravity.
- **Unificação da Identidade Visual e Rebranding Nominal para GD Rastreamento:** `[RESOLVIDO]` Realizada a substituição cirúrgica em 221 arquivos e 628 ocorrências textuais, eliminando todas as menções residuais a "SIGO Guardião" e unificando a identidade da plataforma como **GD Rastreamento** (e "GD RASTREAMENTO" em cabeçalhos e certidões), preservando de forma íntegra os contratos de infraestrutura, domínios de rede (`https://sigoguardiao.oficial.tec.br`) e migrações físicas do banco.
- **Modernização do Auto-Cadastro de Clientes e Micro-Gateway WhatsApp (`ModalConviteCliente`):** `[RESOLVIDO]` Integrado o despachador oficial de mensagens WhatsApp (`enviarMensagemWhatsappOperador`) com suporte ao nome dinâmico da plataforma (`APP_NOME`), input com máscara de telefone formatada e estado de carregamento com feedback de transmissão.
- **Conexão e Migração de Infraestrutura para Nova Instância Supabase (`pflzopmxxawyqkgrlapq`):** `[CONFIGURADO E GERADO SCRIPT MESTRE]` Atualizados todos os arquivos de ambiente e runtime (`wrangler.json`, `.env.production`, `.env.local`, `scripts/fix-nitro-chunks.mjs`, `deploy/hunter-gateway/fly.toml` e gateways de telemetria) para a nova instância Supabase (`https://pflzopmxxawyqkgrlapq.supabase.co`, chaves `sb_publishable_...` e `sb_secret_...`). Compilado o script mestre de migração completa `supabase/CRIAR_BANCO_COMPLETO_NOVO_SUPABASE.sql` com todas as 225 migrações em ordem cronológica (1.85 MB) para provisionamento do banco de dados do zero.

---

## 10. Dívidas Técnicas e Oportunidades de Refatoração

1. **Otimização de Bundles Secundários:** `[CONCLUÍDA]` Implementado code splitting com importação dinâmica sob demanda (`await import(...)`) para `jspdf`, `exceljs` e `unpdf` em todos os modais de exportação, geradores de contrato, propostas e leitores de OCR/NF-e. Isso reduziu o tamanho do bundle de modais críticos (ex: `ModalPixCobrancaInadimplente` de 956 KB para 49 KB, economia de 95%) e isolou bibliotecas densas em chunks autônomos carregados estritamente sob demanda.
2. **Medidor 3 J16 (Decisão Arquitetural Homologada):** Homologado formalmente que a leitura sob demanda da MCU J16 via comando `MILEAGE#` não constitui dívida técnica, mas uma salvaguarda física intencional para economia de dados celular e preservação da vida útil da memória flash da MCU do rastreador.

---

## 11. Riscos de Segurança e Integridade

- **Proteção contra Injeção:** Coberta pelo uso do PostgREST com Prepared Statements e tipagem estrita no TypeScript.
- **Risco de Downgrade:** Protegido pelos scripts de marco de segurança A/B e verificação atômica de versão nos 5 arquivos canônicos (`gate:check`).
- **Proteção de Segredos:** Nenhuma chave privilegiada reside no código cliente; todas as rotas sensíveis utilizam o backend Nitro com isolamento de variáveis de ambiente.

---

## 12. Próximos Passos e Prioridades Recomendadas

1. **Gaps de Produto Fechados:** Concluída a implementação de todos os módulos autorizados (Hardening RLS, Lembrete Preventivo WhatsApp PIX, Medidor 8 Motor D Compensado, Alerta Preditivo de Descarga de Bateria, SPED Fiscal, Conciliação de Pedágio, Saneamento 400/404, Modernização de Instalações, Calibração M2M e Otimização de Bundles Secundários).
2. **Operação e Governança:** Manutenção preventiva contínua, governança estrita de limites Free Tier e expansão contínua da cobertura de testes automatizados.
