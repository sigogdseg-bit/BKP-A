# GD Segurança — Plataforma Avançada de Rastreamento Veicular, Telemetria e Defesa Cibernética

Plataforma de alta segurança, rastreamento geográfico em tempo real, telemetria veicular avançada, gestão de frotas e proteção patrimonial baseada nos padrões estritos de governança **GD-SEGURANÇA / DJR-NEW**.

---

## 1. Visão Geral do Sistema

O **GD Segurança** é uma solução completa para monitoramento veicular, rastreamento tático e inteligência de frotas, desenvolvida com foco em segurança cibernética, confiabilidade em tempo real e integridade absoluta dos dados.

A plataforma atende a múltiplos perfis operacionais com segregação estrita de permissões via banco de dados:

- **SuperADM:** Governança total da infraestrutura, chaves mestras, auditoria forense e custódia imutável.
- **Administrador:** Gestão comercial, aprovação de despesas, supervisão de operadores, faturamento e relatórios executivos.
- **Operador:** Monitoramento do mapa, despacho de atendimentos, suporte técnico e gestão de alertas.
- **Instalador Credenciado:** Ordens de serviço de instalação física, checklists fotográficos de segurança, testes de sinal GSM/GPS e repasses financeiros.
- **Cliente Titular:** Visão dedicada dos seus veículos cadastrados, histórico de viagens, acionamento de bloqueio remoto, âncora virtual anti-furto e links de compartilhamento público seguro.
- **Motorista:** Portal mobile simplificado para acompanhamento do veículo designado, lançamento de abastecimentos e envio de comprovantes de despesas.

---

## 2. Principais Módulos e Recursos

### 2.1. Mapa Operacional e Cockpit 3D Holográfico

- **Rastreamento em Tempo Real:** Visualização contínua dos veículos no mapa (Leaflet e motor MapLibre GL 3D) com marcadores volumétricos em 3D, orientação de azimute e placa no padrão Mercosul.
- **Cockpit de Telemetria:** Painel tático em tempo real exibindo velocímetro digital, osciloscópio de tensão de bateria física, giroscópio de chassi (Roll e Pitch) e constelação orbital de satélites GNSS.
- **Bloqueio e Desbloqueio Seguro:** Acionamento de corte remoto de combustível/ignição com confirmação em duas etapas e validação de segurança.
- **Histórico e Playback de Viagens:** Replay interativo de rotas percorridas com controle de velocidade, paradas identificadas e linha do tempo cronológica.
- **Roteirização Inteligente (2-Opt):** Otimização de itinerários eliminando cruzamentos e zigue-zagues, com exportação direta para Google Maps e Waze com numeração predial preservada.
- **Modo Privacidade:** Ocultação tática da posição e situação do veículo para operadores a critério exclusivo do cliente titular.

### 2.2. Compartilhamento ao Vivo com Modo Stealth e Auditoria Forense

- **Links Temporários Criptografados:** Geração de link público com token de alta entropia e validade configurável (1h, 6h, 24h, 7 dias ou encerramento manual) acompanhado de QR Code.
- **Modo Stealth (Congelamento Tático):** Congela as coordenadas visíveis aos visitantes externos na última posição transmitida, mantendo o rastreamento privado ativo internamente na central.
- **Auditoria Completa de Acessos:** Registro forense de cada visitante que abre o link, com endereço IP mascarado, provedor de internet (ISP), cidade/região, duração da sessão e navegador.
- **Painel 'Ver Trajeto Visualizado':** Exibe no mapa a rota exata acompanhada pelo visitante durante a sessão pública e o intervalo temporal em que o Modo Stealth esteve ativo.
- **Marcador 3D Volumétrico no Link Público:** Visualização do modelo 3D do veículo sem expor a placa física ou dados sensíveis do cliente a terceiros desautorizados.

### 2.3. Âncora Virtual e Proteção Anti-Furto de 1 Toque

- **Ativação Instantânea ao Estacionar:** Criação de perímetro circular de alta precisão ao redor das coordenadas do veículo estacionado.
- **Filtro Anti-Drift de GPS:** Algoritmo que compensa oscilações normais de satélites em coberturas metálicas e garagens subterrâneas, prevenindo falsos alertas.
- **Detecção de Reboque e Guincho:** Disparo imediato de alarme sonoro e notificação Web Push caso o veículo se desloque para fora do perímetro com a ignição desligada.

### 2.4. Central de Alertas e Sincronização Realtime Inter-Dispositivos

- **Persistência Unificada:** Alertas de excesso de velocidade, saída de cerca virtual, desvio de rota, pânico, colisão/capotamento e movimento fora de horário gravados na tabela `historico_alertas_veiculo`.
- **Reatividade Pura via WebSockets:** Notificações instantâneas sincronizadas entre desktop e smartphone sem polling contínuo.

### 2.5. Telemetria Corporativa, Ociosidade Real e Gestão de Frota (TCO)

- **Tempo Ocioso de Motor:** Cálculo do período em que o motor permanece ligado com o veículo imóvel, identificando desperdício de combustível.
- **Custo Total de Propriedade (TCO):** Apuração automática do Custo por Quilômetro Rodado (combustível, manutenção e insumos).
- **Dossiê Executivo em PDF:** Emissão de relatórios gerenciais com gráficos vetoriais nativos de alta fidelidade e assinatura digital com hash SHA-256.

### 2.6. Motoristas e Portal do Condutor

- **Gestão de Habilitações:** Controle de validade e pontuação de CNH com avisos preventivos de renovação.
- **Vinculação Operacional:** Associação de motoristas aos veículos da frota para responsabilização e custódia.
- **Portal Mobile de Autoatendimento:** Interface no smartphone para motoristas consultarem seu veículo designado e anexarem fotos de notas fiscais de despesas operacionais.

### 2.7. Chat e Mensageria Instantânea com Web Push VAPID

- **Comunicação Privativa:** Canal em tempo real entre centrais, operadores, clientes e administradores com interface neumórfica suave em relevo tátil 3D.
- **Entrega em Segundo Plano:** Notificações Web Push VAPID ativas mesmo com a tela bloqueada ou app fechado, com tratamento para Apple iOS Safari e Android.
- **Modo Supervisão:** Permite a administradores auditar diálogos mantidos entre atendentes e clientes de forma transparente.

### 2.8. Instalações Técnicas e Auto-Cadastro de Credenciados

- **Checklist Técnico e Fotográfico:** Registro com fotos obrigatórias de chicotes elétricos e local de fixação do hardware antes da liberação.
- **Teste de Sinal em Tempo Real:** Validação de comunicação GSM e fixação de satélites GPS diretamente no pátio de montagem.
- **Convite Seguro para Auto-Cadastro:** Geração de link com token e QR Code para oficinas e instaladores parceiros cadastrarem seus dados, endereço e chave PIX de repasses.

### 2.9. Estoque e Suprimentos

- **Catálogo de Hardware e Insumos:** Controle de chips M2M multi-operadora, relés automotivos 12V 40A, chicotes e rastreadores homologados.
- **Leitor Inteligente de Notas Fiscais em PDF:** Extração automática de dados fiscais e produtos para entrada em estoque.
- **Baixa Automática:** Integração com as ordens de serviço de instalação para abatimento do saldo de insumos por chassi atendido.

### 2.10. Gestão Financeira e Cobrança

- **Livro-Caixa e DRE:** Controle de receitas e despesas com filtros por ano e mês, DRE gerencial e transporte automático de saldo anterior.
- **Despesas Recorrentes, Parceladas e Câmbio USD:** Gestão de parcelas futuras, cancelamento de recorrência e conversão automática de dólar em tempo real.
- **Mensalidades e Encargos Legais:** Faturamento de contratos com cálculo automático de multa de 2% e juros de mora proporcionais diários por atraso.

### 2.11. Central de Segurança Cibernética e Logs Forenses

- **Pilares de Defesa:** Visão consolidada da conformidade de segurança e controle de dispositivos autorizados.
- **Logs Forenses Imutáveis:** Rastreabilidade integral de acessos, autenticações e ações administrativas.
- **Integridade de Arquivos (FIM):** Monitoramento contínuo de alterações na base de código e scripts críticos.
- **Backup com Assinatura SHA-256:** Exportação de snapshots com hash criptográfico para custódia digital.

---

## 3. Arquitetura e Stack Tecnológica

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENTES E NAVEGADORES                    │
│   React 18 • TypeScript • Tailwind CSS • Leaflet / MapLibre 3D  │
│          PWA • Service Worker • Web Push VAPID Nativo           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / WebSockets
┌───────────────────────────────▼─────────────────────────────────┐
│                    BORDA E SERVIÇOS SERVERLESS                  │
│       Cloudflare Pages e Workers • Node 22 • PostgREST API      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ SQL com RLS Estrito
┌───────────────────────────────▼─────────────────────────────────┐
│                  BANCO DE DADOS E EVENTOS TEMPO REAL            │
│     Supabase PostgreSQL 15+ • Row Level Security (RLS) 100%     │
│   Triggers • RPCs Seguras • Realtime WebSockets • pg_net Push   │
└───────────────────────────────▲─────────────────────────────────┘
                                │ TCP / SMS
┌───────────────────────────────┴─────────────────────────────────┐
│                     HARDWARE E RASTREADORES                     │
│      Rastreadores 4G J16 / Coban • Protocolo GT06 Porta 7002    │
│           Sensores Físicos • Relé de Corte de Ignição           │
└─────────────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Leaflet, MapLibre GL 3D, jsPDF.
- **Backend e Borda:** Cloudflare Pages / Workers, Node 22, Express/Node.js para rotas de push VAPID.
- **Banco de Dados:** Supabase (PostgreSQL 15+), PostgREST, triggers de blindagem de perfil, RPCs canônicas, Realtime WebSockets e extensão `pg_net`.
- **Rastreamento Veicular:** Protocolo Concox/GT06 na porta TCP 7002 para rastreadores J16 4G e Coban, com telemetria analógica e comandos SMS de contingência.

---

## 4. Princípios Inegociáveis de Governança (HUNTER-GUARDIAN / DJR-NEW)

1. **Autonomia Plena e Execução Integral no Banco de Dados:** Todas as alterações são realizadas de ponta a ponta (migrações SQL em `supabase/migrations/`, tabelas, RPCs, políticas RLS, permissões GRANT, `NOTIFY pgrst` e consolidação no script mestre `APLICAR_NO_SQL_EDITOR_SUPABASE.sql`), além de frontend e suíte de testes.
2. **SuperADM Imutável:** As contas `novaes@adm.28bpm.local` e `novaes@oficial.tec.br` são blindadas no banco de dados contra exclusão, alteração de e-mail ou rebaixamento de privilégios.
3. **Isolamento Total de Marca e Sistemas:** Proibição absoluta de utilizar referências cruzadas a outros sistemas em qualquer texto de tela, relatórios de impressão (PDF, Excel, comprovantes), cabeçalhos, rodapés, tooltips, modais, comentários de código ou mensagens ao usuário.
4. **Isolamento Estrito de Dados por RLS (Row Level Security):** 100% das tabelas públicas possuem RLS ativo. Clientes autenticados acessam estritamente seus próprios veículos e rastreadores cadastrados.
5. **Zero Invenção de Dados (Anti-Mock Absoluto):** Proibido inventar dados de telemetria, sensores, posições ou voltagens. Se um sensor físico não reportar leitura, o sistema exibe explicitamente "Sem leitura", "Indisponível" ou "—".
6. **Zero Invenção de Campos:** Proibição absoluta de incluir inputs ou formulários não solicitados formalmente.
7. **Root Cause First:** Proibido hardcode de incidentes, filtros cosméticos ou mascaramento de erros.
8. **Anti-Polling Total:** Proibido polling com janelas/chat fechados. Toda reatividade ocorre via WebSockets (Supabase Realtime).
9. **Ergonomia e Renderização Canônica de Modais:** Todo modal é renderizado via `createPortal(..., document.body)` e dimensionado de acordo com a viewport atual (`max-h-[90vh]`, `overflow-y-auto`, `my-auto`, layout em coluna com rolagem interna).
10. **Padrão Tipográfico Sem o Caractere Comercial Proibido:** Ausência total do caractere comercial `&` em títulos, cards, menus e mensagens ao usuário, utilizando sempre a conjunção formal **"e"**.
11. **Protocolo dos 7 Gates de Execução e Encerramento Obrigatórios:** Validação formal em todas as entregas (Gate 1: Auto-auditoria ativa, investigação de contexto histórico e compreensão do assunto para encontrar erros e soluções anteriores antes de qualquer intervenção, e checagem de gates sem declarações da boca para fora; Gate 2: TypeScript estrito; Gate 3: Prettier; Gate 4: 100% de testes aprovados; Gate 5: Compilação de produção com saída 0; Gate 6: Consulta prévia ao usuário e bump sincronizado A.B.C.D com push de tag; e Gate 7: Notificação final com declaração de normas pétreas).
12. **Protocolo Permanente de Ponto de Controle e Restauração:** Restauração instantânea para estado estável auditado através do comando `npm run checkpoint:restore`.

---

## 5. Instalação e Desenvolvimento Local

### Pré-requisitos

- Node.js 22 LTS
- Gerenciador de pacotes npm
- Conta e projeto configurado no Supabase

### Instalação de Dependências

```bash
npm install
```

### Configuração de Variáveis de Ambiente

Crie um arquivo `.env.local` baseado no modelo `.env.example`:

```env
VITE_SUPABASE_URL=https://pflzopmxxawyqkgrlapq.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui
VAPID_PUBLIC_KEY=sua_chave_vapid_publica
VAPID_PRIVATE_KEY=sua_chave_vapid_privada
```

### Execução em Desenvolvimento

```bash
npm run dev
```

---

## 6. Verificação de Qualidade e Testes

O projeto conta com ampla cobertura de testes unitários e de integração baseados no runner nativo do Node.js (`node:test`).

### Executar Verificação de Tipos (TypeScript)

```bash
npx tsc --noEmit
```

### Executar Suíte de Testes

```bash
npm test
```

### Formatação de Código (Prettier)

```bash
npm run format
```

### Compilação de Produção

```bash
npm run build
```

---

## 7. Protocolo de Ponto de Controle de Estabilidade

Caso seja necessário restaurar a aplicação para o último ponto de controle estável auditado:

```bash
npm run checkpoint:restore
```

O script automatizado:

1. Consulta o manifesto `PONTO_DE_CONTROLE.json`.
2. Sincroniza as tags remotas (`git fetch origin --tags`).
3. Aplica o reset seguro na tag flutuante `ultimo-ponto-de-controle`.
4. Executa a suíte de testes (`npm test`) e recompila o build de produção (`npm run build`).
5. Confirma a restauração exibindo a versão, hash de commit e data.

---

## 8. Licença e Direitos Autorais

Propriedade exclusiva do ecossistema GD Rastreamento (Hunter). Todos os direitos reservados.
Proibida a reprodução, engenharia reversa ou distribuição desautorizada deste código-fonte.
