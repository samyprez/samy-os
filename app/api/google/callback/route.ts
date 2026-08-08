import { NextResponse } from "next/server";

export const runtime = "nodejs";

function page(title: string, bodyHtml: string, status: number) {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>${title}</title><style>` +
      `body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.25rem;line-height:1.6;color:#111}` +
      `code,pre{background:#f4f4f5;border-radius:.375rem}` +
      `pre{padding:1rem;overflow-wrap:anywhere;white-space:pre-wrap;border:1px solid #e4e4e7}` +
      `code{padding:.15rem .35rem}` +
      `h1{font-size:1.4rem}ol{padding-left:1.25rem}` +
      `.warn{background:#fef3c7;border:1px solid #fcd34d;padding:.75rem 1rem;border-radius:.5rem}` +
      `</style></head><body>${bodyHtml}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Exchanges the one-time code for tokens and prints the refresh token once.
 *
 * Showing a secret in a page is normally wrong, but this is the accepted
 * pattern for a self-hosted single-user OAuth setup: Google only ever returns
 * the refresh token in this one response, there is nowhere to persist it (env
 * vars are set in Vercel by hand), and the alternative — writing it to a log or
 * a database — leaves more copies around than a page shown once.
 *
 * The ?code= in the URL is not a second exposure worth worrying about: it is
 * single-use, expires in minutes, and is useless without GOOGLE_CLIENT_SECRET,
 * which never leaves the server. The refresh token itself is never stored here.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return page("Google OAuth", `<h1>Google rechazó la autorización</h1><p><code>${escapeHtml(error)}</code></p>`, 400);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return page("Google OAuth", `<h1>Falta el código</h1><p>Empieza en <code>/api/google/auth?token=…</code>.</p>`, 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return page(
      "Google OAuth",
      `<h1>Falta configuración</h1><p>Define <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> antes de continuar.</p>`,
      500,
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json()) as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    return page("Google OAuth", `<h1>No se pudo canjear el código</h1><pre>${escapeHtml(detail)}</pre>`, 400);
  }

  if (!payload.refresh_token) {
    return page(
      "Google OAuth",
      `<h1>Google no devolvió refresh token</h1>` +
        `<p>Pasa de nuevo por <code>/api/google/auth</code>. Solo lo entrega con ` +
        `<code>access_type=offline</code> y <code>prompt=consent</code>, o si revocas el acceso en ` +
        `<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>`,
      400,
    );
  }

  return page(
    "Google OAuth",
    `<h1>Refresh token listo</h1>` +
      `<p class="warn">Se muestra <strong>una sola vez</strong>. Cópialo ahora y cierra esta pestaña.</p>` +
      `<pre>${escapeHtml(payload.refresh_token)}</pre>` +
      `<ol>` +
      `<li>Vercel → proyecto <code>samy-os</code> → <strong>Settings → Environment Variables</strong>.</li>` +
      `<li>Crea <code>GOOGLE_REFRESH_TOKEN</code> con ese valor, en Production (y Preview si lo usas).</li>` +
      `<li>Vuelve a desplegar para que la variable entre en vigor.</li>` +
      `<li>Verifica con <code>GET /api/health</code>: <code>gmail.works</code> debe ser <code>true</code>.</li>` +
      `</ol>` +
      `<p>No lo guardes en el repo. <code>.env*</code> está en <code>.gitignore</code> excepto <code>.env.example</code>.</p>`,
    200,
  );
}
