import { NextResponse } from "next/server";
import { assertSamyOsCaller, getSamyOsAdmin } from "@/lib/server/samy-os-admin";
import { runGatewayOperation, type GatewayInput } from "@/lib/server/gateway-operations";

export const runtime = "nodejs";

// Same brain as /api/chatgpt (runGatewayOperation), different door: this one
// accepts the signed-in Samy OS browser session instead of the ChatGPT
// gateway token, so the dashboard UI and Walie's browser voice can call it
// directly without ever holding the server-only ASSISTANT_API_KEY.

export async function POST(request: Request) {
  try {
    let userId: string;
    try {
      userId = await assertSamyOsCaller(request);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }

    const input = (await request.json()) as GatewayInput;
    const admin = getSamyOsAdmin();

    return await runGatewayOperation(input, admin, userId);
  } catch (error) {
    console.error("Dashboard gateway error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
