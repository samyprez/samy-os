import { NextResponse } from "next/server";
import { interpretMessage } from "@/lib/server/assistant-engine";
import { assertSamyOsCaller } from "@/lib/server/samy-os-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    try {
      await assertSamyOsCaller(request);
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
    return NextResponse.json(action);
  } catch (error) {
    console.error("Walie error", error);
    return NextResponse.json({ error: "Walie no pudo interpretar la instrucción." }, { status: 500 });
  }
}
