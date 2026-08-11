import { NextResponse } from "next/server";
import { GMAIL_SCOPES } from "@/lib/server/gmail";
import { CALENDAR_SCOPES } from "@/lib/server/calendar";
import { matchesSamyOsSecret, readBearerToken } from "@/lib/server/samy-os-admin";

export const runtime = "nodejs";

/**
 * One-time OAuth start. Left open, anyone who found the URL could walk the
 * consent screen and — with a Google account of their own — burn the client's
 * quota, so it takes the gateway token. A browser following a redirect cannot
 * set an Authorization header, hence the ?token= fallback: same secret, same
 * timing-safe compare.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supplied = readBearerToken(request) || url.searchParams.get("token")?.trim() || "";

  if (!process.env.ASSISTANT_API_KEY && !process.env.SAMY_OS_API_TOKEN) {
    return NextResponse.json({ ok: false, error: "Missing ASSISTANT_API_KEY" }, { status: 500 });
  }
  if (!matchesSamyOsSecret(supplied)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Missing GOOGLE_CLIENT_ID" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/api/google/callback`,
    response_type: "code",
    scope: `${GMAIL_SCOPES} ${CALENDAR_SCOPES}`,
    // offline is what makes Google issue a refresh token at all, and consent
    // forces a fresh one even if this account already approved the app —
    // otherwise a second run returns an access token only and the setup
    // silently produces nothing to paste into Vercel.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
