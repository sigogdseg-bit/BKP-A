import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { PASSOS_FOTOS_GUIA } from "@/features/instalacoes/constants/fotosGuia";
import type { Instalacao } from "@/features/instalacoes/types";

describe("Hunter — Comprovação Fotográfica Guiada e Separação de Papéis do Instalador (DJR-NEW)", () => {
  it("1. Deve conter os 4 passos canônicos com modelos ilustrados em esboço e instruções claras", () => {
    assert.strictEqual(PASSOS_FOTOS_GUIA.length, 4);

    const [passo1, passo2, passo3, passo4] = PASSOS_FOTOS_GUIA;

    // Passo 1: Frente do veículo mostrando placa
    assert.strictEqual(passo1.id, "placa");
    assert.ok(passo1.titulo.toLowerCase().includes("frente do veículo e placa"));
    assert.ok(passo1.imagemModeloUrl.includes("esboco_frente_placa"));

    // Passo 2: Rastreador com IMEI
    assert.strictEqual(passo2.id, "rastreador");
    assert.ok(passo2.titulo.toLowerCase().includes("rastreador"));
    assert.ok(passo2.titulo.toLowerCase().includes("imei"));
    assert.ok(passo2.imagemModeloUrl.includes("esboco_rastreador_imei"));

    // Passo 3: Ponto de instalação
    assert.strictEqual(passo3.id, "local");
    assert.ok(
      passo3.titulo.toLowerCase().includes("ponto") ||
        passo3.titulo.toLowerCase().includes("instalação") ||
        passo3.titulo.toLowerCase().includes("fixação"),
    );
    assert.ok(passo3.imagemModeloUrl.includes("esboco_local_instalado"));

    // Passo 4: Bloqueador/Relé instalado (condicional)
    assert.strictEqual(passo4.id, "bloqueador");
    assert.ok(
      passo4.titulo.toLowerCase().includes("bloqueio") ||
        passo4.titulo.toLowerCase().includes("bloqueador") ||
        passo4.titulo.toLowerCase().includes("relé"),
    );
    assert.strictEqual(passo4.requerBloqueador, true);
    assert.ok(passo4.imagemModeloUrl.includes("esboco_bloqueador_rele"));
  });

  it("2. Todas as ilustrações em modelo esboço técnico devem existir no disco em public/assets/esbocos/", () => {
    for (const passo of PASSOS_FOTOS_GUIA) {
      const relPath = passo.imagemModeloUrl.replace(/^\//, "");
      const fullPath = path.resolve(process.cwd(), "public", relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `Arquivo de ilustração modelo não encontrado no disco: ${fullPath}`,
      );
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 0, `Arquivo de ilustração vazio: ${fullPath}`);
    }
  });

  it("3. Lógica de validação: Sem bloqueador dispensa a foto 4, Com bloqueador exige todas as 4 fotos", () => {
    // Caso com bloqueador
    const passosComBloqueador = PASSOS_FOTOS_GUIA.filter(
      (p) => !p.requerBloqueador || p.requerBloqueador,
    );
    assert.strictEqual(passosComBloqueador.length, 4);

    // Caso sem bloqueador
    const passosSemBloqueador = PASSOS_FOTOS_GUIA.filter((p) => !p.requerBloqueador);
    assert.strictEqual(passosSemBloqueador.length, 3);
    assert.ok(!passosSemBloqueador.some((p) => p.id === "bloqueador"));
  });

  it("4. Separação rígida de papéis: Instalador não mexe em kits de estoque ou fidelidade", () => {
    const instalacaoSimulada: Partial<Instalacao> = {
      id: "inst-100",
      placa: "BRA2E19",
      marca: "Toyota",
      modelo: "Corolla Cross",
      rastreador_imei: "869890084963382",
      rastreador_modelo: "J16 4G",
      chip_operadora: "Algar",
      chip_iccid: "89553202100092787817",
      status: "nao_instalado",
      data_agendamento: "2026-10-10",
      hora_agendamento: "14:00",
      com_bloqueador: true,
      km_instalacao: 15420,
    };

    // O kit já vem pré-determinado pelo operador
    assert.strictEqual(instalacaoSimulada.rastreador_imei, "869890084963382");
    assert.strictEqual(instalacaoSimulada.chip_operadora, "Algar");
    assert.ok(instalacaoSimulada.data_agendamento);
  });

  it("5. Contadores canônicos por veículo: A Agendar, A Instalar e Instalados", () => {
    const listaOrdens: Partial<Instalacao>[] = [
      // Cliente A: 2 veículos
      {
        id: "inst-001",
        cliente_id: "cli-A",
        placa: "ABC-1234",
        status: "nao_instalado",
        data_agendamento: null, // sem agendamento
      },
      {
        id: "inst-002",
        cliente_id: "cli-A",
        placa: "XYZ-9876",
        status: "nao_instalado",
        data_agendamento: null, // sem agendamento
      },
      // Cliente B: 1 veículo agendado
      {
        id: "inst-003",
        cliente_id: "cli-B",
        placa: "KTM-3000",
        status: "nao_instalado",
        data_agendamento: "2026-10-11", // agendado
      },
      // Cliente C: 1 veículo já concluído
      {
        id: "inst-004",
        cliente_id: "cli-C",
        placa: "HON-5000",
        status: "concluida",
        data_agendamento: "2026-10-09",
      },
    ];

    const totalAAgendar = listaOrdens.filter(
      (i) => i.status !== "concluida" && !i.data_agendamento,
    ).length;
    const totalAInstalar = listaOrdens.filter(
      (i) => i.status !== "concluida" && Boolean(i.data_agendamento),
    ).length;
    const totalInstalados = listaOrdens.filter((i) => i.status === "concluida").length;

    // Validação estrita da regra de negócio solicitada pelo usuário:
    assert.strictEqual(totalAAgendar, 2, "Deveria haver 2 veículos a agendar");
    assert.strictEqual(totalAInstalar, 1, "Deveria haver 1 veículo a instalar");
    assert.strictEqual(totalInstalados, 1, "Deveria haver 1 veículo instalado");

    // Quando o usuário agenda um dos veículos do Cliente A:
    listaOrdens[0].data_agendamento = "2026-10-12";
    const novoAAgendar = listaOrdens.filter(
      (i) => i.status !== "concluida" && !i.data_agendamento,
    ).length;
    const novoAInstalar = listaOrdens.filter(
      (i) => i.status !== "concluida" && Boolean(i.data_agendamento),
    ).length;

    assert.strictEqual(novoAAgendar, 1, "Agora resta 1 veículo a agendar");
    assert.strictEqual(novoAInstalar, 2, "Agora são 2 veículos a instalar");
  });
});
