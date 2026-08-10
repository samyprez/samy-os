import { NextResponse } from "next/server";
import { getSamyOsAdmin, getSamyOsOwnerId } from "@/lib/server/samy-os-admin";
import {
  normalizePhone,
  parseWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "@/lib/server/whatsapp";

export const runtime = "nodejs";

/**
 * Meta's one-time subscription check. It sends hub.challenge and expects it
 * echoed back as plain text — a JSON body fails the verification.
 */
export async function GET(request: Request) {
  const challenge = verifyWebhookChallenge(new URL(request.url).searchParams);
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Meta retries on any non-200 and delivers at least once, so this handler
 * must be idempotent and must not fail on a message it cannot store. Every
 * path below returns 200; problems are logged rather than surfaced, because
 * a 500 here means Meta redelivers the same message indefinitely.
 */
export async function POST(request: Request) {
  // The signature covers the raw bytes, so the body must be read as text
  // before parsing — re-serialising JSON would change it.
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    // Not Meta, or the app secret is wrong. Refuse rather than accept a
    // forged message into Samuel's client history.
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  const { inbound, statuses } = parseWebhookPayload(payload);
  if (!inbound.length && !statuses.length) {
    return NextResponse.json({ ok: true, ignored: "no messages" });
  }

  try {
    const admin = getSamyOsAdmin();
    const userId = await getSamyOsOwnerId();

    if (inbound.length) {
      // Resolve which client each number belongs to, in one query.
      const numbers = [...new Set(inbound.map((m) => m.from_number))];
      const { data: clients } = await admin
        .from("clients")
        .select("id,whatsapp_phone")
        .eq("user_id", userId)
        .in("whatsapp_phone", numbers);

      const clientByPhone = new Map<string, string>();
      for (const c of clients || []) {
        if (c.whatsapp_phone) clientByPhone.set(normalizePhone(c.whatsapp_phone), c.id);
      }

      const rows = inbound.map((m) => ({
        user_id: userId,
        client_id: clientByPhone.get(m.from_number) || null,
        wa_message_id: m.wa_message_id,
        direction: "in" as const,
        from_number: m.from_number,
        to_number: m.to_number,
        contact_name: m.contact_name,
        body: m.body,
        message_type: m.message_type,
        media_url: m.media_url,
        status: "received",
        sent_at: m.sent_at,
      }));

      // Upsert on wa_message_id: a retried delivery updates instead of
      // inserting a duplicate.
      const { error } = await admin
        .from("whatsapp_messages")
        .upsert(rows, { onConflict: "wa_message_id" });
      if (error) console.error("WhatsApp inbound store failed", error.message);
    }

    for (const s of statuses) {
      const { error } = await admin
        .from("whatsapp_messages")
        .update({ status: s.status, error: s.error, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("wa_message_id", s.wa_message_id);
      if (error) console.error("WhatsApp status update failed", error.message);
    }
  } catch (error) {
    // Still 200. Meta must not retry forever because our database blinked.
    console.error("WhatsApp webhook error", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, stored: false });
  }

  return NextResponse.json({ ok: true, inbound: inbound.length, statuses: statuses.length });
}
