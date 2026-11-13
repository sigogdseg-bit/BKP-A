import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selecionarInstalacaoOuVeiculoPendente } from "@/features/instalacoes/services/instalacaoService";
import { ehVeiculoComInstalacaoConcluida } from "@/features/clientes/services/clienteService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

describe("Hunter — Instalações: Alternador Cards/Lista e Relação Completa de Clientes", () => {
  it("1. InstalacoesView.tsx deve oferecer alternância persistida entre Cards e Lista", () => {
    const viewPath = path.join(root, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      content.includes("hunter_instalacoes_modo_exibicao"),
      "Deve persistir modo de exibição em localStorage",
    );
    assert.ok(
      content.includes('setModoExibicao("cards")') && content.includes('setModoExibicao("lista")'),
      "Deve alternar entre modos cards e lista",
    );
    assert.ok(
      content.includes('modoExibicao === "cards" ? (') && content.includes("<table"),
      "Deve renderizar grid de cards ou tabela no modo lista",
    );
    const contentSemUrls = content.replace(/\?api=1&query=/g, "");
    assert.ok(
      !/[^&]&[^&]/.test(contentSemUrls),
      "InstalacoesView.tsx não deve conter caractere comercial & isolado em textos",
    );
  });

  it("2. carregarClientesParaInstalacao deve relacionar todos os clientes sem excluir clientes já ativos", () => {
    const servicePath = path.join(root, "src/features/instalacoes/services/instalacaoService.ts");
    const content = fs.readFileSync(servicePath, "utf-8");

    const inicioFn = content.indexOf("export async function carregarClientesParaInstalacao");
    const fimFn = content.indexOf("export async function obterDadosPreenchimentoInstalacaoCliente");
    assert.ok(inicioFn !== -1 && fimFn > inicioFn, "Função deve existir no serviço");

    const trechoFn = content.slice(inicioFn, fimFn);
    assert.ok(
      !trechoFn.includes("status_agendamento.neq.concluido"),
      "carregarClientesParaInstalacao não deve excluir clientes ativos com status_agendamento concluido",
    );
  });

  it("3. NovaInstalacaoModal e ClientesView devem permitir ir direto para o cadastro de novo cliente", () => {
    const modalPath = path.join(
      root,
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const modalContent = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      modalContent.includes("irParaCadastroNovoCliente"),
      "NovaInstalacaoModal deve implementar irParaCadastroNovoCliente",
    );
    assert.ok(
      modalContent.includes("Ir para Cadastro de Novo Cliente") &&
        modalContent.includes("Cadastrar Novo Cliente"),
      "NovaInstalacaoModal deve exibir botão claro para ir ao cadastro de novo cliente",
    );
    assert.ok(
      modalContent.includes('navigate({ to: "/clientes" })'),
      "Deve navegar para /clientes",
    );
    assert.ok(
      !/[^&]&[^&]/.test(modalContent),
      "NovaInstalacaoModal.tsx não deve conter caractere comercial & isolado",
    );

    const clientesPath = path.join(root, "src/features/clientes/components/ClientesView.tsx");
    const clientesContent = fs.readFileSync(clientesPath, "utf-8");
    assert.ok(
      clientesContent.includes("sigo_abrir_novo_cliente"),
      "ClientesView deve abrir o modal de novo cliente ao receber sigo_abrir_novo_cliente",
    );
  });

  it("4. selecionarInstalacaoOuVeiculoPendente não deve puxar instalação concluída nem veículo já ativo ao adicionar novo veículo", () => {
    const instalacoesConcluidas = [
      {
        id: "inst-concluida-1",
        veiculo_id: "veic-1",
        placa: "LTK1A94",
        marca: "A DEFINIR",
        modelo: "GM MONTANA GM/ MONTANA SPORT",
        rastreador_imei: "869890084959182",
        chip_iccid: "89553202100092787791",
        status: "concluida",
        tipo_servico: "instalacao",
      },
    ];
    const veiculosAtivos = [
      {
        id: "veic-1",
        placa: "LTK1A94",
        marca_modelo: "GM MONTANA",
        rastreador_id: "rast-1",
        ativo: true,
        status_operacional: "estacionado",
      },
    ];

    const resConcluido = selecionarInstalacaoOuVeiculoPendente(
      instalacoesConcluidas,
      veiculosAtivos,
    );
    assert.strictEqual(
      resConcluido,
      null,
      "Cliente ativo com apenas instalação concluída não deve pré-preencher o veículo anterior em + Nova Instalação",
    );

    const resComNovoVeiculoPendente = selecionarInstalacaoOuVeiculoPendente(instalacoesConcluidas, [
      {
        id: "veic-2",
        placa: "NEW2B34",
        marca_modelo: "Fiat Strada",
        ativo: false,
        rastreador_id: null,
      },
      ...veiculosAtivos,
    ]);
    assert.strictEqual(resComNovoVeiculoPendente?.origem, "veiculo");
    assert.strictEqual(resComNovoVeiculoPendente?.veiculo?.placa, "NEW2B34");

    const resComOrdemPendente = selecionarInstalacaoOuVeiculoPendente(
      [
        {
          id: "inst-aberta-2",
          veiculo_id: "veic-2",
          placa: "ABC9D88",
          rastreador_imei: "869890084999999",
          status: "agendada",
          tipo_servico: "instalacao",
        },
        ...instalacoesConcluidas,
      ],
      veiculosAtivos,
    );
    assert.strictEqual(resComOrdemPendente?.origem, "instalacao");
    assert.strictEqual(resComOrdemPendente?.instalacao?.id, "inst-aberta-2");
  });

  it("5. NovaInstalacaoModal deve isolar edição e limpar campos anteriores ao trocar ou selecionar cliente", () => {
    const modalPath = path.join(
      root,
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("if (isEdicao || !clienteId) return;"),
      "useEffect de pré-preenchimento não deve sobrescrever instalações em edição",
    );
    assert.ok(
      content.includes("limparDadosNovoVeiculoEquipamento"),
      "Modal deve possuir helper limparDadosNovoVeiculoEquipamento ao trocar cliente ou limpar pré-preenchimento",
    );
    assert.ok(
      content.includes("Limpar para Cadastrar Outro Veículo") &&
        content.includes("Novo veículo para cliente ativo"),
      "Modal deve orientar o operador quando adiciona novo veículo a cliente ativo ou pré-preenche ordem pendente",
    );
    assert.ok(
      !/[^&]&[^&]/.test(content),
      "NovaInstalacaoModal.tsx não deve conter caractere comercial & isolado",
    );
  });

  it("6. ehVeiculoComInstalacaoConcluida e ModalDistribuirInstalacoesVeiculos isolam veículos já instalados ao gerar novas OSs", () => {
    assert.strictEqual(
      ehVeiculoComInstalacaoConcluida({
        instalacao_status: "concluida",
        ativo: true,
        rastreador_id: "rast-1",
      }),
      true,
    );
    assert.strictEqual(
      ehVeiculoComInstalacaoConcluida({
        instalacao_status: "agendada",
        ativo: true,
        rastreador_id: "rast-1",
      }),
      true,
      "Veículo já ativo com rastreador vinculado deve permanecer preservado",
    );
    assert.strictEqual(
      ehVeiculoComInstalacaoConcluida({
        instalacao_status: null,
        ativo: false,
        rastreador_id: null,
      }),
      false,
    );
    assert.strictEqual(
      ehVeiculoComInstalacaoConcluida({
        instalacao_status: "agendada",
        ativo: false,
        rastreador_id: "rast-2",
      }),
      false,
    );

    const modalDistribuirPath = path.join(
      root,
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    const modalContent = fs.readFileSync(modalDistribuirPath, "utf-8");
    assert.ok(
      modalContent.includes("veiculosPendentes.map((v) =>"),
      "ModalDistribuirInstalacoesVeiculos deve enviar apenas veículos pendentes ao salvar",
    );
    assert.ok(
      modalContent.includes("Instalação Concluída • Preservada"),
      "ModalDistribuirInstalacoesVeiculos deve exibir card bloqueado/preservado para veículos já instalados",
    );

    const clienteServicePath = path.join(root, "src/features/clientes/services/clienteService.ts");
    const clienteServiceContent = fs.readFileSync(clienteServicePath, "utf-8");
    assert.ok(
      clienteServiceContent.includes("veiculosComOrdemConcluida") &&
        clienteServiceContent.includes("ordensConcluidasIds"),
      "salvarDistribuicaoInstalacoesCliente deve blindar ordens já concluídas contra sobrescrita",
    );
  });
});
