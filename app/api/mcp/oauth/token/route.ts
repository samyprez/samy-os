import { NextResponse } from "next/server";
import { ACCESS_TOKEN_TTL_SECONDS, OAuthError, redeemCode } from "@/lib/server/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*" };
}

export async function POST(request: Request) {
  try {
    // El cuerpo llega como formulario según el estándar, pero algunos clientes
    // mandan JSON. Aceptar los dos cuesta cuatro líneas y evita un fallo opaco.
    const contentType = request.headers.get("content-type") || "";
    let params: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      params = (await request.json().catch(() => ({}))) as Record<string, string>;
    } else {
      const form = await request.formData();
      for (const [key, value] of form.entries()) params[key] = String(value);
    }

    if (params.grant_type !== "authorization_code") {
      throw new OAuthError("unsupported_grant_type", "Solo se admite authorization_code");
    }

    const token = redeemCode(
      params.code || "",
      params.client_id || "",
      params.redirect_uri || "",
      params.code_verifier || "",
    );

    return NextResponse.json(
      { access_token: token, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, scope: "mcp" },
      { headers: { ...corsHeaders(), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json(
        { error: error.code, error_description: error.message },
        { status: error.status, headers: corsHeaders() },
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
