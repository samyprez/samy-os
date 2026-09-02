import "server-only";

/**
 * Twilio WhatsApp transport for the notification gateway.
 *
 * Twilio is the provider Samuel asked for because it works in both modes with
 * the same code: the Sandbox during development (each recipient joins once by
 * texting a code) and a registered WhatsApp Sender in production.
 *
 * Everything here is transport only — no validation, no formatting, no
 * recipient book. Those live in lib/server/notifications.ts so a second
 * provider can be swapped in without touching them.
 */

const DEFAULT_API_BASE = "https://api.twilio.com";

export const TWILIO_ENV_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] as const;

export function missingTwilioEnvVars() {
  const missing = TWILIO_ENV_VARS.filter((name) => !process.env[name]?.trim());
  // Either a From number or a Messaging Service is enough to address a message.
  if (!process.env.TWILIO_WHATSAPP_FROM?.trim() && !process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()) {
    missing.push("TWILIO_WHATSAPP_FROM" as (typeof TWILIO_ENV_VARS)[number]);
  }
  return missing as string[];
}

export function twilioConfigured() {
  return missingTwilioEnvVars().length === 0;
}

/** Twilio addresses WhatsApp endpoints as `whatsapp:+E164`. */
function channelAddress(e164: string) {
  const trimmed = e164.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

export type TwilioSendInput = {
  to: string;
  body?: string;
  /** Approved Content template, required outside the 24h service window. */
  contentSid?: string;
  contentVariables?: Record<string, string>;
};

export type TwilioSendResult = {
  sid: string;
  status: string;
  to: string;
  from: string | null;
};

export class TwilioSendError extends Error {
  code: number | null;
  httpStatus: number;
  hint: string | null;

  constructor(message: string, httpStatus: number, code: number | null, hint: string | null) {
    super(message);
    this.name = "TwilioSendError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.hint = hint;
  }
}

/**
 * The Twilio error codes that actually mean "Samuel has to do something",
 * turned into a sentence he can act on instead of a number he has to look up.
 */
function hintForTwilioCode(code: number | null): string | null {
  switch (code) {
    case 63015:
    case 63016:
      return "Fuera de la ventana de 24 horas de WhatsApp: hay que enviar una plantilla aprobada (content_sid) en vez de texto libre.";
    case 63007:
      return "TWILIO_WHATSAPP_FROM no es un remitente de WhatsApp válido en esta cuenta. En Sandbox suele ser +14155238886.";
    case 63018:
      return "Límite de envíos de Twilio alcanzado. Reintenta más tarde.";
    case 21610:
      return "El destinatario canceló la suscripción (respondió STOP). Debe volver a escribir para reactivarla.";
    case 21211:
    case 21614:
      return "Número de destino inválido para WhatsApp.";
    case 20003:
      return "Credenciales de Twilio rechazadas: revisa TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN.";
    case 63024:
      return "El destinatario no está unido al Sandbox de Twilio: debe enviar el código 'join <palabras>' al número del Sandbox por WhatsApp.";
    default:
      return null;
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function sendTwilioWhatsApp(input: TwilioSendInput): Promise<TwilioSendResult> {
  const accountSid = required("TWILIO_ACCOUNT_SID");
  const authToken = required("TWILIO_AUTH_TOKEN");
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (!from && !messagingServiceSid) throw new Error("Missing TWILIO_WHATSAPP_FROM");

  const base = process.env.TWILIO_API_BASE_URL?.trim() || DEFAULT_API_BASE;

  const form = new URLSearchParams();
  form.set("To", channelAddress(input.to));
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
  else if (from) form.set("From", channelAddress(from));
  if (input.contentSid) {
    form.set("ContentSid", input.contentSid);
    if (input.contentVariables) form.set("ContentVariables", JSON.stringify(input.contentVariables));
  }
  if (input.body) form.set("Body", input.body);

  const res = await fetch(`${base}/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      // Basic auth. The token never leaves this function and is never logged.
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      // El charset es obligatorio, no decorativo: sin él Twilio no interpreta
      // los bytes como UTF-8 y los acentos llegan al teléfono como `�`.
      // Los avisos de Samuel van en español, así que esto se nota en todos.
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: form.toString(),
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Twilio answers JSON on every path we care about; a non-JSON body means
    // something in front of Twilio (a proxy, an outage page) answered instead.
  }

  if (!res.ok) {
    const code = typeof parsed.code === "number" ? parsed.code : null;
    const message =
      (typeof parsed.message === "string" && parsed.message) || text.slice(0, 300) || `Twilio HTTP ${res.status}`;
    throw new TwilioSendError(message, res.status, code, hintForTwilioCode(code));
  }

  const sid = typeof parsed.sid === "string" ? parsed.sid : "";
  if (!sid) throw new TwilioSendError("Twilio no devolvió un Message SID", 502, null, null);

  return {
    sid,
    status: typeof parsed.status === "string" ? parsed.status : "queued",
    to: typeof parsed.to === "string" ? parsed.to : channelAddress(input.to),
    from: typeof parsed.from === "string" ? parsed.from : (from ?? null),
  };
}
