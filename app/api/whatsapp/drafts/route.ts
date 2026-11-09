import { NextResponse } from "next/server";
import { assertSamyOsApiAuth } from "@/lib/server/samy-os-admin";
import { approveAndSend, cancelDraft, createDraft, DraftError, listDrafts } from "@/lib/server/whatsapp-drafts";

export const runtime = "nodejs";

/**
 * WhatsApp to third parties. Server-to-server only (Bearer ASSISTANT_API_KEY).
 * POST { action: "create" | "approve_and_send" | "cancel", ... }
 * GET  lists recent drafts with masked numbers.
 */

function fail(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof DraftError) {
    return NextResponse.json({ ok: false, error: error.code, message: error.message, hint: error.hint ?? null }, { status: error.status });
  }
  console.error("[whatsapp-drafts]", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    assertSamyOsApiAuth(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") || 20);
    return NextResponse.json(await listDrafts(Number.isFinite(limit) ? limit : 20));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSamyOsApiAuth(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new DraftError("JSON inválido", 400, "invalid_json");
    switch (body.action) {
      case "create": return NextResponse.json(await createDraft(body));
      case "approve_and_send": return NextResponse.json(await approveAndSend(body));
      case "cancel": return NextResponse.json(await cancelDraft(body.draft_id));
      default: throw new DraftError("action debe ser create, approve_and_send o cancel", 400, "invalid_action");
    }
  } catch (error) {
    return fail(error);
  }
}
