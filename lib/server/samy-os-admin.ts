import "server-only";

import { createClient } from "@supabase/supabase-js";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function assertSamyOsApiAuth(request: Request) {
  const expected = (process.env.ASSISTANT_API_KEY || process.env.SAMY_OS_API_TOKEN || "").trim();
  if (!expected) throw new Error("Missing ASSISTANT_API_KEY");
  const header = request.headers.get("authorization") || "";
  const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!received || received !== expected) {
    throw new Error("UNAUTHORIZED");
  }
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
