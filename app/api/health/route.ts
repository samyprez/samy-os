import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSamyOsAdmin, getSamyOsOwnerId } from "@/lib/server/samy-os-admin";
import { getGmailAddress, gmailConfigured, missingGmailEnvVars } from "@/lib/server/gmail";

export const runtime = "nodejs";

type GmailHealth = {
  configured: boolean;
  works: boolean;
  address: string | null;
  missing: string[];
  error: string | null;
};

// Same reason the service-role key is exercised rather than merely counted:
// a refresh token that Google revoked — or one minted against a different OAuth
// client — is still "configured" and still fails every send. Only a real call
// tells them apart.
async function checkGmail(): Promise<GmailHealth> {
  const configured = gmailConfigured();
  const result: GmailHealth = {
    configured,
    works: false,
    address: null,
    missing: missingGmailEnvVars(),
    error: null,
  };
  if (!configured) return result;

  try {
    const address = await getGmailAddress();
    result.works = Boolean(address);
    result.address = address || null;
    if (!address) result.error = "Gmail no devolvió una dirección";
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Gmail check failed";
  }
  return result;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const gatewayTokenConfigured = Boolean(process.env.ASSISTANT_API_KEY || process.env.SAMY_OS_API_TOKEN);
  const ownerConfigured = Boolean(process.env.SAMY_OS_OWNER_USER_ID || process.env.SAMY_OS_OWNER_EMAIL);
  const chatgptGatewayConfigured = serviceRoleConfigured && gatewayTokenConfigured && ownerConfigured;
  const gmail = await checkGmail();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        ok: false,
        supabase: false,
        openai: openAIConfigured,
        chatgptGateway: chatgptGatewayConfigured,
        gmail,
        error: "Missing Supabase environment variables",
      },
      { status: 500 },
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const checks = await Promise.all(
      ["clients", "tasks", "notes", "events", "brands", "health_entries"].map(async (table) => {
        const { error } = await supabase.from(table).select("id").limit(1);
        return { table, ok: !error, error: error?.message || null };
      }),
    );

    const tablesReady = checks.every((item) => item.ok);

    // Presence of a variable proves nothing: a service-role key copied from a
    // different Supabase project is "configured" and still fails every call.
    // Exercise it for real so the health check can say which one is wrong.
    const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0];
    let serviceRoleWorks = false;
    let serviceRoleError: string | null = null;
    let ownerResolved = false;
    let ownerError: string | null = null;

    if (serviceRoleConfigured) {
      try {
        const { error } = await getSamyOsAdmin().from("tasks").select("id").limit(1);
        if (error) serviceRoleError = error.message;
        else serviceRoleWorks = true;
      } catch (error) {
        serviceRoleError = error instanceof Error ? error.message : "service-role check failed";
      }
    }

    if (serviceRoleWorks && ownerConfigured) {
      try {
        await getSamyOsOwnerId();
        ownerResolved = true;
      } catch (error) {
        ownerError = error instanceof Error ? error.message : "owner lookup failed";
      }
    }

    const gatewayReady = chatgptGatewayConfigured && serviceRoleWorks && ownerResolved;

    return NextResponse.json({
      ok: tablesReady && openAIConfigured,
      supabase: true,
      supabaseProject: projectRef,
      tablesReady,
      openai: openAIConfigured,
      chatgptGateway: gatewayReady,
      gmail,
      gatewayRequirements: {
        serviceRole: serviceRoleConfigured,
        serviceRoleWorks,
        serviceRoleError,
        apiToken: gatewayTokenConfigured,
        owner: ownerConfigured,
        ownerResolved,
        ownerError,
      },
      tables: checks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        supabase: false,
        openai: openAIConfigured,
        chatgptGateway: chatgptGatewayConfigured,
        gmail,
        error: error instanceof Error ? error.message : "Supabase health check failed",
      },
      { status: 500 },
    );
  }
}
