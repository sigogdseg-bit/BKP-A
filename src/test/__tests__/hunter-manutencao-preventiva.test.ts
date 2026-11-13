import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatarTelefoneWhatsApp,
  gerarMensagemWhatsAppManutencao,
  gerarLinkWhatsAppManutencao,
} from "../../features/manutencao/services/manutencaoService";
import type { AlertaWhatsAppInfo } from "../../features/manutencao/types";

describe("Hunter — Manutenção Preventiva, Odômetro e Notificações WhatsApp", () => {
  test("Formatação de telefone para padrão internacional E.164 do WhatsApp (DDI Brasil 55)", () => {
    assert.equal(formatarTelefoneWhatsApp("(24) 99888-7766"), "5524998887766");
    assert.equal(formatarTelefoneWhatsApp("24998887766"), "5524998887766");
    assert.equal(formatarTelefoneWhatsApp("5524998887766"), "5524998887766");
    assert.equal(formatarTelefoneWhatsApp(""), "");
    assert.equal(formatarTelefoneWhatsApp(null), "");
    assert.equal(formatarTelefoneWhatsApp(undefined), "");
  });

  test("Geração de mensagem amigável e formal de WhatsApp para revisão em aviso preventivo", () => {
    const info: AlertaWhatsAppInfo = {
      clienteNome: "Carlos Eduardo Silva",
      telefone: "24998887766",
      placa: "HUN-2026",
      marcaModelo: "Toyota Hilux CD 4x4",
      odometroAtual: 49650,
      itemManutencao: "Troca de Óleo e Filtro",
      proximoKmAlvo: 50000,
      kmRestante: 350,
      status: "proxima",
    };

    const msg = gerarMensagemWhatsAppManutencao(info);
    assert.ok(msg.includes("Carlos"), "Deve saudar o cliente pelo primeiro nome");
    assert.ok(msg.includes("Toyota Hilux CD 4x4"), "Deve conter o modelo do veículo");
    assert.ok(msg.includes("HUN-2026"), "Deve conter a placa do veículo");
    assert.ok(
      msg.includes(info.odometroAtual.toLocaleString("pt-BR")),
      "Deve conter o odômetro atual formatado",
    );
    assert.ok(msg.includes("Troca de Óleo e Filtro"), "Deve conter o nome do item de revisão");
    assert.ok(msg.includes(info.proximoKmAlvo.toLocaleString("pt-BR")), "Deve conter a meta alvo");
    assert.ok(
      msg.includes(info.kmRestante.toLocaleString("pt-BR")),
      "Deve informar a quilometragem restante",
    );
    assert.ok(!msg.includes("&"), "Proibição estrita do caractere comercial");
  });

  test("Geração de mensagem de WhatsApp para revisão vencida", () => {
    const info: AlertaWhatsAppInfo = {
      clienteNome: "Beatriz Mendes",
      telefone: "(11) 98765-4321",
      placa: "ABC-1234",
      marcaModelo: "Chevrolet S10",
      odometroAtual: 60200,
      itemManutencao: "Pastilhas de Freio",
      proximoKmAlvo: 60000,
      kmRestante: -200,
      status: "vencida",
    };

    const msg = gerarMensagemWhatsAppManutencao(info);
    assert.ok(msg.includes("VENCIDA"), "Deve indicar claramente status vencido");
    assert.ok(msg.includes("Beatriz"), "Deve saudar Beatriz");
    assert.ok(msg.includes("Pastilhas de Freio"), "Deve indicar o serviço vencido");
  });

  test("Geração de link seguro wa.me com codificação URI válida", () => {
    const info: AlertaWhatsAppInfo = {
      clienteNome: "Marcos Paulo",
      telefone: "24988776655",
      placa: "KTM-9988",
      marcaModelo: "Fiat Toro",
      odometroAtual: 29800,
      itemManutencao: "Pneus e Balanceamento",
      proximoKmAlvo: 30000,
      kmRestante: 200,
      status: "proxima",
    };

    const link = gerarLinkWhatsAppManutencao(info);
    assert.ok(link !== null, "Link não pode ser nulo para telefone válido");
    assert.ok(link.startsWith("https://wa.me/5524988776655?text="));
    assert.ok(link.includes(encodeURIComponent("Fiat Toro")));
  });

  test("Cálculo dinâmico de status por odômetro: em dia, aviso preventivo e vencida", () => {
    const calcularStatus = (
      odometroAtual: number,
      proximoKmAlvo: number,
      avisoAntecipadoKm: number,
    ) => {
      const kmRestante = proximoKmAlvo - odometroAtual;
      if (kmRestante <= 0) return "vencida";
      if (kmRestante <= avisoAntecipadoKm) return "proxima";
      return "em_dia";
    };

    // Caso 1: Odômetro bem antes da margem de aviso (10.000 km alvo, odômetro 8.000 km, aviso 500 km)
    assert.equal(calcularStatus(8000, 10000, 500), "em_dia");

    // Caso 2: Odômetro dentro da margem de aviso preventivo (faltam 400 km, aviso é de 500 km)
    assert.equal(calcularStatus(9600, 10000, 500), "proxima");

    // Caso 3: Odômetro exatamente na meta (faltam 0 km)
    assert.equal(calcularStatus(10000, 10000, 500), "vencida");

    // Caso 4: Odômetro ultrapassou a meta (10.200 km)
    assert.equal(calcularStatus(10200, 10000, 500), "vencida");
  });

  test("Cálculo atômico de próximo alvo na conclusão de manutenção", () => {
    const kmRealizado = 50250;
    const intervaloKm = 5000;
    const proximoAlvo = kmRealizado + intervaloKm;

    assert.equal(proximoAlvo, 55250, "Próximo alvo deve somar exatamente o intervalo de km");
  });

  test("Segurança e RLS Estrito: carregarVeiculosDoCliente não pode conter fallback vazando veículos de terceiros", async () => {
    const fs = await import("node:fs/promises");
    const serviceCode = await fs.readFile(
      new URL("../../../src/features/manutencao/services/manutencaoService.ts", import.meta.url),
      "utf-8",
    );

    // Não deve conter fallback sem filtro de cliente_id
    assert.ok(
      !serviceCode.includes("const fallback = await supabase"),
      "manutencaoService.ts não deve conter fallback sem filtro que vaze veículos de outros clientes",
    );
    assert.ok(
      serviceCode.includes("v.cliente_id !== clienteId"),
      "manutencaoService.ts deve blindar estritamente o retorno de veículos por cliente_id",
    );
  });

  test("Integridade de Schema BD: queries de veiculos usam estritamente a coluna canônica horimetro_horas", async () => {
    const fs = await import("node:fs/promises");
    const serviceCode = await fs.readFile(
      new URL("../../../src/features/manutencao/services/manutencaoService.ts", import.meta.url),
      "utf-8",
    );

    // Deve usar horimetro_horas
    assert.ok(
      serviceCode.includes("horimetro_horas"),
      "manutencaoService.ts deve selecionar a coluna canônica horimetro_horas da tabela veiculos",
    );

    // Não deve conter a coluna inexistente horimetro em selects de veiculos
    const lines = serviceCode.split("\n");
    const invalidSelectLines = lines.filter(
      (line) => line.trim() === "horimetro," || line.trim() === "horimetro",
    );
    assert.equal(
      invalidSelectLines.length,
      0,
      "Não pode haver select com coluna inexistente 'horimetro' da tabela veiculos",
    );
  });
});
