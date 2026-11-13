import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CANAIS_ALERTAS_PADRAO } from "../../features/monitor-gps/services/notificacoesService";
import {
  carregarContatosAlertaVeiculo,
  type ContatoAlertaWhatsapp,
} from "../../features/monitor-gps/services/protecaoVeiculoService";
import { validarDestinatarioMensagemAdministrativa } from "../../shared/lib/chatbotxBridge";

describe("Hunter — Canais de Alerta (App / WhatsApp) e Blindagem Administrativa", () => {
  test("1. Canais padrão de alerta devem ter App e WhatsApp ativos simultaneamente e Ligação desligada por padrão", () => {
    assert.deepEqual(CANAIS_ALERTAS_PADRAO, {
      app: true,
      whatsapp: true,
      ligacao: false,
    });
  });

  test("2. Blindagem Administrativa: deve permitir mensagens de plano/financeiro estritamente para o cliente", () => {
    // Permitido para cliente titular
    const r1 = validarDestinatarioMensagemAdministrativa(
      "cliente",
      "financeiro",
      "Seu plano Hunter Guardian vence em 5 dias.",
    );
    assert.equal(r1.permitido, true);

    // Proibido para motorista
    const r2 = validarDestinatarioMensagemAdministrativa(
      "motorista",
      "financeiro",
      "Seu plano Hunter Guardian vence em 5 dias.",
    );
    assert.equal(r2.permitido, false);
    assert.match(r2.motivo || "", /inadmissível/i);

    // Proibido para instalador com texto de plano
    const r3 = validarDestinatarioMensagemAdministrativa(
      "instalador",
      undefined,
      "Fatura disponível referente à mensalidade do seu plano.",
    );
    assert.equal(r3.permitido, false);
    assert.match(r3.motivo || "", /inadmissível/i);

    // Proibido para terceiros / outros
    const r4 = validarDestinatarioMensagemAdministrativa(
      "outro",
      "administrativo",
      "Atualização no contrato de rastreamento.",
    );
    assert.equal(r4.permitido, false);
    assert.match(r4.motivo || "", /inadmissível/i);

    // Mensagens operacionais comuns (alertas de velocidade, ignição) permitidas para motoristas
    const r5 = validarDestinatarioMensagemAdministrativa(
      "motorista",
      "alerta",
      "Alerta de velocidade violada no veículo ABC-1234",
    );
    assert.equal(r5.permitido, true);
  });

  test("3. Resolução de contatos de alerta: deve carregar cliente como padrão e motoristas vinculados", async () => {
    // Mock do Supabase Client para simular busca do cliente e motoristas
    const supabaseMock: any = {
      from(tabela: string) {
        if (tabela === "clientes") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "cli-1",
                        nome_razao_social: "Carlos Eduardo",
                        telefone: "(24) 99250-1512",
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (tabela === "motoristas") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq: async () => ({
                      data: [
                        {
                          id: "mot-1",
                          nome: "Roberto Motorista",
                          telefone: "(24) 98888-1111",
                          ativo: true,
                        },
                      ],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        return {};
      },
    };

    const contatos = await carregarContatosAlertaVeiculo("vtr-1", "cli-1", [], supabaseMock);

    assert.equal(contatos.length, 2);
    // Primeiro contato deve ser o cliente
    const clienteContato = contatos.find((c) => c.tipo === "cliente");
    assert.ok(clienteContato);
    assert.equal(clienteContato?.nome, "Carlos Eduardo (Cliente Titular)");
    assert.equal(clienteContato?.padrao, true);
    assert.equal(clienteContato?.ativo, true);

    // Segundo contato deve ser o motorista
    const motoristaContato = contatos.find((c) => c.tipo === "motorista");
    assert.ok(motoristaContato);
    assert.equal(motoristaContato?.nome, "Roberto Motorista (Motorista)");
    assert.equal(motoristaContato?.ativo, false); // Motoristas iniciam desligados por padrão até seleção
  });

  test("4. Resolução de contatos de alerta: preserva contatos extras salvos e customizações", async () => {
    const supabaseMock: any = {
      from(tabela: string) {
        if (tabela === "clientes") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "cli-1",
                    nome_razao_social: "Carlos Eduardo",
                    telefone: "24992501512",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (tabela === "motoristas") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const contatosSalvos: ContatoAlertaWhatsapp[] = [
      {
        id: "extra-1",
        nome: "Central 24h",
        telefone: "(24) 97777-3333",
        tipo: "adicional",
        ativo: true,
        padrao: false,
      },
    ];

    const contatos = await carregarContatosAlertaVeiculo(
      "vtr-1",
      "cli-1",
      contatosSalvos,
      supabaseMock,
    );

    assert.equal(contatos.length, 2);
    const extra = contatos.find((c) => c.id === "extra-1");
    assert.ok(extra);
    assert.equal(extra?.nome, "Central 24h");
    assert.equal(extra?.tipo, "adicional");
    assert.equal(extra?.ativo, true);
  });

  test("5. Código-fonte de ConfiguracaoProtecaoModal.tsx: conformidade estrita e ausência de '&'", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    // Proibição de '&' literal no código / texto da UI
    assert.equal(
      content.includes(" & "),
      false,
      "Não deve conter ' & ' solto na UI (utilizar 'e' ou 'e/ou')",
    );

    // Aba WhatsApp deve existir
    assert.ok(
      content.includes(`onClick={() => setAbaAtiva("whatsapp")}`),
      "Deve conter o gatilho da aba WhatsApp",
    );

    // Canais App e WhatsApp devem estar presentes na aba Notificações
    assert.ok(
      content.includes("Canais de Envio dos Alertas"),
      "Deve conter a seção de canais de envio",
    );

    // Preservação de assinaturas vitais
    assert.ok(content.includes("carregarPreferenciasNotificacao(session?.userId, veiculo.id)"));
    assert.ok(
      content.includes(
        'salvarPreferenciasNotificacao(session?.userId || "", notificacoes, veiculo.id)',
      ),
    );
    assert.ok(content.includes("if (!veiculo) return null;"));
    assert.ok(content.includes("Array.isArray(diasSemana)"));
    assert.ok(content.includes("PREFERENCIAS_PADRAO"));
  });

  test("6. Migração SQL e Script Mestre: devem conter canais_alertas e whatsapp_destinatarios com NOTIFY pgrst", () => {
    const migracaoPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261016100000_hunter_alertas_whatsapp_destinatarios.sql",
    );
    assert.ok(fs.existsSync(migracaoPath), "Arquivo de migração deve existir");
    const migContent = fs.readFileSync(migracaoPath, "utf-8");
    assert.ok(migContent.includes("canais_alertas"));
    assert.ok(migContent.includes("whatsapp_destinatarios"));
    assert.ok(migContent.includes("registrar_alerta_seguranca"));
    assert.ok(migContent.includes("NOTIFY pgrst, 'reload schema';"));

    const masterSqlPath = path.resolve(
      process.cwd(),
      "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const masterContent = fs.readFileSync(masterSqlPath, "utf-8");
    assert.ok(masterContent.includes("canais_alertas"));
    assert.ok(masterContent.includes("whatsapp_destinatarios"));
  });
});
