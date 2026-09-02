#!/usr/bin/env node
/**
 * Carga las credenciales de Twilio en las variables de entorno de Vercel.
 *
 * Existe para que el Account SID y el Auth Token viajen de la terminal de
 * Samuel a Vercel sin pasar por el código ni por el repo. El token se escribe
 * a ciegas y no se imprime en ningún momento.
 *
 *   node scripts/setup-twilio.mjs
 *
 * Después hace falta un redeploy para que las funciones las lean.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import process from "node:process";

const IS_WINDOWS = process.platform === "win32";
const VERCEL = IS_WINDOWS ? "npx.cmd" : "npx";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Silencia el eco: lo tecleado no queda en el scrollback.
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function run(args, { input } = {}) {
  return new Promise((resolve) => {
    // En Windows hay que pasar por el shell: desde Node 18.20 lanzar un .cmd
    // directamente falla con EINVAL. Se manda como una sola cadena para no
    // disparar el aviso de deprecación de argumentos sin escapar. Los
    // argumentos son constantes (nombres de variables y flags); el secreto
    // viaja por stdin, nunca por argv ni por el historial del shell.
    const child = IS_WINDOWS
      ? spawn([VERCEL, "vercel", ...args].join(" "), { stdio: ["pipe", "pipe", "pipe"], shell: true })
      : spawn(VERCEL, ["vercel", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("error", (error) => resolve({ code: 1, out: String(error) }));
    child.on("close", (code) => resolve({ code, out }));
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

/** Reemplaza el valor: `vercel env add` falla si la variable ya existe. */
async function setEnv(name, value) {
  await run(["env", "rm", name, "production", "--yes"]);
  const result = await run(["env", "add", name, "production"], { input: value });
  if (result.code !== 0) throw new Error(`No se pudo escribir ${name}:\n${result.out}`);
  console.log(`  OK  ${name}`);
}

const SID_PATTERN = /^AC[0-9a-f]{32}$/i;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Acepta las dos credenciales en una sola respuesta.
 *
 * Copiarlas del console y pegarlas de golpe es lo que sale natural, y el
 * resultado es un pegote de 66 caracteres o dos valores separados por espacio.
 * Los dos formatos son inequívocos —el SID son AC y 32 hex, el token otros 32—
 * así que rechazarlos por venir juntos solo obliga a repetir el paso.
 */
function splitPair(input) {
  const parts = input.split(/[\s,;:]+/).filter(Boolean);
  if (parts.length >= 2 && SID_PATTERN.test(parts[0]) && TOKEN_PATTERN.test(parts[1])) {
    return { sid: parts[0], token: parts[1] };
  }
  const glued = input.replace(/[^0-9a-zA-Z]/g, "");
  if (/^AC[0-9a-f]{64}$/i.test(glued)) {
    return { sid: glued.slice(0, 34), token: glued.slice(34) };
  }
  return null;
}

async function main() {
  console.log("\nCredenciales de Twilio → Vercel (producción)\n");
  console.log("Están en console.twilio.com → Account Dashboard → Account Info.");
  console.log("Puedes pegar el SID y el token juntos, o el SID solo y te pido el token aparte.\n");

  const first = await ask("TWILIO_ACCOUNT_SID (empieza por AC): ");

  let sid;
  let token;
  const pair = splitPair(first);
  if (pair) {
    ({ sid, token } = pair);
    console.log("  (detecté los dos valores en el mismo pegado)");
  } else {
    sid = first;
    if (!SID_PATTERN.test(sid)) {
      console.error("\nEse no es un Account SID válido: son las letras AC y 32 caracteres hexadecimales.");
      console.error(`Lo que llegó tiene ${sid.length} caracteres.`);
      process.exit(1);
    }
    token = await ask("TWILIO_AUTH_TOKEN (no se ve al teclear): ", { hidden: true });
  }

  if (!TOKEN_PATTERN.test(token)) {
    console.error("\nEl Auth Token debe ser 32 caracteres hexadecimales. Cópialo entero desde el console.");
    process.exit(1);
  }

  console.log("");
  await setEnv("TWILIO_ACCOUNT_SID", sid);
  await setEnv("TWILIO_AUTH_TOKEN", token);
  await setEnv("TWILIO_WHATSAPP_FROM", "+14155238886");

  console.log("\nListo. Falta un redeploy para que las funciones las lean.");
  console.log("Dile a Claude que ya están y él hace el redeploy y la prueba de envío real.\n");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
