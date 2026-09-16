import { NextResponse } from "next/server";
import { assertSamyOsApiAuth, getSamyOsAdmin, getSamyOsOwnerId } from "@/lib/server/samy-os-admin";
import { runGatewayOperation, type GatewayInput } from "@/lib/server/gateway-operations";
import { DATABASE_UNREACHABLE, isDatabaseUnreachable } from "@/lib/server/gateway-errors";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    try {
      assertSamyOsApiAuth(request);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
      throw error;
    }

    const input = (await request.json()) as GatewayInput;
    const admin = getSamyOsAdmin();
    const userId = await getSamyOsOwnerId();

    return await runGatewayOperation(input, admin, userId);
  } catch (error) {
    console.error("ChatGPT gateway error", error);

    // Un 500 hace que ChatGPT anuncie un fallo del conector y se calle. Cuando
    // la causa es la base de datos caída preferimos un 200 con el motivo
    // escrito: así la voz lo lee y Samy sabe qué tiene que arreglar.
    if (isDatabaseUnreachable(error)) {
      return NextResponse.json({ ok: false, error: DATABASE_UNREACHABLE });
    }

    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
