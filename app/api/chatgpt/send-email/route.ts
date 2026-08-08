import { NextResponse } from "next/server";
import { assertSamyOsApiAuth } from "@/lib/server/samy-os-admin";
import { gmailConfigured, missingGmailEnvVars, sendEmail } from "@/lib/server/gmail";

export const runtime = "nodejs";

/**
 * Sending lives on its own path purely so it can be marked consequential.
 *
 * /api/chatgpt is deliberately x-openai-isConsequential: false, otherwise
 * ChatGPT prompts before every task and note and never offers "always allow",
 * which kills hands-free voice use. But sending mail is irreversible and goes
 * to a third party, so it must always show Samy the recipient and the body and
 * wait for a yes. The flag is per-operation, not per-field, so the only way to
 * have both behaviours is two paths.
 */
type Input = {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string | null;
  reply_to_message_id?: string | null;
};

export async function POST(request: Request) {
  try {
    try {
      assertSamyOsApiAuth(request);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      throw error;
    }

    if (!gmailConfigured()) {
      return NextResponse.json({
        ok: false,
        error: `Gmail no está conectado. Faltan estas variables en Vercel: ${missingGmailEnvVars().join(", ")}.`,
      });
    }

    const input = (await request.json()) as Input;
    const to = input.to?.trim();
    const subject = input.subject?.trim();
    const body = input.body;

    if (!to) return NextResponse.json({ ok: false, error: "to is required" }, { status: 400 });
    if (!subject) return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
    if (!body?.trim()) return NextResponse.json({ ok: false, error: "body is required" }, { status: 400 });

    const email = await sendEmail({
      to,
      subject,
      body,
      cc: input.cc,
      reply_to_message_id: input.reply_to_message_id,
    });

    return NextResponse.json({ ok: true, email, message: `Correo enviado a ${email.to}.` });
  } catch (error) {
    console.error("ChatGPT send-email error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
