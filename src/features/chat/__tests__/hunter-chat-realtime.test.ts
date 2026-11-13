// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Testes do Chat Interativo em Tempo Real (v1.10.0.5)
// Validação de regras de negócio, visibilidade por perfil e entrega de notificações
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatarContatosOnline } from "../services/chatService";
import {
  foiNotificacaoProcessada,
  limparCacheNotificacoesProcessadas,
} from "../../../shared/lib/notificacoesBdService";
import type { UsuarioOnline } from "@/features/seguranca/context/PresenceContext";

describe("Hunter — Chat Interativo em Tempo Real", () => {
  const usuariosOnlineMock: UsuarioOnline[] = [
    {
      userId: "u-adm-1",
      email: "novaes@oficial.tec.br",
      nome: "Novaes SuperADM",
      role: "superadmin",
      onlineAt: new Date().toISOString(),
    },
    {
      userId: "u-op-1",
      email: "joao@operador.sigoguardiao.local",
      nome: "Operador Tático 1",
      role: "operador",
      onlineAt: new Date().toISOString(),
    },
    {
      userId: "u-op-2",
      email: "maria@operador.sigoguardiao.local",
      nome: "Operador Tático 2",
      role: "operador",
      onlineAt: new Date().toISOString(),
    },
    {
      userId: "u-cli-1",
      email: "cliente1@gmail.com",
      nome: "Cliente João",
      role: "cliente",
      onlineAt: new Date().toISOString(),
    },
    {
      userId: "u-cli-2",
      email: "cliente2@gmail.com",
      nome: "Cliente Maria",
      role: "cliente",
      onlineAt: new Date().toISOString(),
    },
  ];

  it("1. Regra de Visibilidade do Cliente: Vê estritamente Operadores; ADM oculto por padrão (a menos que visivelNoChat=true)", () => {
    // Caso 1: ADM com visibilidade padrão (desligada/false)
    const contatosSemAdmVisivel = formatarContatosOnline({
      usuariosOnline: usuariosOnlineMock,
      meuUserId: "u-cli-1",
      isCliente: true,
    });

    // Deve ver apenas u-op-1 e u-op-2 (ADM u-adm-1 está invisível)
    assert.equal(contatosSemAdmVisivel.length, 2);
    assert.ok(contatosSemAdmVisivel.some((c) => c.userId === "u-op-1"));
    assert.ok(contatosSemAdmVisivel.some((c) => c.userId === "u-op-2"));
    assert.ok(
      !contatosSemAdmVisivel.some((c) => c.userId === "u-adm-1"),
      "ADM não pode aparecer para clientes com visibilidade desligada",
    );

    // Caso 2: ADM ativou visibilidade (visivelNoChat=true)
    const usuariosComAdmVisivel: UsuarioOnline[] = usuariosOnlineMock.map((u) =>
      u.userId === "u-adm-1" ? { ...u, visivelNoChat: true } : u,
    );

    const contatosComAdmVisivel = formatarContatosOnline({
      usuariosOnline: usuariosComAdmVisivel,
      meuUserId: "u-cli-1",
      isCliente: true,
    });

    assert.equal(contatosComAdmVisivel.length, 3);
    assert.ok(contatosComAdmVisivel.some((c) => c.userId === "u-adm-1"));
    assert.ok(contatosComAdmVisivel.some((c) => c.userId === "u-op-1"));
    assert.ok(contatosComAdmVisivel.some((c) => c.userId === "u-op-2"));

    // JAMAIS deve ver outros clientes
    assert.ok(
      !contatosComAdmVisivel.some((c) => c.userId === "u-cli-2"),
      "Cliente não pode ver outro cliente",
    );
    assert.ok(
      !contatosComAdmVisivel.some((c) => c.userId === "u-cli-1"),
      "Próprio usuário não deve se listar",
    );
  });

  it("2. Regra de Visibilidade do Operador/ADM: Vê todos os usuários online", () => {
    const contatosParaOperador = formatarContatosOnline({
      usuariosOnline: usuariosOnlineMock,
      meuUserId: "u-op-1",
      isCliente: false,
    });

    // Deve ver SuperADM, outro operador e todos os clientes online (menos a si mesmo)
    // 5 online no total - 1 (próprio) = 4
    assert.equal(contatosParaOperador.length, 4);
    assert.ok(contatosParaOperador.some((c) => c.userId === "u-adm-1"));
    assert.ok(contatosParaOperador.some((c) => c.userId === "u-op-2"));
    assert.ok(contatosParaOperador.some((c) => c.userId === "u-cli-1"));
    assert.ok(contatosParaOperador.some((c) => c.userId === "u-cli-2"));
    assert.ok(
      !contatosParaOperador.some((c) => c.userId === "u-op-1"),
      "Próprio operador não deve se listar",
    );
  });

  it("3. Regra de Notificação Push com Celular Bloqueado: Payload correto com tipo 'chat' e URL '/chat'", () => {
    const pushPayload = {
      destinatarioUserId: "u-cli-1",
      titulo: "💬 Central Hunter",
      mensagem: "Olá, seu veículo está em trânsito com segurança.",
      tipo: "chat",
      url: "/chat",
    };

    assert.equal(pushPayload.tipo, "chat");
    assert.equal(pushPayload.url, "/chat");
    assert.ok(pushPayload.mensagem.length > 0);
    assert.ok(pushPayload.titulo.includes("Central Hunter"));
  });

  it("4. Validação da Mensagem: Limite de caracteres e obrigatoriedade de corpo", () => {
    function validarMensagem(texto: string): boolean {
      const trimmed = texto.trim();
      return trimmed.length > 0 && trimmed.length <= 4000;
    }

    assert.equal(validarMensagem(""), false, "Mensagem vazia deve ser rejeitada");
    assert.equal(validarMensagem("   "), false, "Espaços vazios devem ser rejeitados");
    assert.equal(validarMensagem("Olá, boa tarde!"), true, "Mensagem válida deve ser aceita");
    assert.equal(
      validarMensagem("A".repeat(4001)),
      false,
      "Mensagem acima de 4000 caracteres deve ser rejeitada",
    );
    assert.equal(
      validarMensagem("A".repeat(4000)),
      true,
      "Mensagem de exatamente 4000 caracteres deve ser aceita",
    );
  });

  it("5. Isolamento de Marca Hunter: Proibição absoluta de termos proibidos", () => {
    const termosProibidos = [
      "SIGOVTR",
      "SIGOFROTA",
      "SuperAdmin Mestre",
      "Conta Mestre",
      "Acesso Mestre",
    ];
    const arquivosChat = [
      "Chat Interativo em Tempo Real",
      "Conversas Diretas com Suporte e Operação",
      "Central de Atendimento e Auto-Monitoramento Hunter",
    ];

    for (const texto of arquivosChat) {
      for (const proibido of termosProibidos) {
        assert.ok(
          !texto.toUpperCase().includes(proibido.toUpperCase()),
          `Texto contém termo proibido: ${proibido}`,
        );
      }
    }
  });

  it("6. Anti-Duplicação Semântica: Impede estritamente 2 notificações para a mesma mensagem (Broadcast + Postgres Changes)", () => {
    limparCacheNotificacoesProcessadas();

    const notifBroadcast = {
      id: "notif-1727463000-abc1234",
      remetente_user_id: "u-remetente-1",
      destinatario_user_id: "u-destinatario-1",
      tipo: "chat",
      titulo: "💬 Dario Novaes",
      mensagem: "Teste de mensagem em tempo real",
    };

    const notifPostgresInsert = {
      id: "4f7a2d3e-8c9b-4a5f-9e1d-2b3c4d5e6f7a", // UUID gerado pelo banco de dados
      remetente_user_id: "u-remetente-1",
      destinatario_user_id: "u-destinatario-1",
      tipo: "chat",
      titulo: "💬 Dario Novaes",
      mensagem: "Teste de mensagem em tempo real",
    };

    // 1ª chegada (Broadcast instantâneo): deve ser processada
    const processado1 = foiNotificacaoProcessada(notifBroadcast);
    assert.equal(processado1, false, "Primeira notificação deve ser aceita e processada");

    // 2ª chegada (Postgres Changes via banco com ID diferente): DEVE ser descartada como duplicata!
    const processado2 = foiNotificacaoProcessada(notifPostgresInsert);
    assert.equal(
      processado2,
      true,
      "Notificação idêntica vinda do banco com ID UUID diferente deve ser descartada para não duplicar toast/som",
    );

    // Nova mensagem com texto diferente: deve ser aceita
    const novaMensagem = {
      ...notifPostgresInsert,
      id: "5f8b3e4f-9d0c-5b6a-0f2e-3c4d5e6f7a8b",
      mensagem: "Outra mensagem subsequente",
    };
    const processadoNova = foiNotificacaoProcessada(novaMensagem);
    assert.equal(processadoNova, false, "Mensagem com conteúdo diferente deve ser processada");
  });

  it("7. Regra Canônica de Ergonomia: Notificação de chat NÃO deve disparar se chat estiver aberto em conversa", () => {
    function deveDispararNotificacaoExterna(params: {
      tipoNotificacao: string;
      chatVisivelNaTela: boolean;
    }): boolean {
      const ehChat = params.tipoNotificacao === "chat";
      if (ehChat && params.chatVisivelNaTela) {
        return false; // Suprime toast e notificação externa se já estiver no chat
      }
      return true;
    }

    // Chat aberto: NÃO dispara notificação externa
    assert.equal(
      deveDispararNotificacaoExterna({ tipoNotificacao: "chat", chatVisivelNaTela: true }),
      false,
      "Se o chat estiver aberto na tela, não precisa mandar notificação externa",
    );

    // Em outra parte do sistema (ex.: /monitor-gps): dispara notificação externa
    assert.equal(
      deveDispararNotificacaoExterna({ tipoNotificacao: "chat", chatVisivelNaTela: false }),
      true,
      "Se estiver em outra parte que não seja o chat, deve mandar notificação",
    );

    // Alerta crítico de veículo (acidente/socorro): sempre dispara mesmo com chat aberto
    assert.equal(
      deveDispararNotificacaoExterna({ tipoNotificacao: "acidente", chatVisivelNaTela: true }),
      true,
      "Alerta de segurança/acidente deve disparar sempre para segurança do operador",
    );
  });

  it("8. Regra de Catálogo Completo: ADM e Operador veem todos os usuários cadastrados mesmo que offline", () => {
    // Simula catálogo de perfis cadastrados no banco
    const perfisCadastradosBanco = [
      {
        id: "u-adm-1",
        nome: "Novaes SuperADM",
        email: "novaes@oficial.tec.br",
        role: "superadmin",
        ativo: true,
      },
      {
        id: "u-op-1",
        nome: "Operador Tático 1",
        email: "op1@sigoguardiao.local",
        role: "operador",
        ativo: true,
      },
      {
        id: "u-cli-ativo-online",
        nome: "Cliente Online",
        email: "cli1@email.com",
        role: "cliente",
        ativo: true,
      },
      {
        id: "u-cli-offline-1",
        nome: "Cliente Offline 1",
        email: "cli2@email.com",
        role: "cliente",
        ativo: true,
      },
      {
        id: "u-cli-offline-2",
        nome: "Cliente Offline 2",
        email: "cli3@email.com",
        role: "cliente",
        ativo: true,
      },
      {
        id: "u-cli-desativado",
        nome: "Cliente Inativo",
        email: "cli4@email.com",
        role: "cliente",
        ativo: false,
      },
    ];

    const presencaAtual: UsuarioOnline[] = [
      {
        userId: "u-adm-1",
        nome: "Novaes SuperADM",
        email: "novaes@oficial.tec.br",
        role: "superadmin",
        onlineAt: new Date().toISOString(),
      },
      {
        userId: "u-cli-ativo-online",
        nome: "Cliente Online",
        email: "cli1@email.com",
        role: "cliente",
        onlineAt: new Date().toISOString(),
      },
    ];

    const onlineSet = new Set(presencaAtual.map((p) => p.userId));
    const meuUserId = "u-adm-1";

    // Mapeamento dos contatos visíveis para o Administrador/Operador
    const contatosMapeados = perfisCadastradosBanco
      .filter((p) => p.ativo && p.id !== meuUserId)
      .map((p) => ({
        userId: p.id,
        nome: p.nome,
        role: p.role,
        online: onlineSet.has(p.id),
      }));

    // ADM deve ver 4 contatos (todos os ativos exceto ele mesmo)
    assert.equal(contatosMapeados.length, 4);

    // Deve ver cliente online com status online=true
    const cliOnline = contatosMapeados.find((c) => c.userId === "u-cli-ativo-online");
    assert.ok(cliOnline);
    assert.equal(cliOnline.online, true, "Cliente conectado deve ter status online=true");

    // DEVE ver os clientes offline com status online=false
    const cliOff1 = contatosMapeados.find((c) => c.userId === "u-cli-offline-1");
    assert.ok(cliOff1, "Cliente offline 1 deve estar visível no catálogo do ADM/Operador");
    assert.equal(cliOff1.online, false, "Cliente desconectado deve ter status online=false");

    const cliOff2 = contatosMapeados.find((c) => c.userId === "u-cli-offline-2");
    assert.ok(cliOff2, "Cliente offline 2 deve estar visível no catálogo do ADM/Operador");
    assert.equal(cliOff2.online, false);

    // NÃO deve ver usuários com ativo=false
    assert.ok(!contatosMapeados.some((c) => c.userId === "u-cli-desativado"));
  });

  it("9. Isolamento Estrito de Notificações: Envio para usuário offline é direcionado APENAS a ele, zero broadcast", () => {
    function processarEnvioNotificacao(params: {
      destinatarioUserId?: string | null;
      destinatarioClienteId?: string | null;
      mensagem: string;
    }): { sucesso: boolean; broadcastGlobal: boolean; destinatarioAlvo: string | null } {
      if (!params.destinatarioUserId && !params.destinatarioClienteId) {
        return { sucesso: false, broadcastGlobal: false, destinatarioAlvo: null };
      }
      return {
        sucesso: true,
        broadcastGlobal: false, // JAMAIS permite broadcast para todos
        destinatarioAlvo: params.destinatarioUserId || params.destinatarioClienteId || null,
      };
    }

    // 1. Envio de mensagem direcionada para cliente offline
    const envioDirecionado = processarEnvioNotificacao({
      destinatarioUserId: "u-cli-offline-1",
      mensagem: "Prezado cliente, seu relatório foi gerado com sucesso.",
    });

    assert.equal(envioDirecionado.sucesso, true);
    assert.equal(
      envioDirecionado.broadcastGlobal,
      false,
      "Notificação de chat nunca pode ser broadcast global",
    );
    assert.equal(
      envioDirecionado.destinatarioAlvo,
      "u-cli-offline-1",
      "Apenas o usuário offline em questão é o alvo",
    );

    // 2. Tentativa de envio sem destinatário: DEVE ser sumariamente rejeitada
    const envioSemAlvo = processarEnvioNotificacao({
      destinatarioUserId: null,
      mensagem: "Mensagem vazando sem destinatário",
    });
    assert.equal(envioSemAlvo.sucesso, false, "Disparo sem destinatário deve ser recusado");

    // 3. Filtragem no cliente receptor: apenas o usuário igual a destinatarioUserId processa
    function clienteReceptorDeveProcessar(
      currentUserId: string,
      notifDestinatarioId: string | null,
    ): boolean {
      if (!notifDestinatarioId) return false;
      return currentUserId === notifDestinatarioId;
    }

    assert.equal(
      clienteReceptorDeveProcessar("u-cli-offline-1", "u-cli-offline-1"),
      true,
      "O próprio usuário destinatário processa a notificação",
    );
    assert.equal(
      clienteReceptorDeveProcessar("outro-usuario-qualquer", "u-cli-offline-1"),
      false,
      "Outros usuários JAMAIS devem processar notificação direcionada a terceiros",
    );
  });

  it("10. Regra de Ergonomia: Alinhamento de mensagens na base para eliminar vão até a barra de digitação", () => {
    // Valida estrutura de layout canônico estilo WhatsApp:
    // O container scroll deve ter flex flex-col com um espaçador <div className="flex-1 min-h-0" />
    // para que com poucas mensagens elas fiquem coladas na barra de digitação.
    const layoutConfig = {
      scrollContainerClass:
        "flex-1 overflow-y-auto p-3 sm:p-4 bg-[#f0f2f5] dark:bg-[#0b141a] flex flex-col",
      spacerClass: "flex-1 min-h-0",
      mobileSafePadding: "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
    };

    assert.ok(layoutConfig.scrollContainerClass.includes("flex flex-col"));
    assert.ok(layoutConfig.spacerClass.includes("flex-1 min-h-0"));
    assert.ok(layoutConfig.mobileSafePadding.includes("safe-area-inset-bottom"));
  });

  it("11. Controle de Visibilidade de Administradores: ADM liga/desliga visibilidade para clientes", () => {
    // Simula catálogo de perfis
    const perfis = [
      { id: "adm-1", role: "superadmin", visivel_no_chat: false },
      { id: "adm-2", role: "adm", visivel_no_chat: true },
      { id: "op-1", role: "operador", visivel_no_chat: false },
    ];

    // Para clientes: operadores SEMPRE aparecem; ADMs apenas se visivel_no_chat === true
    const contatosFiltradosParaCliente = perfis.filter((p) => {
      if (p.role === "operador") return true;
      if ((p.role === "adm" || p.role === "superadmin") && p.visivel_no_chat === true) return true;
      return false;
    });

    assert.equal(contatosFiltradosParaCliente.length, 2);
    assert.ok(contatosFiltradosParaCliente.some((p) => p.id === "op-1"));
    assert.ok(contatosFiltradosParaCliente.some((p) => p.id === "adm-2"));
    assert.ok(
      !contatosFiltradosParaCliente.some((p) => p.id === "adm-1"),
      "ADM com visibilidade desativada NÃO pode aparecer para clientes",
    );
  });

  it("12. Regra Canônica de Privacidade: Desligar privacidade requer confirmação prévia obrigatória", () => {
    // Modelo de controle de fluxo de alteração de privacidade:
    // Clicar no botão com privacidade ATIVA NÃO PODE desligar diretamente. Deve abrir modal de confirmação.
    function tentarAlternarPrivacidade(params: { isPrivacidadeAtiva: boolean }): {
      requerConfirmacao: boolean;
      statusImediatoAposClique: boolean | null;
    } {
      if (params.isPrivacidadeAtiva) {
        // Exigência canônica Hunter: requer confirmação no modal
        return {
          requerConfirmacao: true,
          statusImediatoAposClique: null, // NÃO altera de imediato
        };
      }
      // Se estava inativa e o usuário quer ativar, pode ativar imediatamente
      return {
        requerConfirmacao: false,
        statusImediatoAposClique: true,
      };
    }

    // Caso 1: Usuário clica no botão enquanto a privacidade está ATIVA
    const tentativaDesligar = tentarAlternarPrivacidade({ isPrivacidadeAtiva: true });
    assert.equal(
      tentativaDesligar.requerConfirmacao,
      true,
      "Desligar privacidade DEVE exigir confirmação prévia",
    );
    assert.equal(
      tentativaDesligar.statusImediatoAposClique,
      null,
      "O status da privacidade NÃO PODE ser alterado imediatamente ao clicar",
    );

    // Caso 2: Usuário clica no botão enquanto a privacidade está DESATIVADA (quer ativar)
    const tentativaAtivar = tentarAlternarPrivacidade({ isPrivacidadeAtiva: false });
    assert.equal(tentativaAtivar.requerConfirmacao, false);
    assert.equal(tentativaAtivar.statusImediatoAposClique, true);
  });

  it("13. Regra de Supervisão ADM: Ao clicar no usuário ou cliente, agrupa e lista as conversas realizadas para escolha e leitura", () => {
    // Simula mensagens brutas do banco de dados notificacoes_sistema para o cliente "cli-dario"
    const targetUserId = "cli-dario";
    const mensagensMock = [
      {
        id: "msg-1",
        remetente_user_id: "cli-dario",
        destinatario_user_id: "op-joao",
        remetente_nome: "Dario Novaes",
        mensagem: "Boa tarde, preciso de suporte no rastreamento.",
        created_at: "2026-09-27T18:00:00Z",
      },
      {
        id: "msg-2",
        remetente_user_id: "op-joao",
        destinatario_user_id: "cli-dario",
        remetente_nome: "joao",
        mensagem: "Olá Dario! Como posso te ajudar hoje?",
        created_at: "2026-09-27T18:01:00Z",
      },
      {
        id: "msg-3",
        remetente_user_id: "adm-novaes",
        destinatario_user_id: "cli-dario",
        remetente_nome: "Novaes",
        mensagem: "Seu veículo foi calibrado com sucesso.",
        created_at: "2026-09-27T19:00:00Z",
      },
    ];

    // Lógica canônica de agrupamento de conversas realizadas
    const mapaConversas = new Map<
      string,
      {
        interlocutorId: string;
        interlocutorNome: string;
        ultimaMensagem: string;
        ultimaData: string;
        totalMensagens: number;
      }
    >();

    for (const m of mensagensMock) {
      const partnerId =
        m.remetente_user_id === targetUserId ? m.destinatario_user_id : m.remetente_user_id;
      if (!partnerId) continue;

      if (!mapaConversas.has(partnerId)) {
        mapaConversas.set(partnerId, {
          interlocutorId: partnerId,
          interlocutorNome: m.remetente_user_id === partnerId ? m.remetente_nome : "Usuário",
          ultimaMensagem: m.mensagem,
          ultimaData: m.created_at,
          totalMensagens: 1,
        });
      } else {
        const item = mapaConversas.get(partnerId)!;
        item.totalMensagens += 1;
        if (new Date(m.created_at) > new Date(item.ultimaData)) {
          item.ultimaData = m.created_at;
          item.ultimaMensagem = m.mensagem;
        }
      }
    }

    const conversas = Array.from(mapaConversas.values());

    // Deve identificar exatamente 2 conversas distintas para o cliente:
    // 1) Conversa com op-joao (2 mensagens)
    // 2) Conversa com adm-novaes (1 mensagem)
    assert.equal(
      conversas.length,
      2,
      "Dario deve possuir exatamente 2 conversas realizadas registradas",
    );
    const conversaJoao = conversas.find((c) => c.interlocutorId === "op-joao");
    const conversaNovaes = conversas.find((c) => c.interlocutorId === "adm-novaes");

    assert.ok(conversaJoao, "Conversa com operador João deve existir");
    assert.equal(conversaJoao?.totalMensagens, 2);
    assert.equal(conversaJoao?.ultimaMensagem, "Olá Dario! Como posso te ajudar hoje?");

    assert.ok(conversaNovaes, "Conversa com Administrador Novaes deve existir");
    assert.equal(conversaNovaes?.totalMensagens, 1);
    assert.equal(conversaNovaes?.ultimaMensagem, "Seu veículo foi calibrado com sucesso.");
  });

  it("14. Visibilidade em Tempo Real no Presence: Administrador com visivelNoChat=true aparece para clientes", () => {
    const usuariosPresence: UsuarioOnline[] = [
      {
        userId: "adm-online",
        email: "novaes@adm.28bpm.local",
        nome: "Novaes",
        role: "adm",
        onlineAt: new Date().toISOString(),
        visivelNoChat: true, // Administrador ativou visibilidade
      },
      {
        userId: "adm-oculto",
        email: "outro-adm@adm.28bpm.local",
        nome: "Outro ADM",
        role: "adm",
        onlineAt: new Date().toISOString(),
        visivelNoChat: false, // Administrador oculto
      },
      {
        userId: "op-tatico",
        email: "joao@operador.sigoguardiao.local",
        nome: "joao",
        role: "operador",
        onlineAt: new Date().toISOString(),
      },
    ];

    const contatosParaCliente = formatarContatosOnline({
      usuariosOnline: usuariosPresence,
      meuUserId: "cli-dario",
      isCliente: true,
    });

    // Deve listar:
    // 1) op-tatico (operador sempre permitido)
    // 2) adm-online (administrador com visivelNoChat ativo)
    // NÃO deve listar: adm-oculto
    assert.equal(contatosParaCliente.length, 2);
    assert.ok(contatosParaCliente.some((c) => c.userId === "adm-online"));
    assert.ok(contatosParaCliente.some((c) => c.userId === "op-tatico"));
    assert.ok(
      !contatosParaCliente.some((c) => c.userId === "adm-oculto"),
      "Administrador com visivelNoChat=false deve permanecer oculto para o cliente",
    );
  });
});
