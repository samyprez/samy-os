import { NextResponse } from "next/server";
import { buildSamyOsOpenApi } from "@/lib/server/openapi-schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildSamyOsOpenApi(origin));
}
