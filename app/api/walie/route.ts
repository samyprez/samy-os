import { NextResponse } from "next/server";
import { interpretMessage, runAssistantAction } from "@/lib/server/assistant-engine";
import { assertSamyOsCaller, getSamyOsAdmin } from "@/lib/server/samy-os-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let userId: string;
    try {
      userId = await assertSamyOsCaller(request);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }
      throw error;
    }

    const input = (await request.json()) as { transcript?: string; now?: string; timezone?: string };
    const transcript = input.transcript?.trim();
    if (!transcript) return NextResponse.json({ error: "No recibí ninguna instrucción." }, { status: 400 });

    const action = await interpretMessage(transcript, input.now, input.timezone);

    // "none" usually means Walie needs a missing detail or is redirecting
    // (e.g. sending mail) — nothing to execute, just relay its own response.
    if (action.action === "none") {
      return NextResponse.json({ message: action.response || "No pude completar la acción.", action });
    }

    const admin = getSamyOsAdmin();
    const result = await runAssistantAction(action, admin, userId);
    return NextResponse.json({ message: result.message, success: result.success, action });
  } catch (error) {
    console.error("Walie error", error);
    return NextResponse.json({ error: "Walie no pudo interpretar la instrucción." }, { status: 500 });
  }
}
