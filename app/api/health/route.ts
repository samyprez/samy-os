import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const gatewayTokenConfigured = Boolean(process.env.SAMY_OS_API_TOKEN);
  const ownerConfigured = Boolean(process.env.SAMY_OS_OWNER_USER_ID || process.env.SAMY_OS_OWNER_EMAIL);
  const chatgptGatewayConfigured = serviceRoleConfigured && gatewayTokenConfigured && ownerConfigured;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        ok: false,
        supabase: false,
        openai: openAIConfigured,
        chatgptGateway: chatgptGatewayConfigured,
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
    return NextResponse.json({
      ok: tablesReady && openAIConfigured,
      supabase: true,
      tablesReady,
      openai: openAIConfigured,
      chatgptGateway: chatgptGatewayConfigured,
      gatewayRequirements: {
        serviceRole: serviceRoleConfigured,
        apiToken: gatewayTokenConfigured,
        owner: ownerConfigured,
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
        error: error instanceof Error ? error.message : "Supabase health check failed",
      },
      { status: 500 },
    );
  }
}
