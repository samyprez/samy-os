import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Business Cloud API for Samy OS.
 *
 * Coexistence is enabled on the number, so Samuel keeps using the WhatsApp
 * Business app on his phone and this API sees the same conversations.
 *
 * Two constraints from Meta shape everything here:
 *
 *  - The 24h customer service window. Free-form text is only allowed within
 *    24 hours of the contact's last inbound message. Outside it, only an
 *    approved template may be sent. `canSendFreeform` decides which.
 *  - Webhooks are delivered at least once and retried on any non-200, so
 *    handlers must be idempotent and must answer 200 quickly.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function missingWhatsAppEnvVars() {
  return [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
  ].filter((name) => !process.env[name]?.trim());
}

export function whatsappConfigured() {
  return missingWhatsAppEnvVars().length === 0;
}

/** Meta sends and expects E.164 without the +, e.g. 16474692835. */
export function normalizePhone(input: string) {
  const digits = (input || "").replace(/\D/g, "");
  // A 10-digit Canadian/US number arrives without the country code when a
  // human types it; Meta always includes it.
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

/**
 * Meta signs every webhook with HMAC-SHA256 over the raw body using the app
 * secret. Without this check the endpoint is a public write into Samuel's
 * client history — anyone could forge messages from a client.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) return false;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Meta's one-time GET challenge when the webhook URL is registered. */
export function verifyWebhookChallenge(params: URLSearchParams) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (!verifyToken || mode !== "subscribe" || token !== verifyToken) return null;
  return challenge;
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${required("WHATSAPP_ACCESS_TOKEN")}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; error_user_msg?: string } };
      detail = parsed.error?.error_user_msg || parsed.error?.message || detail;
    } catch {}
    throw new Error(`WhatsApp API ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

type SendResult = { messages?: { id: string }[] };

export async function sendWhatsAppText(to: string, body: string) {
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const recipient = normalizePhone(to);

  const result = await graph<SendResult>(`/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  return { wa_message_id: result.messages?.[0]?.id || null, to: recipient };
}

/**
 * Outside the 24h window only approved templates may be sent. `components`
 * fills the template's {{1}}, {{2}} placeholders in order.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[] = [],
) {
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const recipient = normalizePhone(to);

  const result = await graph<SendResult>(`/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParameters.length
          ? [{ type: "body", parameters: bodyParameters.map((text) => ({ type: "text", text })) }]
          : undefined,
      },
    }),
  });

  return { wa_message_id: result.messages?.[0]?.id || null, to: recipient, template: templateName };
}

export type InboundMessage = {
  wa_message_id: string;
  from_number: string;
  to_number: string;
  contact_name: string | null;
  body: string | null;
  message_type: string;
  media_url: string | null;
  sent_at: string;
};

export type StatusUpdate = {
  wa_message_id: string;
  status: string;
  error: string | null;
};

type WebhookValue = {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string; caption?: string };
    document?: { id?: string; filename?: string };
    audio?: { id?: string };
    button?: { text?: string };
    interactive?: { list_reply?: { title?: string }; button_reply?: { title?: string } };
  }[];
  statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
};

/**
 * Flattens Meta's deeply nested envelope into the two things that matter:
 * new inbound messages, and delivery updates for messages we sent.
 */
export function parseWebhookPayload(payload: unknown) {
  const inbound: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];

  const entries = (payload as { entry?: { changes?: { value?: WebhookValue }[] }[] })?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      const businessNumber = value.metadata?.display_phone_number || "";
      const nameByWaId = new Map<string, string>();
      for (const contact of value.contacts || []) {
        if (contact.wa_id && contact.profile?.name) nameByWaId.set(contact.wa_id, contact.profile.name);
      }

      for (const message of value.messages || []) {
        // Non-text types carry no body; keep a readable placeholder so the
        // assistant can still say "he sent a photo" rather than nothing.
        const body =
          message.text?.body ??
          message.image?.caption ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          (message.type === "image"
            ? "[imagen]"
            : message.type === "document"
              ? `[documento${message.document?.filename ? `: ${message.document.filename}` : ""}]`
              : message.type === "audio"
                ? "[audio]"
                : `[${message.type}]`);

        inbound.push({
          wa_message_id: message.id,
          from_number: normalizePhone(message.from),
          to_number: normalizePhone(businessNumber),
          contact_name: nameByWaId.get(message.from) || null,
          body,
          message_type: message.type,
          media_url: null,
          sent_at: new Date(Number(message.timestamp) * 1000).toISOString(),
        });
      }

      for (const status of value.statuses || []) {
        statuses.push({
          wa_message_id: status.id,
          status: status.status,
          error: status.errors?.[0]?.message || status.errors?.[0]?.title || null,
        });
      }
    }
  }

  return { inbound, statuses };
}

/**
 * True when the contact wrote within the last 24 hours, which is the only
 * time free-form text is allowed. Callers fall back to a template.
 */
export function canSendFreeform(lastInboundAt: string | null | undefined) {
  if (!lastInboundAt) return false;
  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  return elapsed < 24 * 60 * 60 * 1000;
}
