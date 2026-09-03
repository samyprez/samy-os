import { NextResponse } from "next/server";
import { OAuthError, registerClient } from "@/lib/server/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registro dinámico de clientes. ChatGPT se da de alta solo la primera vez;
 * el client_id que recibe es su propio registro firmado, así que no se guarda nada.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { redirect_uris?: unknown };
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
    const client = registerClient(uris);

    return NextResponse.json(
      {
        client_id: client.client_id,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
      { status: 201, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
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
