#!/usr/bin/env node
/**
 * End-to-end test for the WhatsApp notification gateway.
 *
 * Two modes:
 *
 *   node scripts/test-whatsapp-gateway.mjs
 *       Self-contained. Starts a fake Twilio API and a dev server wired to it,
 *       then exercises auth, validation, templates, multi-recipient delivery,
 *       de-duplication, rate limiting and Twilio error passthrough. No
 *       credentials needed and no real message is sent.
 *
 *   node scripts/test-whatsapp-gateway.mjs --url https://samy-os-seven.vercel.app --key <NOTIFICATION_API_KEY>
 *       Runs the checks that do not send against a deployed gateway.
 *       Add --send to deliver one real WhatsApp message to SAMY_WHATSAPP.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const remoteUrl = value("url", "");
const MODE = remoteUrl ? "remote" : "mock";
const API_KEY = value("key", process.env.NOTIFICATION_API_KEY || "test-notification-key");
const MOCK_TWILIO_PORT = Number(value("mock-port", "4310"));
const DEV_PORT = Number(value("port", "3777"));
const BASE_URL = remoteUrl ? remoteUrl.replace(/\/$/, "") : `http://127.0.0.1:${DEV_PORT}`;
const ENDPOINT = `${BASE_URL}/api/notifications/whatsapp`;
const TEST_NUMBER = value("to", "+16474692835");

let passed = 0;
let failed = 0;
const nonce = Date.now().toString(36);

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(body, { token = API_KEY, method = "POST" } = {}) {
  const res = await fetch(ENDPOINT, {
    method,
    headers: {
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

/* ------------------------------------------------------------ fake Twilio -- */

const twilioCalls = [];

function startMockTwilio() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const params = new URLSearchParams(raw);
        const entry = {
          path: req.url,
          auth: req.headers.authorization || "",
          to: params.get("To"),
          from: params.get("From"),
          body: params.get("Body") || "",
          contentSid: params.get("ContentSid"),
        };
        twilioCalls.push(entry);

        // A body the test can use to force the Sandbox "not joined" failure.
        if (entry.body.includes("FORCE_TWILIO_ERROR")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ code: 63024, message: "Recipient has not joined the sandbox", status: 400 }),
          );
          return;
        }

        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sid: `SM${nonce}${twilioCalls.length.toString().padStart(4, "0")}`,
            status: "queued",
            to: entry.to,
            from: entry.from,
          }),
        );
      });
    });
    server.listen(MOCK_TWILIO_PORT, "127.0.0.1", () => resolve(server));
  });
}

/* -------------------------------------------------------------- dev server -- */

async function waitForServer(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status > 0) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function startDevServer() {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", "--port", String(DEV_PORT)],
    {
      env: {
        ...process.env,
        NOTIFICATION_API_KEY: API_KEY,
        NOTIFICATION_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "ACtest00000000000000000000000000",
        TWILIO_AUTH_TOKEN: "test-auth-token",
        TWILIO_WHATSAPP_FROM: "+14155238886",
        TWILIO_API_BASE_URL: `http://127.0.0.1:${MOCK_TWILIO_PORT}`,
        SAMY_WHATSAPP: TEST_NUMBER,
        PARTNER_WHATSAPP: "+18095550123",
        NOTIFICATION_RATE_LIMIT: "8",
        NOTIFICATION_DEDUPE_WINDOW_MS: "60000",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );
  child.stdout.on("data", (data) => {
    const line = String(data);
    if (/error/i.test(line)) process.stdout.write(`  [next] ${line}`);
  });
  child.stderr.on("data", (data) => process.stdout.write(`  [next:err] ${data}`));
  return child;
}

/* ------------------------------------------------------------------ tests -- */

async function runSharedChecks() {
  console.log("\nAutenticación");
  check("GET sin token → 401", (await call(null, { token: null, method: "GET" })).status === 401);
  const noAuth = await call({ message: "hola" }, { token: null });
  check("POST sin token → 401", noAuth.status === 401, `status ${noAuth.status}`);
  const badAuth = await call({ message: "hola" }, { token: "clave-incorrecta" });
  check("POST con token inválido → 401", badAuth.status === 401, `status ${badAuth.status}`);

  console.log("\nValidación");
  const noMessage = await call({ to: TEST_NUMBER, source: "test-validation" });
  check(
    "sin message → 400 missing_message",
    noMessage.status === 400 && noMessage.json?.code === "missing_message",
    JSON.stringify(noMessage.json),
  );

  const badPhone = await call({ to: "12", message: "hola", source: "test-validation" });
  check(
    "teléfono inválido → 400 invalid_recipient",
    badPhone.status === 400 && badPhone.json?.code === "invalid_recipient",
    JSON.stringify(badPhone.json),
  );

  const badTemplate = await call({ to: TEST_NUMBER, template: "no-existe", data: {}, source: "test-validation" });
  check(
    "template desconocida → 400 unknown_template",
    badTemplate.status === 400 && badTemplate.json?.code === "unknown_template",
    JSON.stringify(badTemplate.json),
  );

  const tooLong = await call({ to: TEST_NUMBER, message: "x".repeat(4097), source: "test-validation" });
  check(
    "mensaje demasiado largo → 400 message_too_long",
    tooLong.status === 400 && tooLong.json?.code === "message_too_long",
    JSON.stringify(tooLong.json),
  );

  const badSource = await call({ to: TEST_NUMBER, message: "hola", source: "MAYÚSCULAS Y ESPACIOS" });
  check(
    "source inválido → 400 invalid_source",
    badSource.status === 400 && badSource.json?.code === "invalid_source",
    JSON.stringify(badSource.json),
  );

  console.log("\nEstado de configuración");
  const status = await call(null, { method: "GET" });
  check("GET con token → 200", status.status === 200, JSON.stringify(status.json));
  check(
    "GET informa proveedor y plantillas",
    Boolean(status.json?.provider) && Array.isArray(status.json?.templates),
    JSON.stringify(status.json),
  );
  check(
    "GET enmascara los números",
    !JSON.stringify(status.json?.recipients || {}).includes("4692835"),
    JSON.stringify(status.json?.recipients),
  );
  return status.json;
}

async function runMockChecks() {
  console.log("\nEnvío (Twilio simulado)");
  const send = await call({
    to: TEST_NUMBER,
    message: `Prueba de gateway ${nonce}`,
    source: "samyprez-youtube",
  });
  check("envío válido → 200", send.status === 200, JSON.stringify(send.json));
  check("devuelve Message SID", /^SM/.test(send.json?.results?.[0]?.sid || ""), JSON.stringify(send.json));
  check("marca sent = 1", send.json?.sent === 1, JSON.stringify(send.json));
  const lastCall = twilioCalls.at(-1);
  check("Twilio recibió whatsapp:+E164", lastCall?.to === `whatsapp:${TEST_NUMBER}`, lastCall?.to);
  check("Twilio recibió el From correcto", lastCall?.from === "whatsapp:+14155238886", lastCall?.from);
  check("usa autenticación Basic", lastCall?.auth.startsWith("Basic "), lastCall?.auth.slice(0, 6));

  console.log("\nAlias, plantillas y múltiples destinatarios");
  const alias = await call({ to: "samy", message: `Alias ${nonce}`, source: "money-tracker" });
  check("alias 'samy' resuelve al número", alias.json?.results?.[0]?.to === TEST_NUMBER, JSON.stringify(alias.json));

  const multi = await call({
    recipients: [TEST_NUMBER, "partner"],
    message: `Multi ${nonce}`,
    source: "dominican-content-radar",
  });
  check("dos destinatarios → sent = 2", multi.json?.sent === 2, JSON.stringify(multi.json));

  const template = await call({
    to: TEST_NUMBER,
    template: "samyprez-youtube",
    source: "samyprez-youtube",
    data: {
      do_next: `Grabar "¿Todavía vale la pena emigrar a Canadá siendo dominicano en 2026?" ${nonce}`,
      prep_next: "“Después de vivir en Canadá, estas 7 cosas de RD las veo diferente”",
      kpi: "Watch CTR y retención de los primeros 30 segundos.",
    },
  });
  const templateBody = twilioCalls.at(-1)?.body || "";
  check("plantilla SAMYPREZ → 200", template.status === 200, JSON.stringify(template.json));
  check("plantilla incluye el encabezado", templateBody.startsWith("SAMYPREZ YOUTUBE MANAGER"), templateBody.slice(0, 40));
  check("plantilla incluye DO NEXT y KPI", templateBody.includes("DO NEXT:") && templateBody.includes("KPI:"));

  const urgent = await call({
    to: TEST_NUMBER,
    message: `Servidor caído ${nonce}`,
    source: "system-alert",
    priority: "urgent",
  });
  check("priority urgent añade prefijo", (twilioCalls.at(-1)?.body || "").includes("URGENTE"), JSON.stringify(urgent.json));

  console.log("\nDuplicados, límite y errores de Twilio");
  const duplicate = await call({ to: TEST_NUMBER, message: `Alias ${nonce}`, source: "money-tracker" });
  check(
    "mensaje idéntico se omite",
    duplicate.json?.results?.[0]?.status === "skipped",
    JSON.stringify(duplicate.json),
  );

  const twilioFail = await call({
    to: TEST_NUMBER,
    message: `FORCE_TWILIO_ERROR ${nonce}`,
    source: "test-errors",
  });
  check("error de Twilio → 502", twilioFail.status === 502, JSON.stringify(twilioFail.json));
  check(
    "error de Twilio conserva el código 63024 y una pista",
    twilioFail.json?.results?.[0]?.code === 63024 && Boolean(twilioFail.json?.results?.[0]?.hint),
    JSON.stringify(twilioFail.json?.results?.[0]),
  );

  let rateLimited = false;
  for (let i = 0; i < 10; i += 1) {
    const res = await call({ to: TEST_NUMBER, message: `Ráfaga ${nonce} ${i}`, source: "test-rate" });
    if (res.status === 429 && res.json?.code === "rate_limited") {
      rateLimited = true;
      break;
    }
  }
  check("límite de envíos → 429 rate_limited", rateLimited);

  console.log("\nSin secretos en la respuesta ni en los logs");
  const leak = JSON.stringify(await call({ to: TEST_NUMBER, message: `Fuga ${nonce}`, source: "test-secrets" }));
  check("la respuesta no incluye el token de Twilio", !leak.includes("test-auth-token"));
  check("la respuesta no incluye la API key", !leak.includes(API_KEY));
}

async function runRemoteSend() {
  console.log("\nEnvío real");
  const send = await call({
    to: TEST_NUMBER,
    message: `SAMYPREZ Manager conectado correctamente. (${new Date().toISOString()})`,
    source: "samyprez-youtube",
  });
  console.log(`  respuesta: ${send.status} ${JSON.stringify(send.json)}`);
  check("envío real aceptado", send.status === 200 && send.json?.sent >= 1, JSON.stringify(send.json));
  const sid = send.json?.results?.[0]?.sid;
  if (sid) console.log(`  Twilio Message SID: ${sid}`);
}

/* ------------------------------------------------------------------- main -- */

async function main() {
  let mock = null;
  let dev = null;

  try {
    if (MODE === "mock") {
      mock = await startMockTwilio();
      console.log(`Twilio simulado en http://127.0.0.1:${MOCK_TWILIO_PORT}`);
      dev = startDevServer();
      console.log(`Arrancando next dev en ${BASE_URL} …`);
      const ready = await waitForServer(`${BASE_URL}/api/notifications/whatsapp`);
      if (!ready) throw new Error("El servidor de desarrollo no respondió a tiempo");
    }
    console.log(`Probando ${ENDPOINT}`);

    await runSharedChecks();
    if (MODE === "mock") await runMockChecks();
    else if (flag("send")) await runRemoteSend();
    else console.log("\n(añade --send para enviar un WhatsApp real)");
  } catch (error) {
    failed += 1;
    console.error(`\nError de la prueba: ${error.message}`);
  } finally {
    if (dev) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(dev.pid), "/f", "/t"], { stdio: "ignore" });
      else dev.kill("SIGTERM");
    }
    if (mock) mock.close();
  }

  console.log(`\n${passed} pasadas, ${failed} fallidas`);
  process.exit(failed ? 1 : 0);
}

main();
