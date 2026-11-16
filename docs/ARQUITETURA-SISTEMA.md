# GD Rastreamento — Documento de Arquitetura e Engenharia de Software

Este documento descreve formalmente a arquitetura técnica, modelo de camadas, fluxo de dados de telemetria, protocolos de comunicação veicular e diretrizes de defesa cibernética do **GD Rastreamento**.

---

## 1. Visão Arquitetural

O GD Rastreamento foi concebido sobre uma arquitetura moderna e distribuída, otimizada para tempo real e latência mínima:

1. **Camada de Borda e Apresentação (Frontend / PWA):**
   - Single Page Application (SPA) e Progressive Web App (PWA) construída com React 18, Vite e TypeScript.
   - Design System canônico baseado em Tailwind CSS com modo Claro e Noturno Tático, relevo neumórfico suave e marcadores tridimensionais.
   - Motores cartográficos híbridos: Leaflet para renderização ultrarrápida 2D e MapLibre GL com WebGL para perspectiva 3D e rotação de rumo.
   - Service Worker permanente com escuta de notificações Web Push VAPID mesmo com a janela fechada ou tela bloqueada.

2. **Camada de Computação Serverless (Backend / Borda):**
   - Roteamento e hospedagem na rede global Cloudflare (Pages e Workers) com Node 22 LTS.
   - Servidor Node.js dedicado (`src/server.ts`) para gestão das inscrições VAPID, disparo assíncrono de notificações push e suporte a endpoints auxiliares com isolamento estrito por destinatário.

3. **Camada de Banco de Dados e Reatividade (Database / Realtime):**
   - Supabase PostgreSQL 15+ operando com Row Level Security (RLS) obrigatório em 100% das tabelas públicas.
   - Reatividade nativa via WebSockets (Supabase Realtime) sem necessidade de polling contínuo.
   - Triggers SQL blindados para custódia de perfis e imutabilidade de SuperADM.
   - Extensão `pg_net` para despacho automatizado de requisições assíncronas a partir de eventos do banco.

4. **Camada de Hardware e Telemetria Veicular:**
   - Comunicação TCP na porta 7003 via protocolo padrão Concox/GT06 para rastreadores 4G J16 e Coban no GD Segurança (a porta 7002 permanece preservada para os rastreadores do SIGO Guardião, garantindo separação física total sem necessidade de reprogramação de aparelhos legados).
   - Gateway WhatsApp dedicado na porta HTTP 8082 com sessão própria (`/data/session-gd`), garantindo sincronização de linha independente para o GD Segurança e isolamento completo da linha do SIGO Guardião (porta 8081).
   - Recepção e decodificação de pacotes de dados binários: coordenadas GPS, velocidade, rumo, ignição física (ACC), voltagem de bateria e sensores de vibração.
   - Relé automotivo de bloqueio com acionamento seguro mediante comando binário homologado ou SMS de contingência.

---

## 2. Diagrama de Fluxo de Dados de Telemetria

```
[Hardware Veicular J16/Coban]
       │
       │ Pacotes TCP / GT06 (Porta 7003 GD / Porta 7002 Guardião)
       ▼
[Serviço de Ingestão de Rastreamento]
       │
       │ INSERT / UPDATE
       ▼
[Tabelas: veiculos / posicoes / historico_alertas_veiculo]
       │
       ├─────────────────────────────────┐
       │ PostgreSQL Realtime (WebSockets)│ Triggers SQL / pg_net
       ▼                                 ▼
[Clientes Conectados (Frontend)]  [Endpoint /api/push/disparar]
       │                                 │
       ▼                                 ▼
[Atualização Fluida do Mapa/Cockpit]  [Web Push VAPID no Celular]
```

---

## 3. Pilares de Segurança Cibernética e Governança

### 3.1. Isolamento Estrito por Row Level Security (RLS)

- Cada consulta de dados realizada por usuários comuns é filtrada automaticamente pelo motor PostgreSQL com base no identificador de autenticação (`auth.uid()`).
- O cliente visualiza exclusivamente os veículos registrados para a sua conta titular, sem qualquer possibilidade de enumeração ou vazamento de outros clientes.

### 3.2. SuperADM Blindado por Triggers de Banco de Dados

- As contas institucionais autorizadas (`novaes@adm.28bpm.local` e `novaes@oficial.tec.br`) são protegidas por triggers SQL executados diretamente na camada do PostgreSQL.
- Qualquer tentativa de rebaixamento de nível (`role`), alteração de e-mail ou exclusão da conta é abortada imediatamente com erro fatal de banco (`RAISE EXCEPTION`), impedindo ataques de tomada de controle.

### 3.3. Princípio Anti-Mock Absoluto (Zero Invenção de Dados)

- O sistema proíbe categoricamente o preenchimento de métricas fictícias ou valores aleatórios para simular normalidade operacional.
- Caso a voltagem, os satélites ou a telemetria não sejam informados pelo rastreador físico, a interface apresenta de forma explícita o estado "Sem leitura" ou "—".

### 3.4. Prevenção de Falso Alerta de Guincho e Âncora Virtual

- O módulo de Âncora Virtual aplica um filtro de dispersão métrica (haversine) contra ruídos de satélite comuns em áreas cobertas.
- Caso o veículo se desloque para fora do perímetro seguro com a ignição desligada, o sistema classifica o incidente como deslocamento indevido ou reboque/guincho, disparando notificação sonora e push em alta prioridade.

### 3.5. Compartilhamento Seguro e Auditoria Temporal de Modo Stealth

- Links de compartilhamento temporário são indexados por tokens únicos de alta entropia.
- A função de Modo Stealth permite ao proprietário congelar temporariamente as coordenadas exibidas no link público sem interromper o monitoramento confidencial na central.
- A auditoria forense registra cada visita pública realizada (endereço IP, ISP, localização aproximada, navegador, duração e rota percorrida pelo visualizador).

---

## 4. Estrutura de Diretórios do Projeto

```
hunter/
├── public/                 # Recursos estáticos e Service Worker (sw.js)
├── docs/                   # Documentação técnica, arquitetura e baselines
├── scripts/                # Scripts de suporte, testes e ponto de controle
├── src/
│   ├── features/           # Módulos verticais desacoplados
│   │   ├── auth/           # Autenticação, sessão e proteção de rotas
│   │   ├── monitor-gps/    # Mapa 2D/3D, Cockpit, rotas, âncora e compartilhamento
│   │   ├── motoristas/     # Cadastro de condutores e Portal do Motorista
│   │   ├── frota-gestao/   # Analytics de frota, ociosidade e TCO
│   │   ├── chat/           # Mensageria instantânea e modo supervisão
│   │   ├── instalacao/     # Ordens de serviço e auto-cadastro de instaladores
│   │   ├── estoque/        # Gestão de insumos, leitor de NF-e e fornecedores
│   │   ├── financeiro/     # Livro-caixa, DRE, câmbio e relatórios
│   │   ├── mensalidades/   # Faturas, cobrança e encargos legais
│   │   ├── manutencao/     # Manutenção preventiva e agendamentos
│   │   ├── manual/         # Manuais modulares interativos
│   │   ├── seguranca/      # Central de segurança, auditoria e FIM
│   │   └── usuarios/       # Gestão de usuários e permissões granulares
│   ├── routes/             # Definição e roteamento de telas da aplicação
│   ├── shared/             # Utilitários globais, constantes e versionamento
│   ├── test/               # Suíte de testes unitários e de integração
│   └── server.ts           # Servidor Node.js para Web Push e APIs
├── supabase/               # Migrações SQL, scripts e definições de banco
├── package.json            # Manifesto de dependências e scripts npm
├── vite.config.ts          # Configuração de compilação Vite
└── wrangler.json           # Configuração de deploy Cloudflare
```

---

## 5. Diretrizes de Qualidade e Encerramento (7 Gates)

Toda modificação no código deve atender aos 7 Gates de Execução e Encerramento obrigatórios:

1. **Gate 1:** Auto-Auditoria Operacional, Compreensão de Contexto e Aplicação Fiel das Normas Pétreas (Anti-Declaração da Boca Para Fora). Exige parar e auditar a si mesmo: investigar o contexto prévio para resgatar soluções e erros anteriores entendendo a fundo o assunto no sistema, auditar antes de responder (validar se há dedução; se houver, apagar e buscar o dado factual na raiz) e checar antes de encerrar (auditar gates e formalização da consulta prévia do Gate 6).
2. **Gate 2:** Validação estrita de tipos com `npx tsc --noEmit` (zero erros).
3. **Gate 3:** Formatação estrita com Prettier via `npm run format`.
4. **Gate 4:** 100% de aprovação na suíte de testes com `npm test`.
5. **Gate 5:** Compilação limpa do bundle de produção com `npm run build` (código de saída 0).
6. **Gate 6:** Consulta prévia ao usuário, atualização sincronizada da versão A.B.C.D em todos os manifestos e push explícito de branch e tag Git.
7. **Gate 7:** Comunicação da nova versão publicada ao usuário e declaração expressa de leitura das normas pétreas.
