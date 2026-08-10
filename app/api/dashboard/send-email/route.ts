import { NextResponse } from "next/server";
import { assertSamyOsCaller } from "@/lib/server/samy-os-admin";
import { gmailConfigured, missingGmailEnvVars, sendEmail } from "@/lib/server/gmail";

export const runtime = "nodejs";

// Session-authenticated twin of /api/chatgpt/send-email. Only the dashboard's
// own "Enviar" button calls this, after Samy has seen the recipient and body
// on screen — never fired automatically by voice.

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
      await assertSamyOsCaller(request);
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
    console.error("Dashboard send-email error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
