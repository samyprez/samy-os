import "server-only";

import { missingTwilioEnvVars, probeTwilioAuth, twilioSenderMode } from "./twilio-whatsapp";
import { twilioTrafficEvidence } from "./whatsapp-inbox";

/**
 * Connector registry for providers the Samy OS bridge did not cover before.
 * Every probe is read-only: no message, charge, post or change is created.
 *
 * States never collapse into each other:
 *   not_implemented  no code path in this bridge
 *   not_configured   code exists, env vars missing
 *   configured       env vars present, provider not yet contacted / failed
 *   authenticated    provider accepted the credentials
 *   read_verified    a real read returned data
 * Sending/receiving evidence is reported separately, never inferred.
 */

export type ConnectorReport = {
  provider: string;
  account?: string;
  state: "not_implemented" | "not_configured" | "configured" | "authenticated" | "read_verified" | "auth_failed";
  configured: boolean;
  authenticated: boolean | null;
  read_tested: boolean;
  write_tested: false;
  missing_env?: string[];
  detail?: Record<string, unknown>;
  error?: string;
};

const env = (name: string) => process.env[name]?.trim() || "";
const missing = (names: string[]) => names.filter((n) => !env(n));

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

/* --------------------------------------------------------- WhatsApp ------ */

export async function whatsappTwilioReport() {
  const missingEnv = missingTwilioEnvVars();
  const configured = missingEnv.length === 0;
  const auth = configured ? await probeTwilioAuth() : null;
  let evidence: Awaited<ReturnType<typeof twilioTrafficEvidence>> | null = null;
  let evidenceError: string | null = null;
  try {
    evidence = await twilioTrafficEvidence();
  } catch {
    evidenceError = "No se pudo leer whatsapp_messages (¿migración 004 aplicada?)";
  }
  return {
    provider: "whatsapp_twilio",
    configuration: { ok: configured, missing_env: missingEnv, sender_mode: twilioSenderMode(), webhook_url_set: Boolean(env("TWILIO_WEBHOOK_URL")) },
    authentication: auth
      ? auth.authenticated
        ? { ok: true, account_status: auth.account_status, account_type: auth.account_type }
        : { ok: false, error: auth.error, http_status: auth.http_status }
      : { ok: null, error: "not_configured" },
    // Proven only by Twilio's delivery receipt arriving on the signed webhook.
    sending: { verified: Boolean(evidence?.last_delivered_at), last_delivered_at: evidence?.last_delivered_at ?? null, last_accepted_at: evidence?.last_accepted_at ?? null },
    receiving: { verified: Boolean(evidence?.last_inbound_at), last_inbound_at: evidence?.last_inbound_at ?? null },
    evidence_error: evidenceError,
    capabilities: {
      individual_chats: "Sí: entrantes por webhook y salientes. Texto libre solo dentro de 24 h desde el último mensaje del contacto; fuera, plantilla aprobada (ContentSid).",
      group_chats: "No: la API de WhatsApp Business (Twilio) no lee ni escribe grupos de WhatsApp.",
      personal_history: "No: solo se ve lo que llega al número de Twilio después de configurar el webhook.",
      start_conversation: "Solo con plantilla aprobada; en Sandbox, solo con números que hicieron join.",
    },
  };
}

/* ----------------------------------------------------------- Stripe ------ */

export function stripeMode() {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) return null;
  return /_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : "unknown";
}

export async function stripeReport(): Promise<ConnectorReport> {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) return { provider: "stripe", state: "not_configured", configured: false, authenticated: null, read_tested: false, write_tested: false, missing_env: ["STRIPE_SECRET_KEY"] };
  try {
    const r = await getJson("https://api.stripe.com/v1/payment_intents?limit=1", { Authorization: `Bearer ${key}` });
    if (r.status === 401) return { provider: "stripe", state: "auth_failed", configured: true, authenticated: false, read_tested: false, write_tested: false, detail: { mode: stripeMode() } };
    if (!r.ok) return { provider: "stripe", state: "authenticated", configured: true, authenticated: true, read_tested: false, write_tested: false, detail: { mode: stripeMode(), http_status: r.status }, error: "La clave no tiene permiso de lectura de PaymentIntents." };
    return { provider: "stripe", state: "read_verified", configured: true, authenticated: true, read_tested: true, write_tested: false, detail: { mode: stripeMode(), restricted_key: key.startsWith("rk_") } };
  } catch {
    return { provider: "stripe", state: "configured", configured: true, authenticated: null, read_tested: false, write_tested: false, error: "Stripe no respondió." };
  }
}

/** Read-only: recent PaymentIntents, minimal fields, no card or customer PII. */
export async function listStripePayments(limit = 10) {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe no está configurado (STRIPE_SECRET_KEY)");
  const r = await getJson(`https://api.stripe.com/v1/payment_intents?limit=${Math.min(Math.max(limit, 1), 25)}`, { Authorization: `Bearer ${key}` });
  if (!r.ok) throw new Error(`Stripe HTTP ${r.status}`);
  const rows = (r.body?.data ?? []) as Array<Record<string, unknown>>;
  return {
    mode: stripeMode(),
    payments: rows.map((p) => ({
      id: p.id,
      amount: typeof p.amount === "number" ? p.amount / 100 : null,
      amount_received: typeof p.amount_received === "number" ? p.amount_received / 100 : null,
      currency: p.currency,
      status: p.status,
      description: p.description ?? null,
      customer: p.customer ?? null,
      livemode: p.livemode,
      created: typeof p.created === "number" ? new Date(p.created * 1000).toISOString() : null,
    })),
  };
}

/* -------------------------------------------------------- Hostinger ------ */

/** Two accounts, each with its own API token and the sites it hosts. */
async function hostingerReport(n: 1 | 2): Promise<ConnectorReport> {
  const tokenVar = `HOSTINGER_API_TOKEN_${n}`;
  const label = env(`HOSTINGER_ACCOUNT_${n}_LABEL`) || `cuenta ${n}`;
  const sites = env(`HOSTINGER_ACCOUNT_${n}_SITES`).split(",").map((s) => s.trim()).filter(Boolean);
  const base = { provider: `hostinger_${n}`, account: label };
  const token = env(tokenVar);
  if (!token) return { ...base, state: "not_configured", configured: false, authenticated: null, read_tested: false, write_tested: false, missing_env: [tokenVar, `HOSTINGER_ACCOUNT_${n}_LABEL`, `HOSTINGER_ACCOUNT_${n}_SITES`] };
  try {
    // Domains portfolio: read-only, works for any plan that has domains.
    const r = await getJson("https://developers.hostinger.com/api/domains/v1/portfolio", { Authorization: `Bearer ${token}` });
    if (r.status === 401) return { ...base, state: "auth_failed", configured: true, authenticated: false, read_tested: false, write_tested: false };
    if (!r.ok) return { ...base, state: "configured", configured: true, authenticated: null, read_tested: false, write_tested: false, error: `Hostinger HTTP ${r.status}` };
    const domains = (Array.isArray(r.body) ? r.body : []).map((d: Record<string, unknown>) => String(d.domain ?? "")).filter(Boolean);
    return {
      ...base, state: "read_verified", configured: true, authenticated: true, read_tested: true, write_tested: false,
      detail: { domains_in_account: domains.length, expected_sites: sites, expected_sites_missing: sites.filter((s) => !domains.includes(s)) },
    };
  } catch {
    return { ...base, state: "configured", configured: true, authenticated: null, read_tested: false, write_tested: false, error: "Hostinger no respondió." };
  }
}

/* -------------------------------------------------------- WordPress ------ */

/** WP_SITES=alias1,alias2 and per alias WP_<ALIAS>_URL / _USER / _APP_PASSWORD. */
async function wordpressReports(): Promise<ConnectorReport[]> {
  const aliases = env("WP_SITES").split(",").map((s) => s.trim()).filter(Boolean);
  if (!aliases.length) return [{ provider: "wordpress", state: "not_configured", configured: false, authenticated: null, read_tested: false, write_tested: false, missing_env: ["WP_SITES", "WP_<ALIAS>_URL", "WP_<ALIAS>_USER", "WP_<ALIAS>_APP_PASSWORD"] }];
  return Promise.all(aliases.map(async (alias): Promise<ConnectorReport> => {
    const key = alias.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const names = [`WP_${key}_URL`, `WP_${key}_USER`, `WP_${key}_APP_PASSWORD`];
    const miss = missing(names);
    const base = { provider: "wordpress", account: alias };
    if (miss.length) return { ...base, state: "not_configured", configured: false, authenticated: null, read_tested: false, write_tested: false, missing_env: miss };
    try {
      const url = env(names[0]).replace(/\/+$/, "");
      const auth = Buffer.from(`${env(names[1])}:${env(names[2])}`).toString("base64");
      const r = await getJson(`${url}/wp-json/wp/v2/users/me?context=edit`, { Authorization: `Basic ${auth}` });
      if (r.status === 401 || r.status === 403) return { ...base, state: "auth_failed", configured: true, authenticated: false, read_tested: false, write_tested: false };
      if (!r.ok) return { ...base, state: "configured", configured: true, authenticated: null, read_tested: false, write_tested: false, error: `WordPress HTTP ${r.status}` };
      const caps = (r.body?.capabilities ?? {}) as Record<string, boolean>;
      return { ...base, state: "read_verified", configured: true, authenticated: true, read_tested: true, write_tested: false, detail: { site: new URL(url).host, can_publish_posts: Boolean(caps.publish_posts), roles: r.body?.roles ?? [] } };
    } catch {
      return { ...base, state: "configured", configured: true, authenticated: null, read_tested: false, write_tested: false, error: "WordPress no respondió." };
    }
  }));
}

/* ----------------------------------------------- not yet implemented ----- */

function notImplemented(provider: string, needs: string[], note: string): ConnectorReport {
  return { provider, state: "not_implemented", configured: missing(needs).length === 0, authenticated: null, read_tested: false, write_tested: false, missing_env: missing(needs), detail: { note } };
}

export async function connectorRegistry() {
  const [stripe, h1, h2, wp] = await Promise.all([stripeReport(), hostingerReport(1), hostingerReport(2), wordpressReports()]);
  return [
    stripe, h1, h2, ...wp,
    notImplemented("metricool", ["METRICOOL_USER_TOKEN", "METRICOOL_USER_ID", "METRICOOL_BLOG_ID"], "Requiere plan con API de Metricool; sin código de lectura todavía."),
    notImplemented("google_ads", ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_REFRESH_TOKEN"], "Requiere developer token aprobado y OAuth con scope adwords; el refresh token actual de Gmail/Calendar no lo incluye."),
  ];
}
