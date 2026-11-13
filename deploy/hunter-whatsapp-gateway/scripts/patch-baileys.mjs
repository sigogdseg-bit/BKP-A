#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GATEWAY_DIR = path.resolve(__dirname, "..");
const BAILEYS_DIR = path.join(GATEWAY_DIR, "node_modules", "@whiskeysockets", "baileys");

export const EXPECTED_BAILEYS_VERSION = "6.7.24";
export const PATCH_MARKER = "/* @hunter-patch-v1 */";

const SEND_FILE_REL = path.join("lib", "Socket", "messages-send.js");
const RECV_FILE_REL = path.join("lib", "Socket", "messages-recv.js");

const TARGET_SEND_DEVICES_OLD = `            else {
                const { user: meUser } = jidDecode(meId);
                if (!participant) {
                    devices.push({ user });
                    if (user !== meUser) {
                        devices.push({ user: meUser });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        const additionalDevices = await getUSyncDevices([meId, jid], !!useUserDevicesCache, true);
                        devices.push(...additionalDevices);
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                for (const { user, device } of devices) {
                    const isMe = user === meUser;
                    const jid = jidEncode(isMe && isLid ? authState.creds?.me?.lid.split(':')[0] || user : user, isLid ? 'lid' : 's.whatsapp.net', device);
                    if (isMe) {
                        meJids.push(jid);
                    }
                    else {
                        otherJids.push(jid);
                    }
                    allJids.push(jid);
                }`;

const TARGET_SEND_DEVICES_NEW = `            else {
                ${PATCH_MARKER}
                const { user: meUser, device: myDevice } = jidDecode(meId);
                const meLid = authState.creds?.me?.lid;
                const meLidUser = meLid ? jidDecode(meLid)?.user : undefined;
                const isMeUser = (u) => u === meUser || (!!meLidUser && u === meLidUser);
                if (!participant) {
                    devices.push({ user });
                    if (!isMeUser(user)) {
                        devices.push({ user: meUser });
                    }
                    if (additionalAttributes?.['category'] !== 'peer') {
                        const usyncJids = isMeUser(user) ? [meId] : [meId, jid];
                        const additionalDevices = await getUSyncDevices(usyncJids, !!useUserDevicesCache, true);
                        devices.push(...additionalDevices);
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                const seenJids = new Set();
                const participantServer = participant?.jid ? jidDecode(participant.jid)?.server : undefined;
                for (const { user: devUser, device } of devices) {
                    const isMe = isMeUser(devUser);
                    if (!participant && isMe && (device || 0) === (myDevice || 0)) {
                        continue;
                    }
                    const targetServer = participantServer || (isLid ? 'lid' : 's.whatsapp.net');
                    const targetUser = isMe
                        ? (targetServer === 'lid' ? (meLidUser || devUser) : (meUser || devUser))
                        : devUser;
                    const mappedJid = jidEncode(targetUser, targetServer, device);
                    if (seenJids.has(mappedJid)) {
                        continue;
                    }
                    seenJids.add(mappedJid);
                    if (isMe) {
                        meJids.push(mappedJid);
                    }
                    else {
                        otherJids.push(mappedJid);
                    }
                    allJids.push(mappedJid);
                }`;

const TARGET_SEND_RECIPIENT_OLD = `                else if (areJidsSameUser(participant.jid, meId)) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }`;

const TARGET_SEND_RECIPIENT_NEW = `                else if (areJidsSameUser(participant.jid, meId) || (authState.creds?.me?.lid && areJidsSameUser(participant.jid, authState.creds.me.lid))) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }`;

const TARGET_RECV_RETRY_OLD = `    const sendMessagesAgain = async (key, ids, retryNode) => {
        // todo: implement a cache to store the last 256 sent messages (copy whatsmeow)
        const msgs = await Promise.all(ids.map(id => getMessage({ ...key, id })));
        const remoteJid = key.remoteJid;
        const participant = key.participant || remoteJid;
        // if it's the primary jid sending the request
        // just re-send the message to everyone
        // prevents the first message decryption failure
        const sendToAll = !jidDecode(participant)?.device;
        await assertSessions([participant], true);
        if (isJidGroup(remoteJid)) {
            await authState.keys.set({ 'sender-key-memory': { [remoteJid]: null } });
        }
        logger.debug({ participant, sendToAll }, 'forced new session for retry recp');
        for (const [i, msg] of msgs.entries()) {
            if (msg) {
                updateSendMessageAgainCount(ids[i], participant);
                const msgRelayOpts = { messageId: ids[i] };
                if (sendToAll) {
                    msgRelayOpts.useUserDevicesCache = false;
                }
                else {
                    msgRelayOpts.participant = {
                        jid: participant,
                        count: +retryNode.attrs.count
                    };
                }
                await relayMessage(key.remoteJid, msg, msgRelayOpts);
            }
            else {
                logger.debug({ jid: key.remoteJid, id: ids[i] }, 'recv retry request, but message not available');
            }
        }
    };
    const handleReceipt = async (node) => {
        const { attrs, content } = node;
        const isLid = attrs.from.includes('lid');
        const isNodeFromMe = areJidsSameUser(attrs.participant || attrs.from, isLid ? authState.creds.me?.lid : authState.creds.me?.id);
        const remoteJid = !isNodeFromMe || isJidGroup(attrs.from) ? attrs.from : attrs.recipient;`;

const TARGET_RECV_RETRY_NEW = `    ${PATCH_MARKER}
    const retrySessionResetMap = new Map();
    const RETRY_RESET_COOLDOWN_MS = 30000;
    const RETRY_RESET_SECOND_CHANCE_MS = 10000;
    const sendMessagesAgain = async (key, ids, retryNode) => {
        const msgs = await Promise.all(ids.map(id => getMessage({ ...key, id })));
        if (!msgs.some(Boolean)) {
            logger.debug({ jid: key.remoteJid, ids }, 'recv retry request, no cached messages available; skipping session reset');
            return;
        }
        const remoteJid = key.remoteJid;
        const participant = key.participant || remoteJid;
        // Fan out only on group retries from primary devices; for 1:1 chats target the requesting device/peer only.
        const sendToAll = isJidGroup(remoteJid) && !jidDecode(participant)?.device;
        const retryCount = +(retryNode?.attrs?.count || 1);
        const now = Date.now();
        const lastForcedReset = retrySessionResetMap.get(participant) || 0;
        const elapsed = now - lastForcedReset;
        const shouldForceSessionReset = elapsed >= RETRY_RESET_COOLDOWN_MS || (retryCount >= 2 && elapsed >= RETRY_RESET_SECOND_CHANCE_MS);
        if (shouldForceSessionReset) {
            retrySessionResetMap.set(participant, now);
            if (retrySessionResetMap.size > 500) {
                const oldestKey = retrySessionResetMap.keys().next().value;
                if (oldestKey) {
                    retrySessionResetMap.delete(oldestKey);
                }
            }
        }
        await assertSessions([participant], shouldForceSessionReset);
        if (isJidGroup(remoteJid)) {
            await authState.keys.set({ 'sender-key-memory': { [remoteJid]: null } });
        }
        logger.debug({ participant, sendToAll, shouldForceSessionReset, retryCount }, 'handled retry recp session check');
        for (const [i, msg] of msgs.entries()) {
            if (msg) {
                updateSendMessageAgainCount(ids[i], participant);
                const msgRelayOpts = { messageId: ids[i] };
                if (sendToAll) {
                    msgRelayOpts.useUserDevicesCache = false;
                }
                else {
                    msgRelayOpts.participant = {
                        jid: participant,
                        count: retryCount
                    };
                }
                await relayMessage(key.remoteJid, msg, msgRelayOpts);
            }
            else {
                logger.debug({ jid: key.remoteJid, id: ids[i] }, 'recv retry request, but message not available');
            }
        }
    };
    const handleReceipt = async (node) => {
        const { attrs, content } = node;
        const fromParticipantOrSender = attrs.participant || attrs.from;
        const isNodeFromMe = areJidsSameUser(fromParticipantOrSender, authState.creds.me?.id) || (!!authState.creds.me?.lid && areJidsSameUser(fromParticipantOrSender, authState.creds.me.lid));
        const remoteJid = !isNodeFromMe || isJidGroup(attrs.from) ? attrs.from : (attrs.recipient || attrs.from);`;

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n");
}

function aplicarSubstituicao(content, targetOld, targetNew, label) {
  if (!content.includes(targetOld)) {
    throw new Error(`[patch-baileys] Bloco alvo não encontrado para "${label}".`);
  }
  return content.replace(targetOld, targetNew);
}

export function verifyBaileysPatch(baileysRoot = BAILEYS_DIR) {
  const pkgPath = path.join(baileysRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, reason: `package.json ausente em ${pkgPath}` };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (pkg.version !== EXPECTED_BAILEYS_VERSION) {
    return {
      ok: false,
      reason: `Versão incompatível do Baileys: ${pkg.version} (esperada: ${EXPECTED_BAILEYS_VERSION})`,
    };
  }

  const sendPath = path.join(baileysRoot, SEND_FILE_REL);
  const recvPath = path.join(baileysRoot, RECV_FILE_REL);
  if (!fs.existsSync(sendPath) || !fs.existsSync(recvPath)) {
    return { ok: false, reason: "Arquivos Socket do Baileys não encontrados." };
  }

  const sendContent = fs.readFileSync(sendPath, "utf-8");
  const recvContent = fs.readFileSync(recvPath, "utf-8");

  const hasSendPatch =
    sendContent.includes(PATCH_MARKER) &&
    sendContent.includes(
      "const isMeUser = (u) => u === meUser || (!!meLidUser && u === meLidUser);",
    ) &&
    sendContent.includes("areJidsSameUser(participant.jid, authState.creds.me.lid)");
  const hasRecvPatch =
    recvContent.includes(PATCH_MARKER) &&
    recvContent.includes("RETRY_RESET_COOLDOWN_MS") &&
    recvContent.includes(
      "const sendToAll = isJidGroup(remoteJid) && !jidDecode(participant)?.device;",
    );

  if (!hasSendPatch || !hasRecvPatch) {
    return {
      ok: false,
      reason: `Marcadores de patch ausentes (send=${hasSendPatch}, recv=${hasRecvPatch}).`,
    };
  }

  return { ok: true, version: pkg.version };
}

export function applyBaileysPatch(baileysRoot = BAILEYS_DIR) {
  const pkgPath = path.join(baileysRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`[patch-baileys] @whiskeysockets/baileys não encontrado em ${baileysRoot}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (pkg.version !== EXPECTED_BAILEYS_VERSION) {
    throw new Error(
      `[patch-baileys] Versão incompatível do Baileys: "${pkg.version}". Esperada exata: "${EXPECTED_BAILEYS_VERSION}".`,
    );
  }

  const checkBefore = verifyBaileysPatch(baileysRoot);
  if (checkBefore.ok) {
    return { alreadyPatched: true, version: pkg.version };
  }

  const sendPath = path.join(baileysRoot, SEND_FILE_REL);
  const recvPath = path.join(baileysRoot, RECV_FILE_REL);

  let sendContent = normalizeNewlines(fs.readFileSync(sendPath, "utf-8"));
  if (!sendContent.includes(PATCH_MARKER)) {
    sendContent = aplicarSubstituicao(
      sendContent,
      TARGET_SEND_DEVICES_OLD,
      TARGET_SEND_DEVICES_NEW,
      "messages-send.js:relayMessage-lid-devices",
    );
    sendContent = aplicarSubstituicao(
      sendContent,
      TARGET_SEND_RECIPIENT_OLD,
      TARGET_SEND_RECIPIENT_NEW,
      "messages-send.js:relayMessage-lid-recipient",
    );
    fs.writeFileSync(sendPath, sendContent, "utf-8");
  }

  let recvContent = normalizeNewlines(fs.readFileSync(recvPath, "utf-8"));
  if (!recvContent.includes(PATCH_MARKER)) {
    recvContent = aplicarSubstituicao(
      recvContent,
      TARGET_RECV_RETRY_OLD,
      TARGET_RECV_RETRY_NEW,
      "messages-recv.js:sendMessagesAgain-and-handleReceipt",
    );
    fs.writeFileSync(recvPath, recvContent, "utf-8");
  }

  const checkAfter = verifyBaileysPatch(baileysRoot);
  if (!checkAfter.ok) {
    throw new Error(`[patch-baileys] Pós-verificação falhou: ${checkAfter.reason}`);
  }

  return { alreadyPatched: false, version: pkg.version };
}

const isCliRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isCliRun) {
  const modeCheck = process.argv.includes("--check");
  if (modeCheck) {
    const res = verifyBaileysPatch();
    if (!res.ok) {
      console.error(`❌ [patch-baileys] Verificação falhou: ${res.reason}`);
      process.exit(1);
    }
    console.log(`✅ [patch-baileys] Verificado com sucesso (Baileys v${res.version}).`);
  } else {
    const res = applyBaileysPatch();
    console.log(
      res.alreadyPatched
        ? `✅ [patch-baileys] Patch já estava ativo (Baileys v${res.version}).`
        : `🛡️ [patch-baileys] Patch Signal/LID/Retry aplicado com sucesso em Baileys v${res.version}.`,
    );
  }
}
