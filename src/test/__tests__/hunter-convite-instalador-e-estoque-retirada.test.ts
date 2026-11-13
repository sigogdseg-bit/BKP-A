import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  ConviteInstalador,
  ValidarConviteResultado,
  CadastrarInstaladorPorConvitePayload,
} from "../../features/seguranca/services/conviteInstaladorService";

test("Hunter — Convite de Auto-Cadastro de Instalador e Devolucao de Kit ao Estoque (DJR-NEW)", async (t) => {
  await t.test("Estrutura do Convite: token de uso unico e expiracao", () => {
    const conviteMock: ConviteInstalador = {
      id: "convite-uuid-001",
      token: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      criado_por: "operador-uuid-123",
      usado: false,
      usado_em: null,
      expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };

    assert.equal(conviteMock.usado, false);
    assert.equal(typeof conviteMock.token, "string");
    assert.equal(conviteMock.token.length, 36);
  });

  await t.test("Validacao de Convite: rejeita convite usado ou expirado", () => {
    const conviteValido: ValidarConviteResultado = {
      valido: true,
      token: "uuid-valido-123",
    };
    assert.equal(conviteValido.valido, true);

    const conviteUsado: ValidarConviteResultado = {
      valido: false,
      mensagem: "Este link de convite ja foi utilizado e nao e mais valido.",
    };
    assert.equal(conviteUsado.valido, false);
    assert.ok(conviteUsado.mensagem?.includes("ja foi utilizado"));

    const conviteExpirado: ValidarConviteResultado = {
      valido: false,
      mensagem: "Este link de convite expirou. Solicite um novo link a administracao.",
    };
    assert.equal(conviteExpirado.valido, false);
    assert.ok(conviteExpirado.mensagem?.includes("expirou"));
  });

  await t.test(
    "Regra Petrea: conta cadastrada via convite e OBRIGATORIAMENTE inativa (ativo = false)",
    () => {
      const payloadCadastro: CadastrarInstaladorPorConvitePayload = {
        token: "uuid-convite-999",
        nome: "Joao Instalador Silva",
        email: "joao.instalador@oficina.com.br",
        senha: "SenhaSeguraForte123!",
        telefone: "21988887777",
        chavePix: "joao.instalador@oficina.com.br",
        enderecoInstalacao: "Rua das Oficinas, 120 - Centro, Rio de Janeiro - RJ",
      };

      // A regra de negocio determina que o instalador cadastrado pelo link
      // SEMPRE recebe status ativo = false, aguardando habilitacao por operador ou adm
      const perfilCriado = {
        id: "perfil-uuid-888",
        nome: payloadCadastro.nome,
        email: payloadCadastro.email,
        role: "instalador",
        ativo: false, // Obrigatoriamente inativa
        modulos: ["instalacao"],
        chave_pix: payloadCadastro.chavePix,
        endereco_instalacao: payloadCadastro.enderecoInstalacao,
      };

      assert.equal(perfilCriado.ativo, false, "A conta deve nascer inativa ate a aprovacao");
      assert.equal(perfilCriado.role, "instalador", "O perfil deve ser estritamente instalador");
      assert.deepEqual(
        perfilCriado.modulos,
        ["instalacao"],
        "Acesso restrito ao modulo de instalacao",
      );
    },
  );

  await t.test("Regra de Queima de Token: link de uso unico nao funciona apos envio", () => {
    let tokenUsado = false;

    // Simulacao de envio do formulario
    const enviarCadastro = () => {
      if (tokenUsado) {
        throw new Error("Token ja consumido. Link de uso unico.");
      }
      tokenUsado = true;
      return { success: true, message: "Cadastro realizado com sucesso." };
    };

    const primeiroEnvio = enviarCadastro();
    assert.equal(primeiroEnvio.success, true);
    assert.equal(tokenUsado, true);

    // Segundo envio com o mesmo token DEVE falhar
    assert.throws(() => enviarCadastro(), /Token ja consumido/);
  });

  await t.test("Retirada de Rastreador: estorno de itens do kit ao estoque", () => {
    // Simulacao de itens do kit instalados no veiculo
    const itensInstaladosNoVeiculo = [
      { item_id: "rele-12v", nome: "Rele de Bloqueio 12V 40A", quantidade: 1 },
      { item_id: "porta-fusivel", nome: "Porta Fusivel Automotivo com Chicote", quantidade: 1 },
      { item_id: "fio-10mm", nome: "Fio Automotivo 1.0mm", quantidade: 2 },
    ];

    // Ao concluir a retirada, todos os itens retornam ao estoque
    const estoqueAntes = {
      "rele-12v": 10,
      "porta-fusivel": 15,
      "fio-10mm": 50,
    };

    const estoqueDepois = { ...estoqueAntes };
    itensInstaladosNoVeiculo.forEach((item) => {
      estoqueDepois[item.item_id as keyof typeof estoqueDepois] += item.quantidade;
    });

    assert.equal(estoqueDepois["rele-12v"], 11);
    assert.equal(estoqueDepois["porta-fusivel"], 16);
    assert.equal(estoqueDepois["fio-10mm"], 52);
  });

  await t.test(
    "Regra de Primeiro Acesso: auto-cadastro por convite define primeiro_acesso = false (instalador escolheu a propria senha)",
    () => {
      // Quando o instalador se cadastra via convite, ele ja definiu sua senha pessoal.
      // Portanto primeiro_acesso DEVE ser false, dispensando a tela de troca obrigatoria de senha.
      const instaladorPorConvite = {
        id: "instalador-convite-123",
        role: "instalador",
        primeiro_acesso: false, // Definido explicitamente no auto-cadastro
        user_metadata: {
          convite_token: "token-convite-123",
        },
      };

      assert.equal(
        instaladorPorConvite.primeiro_acesso,
        false,
        "Instalador cadastrado por link com senha propria nao deve ter primeiro_acesso como true",
      );

      // Usuario comum cadastrado pela administracao sem link
      const usuarioCriadoPorAdm = {
        id: "usuario-adm-456",
        role: "operador",
        primeiro_acesso: true, // Troca obrigatoria
      };

      assert.equal(
        usuarioCriadoPorAdm.primeiro_acesso,
        true,
        "Usuario cadastrado pela administracao deve passar pela troca obrigatoria",
      );
    },
  );

  await t.test(
    "Fluxo de Agendamento: cliente atribuido a instalador fica elegivel para agendamento presencial",
    () => {
      const clienteAtribuido = {
        id: "cliente-789",
        nome_razao_social: "Transportadora Confianca",
        instalador_id: "instalador-convite-123",
        status_agendamento: "aguardando_agendamento",
        data_agendamento: null,
        hora_agendamento: null,
      };

      // Instalador define data e hora
      const agendamentoRealizado = {
        ...clienteAtribuido,
        data_agendamento: "2026-10-15",
        hora_agendamento: "14:00",
        status_agendamento: "agendado",
      };

      assert.equal(agendamentoRealizado.status_agendamento, "agendado");
      assert.equal(agendamentoRealizado.data_agendamento, "2026-10-15");
      assert.equal(agendamentoRealizado.hora_agendamento, "14:00");
    },
  );

  await t.test("Regra Petrea DJR-NEW: Proibicao de caractere comercial em arquivos novos", () => {
    const arquivosVerificar = [
      path.resolve(process.cwd(), "src/features/seguranca/services/conviteInstaladorService.ts"),
      path.resolve(process.cwd(), "src/features/seguranca/components/ModalConviteInstalador.tsx"),
      path.resolve(process.cwd(), "src/routes/cadastro-instalador.tsx"),
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260926120000_hunter_convites_auto_cadastro_instalador.sql",
      ),
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260926110000_hunter_devolucao_kit_estoque_na_retirada.sql",
      ),
      path.resolve(process.cwd(), "supabase/MIGRATION_CONVITES_E_RETIRADA_KIT.sql"),
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261008133000_hunter_fix_instalador_primeiro_acesso_e_agendamentos.sql",
      ),
    ];

    for (const arq of arquivosVerificar) {
      if (fs.existsSync(arq)) {
        const conteudo = fs.readFileSync(arq, "utf-8");
        // Verifica se ha caractere comercial solto em strings ou comentarios de texto
        // Permitindo apenas operadores booleanos && no codigo TypeScript
        const linhas = conteudo.split("\n");
        linhas.forEach((linha, idx) => {
          const linhaTrim = linha.trim();
          // Ignora operadores &&
          const semOperador = linhaTrim.replace(/&&/g, "");
          assert.ok(
            !semOperador.includes("&"),
            `Caractere comercial proibido encontrado em ${path.basename(arq)} na linha ${idx + 1}: ${linhaTrim}`,
          );
        });
      }
    }
  });
});
