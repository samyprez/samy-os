import "server-only";

import { createHash } from "node:crypto";
import { getHubAdmin, hubConfigured } from "./hub";
import { normalizePhone } from "./notifications";
import { getSamyOsAdmin, getSamyOsOwnerId } from "./samy-os-admin";
import { sendTwilioWhatsApp, TwilioSendError } from "./twilio-whatsapp";
import { digitsOnly, lastInboundAt, maskPhone, recordTwilioOutbound } from "./whatsapp-inbox";

/**
 * WhatsApp to third parties: draft -> explicit approval -> send.
 *
 * - The recipient must be identified: a Hub client whose phone matches, or a
 *   number that has written to Samy's Twilio WhatsApp before.
 * - Free text only inside Meta's 24 h customer-service window; outside it an
 *   approved template (content_sid) is required. Checked again at send time.
 * - Approval quotes approval_hash, which covers recipient + text + template,
 *   so any change needs a new draft and a new approval.
 * - draft -> sending is a single conditional update, so a double click or a
 *   retried request cannot send twice.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

export class DraftError extends Error {
  constructor(message: string, public status: number, public code: string, public hint?: string) {
    super(message);
  }
}

function approvalHash(to: string, body: string | null, contentSid: string | null, vars: unknown) {
  return createHash("sha256")
    .update(JSON.stringify([digitsOnly(to), body ?? "", contentSid ?? "", vars ?? null]))
    .digest("hex")
    .slice(0, 16);
}

async function identifyRecipient(toDigits: string, hubClientId: string | null) {
  if (hubClientId) {
    if (!hubConfigured()) throw new DraftError("El Hub no está configurado", 503, "hub_not_configured");
    const { data, error } = await getHubAdmin()
      .from("clients")
      .select("id,company_name,contact_name,phone")
      .eq("id", hubClientId)
      .maybeSingle();
    if (error) throw new DraftError("No se pudo leer el cliente del Hub", 502, "hub_read_failed");
    if (!data) throw new DraftError("Cliente del Hub no encontrado", 404, "hub_client_not_found");
    const phone = data.phone ? normalizePhone(String(data.phone)) : null;
    if (!phone || digitsOnly(phone) !== toDigits) {
      throw new DraftError(
        "El número no coincide con el teléfono del cliente en el Hub",
        422,
        "recipient_mismatch",
        "Corrige el teléfono del cliente en el Hub o usa el número que tiene registrado.",
      );
    }
    return { source: "hub_client" as const, name: (data.contact_name || data.company_name || null) as string | null, hubClientId: String(data.id) };
  }
  const inbound = await lastInboundAt(toDigits);
  if (inbound) return { source: "inbound_history" as const, name: inbound.contactName, hubClientId: null };
  throw new DraftError(
    "Destinatario no identificado",
    422,
    "recipient_not_identified",
    "Indica hub_client_id de un cliente del Hub con ese teléfono, o espera a que esa persona escriba primero.",
  );
}

async function assertWindow(toDigits: string, hasTemplate: boolean) {
  if (hasTemplate) return;
  const inbound = await lastInboundAt(toDigits);
  if (!inbound || Date.now() - new Date(inbound.at).getTime() > WINDOW_MS) {
    throw new DraftError(
      "Fuera de la ventana de 24 h de WhatsApp",
      422,
      "outside_service_window",
      "Solo se puede escribir texto libre si esa persona escribió en las últimas 24 h. Usa una plantilla aprobada (content_sid).",
    );
  }
}

function preview(row: Record<string, unknown>) {
  return {
    draft_id: row.id,
    status: row.status,
    to: maskPhone(String(row.to_number)),
    contact_name: row.contact_name,
    recipient_source: row.recipient_source,
    body: row.body,
    content_sid: row.content_sid,
    approval_hash: row.approval_hash,
    created_at: row.created_at,
  };
}

export async function createDraft(input: {
  to?: unknown; body?: unknown; content_sid?: unknown; content_variables?: unknown; hub_client_id?: unknown;
}) {
  const normalized = typeof input.to === "string" ? normalizePhone(input.to) : null;
  if (!normalized) throw new DraftError("Número inválido", 400, "invalid_recipient", "Formato E.164, p. ej. +16475550123.");
  const toDigits = digitsOnly(normalized);
  const body = typeof input.body === "string" && input.body.trim() ? input.body.trim() : null;
  const contentSid = typeof input.content_sid === "string" && /^HX[0-9a-f]{32}$/i.test(input.content_sid.trim()) ? input.content_sid.trim() : null;
  if (input.content_sid != null && !contentSid) throw new DraftError("content_sid inválido", 400, "invalid_content_sid");
  if (!body && !contentSid) throw new DraftError("Falta body o content_sid", 400, "empty_message");
  if (body && body.length > 1600) throw new DraftError("Texto demasiado largo (máx. 1600)", 400, "body_too_long");
  const vars = input.content_variables && typeof input.content_variables === "object" ? input.content_variables : null;

  const recipient = await identifyRecipient(toDigits, typeof input.hub_client_id === "string" ? input.hub_client_id : null);
  await assertWindow(toDigits, Boolean(contentSid));

  const admin = getSamyOsAdmin();
  const { data, error } = await admin
    .from("whatsapp_drafts")
    .insert({
      user_id: await getSamyOsOwnerId(),
      to_number: toDigits,
      contact_name: recipient.name,
      hub_client_id: recipient.hubClientId,
      recipient_source: recipient.source,
      body,
      content_sid: contentSid,
      content_variables: vars,
      approval_hash: approvalHash(toDigits, body, contentSid, vars),
    })
    .select("*")
    .single();
  if (error) throw new DraftError("No se pudo guardar el borrador", 500, "draft_store_failed");
  return {
    ok: true,
    draft: preview(data),
    next_step:
      "Muestra a Samy destinatario y texto exactos. Solo si los aprueba, llama approve_and_send con draft_id, approval_hash y approved: true.",
  };
}

export async function approveAndSend(input: { draft_id?: unknown; approval_hash?: unknown; approved?: unknown }) {
  if (input.approved !== true) throw new DraftError("Falta aprobación explícita (approved: true)", 400, "approval_required");
  if (typeof input.draft_id !== "string" || typeof input.approval_hash !== "string") {
    throw new DraftError("Faltan draft_id o approval_hash", 400, "invalid_request");
  }
  const admin = getSamyOsAdmin();
  const userId = await getSamyOsOwnerId();
  const { data: draft } = await admin
    .from("whatsapp_drafts").select("*").eq("id", input.draft_id).eq("user_id", userId).maybeSingle();
  if (!draft) throw new DraftError("Borrador no encontrado", 404, "draft_not_found");
  if (draft.status !== "draft") throw new DraftError(`El borrador ya está en estado ${draft.status}`, 409, "draft_not_pending");
  const expected = approvalHash(draft.to_number, draft.body, draft.content_sid, draft.content_variables);
  if (input.approval_hash !== draft.approval_hash || expected !== draft.approval_hash) {
    throw new DraftError("La aprobación no corresponde a este texto", 409, "approval_mismatch", "Crea un borrador nuevo y vuelve a pedir aprobación.");
  }
  await assertWindow(draft.to_number, Boolean(draft.content_sid));

  // Claim the draft atomically; a second request finds no row and stops.
  const { data: claimed } = await admin
    .from("whatsapp_drafts")
    .update({ status: "sending", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", draft.id).eq("status", "draft").select("id");
  if (!claimed?.length) throw new DraftError("El borrador ya se está enviando", 409, "draft_not_pending");

  try {
    const sent = await sendTwilioWhatsApp({
      to: `+${draft.to_number}`,
      body: draft.body ?? undefined,
      contentSid: draft.content_sid ?? undefined,
      contentVariables: draft.content_variables ?? undefined,
    });
    await admin.from("whatsapp_drafts")
      .update({ status: "sent", provider_message_id: sent.sid, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    await recordTwilioOutbound({ sid: sent.sid, to: draft.to_number, from: sent.from, body: draft.body, status: sent.status, source: "draft" }).catch(() => {});
    return { ok: true, draft_id: draft.id, status: "sent", provider_status: sent.status, sid: sent.sid, to: maskPhone(draft.to_number) };
  } catch (error) {
    const code = error instanceof TwilioSendError ? error.code : null;
    await admin.from("whatsapp_drafts")
      .update({ status: "failed", error: code ? `twilio_${code}` : "send_failed", updated_at: new Date().toISOString() })
      .eq("id", draft.id);
    throw new DraftError(
      "Twilio rechazó el envío",
      502,
      "send_failed",
      error instanceof TwilioSendError ? error.hint ?? undefined : undefined,
    );
  }
}

export async function cancelDraft(draftId: unknown) {
  if (typeof draftId !== "string") throw new DraftError("Falta draft_id", 400, "invalid_request");
  const { data } = await getSamyOsAdmin()
    .from("whatsapp_drafts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", draftId).eq("user_id", await getSamyOsOwnerId()).eq("status", "draft").select("id");
  if (!data?.length) throw new DraftError("Borrador no encontrado o ya no está pendiente", 409, "draft_not_pending");
  return { ok: true, draft_id: draftId, status: "cancelled" };
}

export async function listDrafts(limit = 20) {
  const { data, error } = await getSamyOsAdmin()
    .from("whatsapp_drafts").select("*").eq("user_id", await getSamyOsOwnerId())
    .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new DraftError("No se pudieron leer los borradores", 500, "draft_read_failed");
  return { ok: true, drafts: (data ?? []).map(preview) };
}
