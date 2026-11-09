import "server-only";

import { getSamyOsAdmin, getSamyOsOwnerId } from "./samy-os-admin";

/**
 * Durable record of Twilio WhatsApp traffic in public.whatsapp_messages
 * (migration 003 + 004). Phones are stored as E.164 without the +, the same
 * shape the Meta webhook and clients.whatsapp_phone already use.
 */

export function digitsOnly(phone: string) {
  return (phone || "").replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/** For logs and diagnostics: never print a full number. */
export function maskPhone(phone: string) {
  const d = digitsOnly(phone);
  return d.length > 4 ? `***${d.slice(-4)}` : "***";
}

// Twilio may deliver callbacks out of order or replay them; a status only
// moves forward, so an old "sent" can never overwrite "delivered".
const STATUS_RANK: Record<string, number> = {
  accepted: 1, scheduled: 1, queued: 2, sending: 3, sent: 4,
  delivered: 5, read: 6, undelivered: 7, failed: 7, canceled: 7,
};

export type TwilioInbound = {
  sid: string;
  from: string;
  to: string;
  body: string | null;
  profileName: string | null;
  numMedia: number;
  mediaType: string | null;
};

/** Insert-only: a replayed webhook with the same MessageSid is ignored. */
export async function storeTwilioInbound(m: TwilioInbound) {
  const admin = getSamyOsAdmin();
  const userId = await getSamyOsOwnerId();
  const from = digitsOnly(m.from);

  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .eq("whatsapp_phone", from)
    .maybeSingle();

  const { error } = await admin.from("whatsapp_messages").upsert(
    {
      user_id: userId,
      client_id: client?.id ?? null,
      provider: "twilio",
      wa_message_id: m.sid,
      direction: "in",
      from_number: from,
      to_number: digitsOnly(m.to),
      contact_name: m.profileName,
      body: m.body,
      // Media URLs from Twilio need the account credentials to fetch, so only
      // the type is kept; the file stays in Twilio.
      message_type: m.numMedia > 0 ? m.mediaType || "media" : "text",
      media_url: null,
      status: "received",
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`inbound_store_failed: ${error.message}`);
}

export async function recordTwilioOutbound(input: {
  sid: string;
  to: string;
  from: string | null;
  body: string | null;
  status: string;
  source: string;
}) {
  const admin = getSamyOsAdmin();
  const userId = await getSamyOsOwnerId();
  const { error } = await admin.from("whatsapp_messages").upsert(
    {
      user_id: userId,
      provider: "twilio",
      source: input.source,
      wa_message_id: input.sid,
      direction: "out",
      from_number: digitsOnly(input.from || process.env.TWILIO_WHATSAPP_FROM || ""),
      to_number: digitsOnly(input.to),
      body: input.body,
      status: input.status || "queued",
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`outbound_store_failed: ${error.message}`);
}

/** Applies a delivery receipt only if it advances the stored status. */
export async function applyTwilioStatus(sid: string, status: string, errorCode: string | null) {
  const admin = getSamyOsAdmin();
  const { data: row } = await admin
    .from("whatsapp_messages")
    .select("id,status")
    .eq("wa_message_id", sid)
    .maybeSingle();
  if (!row) return "unknown_message";
  if ((STATUS_RANK[status] ?? 0) <= (STATUS_RANK[row.status] ?? 0)) return "stale_or_duplicate";
  const { error } = await admin
    .from("whatsapp_messages")
    .update({ status, error: errorCode ? `twilio_${errorCode}` : null, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(`status_update_failed: ${error.message}`);
  return "updated";
}

/** Newest inbound from this number, for the 24 h customer-service window. */
export async function lastInboundAt(phone: string) {
  const admin = getSamyOsAdmin();
  const userId = await getSamyOsOwnerId();
  const { data } = await admin
    .from("whatsapp_messages")
    .select("sent_at,contact_name")
    .eq("user_id", userId)
    .eq("direction", "in")
    .eq("from_number", digitsOnly(phone))
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { at: data.sent_at as string, contactName: (data.contact_name as string | null) ?? null } : null;
}

/**
 * Evidence for diagnostics: when Twilio last confirmed a delivery and when a
 * signed inbound last arrived. Returns timestamps only, never content.
 */
export async function twilioTrafficEvidence() {
  const admin = getSamyOsAdmin();
  const newest = async (direction: "in" | "out", statuses?: string[]) => {
    let q = admin
      .from("whatsapp_messages")
      .select("sent_at,updated_at")
      .eq("provider", "twilio")
      .eq("direction", direction);
    if (statuses) q = q.in("status", statuses);
    const { data, error } = await q.order("sent_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? ((data.updated_at || data.sent_at) as string) : null;
  };
  return {
    last_delivered_at: await newest("out", ["delivered", "read"]),
    last_accepted_at: await newest("out", ["queued", "sent", "delivered", "read"]),
    last_inbound_at: await newest("in"),
  };
}

/** Read-only inbox for the assistant: newest first, numbers masked. */
export async function listWhatsAppMessages(opts: { query?: string; limit?: number } = {}) {
  const admin = getSamyOsAdmin();
  const userId = await getSamyOsOwnerId();
  let q = admin
    .from("whatsapp_messages")
    .select("wa_message_id,provider,direction,from_number,to_number,contact_name,body,message_type,status,sent_at")
    .eq("user_id", userId);
  const search = opts.query?.trim().replace(/[,%()]/g, " ");
  if (search) q = q.or(`body.ilike.%${search}%,contact_name.ilike.%${search}%`);
  const { data, error } = await q.order("sent_at", { ascending: false }).limit(Math.min(Math.max(opts.limit ?? 10, 1), 25));
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: m.wa_message_id,
    provider: m.provider,
    direction: m.direction,
    counterpart: maskPhone(m.direction === "in" ? m.from_number : m.to_number),
    contact_name: m.contact_name,
    body: m.body,
    type: m.message_type,
    status: m.status,
    at: m.sent_at,
  }));
}
