#!/usr/bin/env node
/**
 * Prueba de extremo a extremo del conector MCP.
 *
 * Recorre lo mismo que recorre ChatGPT al añadir el complemento: descubrimiento,
 * registro dinámico, consentimiento con PKCE, canje del código y llamadas a las
 * herramientas. Sin --send no manda ningún WhatsApp.
 *
 *   node scripts/test-mcp.mjs --url https://samy-os-seven.vercel.app --key <clave>
 *   node scripts/test-mcp.mjs ... --send      # entrega un aviso real
 */

import { createHash, randomBytes } from "node:crypto";
import process from "node:process";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = value("url", "https://samy-os-seven.vercel.app").replace(/\/$/, "");
const KEY = value("key", process.env.NOTIFICATION_API_KEY || "");
const REDIRECT = value("redirect", "https://chatgpt.com/connector_platform_oauth_redirect");
const SEND = args.includes("--send");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function rpc(token, method, params) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Respuesta no JSON: el check correspondiente lo delatará.
  }
  return { status: res.status, json, headers: res.headers };
}

async function main() {
  console.log(`\nConector MCP en ${BASE}\n`);

  console.log("Descubrimiento");
  const pr = await fetch(`${BASE}/.well-known/oauth-protected-resource`).then((r) => r.json());
  check("protected-resource apunta al recurso", pr.resource === `${BASE}/api/mcp`, JSON.stringify(pr));
  const as = await fetch(`${BASE}/.well-known/oauth-authorization-server`).then((r) => r.json());
  check("authorization-server publica sus endpoints", Boolean(as.authorization_endpoint && as.token_endpoint));
  check("exige PKCE S256", JSON.stringify(as.code_challenge_methods_supported) === JSON.stringify(["S256"]));

  console.log("\nSin autenticación");
  const anon = await rpc(null, "tools/list", {});
  check("tools/list sin token → 401", anon.status === 401, `status ${anon.status}`);
  check(
    "el 401 dice dónde autenticarse",
    (anon.headers.get("www-authenticate") || "").includes("resource_metadata"),
  );

  console.log("\nRegistro y autorización");
  const reg = await fetch(`${BASE}/api/mcp/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [REDIRECT] }),
  }).then((r) => r.json());
  check("registro dinámico devuelve client_id", Boolean(reg.client_id), JSON.stringify(reg).slice(0, 120));

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl =
    `${BASE}/api/mcp/oauth/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}` +
    `&code_challenge_method=S256&state=xyz`;

  const form = await fetch(authUrl).then((r) => r.text());
  check("la pantalla de consentimiento pide la clave", form.includes('name="key"'));

  const base = {
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    state: "xyz",
    code_challenge: challenge,
    code_challenge_method: "S256",
  };

  const badRes = await fetch(`${BASE}/api/mcp/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...base, key: "clave-incorrecta" }).toString(),
    redirect: "manual",
  });
  check("clave incorrecta → 401", badRes.status === 401, `status ${badRes.status}`);

  if (!KEY) {
    console.log("\nSin --key no se puede continuar más allá del consentimiento.");
    console.log(`\n${passed} pasadas, ${failed} fallidas\n`);
    process.exit(failed ? 1 : 0);
  }

  const authRes = await fetch(`${BASE}/api/mcp/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...base, key: KEY }).toString(),
    redirect: "manual",
  });
  check("clave correcta → redirección 302", authRes.status === 302, `status ${authRes.status}`);
  const location = new URL(authRes.headers.get("location") || "https://x.invalid");
  const code = location.searchParams.get("code") || "";
  check("la redirección trae el código", Boolean(code));
  check("conserva el state", location.searchParams.get("state") === "xyz");

  const wrongPkce = await fetch(`${BASE}/api/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: reg.client_id,
      redirect_uri: REDIRECT,
      code_verifier: randomBytes(32).toString("base64url"),
    }).toString(),
  });
  check("verificador PKCE erróneo → rechazado", wrongPkce.status === 400, `status ${wrongPkce.status}`);

  const tokenRes = await fetch(`${BASE}/api/mcp/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: reg.client_id,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }).toString(),
  }).then((r) => r.json());
  check("canje del código devuelve access_token", Boolean(tokenRes.access_token), JSON.stringify(tokenRes));
  const token = tokenRes.access_token;

  console.log("\nProtocolo MCP");
  const init = await rpc(token, "initialize", { protocolVersion: "2024-11-05" });
  check("initialize responde", init.json?.result?.serverInfo?.name === "samy-os", JSON.stringify(init.json));
  const list = await rpc(token, "tools/list", {});
  const names = (list.json?.result?.tools || []).map((t) => t.name);
  check(
    "tools/list trae las herramientas",
    names.includes("enviar_whatsapp") && names.includes("estado_whatsapp"),
    names.join(","),
  );

  const status = await rpc(token, "tools/call", { name: "estado_whatsapp", arguments: {} });
  const statusText = status.json?.result?.content?.[0]?.text || "";
  check("estado_whatsapp informa configurado", statusText.includes("Gateway listo"), statusText);

  if (SEND) {
    console.log("\nEnvío real");
    const sent = await rpc(token, "tools/call", {
      name: "enviar_whatsapp",
      arguments: {
        template: "samyprez-youtube",
        source: "samyprez-youtube",
        data: {
          do_next: "Probar el conector MCP desde ChatGPT",
          prep_next: "El video de Canadá",
          kpi: "Que este aviso llegue completo, con acentos.",
        },
      },
    });
    const text = sent.json?.result?.content?.[0]?.text || "";
    check("enviar_whatsapp devuelve Message SID", /SM[0-9a-f]{32}/.test(text), text);
  } else {
    console.log("\n(añade --send para entregar un WhatsApp real)");
  }

  console.log(`\n${passed} pasadas, ${failed} fallidas\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
