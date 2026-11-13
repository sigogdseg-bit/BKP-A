import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IMEI = "863874085222366";

async function testarComando(cmd) {
  return new Promise((resolve) => {
    let resolvido = false;
    const canal = supabase.channel("hunter_gateway_comandos");

    const timeout = setTimeout(() => {
      if (!resolvido) {
        resolvido = true;
        resolve({ cmd, resposta: "TIMEOUT (Sem resposta do hardware em 6s)" });
      }
    }, 6000);

    canal
      .on("broadcast", { event: "resposta_comando" }, (payload) => {
        const { imei, resposta } = payload.payload || {};
        if (imei === IMEI && !resolvido) {
          resolvido = true;
          clearTimeout(timeout);
          resolve({ cmd, resposta });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log(`\n📤 [ENVIANDO AO J16]: "${cmd}"`);
          // Dispara via broadcast Realtime
          await canal.send({
            type: "broadcast",
            event: "comando_terminal",
            payload: {
              imei: IMEI,
              comando: cmd,
              origem: "teste_ao_vivo",
              timestamp: new Date().toISOString(),
            },
          });

          // Dispara também via HTTP para o Gateway Fly.io
          try {
            await fetch("http://hunter-gps-gateway.fly.dev:8080/api/comando", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imei: IMEI, comando: cmd }),
            });
          } catch {
            // Silencioso
          }
        }
      });
  });
}

async function run() {
  console.log("=== INICIANDO TESTE AO VIVO COM O HARDWARE J16 (IMEI " + IMEI + ") ===");

  const comandosParaTestar = [
    "STATUS#",
    "PARAM#",
    "TIMER,15,3600#",
    "SZCS#ACCLINE=1#",
    "SZCS#ACCLINE=1",
    "SZCS#ANGLEVALUE=10-015",
    "SZCS#ANGLEVALUE=10-15#",
    "HBT,120,300#",
  ];

  for (const cmd of comandosParaTestar) {
    const res = await testarComando(cmd);
    console.log(`📥 [RESPOSTA]: "${res.resposta}"\n-----------------------------------`);
    // Aguarda 2s antes do próximo
    await new Promise((r) => setTimeout(r, 2000));
  }

  process.exit(0);
}

run();
