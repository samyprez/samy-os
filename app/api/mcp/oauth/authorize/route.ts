import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientRedirectUris, issueCode } from "@/lib/server/mcp-oauth";
import { notificationAuthSecrets } from "@/lib/server/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pantalla de consentimiento.
 *
 * Samy OS no tiene sesiones de navegador, así que la prueba de que quien
 * autoriza es Samuel es que sepa la clave del gateway. La teclea él en su
 * navegador, una sola vez por conector: nunca viaja en una URL ni queda en un
 * registro.
 */

type AuthParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  method: string;
};

function readParams(url: URL): AuthParams {
  return {
    clientId: url.searchParams.get("client_id") || "",
    redirectUri: url.searchParams.get("redirect_uri") || "",
    state: url.searchParams.get("state") || "",
    challenge: url.searchParams.get("code_challenge") || "",
    method: url.searchParams.get("code_challenge_method") || "",
  };
}

function validate(params: AuthParams): string | null {
  const uris = clientRedirectUris(params.clientId);
  if (!uris) return "El client_id no es válido.";
  if (!uris.includes(params.redirectUri)) return "La redirect_uri no está registrada para este cliente.";
  if (params.method !== "S256") return "Se requiere PKCE con code_challenge_method=S256.";
  if (!params.challenge) return "Falta code_challenge.";
  return null;
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function page(params: AuthParams, error: string | null, fatal: string | null) {
  const body = fatal
    ? `<p class="err">${escape(fatal)}</p>`
    : `${error ? `<p class="err">${escape(error)}</p>` : ""}
      <form method="post">
        <input type="hidden" name="client_id" value="${escape(params.clientId)}">
        <input type="hidden" name="redirect_uri" value="${escape(params.redirectUri)}">
        <input type="hidden" name="state" value="${escape(params.state)}">
        <input type="hidden" name="code_challenge" value="${escape(params.challenge)}">
        <input type="hidden" name="code_challenge_method" value="${escape(params.method)}">
        <label for="key">Clave del gateway</label>
        <input id="key" name="key" type="password" autocomplete="off" autofocus required>
        <button type="submit">Autorizar</button>
      </form>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar acceso — Samy OS</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f6f7;
 font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b}
.card{background:#fff;padding:32px;border-radius:14px;max-width:380px;width:calc(100% - 32px);
 box-shadow:0 1px 3px rgba(0,0,0,.1),0 8px 24px rgba(0,0,0,.06)}
h1{font-size:19px;margin:0 0 6px}
p{margin:0 0 18px;color:#52525b}
label{display:block;font-weight:600;margin-bottom:6px;font-size:13px}
input{width:100%;padding:10px 12px;border:1px solid #d4d4d8;border-radius:8px;font-size:15px;
 box-sizing:border-box;background:#fff;color:inherit}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#18181b;
 color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{color:#b91c1c;font-weight:500}
@media(prefers-color-scheme:dark){
 body{background:#09090b;color:#fafafa}
 .card{background:#18181b;box-shadow:none;border:1px solid #27272a}
 p{color:#a1a1aa} input{background:#09090b;border-color:#3f3f46}
 button{background:#fafafa;color:#18181b}
 .err{color:#f87171}}
</style></head><body><div class="card">
<h1>Autorizar acceso a Samy OS</h1>
<p>Un cliente MCP pide permiso para mandar avisos por WhatsApp en tu nombre.</p>
${body}
</div></body></html>`;
}

function html(content: string, status = 200) {
  return new NextResponse(content, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const params = readParams(new URL(request.url));
  const fatal = validate(params);
  return html(page(params, null, fatal), fatal ? 400 : 200);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: AuthParams = {
    clientId: String(form.get("client_id") || ""),
    redirectUri: String(form.get("redirect_uri") || ""),
    state: String(form.get("state") || ""),
    challenge: String(form.get("code_challenge") || ""),
    method: String(form.get("code_challenge_method") || ""),
  };

  const fatal = validate(params);
  if (fatal) return html(page(params, null, fatal), 400);

  const key = String(form.get("key") || "");
  const secrets = notificationAuthSecrets();
  const ok = secrets.some((secret) => {
    const a = Buffer.from(key);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!ok) return html(page(params, "Clave incorrecta.", null), 401);

  const code = issueCode(params.clientId, params.redirectUri, params.challenge);
  const target = new URL(params.redirectUri);
  target.searchParams.set("code", code);
  if (params.state) target.searchParams.set("state", params.state);

  return NextResponse.redirect(target.toString(), 302);
}
