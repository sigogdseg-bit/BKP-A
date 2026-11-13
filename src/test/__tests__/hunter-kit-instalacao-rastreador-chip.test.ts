import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Nova Sistemática de Estoque e Kit de Instalação", () => {
  test("deve liberar para instalação estritamente equipamentos que possuem IMEI e ICCID vinculados no estoque", () => {
    const dispositivos = [
      { id: "1", imei: "869402051234567", status: "estoque", chip_id: null },
      { id: "2", imei: "869402051234568", status: "estoque", chip_id: "chip-1" },
      { id: "3", imei: "869402051234569", status: "instalado", chip_id: "chip-2" },
      { id: "4", imei: "869402051234570", status: "em_instalacao", chip_id: "chip-3" },
    ];

    const liberados = dispositivos.filter((d) => d.status === "estoque" && Boolean(d.chip_id));

    assert.equal(liberados.length, 1);
    assert.equal(liberados[0].imei, "869402051234568");
  });

  test("deve computar chips disponíveis considerando a quantidade total de chips menos os vinculados a rastreadores", () => {
    const totalChipsEstoque = [
      { id: "c1", iccid: "895501" },
      { id: "c2", iccid: "895502" },
      { id: "c3", iccid: "895503" },
      { id: "c4", iccid: "895504" },
    ];

    const rastreadores = [
      { id: "r1", chip_id: "c1" },
      { id: "r2", chip_id: "c2" },
      { id: "r3", chip_id: null },
    ];

    const chipsVinculadosIds = new Set(
      rastreadores.map((r) => r.chip_id).filter((id): id is string => Boolean(id)),
    );

    const chipsDisponiveis = totalChipsEstoque.filter((c) => !chipsVinculadosIds.has(c.id));

    assert.equal(chipsDisponiveis.length, 2);
    assert.deepEqual(
      chipsDisponiveis.map((c) => c.id),
      ["c3", "c4"],
    );
  });

  test("deve normalizar e aceitar IMEI lido por código de barras ou digitado", () => {
    const imeiBrutoComEspacos = " 8694-0205-1234-567 ";
    const normalizado = imeiBrutoComEspacos.replace(/[^0-9A-Z]/gi, "").toUpperCase();

    assert.equal(normalizado, "869402051234567");
    assert.equal(normalizado.length, 15);
  });

  test("deve validar a correspondência do kit quando o instalador lê ou digita o IMEI correto", () => {
    const kitDeterminado = {
      rastreador_id: "rast-100",
      imei: "869402059999999",
      iccid: "89551234567890123456",
    };

    const imeiLidoCamerainstalador = "869402059999999";
    const confere =
      imeiLidoCamerainstalador.trim().toUpperCase() === kitDeterminado.imei.toUpperCase();

    assert.equal(confere, true);
  });

  test("deve rejeitar a confirmação do kit caso o instalador aponte IMEI divergente do determinado", () => {
    const kitDeterminado = {
      rastreador_id: "rast-100",
      imei: "869402059999999",
      iccid: "89551234567890123456",
    };

    const imeiLidoDivergente = "869402051111111";
    const confere = imeiLidoDivergente.trim().toUpperCase() === kitDeterminado.imei.toUpperCase();

    assert.equal(confere, false);
  });

  test("deve permitir vincular retroativamente IMEI e Chip em cliente existente atualizando a ordem de instalação", () => {
    // Simula cliente cadastrado antes da regra com IMEI PENDENTE na instalação
    const instalacaoExistente = {
      id: "inst-1",
      cliente_id: "cli-weidisson",
      rastreador_imei: "PENDENTE",
      chip_iccid: null,
      status: "agendada",
    };

    // Operador edita ficha do cliente e atribui o kit do estoque
    const kitSelecionadoEstoque = {
      rastreador_id: "rast-8698",
      imei: "869890084890007",
      modelo: "J16 4G",
      chip_id: "chip-8955",
      iccid: "89553202100092787809",
      operadora: "Multi-Operadora",
    };

    // Atualização aplicada na ordem existente preservando ID
    const instalacaoAtualizada = {
      ...instalacaoExistente,
      rastreador_imei: kitSelecionadoEstoque.imei,
      rastreador_modelo: kitSelecionadoEstoque.modelo,
      chip_iccid: kitSelecionadoEstoque.iccid,
      chip_operadora: kitSelecionadoEstoque.operadora,
      rastreador_id: kitSelecionadoEstoque.rastreador_id,
    };

    assert.equal(instalacaoAtualizada.id, "inst-1");
    assert.equal(instalacaoAtualizada.rastreador_imei, "869890084890007");
    assert.equal(instalacaoAtualizada.chip_iccid, "89553202100092787809");
    assert.notEqual(instalacaoAtualizada.rastreador_imei, "PENDENTE");

    // Instalador agora pode conferir o IMEI
    const imeiConferido = "869890084890007";
    assert.equal(imeiConferido === instalacaoAtualizada.rastreador_imei, true);
  });

  test("deve recuperar integralmente chipLinha e amarração veicular sem perda de dados na edição", () => {
    const chipNoBanco = {
      id: "chip-1",
      iccid: "89553202100092787817",
      linha: "5516910197996",
      operadora: "Algar",
    };

    const instSemLinhaNaTabela = {
      id: "inst-1",
      cliente_id: "cli-1",
      rastreador_imei: "869890084963382",
      rastreador_modelo: "J16 4G",
      chip_iccid: "89553202100092787817",
      chip_operadora: "Algar",
      chip_linha: null,
    };

    const linhaResolvida =
      instSemLinhaNaTabela.chip_linha ||
      (instSemLinhaNaTabela.chip_iccid === chipNoBanco.iccid ? chipNoBanco.linha : "");

    assert.equal(linhaResolvida, "5516910197996");

    const veiculoExistente = {
      id: "veic-1",
      cliente_id: "cli-1",
      placa: "A DEFINIR",
      rastreador_id: null,
      rastreador_imei: null,
    };

    const veiculoAtualizado = {
      ...veiculoExistente,
      placa: "KLS4A90",
      rastreador_id: "rast-1",
      rastreador_imei: instSemLinhaNaTabela.rastreador_imei,
    };

    const rastreadorAtualizado = {
      id: "rast-1",
      imei: "869890084963382",
      chip_id: chipNoBanco.id,
      veiculo_id: veiculoAtualizado.id,
    };

    assert.equal(veiculoAtualizado.rastreador_imei, "869890084963382");
    assert.equal(veiculoAtualizado.placa, "KLS4A90");
    assert.equal(rastreadorAtualizado.veiculo_id, "veic-1");
  });

  test("deve permitir exclusão segura de rastreador em estoque e liberar chip vinculado", () => {
    const rastreadorEmEstoque = {
      id: "rast-teste-1234",
      imei: "1234",
      status: "estoque",
      chip_id: "chip-livre-1",
    };

    const chips = [{ id: "chip-livre-1", status: "em_uso" }];
    const veiculos: any[] = [];
    const instalacoes: any[] = [];

    // Verificação de salvaguarda 1: veículo vinculado
    const veiculoVinculado = veiculos.find((v) => v.rastreador_id === rastreadorEmEstoque.id);
    assert.equal(veiculoVinculado, undefined);

    // Verificação de salvaguarda 2: instalação ativa
    const instalacaoAtiva = instalacoes.find(
      (i) =>
        i.rastreador_id === rastreadorEmEstoque.id &&
        !["concluida", "cancelada"].includes(i.status),
    );
    assert.equal(instalacaoAtiva, undefined);

    // Desvinculação do chip
    if (rastreadorEmEstoque.chip_id) {
      const chip = chips.find((c) => c.id === rastreadorEmEstoque.chip_id);
      if (chip) chip.status = "ativo";
    }

    assert.equal(chips[0].status, "ativo");
  });

  test("deve bloquear exclusão de rastreador atrelado a veículo ativo", () => {
    const rastreadorVinculado = {
      id: "rast-ativo-1",
      imei: "863874085222366",
      status: "instalado",
    };

    const veiculos = [
      { id: "v1", placa: "AXH0E44", marca_modelo: "Volvo XC 60 T6", rastreador_id: "rast-ativo-1" },
    ];

    const veiculoVinculado = veiculos.find((v) => v.rastreador_id === rastreadorVinculado.id);
    assert.ok(veiculoVinculado);
    assert.equal(veiculoVinculado.placa, "AXH0E44");
  });

  test("deve diferenciar rastreador sem chip (Falta Chip) de kit reservado/agendado (Kit Agendado)", () => {
    const rastreadorSemChip = {
      id: "r1",
      imei: "869890084000001",
      status: "estoque",
      chip_id: null,
      em_instalacao_ativa: false,
      liberado_instalacao: false,
    };

    const rastreadorLivreComChip = {
      id: "r2",
      imei: "869890084890007",
      status: "estoque",
      chip_id: "chip-1",
      em_instalacao_ativa: false,
      liberado_instalacao: true,
    };

    const rastreadorAgendadoComChip = {
      id: "r3",
      imei: "869890084963382",
      status: "estoque",
      chip_id: "chip-2",
      em_instalacao_ativa: true,
      liberado_instalacao: false,
    };

    function calcularRotuloStatus(item: {
      status: string;
      chip_id: string | null;
      em_instalacao_ativa: boolean;
      liberado_instalacao: boolean;
    }) {
      if (item.status !== "estoque") return item.status;
      if (!item.chip_id) return "Falta Chip";
      if (item.em_instalacao_ativa) return "Kit Agendado";
      if (item.liberado_instalacao) return "Liberado para Instalação";
      return "Falta Chip";
    }

    assert.equal(calcularRotuloStatus(rastreadorSemChip), "Falta Chip");
    assert.equal(calcularRotuloStatus(rastreadorLivreComChip), "Liberado para Instalação");
    assert.equal(calcularRotuloStatus(rastreadorAgendadoComChip), "Kit Agendado");
  });

  test("deve validar cadastro e integridade de chips M2M avulsos livres no estoque", () => {
    // Simula lista de chips e rastreadores em estoque
    const chipsEstoque = [
      { id: "c1", iccid: "89553202100092787809", operadora: "Multi-Operadora", status: "ativo" },
      { id: "c2", iccid: "89553202100092787817", operadora: "Algar", status: "ativo" },
    ];

    const rastreadores = [{ id: "r1", imei: "869890084890007", chip_id: "c1" }];

    // Validação de entrada
    function validarNovoChip(iccid: string, operadora: string) {
      const iccidLimpo = iccid.replace(/[^0-9A-Z]/gi, "").toUpperCase();
      if (!iccidLimpo || iccidLimpo.length < 4) {
        return { valido: false, erro: "ICCID inválido" };
      }

      // Checa se já está em uso por rastreador
      const chipExistente = chipsEstoque.find((c) => c.iccid === iccidLimpo);
      if (chipExistente) {
        const vinculado = rastreadores.find((r) => r.chip_id === chipExistente.id);
        if (vinculado) {
          return { valido: false, erro: `Chip já em uso pelo IMEI ${vinculado.imei}` };
        }
      }

      return { valido: true, iccid: iccidLimpo, operadora: operadora.trim() || "Algar" };
    }

    // Caso 1: ICCID inválido / vazio
    assert.equal(validarNovoChip("", "Vivo").valido, false);
    assert.equal(validarNovoChip("12", "Vivo").valido, false);

    // Caso 2: Chip já em uso por rastreador
    const resDuplicado = validarNovoChip("89553202100092787809", "Multi-Operadora");
    assert.equal(resDuplicado.valido, false);
    assert.ok(resDuplicado.erro?.includes("869890084890007"));

    // Caso 3: Novo chip válido (ex: chip avulso da Algar que chegou no lote)
    const resValido = validarNovoChip("8955-3202-9999-0001", "Algar");
    assert.equal(resValido.valido, true);
    assert.equal(resValido.iccid, "8955320299990001");
    assert.equal(resValido.operadora, "Algar");
  });

  test("deve bloquear exclusão de chip vinculado a rastreador e permitir exclusão de chip livre", () => {
    const chips = [
      { id: "c1", iccid: "8955001", status: "ativo" },
      { id: "c2", iccid: "8955002", status: "ativo" },
    ];
    const rastreadores = [{ id: "r1", imei: "86980001", chip_id: "c1" }];

    function podeExcluirChip(chipId: string) {
      const vinculado = rastreadores.find((r) => r.chip_id === chipId);
      if (vinculado) {
        return { pode: false, motivo: `Vinculado ao rastreador ${vinculado.imei}` };
      }
      return { pode: true };
    }

    assert.equal(podeExcluirChip("c1").pode, false);
    assert.equal(podeExcluirChip("c2").pode, true);
  });
});
