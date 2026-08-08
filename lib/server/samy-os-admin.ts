import "server-only";

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function matchesGatewayToken(received: string) {
  const expected = (process.env.ASSISTANT_API_KEY || process.env.SAMY_OS_API_TOKEN || "").trim();
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Same secret, compared the same way, for the few endpoints a browser reaches
 * by plain redirect and so cannot send an Authorization header — currently only
 * the one-time Google OAuth start.
 */
export function matchesSamyOsSecret(received: string) {
  return matchesGatewayToken(received);
}

export function assertSamyOsApiAuth(request: Request) {
  const expected = (process.env.ASSISTANT_API_KEY || process.env.SAMY_OS_API_TOKEN || "").trim();
  if (!expected) throw new Error("Missing ASSISTANT_API_KEY");
  if (!matchesGatewayToken(readBearerToken(request))) {
    throw new Error("UNAUTHORIZED");
  }
}

/**
 * Guard for endpoints the browser calls too. Accepts either the server-to-server
 * gateway token or a signed-in Samy OS user's Supabase access token, so the voice
 * UI keeps working without ever shipping the gateway token to the browser.
 * Returns the resolved user id.
 */
export async function assertSamyOsCaller(request: Request): Promise<string> {
  const token = readBearerToken(request);
  if (!token) throw new Error("UNAUTHORIZED");

  if (matchesGatewayToken(token)) {
    return getSamyOsOwnerId();
  }

  const { data, error } = await getSamyOsAdmin().auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user.id;
}

export function getSamyOsAdmin() {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

return createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
}

export async function getSamyOsOwnerId() {
  const explicitId = process.env.SAMY_OS_OWNER_USER_ID?.trim();
  if (explicitId) return explicitId;

const email = process.env.SAMY_OS_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("Missing SAMY_OS_OWNER_USER_ID or SAMY_OS_OWNER_EMAIL");

const admin = getSamyOsAdmin();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);

const user = data.users.find((item) => item.email?.toLowerCase() === email);
  if (!user) throw new Error(`Samy OS owner not found for ${email}`);
  return user.id;
}
