import { validateTwilioSignature } from "@/lib/server/twilio-whatsapp";
import { applyTwilioStatus, maskPhone, storeTwilioInbound } from "@/lib/server/whatsapp-inbox";

export const runtime = "nodejs";

/**
 * Twilio WhatsApp webhook: inbound messages ("A message comes in") and
 * delivery receipts (StatusCallback) on one signed URL.
 *
 * Separate from /api/whatsapp/webhook, which is the Meta Cloud API webhook
 * and verifies a different signature. Neither replaces the other.
 *
 * Replay/idempotency: Twilio signs the request but not a timestamp, so a
 * captured request could be resent. That is harmless here: inbound rows are
 * insert-only on MessageSid, and receipts only move a status forward.
 */

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = (status = 200) =>
  new Response(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });

function log(event: string, fields: Record<string, unknown> = {}) {
  // Operational only: no body, no full numbers, no tokens.
  console.log(`[twilio-webhook] ${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}`);
}

/** The URL Twilio signed: the configured public URL, or the one we received. */
function candidateUrls(request: Request) {
  const configured = process.env.TWILIO_WEBHOOK_URL?.trim();
  const urls = [configured, request.url].filter((u): u is string => Boolean(u));
  return [...new Set(urls)];
}

export async function POST(request: Request) {
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
    log("rejected", { reason: "auth_token_not_configured" });
    return new Response("Webhook not configured", { status: 503 });
  }

  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;

  const signature = request.headers.get("x-twilio-signature");
  const valid = candidateUrls(request).some((url) => validateTwilioSignature(url, params, signature));
  if (!valid) {
    log("rejected", { reason: "invalid_signature" });
    return new Response("Invalid signature", { status: 403 });
  }

  const expectedAccount = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (expectedAccount && params.AccountSid !== expectedAccount) {
    log("rejected", { reason: "account_mismatch" });
    return new Response("Wrong account", { status: 403 });
  }

  const sid = params.MessageSid || params.SmsSid || "";
  if (!sid) return twiml();

  try {
    const messageStatus = params.MessageStatus || "";
    if (messageStatus && messageStatus !== "received") {
      const result = await applyTwilioStatus(sid, messageStatus, params.ErrorCode || null);
      log("status", { sid, status: messageStatus, result, error_code: params.ErrorCode || null });
      return twiml();
    }

    if (!/^whatsapp:/i.test(params.From || "")) {
      // SMS to the same number is out of scope for this route.
      log("ignored", { sid, reason: "not_whatsapp" });
      return twiml();
    }

    await storeTwilioInbound({
      sid,
      from: params.From,
      to: params.To || "",
      body: params.Body ?? null,
      profileName: params.ProfileName || null,
      numMedia: Number(params.NumMedia || 0),
      mediaType: params.MediaContentType0 || null,
    });
    log("inbound", { sid, from: maskPhone(params.From), media: Number(params.NumMedia || 0) });
  } catch (error) {
    // 200 anyway: the message stays in Twilio's log and can be recovered;
    // a 5xx would only make Twilio hit the fallback URL.
    log("store_failed", { sid, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
  }

  return twiml();
}
