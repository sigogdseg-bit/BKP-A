import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { fileURLToPath } from "url";

process.env.HUNTER_GATEWAY_TEST = "1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY_DIR = path.resolve(__dirname, "..");

const { EXPECTED_BAILEYS_VERSION, PATCH_MARKER, applyBaileysPatch, verifyBaileysPatch } =
  await import("../scripts/patch-baileys.mjs");

const {
  normalizarTelefoneBr,
  expandirCandidatosJidBr,
  registrarAssociacaoLid,
  sanitizarIdMensagem,
  verificarPatchBaileysAtivo,
} = await import("../dist/server.js");

const { BufferJSON, generateWAMessageContent, proto } = await import("@whiskeysockets/baileys");

describe("Gateway helpers e verificação estrutural", () => {
  it("confirma que o patch do Baileys v6.7.24 está ativo em node_modules", () => {
    const check = verifyBaileysPatch();
    assert.equal(check.ok, true);
    assert.equal(check.version, EXPECTED_BAILEYS_VERSION);
    assert.equal(verificarPatchBaileysAtivo(), true);
  });

  it("falha fechado se versão do Baileys divergir ou âncora não existir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baileys-patch-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "lib", "Socket"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "@whiskeysockets/baileys", version: "7.0.0-rc14" }),
      );
      assert.throws(() => applyBaileysPatch(tmpDir), /Versão incompatível/);

      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "@whiskeysockets/baileys", version: EXPECTED_BAILEYS_VERSION }),
      );
      fs.writeFileSync(path.join(tmpDir, "lib", "Socket", "messages-send.js"), "// altered");
      fs.writeFileSync(path.join(tmpDir, "lib", "Socket", "messages-recv.js"), "// altered");
      assert.throws(() => applyBaileysPatch(tmpDir), /Bloco alvo não encontrado/);

      // Agora copia os arquivos reais pré-existentes e verifica idempotência
      const origSend = fs.readFileSync(
        path.join(GATEWAY_DIR, "node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js"),
        "utf-8",
      );
      const origRecv = fs.readFileSync(
        path.join(GATEWAY_DIR, "node_modules/@whiskeysockets/baileys/lib/Socket/messages-recv.js"),
        "utf-8",
      );
      fs.writeFileSync(path.join(tmpDir, "lib", "Socket", "messages-send.js"), origSend);
      fs.writeFileSync(path.join(tmpDir, "lib", "Socket", "messages-recv.js"), origRecv);
      assert.equal(origSend.includes(PATCH_MARKER), true);
      assert.equal(origRecv.includes(PATCH_MARKER), true);
      const res = applyBaileysPatch(tmpDir);
      assert.equal(res.alreadyPatched, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("normaliza telefones e impede corrupção de LID por sufixo :device ou domínio PN/Grupo", () => {
    assert.equal(normalizarTelefoneBr("5524992501512:2@s.whatsapp.net"), "5524992501512");
    assert.equal(normalizarTelefoneBr("024992501512"), "5524992501512");
    assert.equal(normalizarTelefoneBr("02124992501512"), "5524992501512");
    assert.deepEqual(expandirCandidatosJidBr("02124992501512"), ["5524992501512", "552492501512"]);
    assert.deepEqual(expandirCandidatosJidBr("552492501512"), ["552492501512", "5524992501512"]);
    assert.deepEqual(expandirCandidatosJidBr("552433445566"), ["552433445566"]);
    assert.equal(registrarAssociacaoLid("5524999192117@s.whatsapp.net", "5524999192117"), false);
    assert.equal(registrarAssociacaoLid("120363402292620123@g.us", "5524992501512"), false);
    assert.equal(
      registrarAssociacaoLid("117403417612308:2@lid", "5524992501512:2@s.whatsapp.net"),
      true,
    );
    assert.equal(sanitizarIdMensagem("../evil/3EB0ABC"), ".._evil_3EB0ABC");
  });

  it("linkPreview: null gera extendedTextMessage sem disparar getUrlInfo/link-preview-js", async () => {
    let urlLookupChamado = false;
    const content = await generateWAMessageContent(
      { text: "Alerta https://gd.oficial.tec.br/painel", linkPreview: null },
      {
        logger: undefined,
        userJid: "5524992501512:2@s.whatsapp.net",
        getUrlInfo: async () => {
          urlLookupChamado = true;
          return undefined;
        },
        upload: async () => ({ mediaUrl: "", directPath: "" }),
      },
    );
    assert.equal(urlLookupChamado, false);
    assert.equal(content.extendedTextMessage?.text, "Alerta https://gd.oficial.tec.br/painel");
    const serialized = JSON.stringify(content, BufferJSON.replacer);
    const parsed = JSON.parse(serialized, BufferJSON.reviver);
    const encoded = proto.Message.encode(parsed).finish();
    assert.ok(encoded.length > 10);
  });
});

describe("Comportamento real dos módulos Baileys patcheados (Signal / LID / Retry)", () => {
  it("messages-send: self-chat LID não duplica dispositivo próprio nem criptografa duas vezes", async () => {
    const encryptedTargets = [];
    const sentStanzas = [];

    const mockKeys = {
      get: async (type, addrs) => {
        if (type === "session") {
          const out = {};
          for (const a of addrs) out[a] = Buffer.from("sess");
          return out;
        }
        return {};
      },
      set: async () => {},
      transaction: async (fn) => fn(),
    };

    const fakeNewsletterUrl = new URL(
      "../node_modules/@whiskeysockets/baileys/lib/Socket/newsletter.js",
      import.meta.url,
    ).href;
    const fakeGroupsUrl = new URL(
      "../node_modules/@whiskeysockets/baileys/lib/Socket/groups.js",
      import.meta.url,
    ).href;

    const fakeBaseSock = {
      ev: new EventEmitter(),
      authState: {
        creds: {
          me: { id: "5524992501512:2@s.whatsapp.net", lid: "117403417612308:2@lid" },
          account: {
            details: Buffer.from("det"),
            accountSignatureKey: Buffer.from("sigkey"),
            accountSignature: Buffer.from("sig"),
            deviceSignature: Buffer.from("devsig"),
          },
        },
        keys: mockKeys,
      },
      processingMutex: { mutex: (fn) => fn() },
      signalRepository: {
        jidToSignalProtocolAddress: (j) => j,
        encryptMessage: async ({ jid }) => {
          encryptedTargets.push(jid);
          return { type: "msg", ciphertext: Buffer.from("cipher") };
        },
      },
      upsertMessage: async () => {},
      query: async () => ({ tag: "iq", attrs: {}, content: [] }),
      executeUSyncQuery: async () => ({
        list: [
          {
            id: "117403417612308@lid",
            devices: { deviceList: [{ id: 0 }, { id: 2, keyIndex: 2 }, { id: 3, keyIndex: 3 }] },
          },
          {
            id: "5524992501512@s.whatsapp.net",
            devices: { deviceList: [{ id: 0 }, { id: 3, keyIndex: 3 }] },
          },
        ],
      }),
      fetchPrivacySettings: async () => ({ readreceipts: "all" }),
      sendNode: async (stanza) => {
        sentStanzas.push(stanza);
      },
      groupMetadata: async () => ({ participants: [] }),
      groupToggleEphemeral: async () => {},
    };

    const gMock = mock.module(fakeGroupsUrl, {
      exports: { makeGroupsSocket: () => fakeBaseSock, extractGroupMetadata: () => ({}) },
    });
    const nMock = mock.module(fakeNewsletterUrl, {
      exports: { makeNewsletterSocket: (s) => s },
    });

    const sendModUrl = new URL(
      "../node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js",
      import.meta.url,
    ).href;
    const { makeMessagesSocket } = await import(`${sendModUrl}?t=${Date.now()}`);

    const noopLogger = {
      level: "silent",
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => noopLogger,
    };

    const sock = makeMessagesSocket({
      logger: noopLogger,
      linkPreviewImageThumbnailWidth: 192,
      generateHighQualityLinkPreview: false,
      patchMessageBeforeSending: (msg) => msg,
    });

    // 1. Self-chat para 117403417612308@lid: apenas 1x para :0 e 1x para :3 (deduplicado), nunca :2
    await sock.relayMessage("117403417612308@lid", { conversation: "auto-teste" }, {});
    assert.deepEqual(encryptedTargets.sort(), ["117403417612308:3@lid", "117403417612308@lid"]);

    // 2. Retry solicitado pelo próprio aparelho principal (meLid) em chat 1:1 com peer LID
    encryptedTargets.length = 0;
    sentStanzas.length = 0;
    await sock.relayMessage(
      "229875273232532@lid",
      { conversation: "retry-self-copy" },
      { messageId: "MSG1", participant: { jid: "117403417612308@lid", count: 1 } },
    );
    assert.deepEqual(encryptedTargets, ["117403417612308@lid"]);
    assert.equal(sentStanzas[0].attrs.to, "117403417612308@lid");
    assert.equal(sentStanzas[0].attrs.recipient, "229875273232532@lid");
    assert.equal(sentStanzas[0].attrs.device_fanout, "false");
    gMock.restore();
    nMock.restore();
  });

  it("messages-recv: retry 1:1 nunca faz sendToAll, ignora reset se sem msg e aplica cooldown no burst", async () => {
    const assertSessionCalls = [];
    const relayCalls = [];
    const ws = new EventEmitter();
    ws.isOpen = true;
    const ev = new EventEmitter();
    ev.buffer = () => {};
    ev.flush = () => {};

    const fakeMessagesSendUrl = new URL(
      "../node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js",
      import.meta.url,
    ).href;

    const sendMock = mock.module(fakeMessagesSendUrl, {
      exports: {
        makeMessagesSocket: () => ({
          ev,
          ws,
          authState: {
            creds: {
              me: { id: "5524992501512:2@s.whatsapp.net", lid: "117403417612308:2@lid" },
              registrationId: 12345,
              account: {
                details: Buffer.from("det"),
                accountSignatureKey: Buffer.from("sigkey"),
                accountSignature: Buffer.from("sig"),
                deviceSignature: Buffer.from("devsig"),
              },
              signedIdentityKey: { public: Buffer.alloc(32, 1), private: Buffer.alloc(32, 2) },
              signedPreKey: {
                keyId: 1,
                keyPair: { public: Buffer.alloc(32, 3), private: Buffer.alloc(32, 4) },
                signature: Buffer.alloc(64, 5),
              },
            },
            keys: {
              get: async () => ({}),
              set: async () => {},
              transaction: async (fn) => fn(),
            },
          },
          processingMutex: { mutex: (fn) => fn() },
          relayMessage: async (jid, msg, opts) => {
            relayCalls.push({ jid, msg, opts });
          },
          assertSessions: async (jids, force) => {
            assertSessionCalls.push({ jids, force });
            return false;
          },
          sendMessageAck: async () => {},
          sendNode: async () => {},
          sendReceipt: async () => {},
          fetchPrivacySettings: async () => ({}),
          onUnexpectedError: (err) => {
            throw err;
          },
          resyncAppState: async () => {},
          groupMetadata: async () => ({ participants: [] }),
          groupToggleEphemeral: async () => {},
          signalRepository: {},
          query: async () => ({}),
          upsertMessage: async () => {},
          sendPeerDataOperationMessage: async () => "PDO_ID",
          uploadPreKeys: async () => {},
          cleanDirtyBits: async () => {},
        }),
      },
    });

    const recvModUrl = new URL(
      "../node_modules/@whiskeysockets/baileys/lib/Socket/messages-recv.js",
      import.meta.url,
    ).href;
    const { makeMessagesRecvSocket } = await import(`${recvModUrl}?t=${Date.now()}`);

    const noopLogger = {
      level: "silent",
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => noopLogger,
    };

    const cachedMsgs = new Map([
      ["MSG_1", { conversation: "oi 1" }],
      ["MSG_2", { conversation: "oi 2" }],
      ["MSG_3", { conversation: "oi 3" }],
    ]);

    makeMessagesRecvSocket({
      logger: noopLogger,
      retryRequestDelayMs: 0,
      maxMsgRetryCount: 5,
      getMessage: async ({ id }) => cachedMsgs.get(id),
      shouldIgnoreJid: () => false,
      appStateMacVerification: { patch: false, snapshot: false },
    });

    // 1. Retry de mensagem ausente (ex: PDO não persistida) NÃO pode chamar assertSessions
    ws.emit("CB:receipt", {
      tag: "receipt",
      attrs: { from: "5524992501512@s.whatsapp.net", id: "MISSING_PDO", type: "retry", t: "100" },
      content: [{ tag: "retry", attrs: { count: "1", id: "MISSING_PDO", t: "100", v: "1" } }],
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(assertSessionCalls.length, 0);
    assert.equal(relayCalls.length, 0);

    // 2. Burst de 3 retries 1:1 de dispositivo primário :0 -> force=true somente no 1º,
    // e NUNCA sendToAll (todos com participant explícito!)
    for (const id of ["MSG_1", "MSG_2", "MSG_3"]) {
      ws.emit("CB:receipt", {
        tag: "receipt",
        attrs: { from: "229875273232532@lid", id, type: "retry", t: "101" },
        content: [{ tag: "retry", attrs: { count: "1", id, t: "101", v: "1" } }],
      });
    }
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(assertSessionCalls.length, 3);
    assert.deepEqual(
      assertSessionCalls.map((c) => c.force),
      [true, false, false],
    );
    assert.equal(relayCalls.length, 3);
    for (const call of relayCalls) {
      assert.equal(call.jid, "229875273232532@lid");
      assert.deepEqual(call.opts.participant, { jid: "229875273232532@lid", count: 1 });
      assert.equal(call.opts.useUserDevicesCache, undefined);
    }

    // 3. Self-chat retry sem attrs.recipient mantém remoteJid válido (não undefined)
    relayCalls.length = 0;
    cachedMsgs.set("MSG_SELF", { conversation: "self" });
    ws.emit("CB:receipt", {
      tag: "receipt",
      attrs: { from: "117403417612308@lid", id: "MSG_SELF", type: "retry", t: "102" },
      content: [{ tag: "retry", attrs: { count: "1", id: "MSG_SELF", t: "102", v: "1" } }],
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(relayCalls.length, 1);
    assert.equal(relayCalls[0].jid, "117403417612308@lid");
    assert.deepEqual(relayCalls[0].opts.participant, { jid: "117403417612308@lid", count: 1 });

    // 4. Grupo com retry de dispositivo primário :0 mantém fanout de grupo (sendToAll = true)
    relayCalls.length = 0;
    cachedMsgs.set("MSG_GRP", { conversation: "grupo" });
    ws.emit("CB:receipt", {
      tag: "receipt",
      attrs: {
        from: "120363402292620123@g.us",
        participant: "229875273232532@lid",
        id: "MSG_GRP",
        type: "retry",
        t: "103",
      },
      content: [{ tag: "retry", attrs: { count: "1", id: "MSG_GRP", t: "103", v: "1" } }],
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(relayCalls.length, 1);
    assert.equal(relayCalls[0].jid, "120363402292620123@g.us");
    assert.equal(relayCalls[0].opts.useUserDevicesCache, false);
    assert.equal(relayCalls[0].opts.participant, undefined);
    sendMock.restore();
  });
});
