import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, supabase: false, openai: openAIConfigured, error: "Missing Supabase environment variables" },
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
      tables: checks,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        supabase: false,
        openai: openAIConfigured,
        error: error instanceof Error ? error.message : "Supabase health check failed",
      },
      { status: 500 },
    );
  }
}
