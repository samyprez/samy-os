import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  missingTwilioEnvVars,
  sendTwilioWhatsApp,
  TwilioSendError,
  twilioConfigured,
} from "@/lib/server/twilio-whatsapp";
import { missingWhatsAppEnvVars, sendWhatsAppText, whatsappConfigured } from "@/lib/server/whatsapp";
import { priorityPrefix, renderTemplate, templateNames } from "@/lib/server/notification-formatters";

/**
 * Samy's reusable WhatsApp notification gateway.
 *
 * One door for every automation — the SAMYPREZ YouTube Manager, the Dominican
 * Content Radar, Money Tracker, Amazing Solutions, client alerts, reminders —
 * so adding a new caller or a new recipient is configuration, never code.
 *
 * The pieces, on purpose:
 *  - the recipient book lives in environment variables, so a phone number is
 *    never hard-coded and a partner is added without touching logic;
 *  - the transport sits behind `sendViaProvider`, so Twilio (the default) and
 *    the Meta Cloud API already in this repo are interchangeable;
 *  - nothing here knows what SAMYPREZ is. That is a template, not a branch.
 */

export const MAX_MESSAGE_LENGTH = 4096;
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class NotificationError extends Error {
  status: number;
  code: string;
  hint: string | null;

  constructor(message: string, status: number, code: string, hint: string | null = null) {
    super(message);
    this.name = "NotificationError";
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

/* ------------------------------------------------------------------ auth --- */

/**
 * The gateway has its own key so a leaked automation token cannot also read
 * Samuel's mail and calendar through /api/chatgpt. ASSISTANT_API_KEY still
 * works as a fallback so existing automations keep running before the new
 * secret exists anywhere.
 */
export function notificationAuthSecrets() {
  return [process.env.NOTIFICATION_API_KEY, process.env.ASSISTANT_API_KEY, process.env.SAMY_OS_API_TOKEN]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function constantTimeEquals(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function assertNotificationAuth(request: Request) {
  const secrets = notificationAuthSecrets();
  if (!secrets.length) {
    throw new NotificationError(
      "El gateway no tiene NOTIFICATION_API_KEY configurada",
      503,
      "not_configured",
      "Define NOTIFICATION_API_KEY en las variables de entorno de Vercel.",
    );
  }

  const header = request.headers.get("authorization") || "";
  const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!received || !secrets.some((secret) => constantTimeEquals(received, secret))) {
    throw new NotificationError("Unauthorized", 401, "unauthorized");
  }
}

/* ------------------------------------------------------------ recipients --- */

/**
 * The recipient book. `SAMY_WHATSAPP` and `PARTNER_WHATSAPP` are the two names
 * Samuel asked for; any further person is `NOTIFY_WHATSAPP_<ALIAS>`, so a new
 * recipient costs one environment variable and zero code.
 */
export function recipientBook(): Record<string, string> {
  const book: Record<string, string> = {};
  const add = (alias: string, raw: string | undefined) => {
    const value = raw?.trim();
    if (!value) return;
    const normalized = normalizePhone(value);
    if (normalized) book[alias] = normalized;
  };

  add("samy", process.env.SAMY_WHATSAPP);
  add("partner", process.env.PARTNER_WHATSAPP);
  for (const [key, value] of Object.entries(process.env)) {
    const match = /^NOTIFY_WHATSAPP_(.+)$/.exec(key);
    if (match) add(match[1].toLowerCase(), value);
  }
  return book;
}

/** E.164: a `+` and 8–15 digits. A bare 10-digit number is assumed Canadian/US. */
export function normalizePhone(input: string): string | null {
  const raw = (input || "").trim().replace(/^whatsapp:/i, "");
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const candidate = hasPlus ? `+${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return E164_PATTERN.test(candidate) ? candidate : null;
}

function resolveOneRecipient(entry: string, book: Record<string, string>): string[] {
  const value = String(entry ?? "").trim();
  if (!value) throw new NotificationError("Destinatario vacío", 400, "invalid_recipient");

  const alias = value.toLowerCase();
  if (alias === "all" || alias === "todos") {
    const everyone = Object.values(book);
    if (!everyone.length) {
      throw new NotificationError(
        "No hay destinatarios configurados",
        503,
        "no_recipients",
        "Define SAMY_WHATSAPP (y PARTNER_WHATSAPP si aplica) en el entorno.",
      );
    }
    return everyone;
  }
  if (book[alias]) return [book[alias]];

  const normalized = normalizePhone(value);
  if (!normalized) {
    throw new NotificationError(
      `Número o alias inválido: ${value}`,
      400,
      "invalid_recipient",
      "Usa formato E.164 (+16474692835) o un alias configurado.",
    );
  }
  return [normalized];
}

export function resolveRecipients(input: { to?: unknown; recipients?: unknown }): string[] {
  const book = recipientBook();
  const entries: string[] = [];

  if (Array.isArray(input.recipients)) {
    for (const item of input.recipients) entries.push(String(item));
  } else if (typeof input.recipients === "string" && input.recipients.trim()) {
    entries.push(...input.recipients.split(","));
  } else if (input.recipients != null && !Array.isArray(input.recipients)) {
    throw new NotificationError("recipients debe ser una lista", 400, "invalid_recipients");
  }

  if (typeof input.to === "string") {
    if (input.to.trim()) entries.push(...input.to.split(","));
  } else if (input.to != null) {
    throw new NotificationError("to debe ser un texto", 400, "invalid_recipient");
  }

  if (!entries.length) {
    const fallback = process.env.NOTIFICATION_DEFAULT_RECIPIENTS?.trim();
    entries.push(...(fallback ? fallback.split(",") : ["samy"]));
  }

  const resolved: string[] = [];
  for (const entry of entries) {
    if (!entry.trim()) continue;
    for (const phone of resolveOneRecipient(entry, book)) {
      if (!resolved.includes(phone)) resolved.push(phone);
    }
  }

  if (!resolved.length) {
    throw new NotificationError(
      "No se resolvió ningún destinatario",
      400,
      "no_recipients",
      "Envía `to` o `recipients`, o define SAMY_WHATSAPP en el entorno.",
    );
  }
  if (resolved.length > 20) {
    throw new NotificationError("Demasiados destinatarios (máximo 20)", 400, "too_many_recipients");
  }
  return resolved;
}

/* -------------------------------------------------------------- provider --- */

export type ProviderName = "twilio" | "meta";

/**
 * Twilio is the default and what Samuel asked for. `meta` reuses the WhatsApp
 * Cloud API client already in this repo, and is chosen automatically only when
 * Twilio is not configured and Meta is.
 */
export function resolveProvider(): ProviderName {
  const requested = process.env.NOTIFICATION_PROVIDER?.trim().toLowerCase();
  if (requested === "twilio" || requested === "meta") return requested;
  if (!twilioConfigured() && whatsappConfigured()) return "meta";
  return "twilio";
}

export function providerStatus() {
  const provider = resolveProvider();
  const missing = provider === "twilio" ? missingTwilioEnvVars() : missingWhatsAppEnvVars();
  return { provider, configured: missing.length === 0, missing_env: missing };
}

function assertProviderConfigured(): ProviderName {
  const status = providerStatus();
  if (!status.configured) {
    throw new NotificationError(
      `El proveedor ${status.provider} no está configurado`,
      503,
      "provider_not_configured",
      `Faltan variables de entorno: ${status.missing_env.join(", ")}.`,
    );
  }
  return status.provider;
}

type SendOptions = { contentSid?: string; contentVariables?: Record<string, string> };

async function sendViaProvider(provider: ProviderName, to: string, body: string, options: SendOptions) {
  if (provider === "meta") {
    const result = await sendWhatsAppText(to, body);
    return { sid: result.wa_message_id || "", status: "sent" };
  }
  const result = await sendTwilioWhatsApp({
    to,
    body,
    contentSid: options.contentSid,
    contentVariables: options.contentVariables,
  });
  return { sid: result.sid, status: result.status };
}

/* ------------------------------------------------------------ rate limit --- */

/**
 * Best-effort and per-instance. Serverless spreads requests across instances,
 * so this is a brake on a runaway loop or a retry storm from one automation,
 * not a quota — Twilio enforces the real limits.
 */
const rateWindow = new Map<string, number[]>();
const recentSends = new Map<string, number>();

function numberEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function assertWithinRateLimit(source: string, now: number) {
  const limit = numberEnv("NOTIFICATION_RATE_LIMIT", 20);
  const windowMs = numberEnv("NOTIFICATION_RATE_WINDOW_MS", 60_000);
  if (!limit || !windowMs) return;

  const hits = (rateWindow.get(source) || []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) {
    rateWindow.set(source, hits);
    throw new NotificationError(
      `Límite de envíos alcanzado para "${source}" (${limit} por ${Math.round(windowMs / 1000)}s)`,
      429,
      "rate_limited",
    );
  }
  hits.push(now);
  rateWindow.set(source, hits);
}

/** Blocks an identical message to the same number sent moments ago. */
function isDuplicate(key: string, now: number) {
  const windowMs = numberEnv("NOTIFICATION_DEDUPE_WINDOW_MS", 60_000);
  if (!windowMs) return false;
  for (const [seen, at] of recentSends) if (now - at > windowMs) recentSends.delete(seen);
  const previous = recentSends.get(key);
  return previous != null && now - previous < windowMs;
}

function rememberSend(key: string, now: number) {
  if (numberEnv("NOTIFICATION_DEDUPE_WINDOW_MS", 60_000)) recentSends.set(key, now);
}

/* --------------------------------------------------------------- logging --- */

type LogEntry = {
  event: string;
  source: string;
  provider?: ProviderName;
  to?: string;
  status?: string;
  sid?: string | null;
  error?: string;
  code?: string | number | null;
};

/**
 * Operational only: what was sent, where, and whether it landed. No tokens, no
 * authorization headers, and never the body of the message.
 */
function log(entry: LogEntry) {
  console.log(`[whatsapp-gateway] ${JSON.stringify({ ts: new Date().toISOString(), ...entry })}`);
}

/* ----------------------------------------------------------- the gateway --- */

export type NotificationRequest = {
  to?: unknown;
  recipients?: unknown;
  message?: unknown;
  source?: unknown;
  priority?: unknown;
  template?: unknown;
  data?: unknown;
  content_sid?: unknown;
  content_variables?: unknown;
};

export type DeliveryResult = {
  to: string;
  status: "sent" | "failed" | "skipped";
  sid: string | null;
  error?: string;
  code?: string | number | null;
  hint?: string | null;
};

export type NotificationOutcome = {
  ok: boolean;
  source: string;
  provider: ProviderName;
  priority: Priority;
  message_length: number;
  sent: number;
  failed: number;
  results: DeliveryResult[];
};

function validateSource(value: unknown): string {
  if (value == null || value === "") return "system-alert";
  const source = String(value).trim().toLowerCase();
  if (!SOURCE_PATTERN.test(source)) {
    throw new NotificationError(
      "source inválido (minúsculas, números y guiones, máximo 64)",
      400,
      "invalid_source",
    );
  }
  return source;
}

function validatePriority(value: unknown): Priority {
  if (value == null || value === "") return "normal";
  const priority = String(value).trim().toLowerCase();
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    throw new NotificationError(`priority inválida (usa ${PRIORITIES.join(", ")})`, 400, "invalid_priority");
  }
  return priority as Priority;
}

/** Either a written `message`, or `template` + `data` rendered on the server. */
export function buildMessage(input: NotificationRequest, priority: Priority): string {
  if (input.message != null && typeof input.message !== "string") {
    throw new NotificationError("message debe ser texto", 400, "invalid_message");
  }
  let body = typeof input.message === "string" ? input.message.trim() : "";

  if (input.template != null && String(input.template).trim()) {
    const name = String(input.template).trim();
    const data = (input.data && typeof input.data === "object" ? input.data : {}) as Record<string, unknown>;
    const rendered = renderTemplate(name, body ? { body, ...data } : data);
    if (rendered == null) {
      throw new NotificationError(
        `template desconocida: ${name}`,
        400,
        "unknown_template",
        `Disponibles: ${templateNames().join(", ")}.`,
      );
    }
    body = rendered;
  }

  if (!body) throw new NotificationError("message es obligatorio", 400, "missing_message");

  const full = `${priorityPrefix(priority)}${body}`;
  if (full.length > MAX_MESSAGE_LENGTH) {
    throw new NotificationError(
      `El mensaje excede ${MAX_MESSAGE_LENGTH} caracteres (${full.length})`,
      400,
      "message_too_long",
      "WhatsApp corta ahí. Manda el resumen y deja el detalle para el correo.",
    );
  }
  return full;
}

export async function sendWhatsAppNotification(input: NotificationRequest): Promise<NotificationOutcome> {
  const source = validateSource(input.source);
  const priority = validatePriority(input.priority);
  const body = buildMessage(input, priority);
  const recipients = resolveRecipients(input);
  const provider = assertProviderConfigured();

  const contentSid = typeof input.content_sid === "string" ? input.content_sid.trim() : undefined;
  const contentVariables =
    input.content_variables && typeof input.content_variables === "object"
      ? (Object.fromEntries(
          Object.entries(input.content_variables as Record<string, unknown>).map(([key, value]) => [
            key,
            String(value),
          ]),
        ) as Record<string, string>)
      : undefined;

  const now = Date.now();
  assertWithinRateLimit(source, now);

  const results: DeliveryResult[] = [];
  for (const to of recipients) {
    const dedupeKey = `${to}|${body}`;
    if (isDuplicate(dedupeKey, now)) {
      log({ event: "duplicate_skipped", source, provider, to, status: "skipped" });
      results.push({
        to,
        status: "skipped",
        sid: null,
        error: "Mensaje idéntico enviado hace menos de un minuto",
      });
      continue;
    }

    try {
      const sent = await sendViaProvider(provider, to, body, { contentSid, contentVariables });
      rememberSend(dedupeKey, Date.now());
      log({ event: "sent", source, provider, to, status: sent.status, sid: sent.sid });
      results.push({ to, status: "sent", sid: sent.sid || null });
    } catch (error) {
      const isTwilio = error instanceof TwilioSendError;
      const message = error instanceof Error ? error.message : "Error desconocido";
      const code = isTwilio ? error.code : null;
      const hint = isTwilio ? error.hint : null;
      log({ event: "failed", source, provider, to, status: "failed", error: message, code });
      results.push({ to, status: "failed", sid: null, error: message, code, hint });
    }
  }

  const sent = results.filter((result) => result.status === "sent").length;
  return {
    ok: sent > 0,
    source,
    provider,
    priority,
    message_length: body.length,
    sent,
    failed: results.length - sent,
    results,
  };
}
