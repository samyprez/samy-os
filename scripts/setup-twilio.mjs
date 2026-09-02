#!/usr/bin/env node
/**
 * Carga las credenciales de Twilio en las variables de entorno de Vercel.
 *
 * Existe para que el Account SID y el Auth Token viajen de la terminal de
 * Samuel a Vercel sin pasar por el código, por el repo, ni por una conversación.
 * El token se escribe a ciegas y no se imprime en ningún momento.
 *
 *   node scripts/setup-twilio.mjs
 *
 * Después de esto hace falta un redeploy para que las funciones las vean.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import process from "node:process";

const VERCEL = process.platform === "win32" ? "npx.cmd" : "npx";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Silencia el eco: lo tecleado no aparece en pantalla ni queda en el scrollback.
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
    const child = spawn(VERCEL, ["vercel", ...args], { stdio: ["pipe", "pipe", "pipe"], shell: false });
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

async function main() {
  console.log("\nCredenciales de Twilio → Vercel (producción)\n");
  console.log("Están en console.twilio.com → Account Dashboard → Account Info.\n");

  const sid = await ask("TWILIO_ACCOUNT_SID (empieza por AC): ");
  if (!SID_PATTERN.test(sid)) {
    console.error("\nEse no es un Account SID válido: son las letras AC y 32 caracteres hexadecimales.");
    process.exit(1);
  }

  const token = await ask("TWILIO_AUTH_TOKEN (no se ve al teclear): ", { hidden: true });
  if (token.length < 30) {
    console.error("\nEl Auth Token parece incompleto. Cópialo entero desde el console.");
    process.exit(1);
  }
  if (token === sid) {
    console.error("\nPegaste el SID otra vez. El Auth Token es el otro valor, el que está oculto.");
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
