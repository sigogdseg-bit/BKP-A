# GD Rastreamento — Guia Canônico dos Módulos Operacionais

> **Diretriz Fundamental do Negócio:**  
> O **GD Rastreamento** é uma plataforma de alta tecnologia voltada para a **LOCAÇÃO DE RASTREADORES 4G HOMOLOGADOS ANATEL PARA AUTO-MONITORAMENTO VEICULAR COM DISPONIBILIZAÇÃO DO SISTEMA**.  
> Não se trata de uma central de rastreamento terceirizada: o cliente titular possui soberania, autonomia e controle integral sobre seus veículos, telemetria, rotas, âncoras virtuais e bloqueio seguro diretamente pelo smartphone ou computador, com máxima privacidade e custo zero de intermediários.

---

## 1. Módulos Operacionais do Sistema

### 1. Mapa Operacional e Telemetria

- **Identificador:** `mapa-operacional`
- **Rota:** `/monitor-gps`
- **Público:** Administradores, Operadores e Clientes Titulares (Auto-Monitoramento).
- **Finalidade:** Monitoramento contínuo em tempo real da localização geográfica, ignição física, velocidade e telemetria avançada dos veículos.
- **Seções Principais:**
  1. _Visualização e Navegação no Mapa:_ Seleção de camadas cartográficas (Satélite de alta resolução, Ruas vetorial e Noturno Tático), zoom dinâmico até nível 21 sem tela cinza e enquadramento automático do veículo selecionado.
  2. _Bloqueio e Desbloqueio Seguro do Veículo:_ Disparo de comando de corte de ignição ou combustível condicionado a velocidade segura inferior a 20 km/h, prevenindo riscos de trânsito aos ocupantes.
  3. _Histórico de Trajetos e Viagens:_ Replay animado da rota com gráfico de velocidade, hodômetro percorrido e marcação de paradas com tempo ocioso do motor.
  4. _Compartilhamento de Localização ao Vivo e Modo Stealth:_ Geração de link público com token temporário e QR Code, opção de congelamento tático de coordenadas (Modo Stealth) e auditoria forense de acessos com inspeção de trajeto visualizado pelo visitante.
  5. _Âncora Virtual e Cerca de Segurança de 1 Toque:_ Ativação instantânea de perímetro circular seguro ao estacionar, com compensação de oscilações de satélites e alarme sonoro/push em caso de reboque ou guincho.
  6. _Privacidade de Localização:_ Ocultação da posição exata e da situação operacional para operadores de suporte, reservada exclusivamente ao controle do cliente titular em auto-monitoramento.

---

### 2. Instalações Técnicas

- **Identificador:** `instalacoes-tecnicas`
- **Rota:** `/instalacao`
- **Público:** Instaladores Credenciados, Operadores e Administradores.
- **Finalidade:** Gestão física de ordens de serviço, montagem do equipamento rastreador 4G e liberação dos veículos.
- **Seções Principais:**
  1. _Painel de Atendimentos e Repasses:_ Acompanhamento de ordens pendentes e saldo de comissões por instalação com chave PIX cadastrada para repasse automático.
  2. _Execução do Checklist e Validação de Sinal:_ Passo a passo elétrico, teste de sinal GSM/GPS em tempo real via gateway telemático, envio de fotos obrigatórias de conexões e fixação e conclusão da ordem de serviço.
  3. _Convite e Auto-Cadastro de Instaladores Credenciados:_ Geração de link com token e QR Code para que oficinas parceiras preencham seus dados e chave PIX diretamente pelo celular.

---

### 3. Clientes e Planos

- **Identificador:** `clientes-planos`
- **Rota:** `/clientes`
- **Público:** Administradores, Operadores e Clientes.
- **Finalidade:** Administração da carteira de clientes em auto-monitoramento, contratos de locação e vinculação de veículos.
- **Seções Principais:**
  1. _Cadastrar Novo Cliente:_ Inclusão de dados cadastrais, plano de assinatura contratado (Básico, Pro ou Master) e prazo de retenção de histórico.
  2. _Vincular Veículos e Rastreadores:_ Associação de placas, modelos, ano e identificadores de IMEI aos clientes titulares.

---

### 4. Atendimento ao Cliente

- **Identificador:** `atendimento-cliente`
- **Rota:** `/atendimento`
- **Público:** Administradores e Operadores.
- **Finalidade:** Gestão de chamados de suporte ao cliente, incidentes técnicos e solicitações com carimbo de tempo inalterável.
- **Seções Principais:**
  1. _Abrir Novo Chamado de Suporte:_ Registro da ocorrência com categoria, veículo envolvido e descrição detalhada do cliente.
  2. _Registro de Providências e Conclusão:_ Histórico cronológico de ações tomadas pelo operador até o fechamento formal do chamado.

---

### 5. Estoque e Suprimentos

- **Identificador:** `estoque-suprimentos`
- **Rota:** `/estoque`
- **Público:** Administradores e Operadores (com restrições contábeis e de fornecedores para operadores).
- **Finalidade:** Controle de peças, chicotes, relés, chips M2M e rastreadores 4G homologados.
- **Seções Principais:**
  1. _Gestão de Itens e Peças:_ Cadastro de insumos, saldo atual e alerta de estoque mínimo para reposição.
  2. _Leitor Inteligente de Notas Fiscais em PDF:_ Importação automatizada de dados de NF-e para entrada no estoque (acesso exclusivo a administradores).

---

### 6. Financeiro e Fluxo de Caixa

- **Identificador:** `financeiro-caixa`
- **Rota:** `/financeiro`
- **Público:** Administradores e SuperADM.
- **Finalidade:** Controle de receitas, despesas operacionais da operação de locação e saúde contábil.
- **Seções Principais:**
  1. _Lançamento de Receitas e Despesas:_ Livro-caixa com filtros por ano e mês, controle de despesas recorrentes e parceladas e conversão em tempo real de moedas estrangeiras (USD).
  2. _DRE e Relatórios Contábeis:_ Demonstrativo de Resultados do Exercício, margens e projeções financeiras.

---

### 7. Mensalidades e Cobrança

- **Identificador:** `mensalidades-cobranca`
- **Rota:** `/mensalidades`
- **Público:** Administradores e Clientes.
- **Finalidade:** Emissão e liquidação de mensalidades de locação dos rastreadores.
- **Seções Principais:**
  1. _Gestão de Faturas e Baixas:_ Monitoramento de mensalidades com cálculo automático de multa e juros diários de mora proporcionais em caso de atraso e geração instantânea de PIX Copia e Cola.

---

### 8. Manutenção Preventiva

- **Identificador:** `manutencao-preventiva`
- **Rota:** `/manutencao`
- **Público:** Administradores, Operadores e Clientes Titulares.
- **Finalidade:** Acompanhamento do ciclo de vida mecânico dos veículos baseado no odômetro real transmitido pelo rastreador.
- **Seções Principais:**
  1. _Cadastrar Nova Manutenção:_ Definição de revisões preventivas (troca de óleo, pastilhas de freio, filtros, rodízio de pneus) e agendamento de atendimentos pelo app.

---

### 9. Dispositivos Autorizados

- **Identificador:** `dispositivos-autorizados`
- **Rota:** `/seguranca`
- **Público:** Administradores e SuperADM.
- **Finalidade:** Controle de navegadores e aparelhos com acesso concedido à plataforma com política TOFU (Trust On First Use).
- **Seções Principais:**
  1. _Gestão de Dispositivos:_ Aprovação com impressão digital de hardware e revogação imediata de dispositivos conectados.

---

### 10. Rastreadores J16 (Comandos e Ativação)

- **Identificador:** `rastreador-j16`
- **Rota:** `/rastreadores`
- **Público:** SuperADM.
- **Finalidade:** Configuração técnica de hardware, portas de comunicação telemática e comandos SMS/GPRS.
- **Seções Principais:**
  1. _Comandos SMS de Inicialização:_ Instruções de APN, IP do servidor, porta TCP 7002 e temporizadores de transmissão.

---

### 11. Temas dos Cards e Módulos

- **Identificador:** `temas-cards`
- **Rota:** `/configuracao/temas`
- **Público:** Administradores e SuperADM.
- **Finalidade:** Personalização visual da paleta de cores e relevos dos módulos em modo claro e escuro tático.
- **Seções Principais:**
  1. _Esquema Canônico de Cores:_ Configuração de temas monocromáticos, duplos, trios e quad com pré-visualização ao vivo.

---

### 12. Central de Segurança Cibernética e Defesa

- **Identificador:** `central-seguranca`
- **Rota:** `/seguranca`
- **Público:** SuperADM e Administradores.
- **Finalidade:** Auditoria de conformidade, custódia, defesa em profundidade e integridade de arquivos.
- **Seções Principais:**
  1. _Pilares de Segurança Ativos:_ Conferência de RLS em 100% das tabelas, políticas de autenticação MFA AAL2, blindagem da conta mestre SuperADM e proteção contra vazamento de dados.

---

### 13. Logs e Auditoria Forense

- **Identificador:** `logs-auditoria`
- **Rota:** `/seguranca`
- **Público:** SuperADM e Administradores.
- **Finalidade:** Histórico auditável de requisições, logins e operações críticas com encadeamento criptográfico.
- **Seções Principais:**
  1. _Consultar Histórico de Acessos:_ Filtragem por data, usuário, IP, ação realizada e detalhes estruturados em JSON.

---

### 14. Usuários e Acessos

- **Identificador:** `usuarios-acessos`
- **Rota:** `/usuarios`
- **Público:** Administradores e SuperADM.
- **Finalidade:** Administração de operadores, parceiros, clientes e perfis de acesso.
- **Seções Principais:**
  1. _Cadastrar e Gerenciar Usuários:_ Atribuição granular de módulos, seleção de papéis canônicos e bloqueio imediato com 1 clique.

---

### 15. Frota Operacional e Analytics

- **Identificador:** `frota-gestao`
- **Rota:** `/frota`
- **Público:** Administradores e Gestores de Frota.
- **Finalidade:** Inteligência operacional e indicadores de eficiência da frota de veículos.
- **Seções Principais:**
  1. _Painel de Indicadores e Eficiência:_ Contagem de veículos ativos, em trânsito e ociosos com motor ligado.
  2. _Conformidade, Manutenção e Custo por KM:_ Índice de revisões preventivas em dia e controle de TCO.

---

### 16. Motoristas e Portal do Condutor

- **Identificador:** `motoristas-portal`
- **Rota:** `/motoristas`
- **Público:** Administradores, Operadores e Motoristas.
- **Finalidade:** Gestão de condutores e autoatendimento mobile para motoristas da frota.
- **Seções Principais:**
  1. _Cadastro e Monitoramento de CNH:_ Controle de validade e pontuação de habilitações com avisos preventivos.
  2. _Portal do Motorista e Autoatendimento:_ Interface para consulta do veículo designado e envio de recibos de despesas.

---

### 17. Chat e Mensageria em Tempo Real

- **Identificador:** `chat-mensageria`
- **Rota:** `/chat`
- **Público:** Todos os usuários autenticados.
- **Finalidade:** Mensageria instantânea com entrega em segundo plano via Web Push VAPID e modo supervisão.
- **Seções Principais:**
  1. _Conversas em Tempo Real e Web Push:_ Troca de mensagens no padrão neumórfico suave com alertas sonoros e push mesmo com a tela bloqueada.
  2. _Modo Supervisão para Administradores:_ Leitura auditada de atendimentos mantidos entre operadores e clientes com possibilidade de intervenção direta.

---

### 18. Configuração e Diagnóstico de Rastreadores J16 (4G)

- **Identificador:** `rastreador-j16`
- **Rota:** `/configuracao/rastreador-j16`
- **Público:** Administradores e SuperADM.
- **Finalidade:** Parametrização remota via socket TCP/GPRS (pacote binário `0x80`), auditoria física de parâmetros em tempo real (pacote `0x15`), catálogo de comandos canônicos e disparo em lote para múltiplos equipamentos.
- **Referência Técnica Oficial:** Baseado estritamente no [Manual do Usuário Voxter J16 4G v1.1](file:///Users/djrnovaes/.gemini/antigravity-ide/scratch/hunter/docs/MANUAL-J16-VOXTER.md) (Anatel 00452-24-15524).
- **Seções Principais:**
  1. _Listagem e Telemetria em Tempo Real:_ Tabela e cards interativos com seleção múltipla (Multi-Select), status do socket TCP, ignição física, tensão real de bateria e parâmetros auditados.
  2. _Parâmetros Canônicos do Sistema:_ DNS (`gps.oficial.tec.br`), IP (`167.234.233.82`), porta (`7002`), APN M2M (`voxter.br`), credenciais (`algar`/`1212`), timers (`TIMER,30,3600#`), heartbeat (`HBT,300,300#`), timezone (`GMT,W,0,0#`) e detecção de curva inteligente (`SZCS#ANGLE,SEND=1`).
  3. _Carga Total em Lote (Batch Completo):_ Disparo sequencial dos comandos de parametrização homologados com delay de 1.500ms entre comandos para proteção da memória flash e buffer da MCU.
  4. _Console Interativo e Consultas Passivas Seguras:_ Terminal com atalhos de somente-leitura (`STATUS#`, `PARAM#`, `VERSION#`, `SERVER#`, `RELAY#`, `GPRSSET#`, `SCXSZ#`, `WHERE#`), comandos de calibração de engenharia e parser instantâneo de confirmações `0x15` do microcontrolador J16.
  5. _Salvaguardas de Segurança Viária:_ Bloqueio seguro inteligente (`SZCS#SOURCE_OFF_TYPE=0`) para corte condicionado a velocidade inferior a 20 km/h e isolamento rigoroso contra execução acidental de comandos destrutivos de flash.
  6. _Duplo Odômetro em Tempo Real no Cockpit 3D:_ Comparador de precisão A/B entre a quilometragem do Servidor Hunter (WGS-84 + fusão inercial) e a medição interna da MCU do J16 (via `SZCS#GT06SEL=1#GT06METER=1#`), apresentando os dois mostradores lado a lado e o desvio diferencial delta em tempo real.

---

### 19. Disparo Direto e Mensageria WhatsApp

- **Identificador:** `disparo-whatsapp`
- **Rota:** Atalho no Cabeçalho Global, Atendimento ao Cliente (`/atendimento`) e Monitor GPS (`/monitor-gps`).
- **Público:** Operadores, Administradores e SuperADM.
- **Finalidade:** Comunicação direta, instantânea e centralizada com clientes, condutores e técnicos via WhatsApp Web ou Gateway Baileys dedicado, sem expor número pessoal do operador e com histórico de entrega rastreável.
- **Arquitetura Implementada:**
  1. _Micro-Gateway Baileys no Fly.io (Custo Zero):_ Servidor em Node.js com biblioteca Baileys mantendo o socket WhatsApp ativo 24/7 com persistência de sessão em volume criptografado (`/data/session`).
  2. _Proxy Canônico de Mesma Origem (`/api/whatsapp`):_ Roteador reverso no Cloudflare Worker da aplicação que intercepta `/api/whatsapp/status`, `/api/whatsapp/send` e `/api/whatsapp/qrcode`, eliminando bloqueios de adblockers móveis e problemas de CORS.
  3. _Isolamento Seguro de Credenciais:_ Token secreto mantido no servidor, sem vazamento no bundle JavaScript do cliente.
- **Seções Principais:**
  1. _Catálogo Inteligente de Contatos:_ Agregação dinâmica e deduplicação de clientes, telefones vinculados a placas de veículos e motoristas cadastrados.
  2. _Templates Rápidos de 1 Toque:_ Mensagens padronizadas para confirmação de agendamento de instalação, aviso de âncora disparada/alerta de cerca, cobrança cordial de mensalidade e suporte operacional.
  3. _Monitoramento de Conexão em Tempo Real (Badge Interativo):_ Indicador visual verde/vermelho com verificação de status do gateway e botão de recarga/revalidação instantânea.
  4. _Contingência Automática (WhatsApp Web):_ Botão de fallback imediato que abre o WhatsApp Web com texto pré-preenchido caso o micro-gateway esteja temporariamente inacessível.

---

### 20. Revendedores e Vendedores (Parceiros Comerciais)

- **Identificador:** `revendedores-vendedores`
- **Rota:** `/revendedores` e `/minhas-vendas`
- **Público:** Revendedores, Vendedores, Administradores e SuperADM.
- **Finalidade:** Gestão completa de canais de distribuição comercial, parcerias de indicação, comissionamento automático e proteção de margem de lucro.
- **Seções Principais:**
  1. _Auto-Cadastro de Parceiros e Links de Indicação:_ Credenciamento ágil de revendedores e vendedores com chave PIX para repasse automático de comissões por contratos fechados.
  2. _Compartilhamento de Propostas via WhatsApp:_ Geração de links personalizados com código de indicação do parceiro para envio em 1 toque pelo WhatsApp.
  3. _Proteção de Margem Mínima (R$ 15,00):_ A plataforma aplica compulsoriamente a sugestão de no mínimo R$ 15,00 sobre o custo base da locação, bloqueando vendas abaixo do piso para assegurar rentabilidade sustentável ao parceiro.
  4. _DRE do Parceiro:_ Demonstrativo transparente de clientes ativos, receita bruta, custos dos rastreadores e comissão líquida apurada, com agendamento opcional de envio para o WhatsApp.
  5. _Redefinição Segura de Senha:_ Modal dedicado com validação de primeiro acesso para os próprios parceiros definirem sua credencial de acesso.

---

### 21. Contratos de Locação e Assinatura Eletrônica

- **Identificador:** `contratos-assinatura`
- **Rota:** `/clientes` e `/assinar`
- **Público:** Clientes Titulares, Operadores e Administradores.
- **Finalidade:** Formalização jurídica da locação de rastreadores 4G para auto-monitoramento com validade legal plena, carimbo de tempo e custódia digital.
- **Seções Principais:**
  1. _Emissão do Contrato de Locação:_ Geração automática da minuta contratual vinculando o cliente titular, veículos, equipamentos alugados e valor mensal da assinatura.
  2. _Assinatura Mobile na Tela:_ O cliente assina desenhando no canvas touchscreen do próprio smartphone e captura foto de documento oficial com selfie para verificação de identidade.
  3. _Selo de Autenticidade SGD e Código de Verificação:_ O PDF final recebe carimbo oficial do GD Rastreamento com código de validação curto no rodapé de cada página.
  4. _Hash Criptográfico SHA-256 e Verificação Pública:_ O documento possui integridade atestada por hash SHA-256 e QR Code público para conferência de autenticidade em tempo real.

---

### 22. WhatsApp Dev-Bot de Auto-Monitoramento e Degustação 24h

- **Identificador:** `auto-monitoramento-whatsapp`
- **Rota:** Gateway WhatsApp (`/api/whatsapp`)
- **Público:** Visitantes em geral, Clientes em Teste, Parceiros e Administradores.
- **Finalidade:** Autoatendimento ao público no WhatsApp comercial, explicação do modelo de auto-monitoramento veicular, solicitação de degustação de 24h pelo comando TESTE e reativação segura.
- **Seções Principais:**
  1. _Primeiro Contato e Apresentação do Guardião Virtual:_ Mensagem receptiva com menu explicativo de planos, locação para auto-monitoramento pelo próprio cliente e localização de vendedores credenciados.
  2. _Cadastro de Degustação (Comando TESTE):_ Operadores ou parceiros autorizados iniciam o cadastro de um interessado digitando TESTE no WhatsApp, coletando Nome, E-mail, Celular do Cliente e Senha provisória. O número do cliente serve exclusivamente para o envio das credenciais.
  3. _Opção de Envio das Credenciais ao Cliente:_ Ao concluir o cadastro, o bot pergunta: '1. Enviar dados de acesso ao cliente' ou '2. Não enviar'. A escolha 1 despacha imediatamente a mensagem ao cliente pelo WhatsApp; a escolha 2 preserva os dados apenas para o autorizador repassar quando desejar.
  4. _Reativação de Degustação Existente (+24h):_ Se o e-mail informado for de um cliente de degustação já cadastrado, o sistema pergunta se deseja reativar o acesso por mais 24 horas no Plano Master e aplica a reativação imediata após a confirmação.
  5. _Blindagem de Segurança Contra Desconhecidos:_ Comandos operacionais restritos (bloqueio, corte, relatórios) enviados por números não cadastrados são sumariamente ignorados, garantindo a defesa patrimonial e silêncio anti-enumeração.

---

### 23. Relatório Gerencial Diário e Métricas Operacionais às 10h

- **Identificador:** `relatorio-gerencial`
- **Público:** Exclusivo SuperADM (`novaes@adm.28bpm.local` ou `novaes@oficial.tec.br`).
- **Finalidade:** Despacho automatizado do relatório diário de telemetria, integridade de conexões, saúde dos rastreadores J16, cobranças e limites Free Tier às 10h da manhã no WhatsApp do SuperADM.
- **Seções Principais:**
  1. _Saúde Telemática da Frota:_ Total de veículos conectados, em trânsito, estacionados e equipamentos sem transmissão recente.
  2. _Governança de Limites Free Tier:_ Monitoramento de consumo de banco de dados (Supabase), conexões ativas e tráfego de saída.
  3. _Gestão de Cobranças:_ Faturas vencidas, liquidadas no dia anterior e projeção de receitas do mês.
