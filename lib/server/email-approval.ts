import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovedDraft = {
  from: string; to: string; cc: string; bcc: string; subject: string; body: string;
  attachments: never[]; reply_to_message_id: string;
};
export type ApprovalRecord = {
  id: string; principal: string; draft_hash: string; expires_at: string;
  state: "prepared" | "processing" | "sent" | "unknown";
};
export interface ApprovalStore {
  create(record: ApprovalRecord): Promise<void>;
  // Must atomically transition prepared -> processing, matching ALL predicates.
  claim(id: string, principal: string, hash: string, now: string): Promise<boolean>;
  finish(id: string, principal: string, state: "sent" | "unknown", providerId?: string): Promise<void>;
}

export function normalizeDraft(input: unknown): ApprovedDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid draft");
  const d = input as Record<string, unknown>;
  const allowed = ["from", "to", "cc", "bcc", "subject", "body", "attachments", "reply_to_message_id"];
  if (Object.keys(d).some(key => !allowed.includes(key))) throw Error("Unsupported draft field");
  const text = (key: string, required = false, header = true) => {
    const v = d[key] ?? "";
    if (typeof v !== "string" || (header && /[\r\n\x00]/.test(v))) throw Error("Invalid draft field");
    const value = header ? v.trim() : v;
    if (required && !value.trim()) throw Error("Missing draft field");
    return value;
  };
  if (d.attachments !== undefined && (!Array.isArray(d.attachments) || d.attachments.length)) throw Error("Attachments are not supported yet");
  const bcc = text("bcc");
  if (bcc) throw Error("BCC is not supported yet");
  const draft: ApprovedDraft = { from: text("from", true), to: text("to", true), cc: text("cc"), bcc, subject: text("subject", true), body: text("body", true, false), attachments: [], reply_to_message_id: text("reply_to_message_id") };
  if (Buffer.byteLength(JSON.stringify(draft)) > 100_000) throw Error("Draft too large");
  return draft;
}
export function draftHash(draft: ApprovedDraft) {
  return createHash("sha256").update(JSON.stringify(normalizeDraft(draft))).digest("hex");
}
export function createEmailApprovalService(store: ApprovalStore, now = () => Date.now()) {
  return {
    async prepare(principal: string, input: unknown) {
      if (!principal) throw Error("Unauthorized");
      const draft = normalizeDraft(input);
      const record: ApprovalRecord = { id: randomUUID(), principal, draft_hash: draftHash(draft), expires_at: new Date(now() + 15 * 60_000).toISOString(), state: "prepared" };
      await store.create(record); // Fail closed on unavailable persistence.
      return { approval_id: record.id, expires_at: record.expires_at, draft };
    },
    async execute(principal: string, approvalId: string, input: unknown, approved: boolean, send: (draft: ApprovedDraft) => Promise<{ id: string }>) {
      if (!principal || approved !== true) throw Error("Explicit approval required");
      if (!/^[0-9a-f-]{36}$/i.test(approvalId)) throw Error("Invalid approval ID");
      const draft = normalizeDraft(input);
      // Claim BEFORE any provider call. No automatic reset/retry after this point.
      if (!await store.claim(approvalId, principal, draftHash(draft), new Date(now()).toISOString())) {
        throw Error("Approval expired, changed, unavailable or already used. Do not resend without checking delivery.");
      }
      let sent: { id: string };
      try {
        sent = await send(draft);
        if (!sent.id) throw Error("Missing provider receipt");
      } catch {
        await store.finish(approvalId, principal, "unknown").catch(() => {});
        throw Error("Delivery uncertain. Check Sent mail before preparing another approval; automatic retry is blocked.");
      }
      try { await store.finish(approvalId, principal, "sent", sent.id); }
      catch { return { status: "sent_audit_pending" as const, provider_id: sent.id, approval_id: approvalId }; }
      return { status: "sent" as const, provider_id: sent.id, approval_id: approvalId };
    }
  };
}

// Server-only adapter for the ORIGINAL Samy OS database; never the business Hub.
// Not enabled in routes until schema/access and real concurrency tests pass.
export function supabaseApprovalStore(admin: SupabaseClient): ApprovalStore {
  return {
    async create(record) {
      const { error } = await admin.from("email_send_approvals").insert(record);
      if (error) throw Error("Approval storage unavailable");
    },
    async claim(id, principal, hash, now) {
      const { data, error } = await admin.from("email_send_approvals")
        .update({ state: "processing", claimed_at: now })
        .eq("id", id).eq("principal", principal).eq("draft_hash", hash)
        .eq("state", "prepared").gt("expires_at", now).select("id").maybeSingle();
      if (error) throw Error("Approval storage unavailable");
      return Boolean(data);
    },
    async finish(id, principal, state, providerId) {
      const { data, error } = await admin.from("email_send_approvals")
        .update({ state, provider_id: providerId ?? null })
        .eq("id", id).eq("principal", principal).eq("state", "processing")
        .select("id").maybeSingle();
      if (error || !data) throw Error("Approval audit update unavailable");
    }
  };
}
