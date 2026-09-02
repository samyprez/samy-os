import { NextResponse } from "next/server";
import {
  assertNotificationAuth,
  MAX_MESSAGE_LENGTH,
  NotificationError,
  notificationAuthSecrets,
  PRIORITIES,
  providerStatus,
  recipientBook,
  sendWhatsAppNotification,
  type NotificationRequest,
} from "@/lib/server/notifications";
import { templateNames } from "@/lib/server/notification-formatters";

export const runtime = "nodejs";
// Every request must hit the live provider; nothing here is cacheable.
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/whatsapp
 *
 * The single WhatsApp door for every one of Samuel's automations. Callers send
 * a message and a recipient (or an alias, or nothing at all and it goes to the
 * default), authenticate with Bearer NOTIFICATION_API_KEY, and get back the
 * Twilio Message SID.
 *
 * GET on the same URL reports configuration without sending anything, which is
 * how you check a deploy is wired up before spending a message.
 */

function errorResponse(error: NotificationError) {
  return NextResponse.json(
    { ok: false, error: error.message, code: error.code, ...(error.hint ? { hint: error.hint } : {}) },
    { status: error.status },
  );
}

function maskPhone(e164: string) {
  return e164.length > 6 ? `${e164.slice(0, 5)}••••${e164.slice(-3)}` : "•••";
}

export async function POST(request: Request) {
  try {
    assertNotificationAuth(request);

    let body: NotificationRequest;
    try {
      body = (await request.json()) as NotificationRequest;
    } catch {
      throw new NotificationError("Cuerpo JSON inválido", 400, "invalid_json");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new NotificationError("El cuerpo debe ser un objeto JSON", 400, "invalid_body");
    }

    const outcome = await sendWhatsAppNotification(body);

    // 200 all delivered, 207 some delivered, 502 the provider rejected them all.
    const status = outcome.failed === 0 ? 200 : outcome.sent > 0 ? 207 : 502;
    return NextResponse.json(outcome, { status });
  } catch (error) {
    if (error instanceof NotificationError) return errorResponse(error);
    console.error("[whatsapp-gateway] unhandled error", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message, code: "server_error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    assertNotificationAuth(request);
    const provider = providerStatus();
    const book = recipientBook();

    return NextResponse.json({
      ok: provider.configured,
      ...provider,
      auth: { configured: notificationAuthSecrets().length > 0 },
      // Masked: enough to confirm the right number is loaded, not enough to
      // leak a contact list from an endpoint that only needs a bearer token.
      recipients: Object.fromEntries(Object.entries(book).map(([alias, phone]) => [alias, maskPhone(phone)])),
      default_recipients: process.env.NOTIFICATION_DEFAULT_RECIPIENTS?.trim() || "samy",
      templates: templateNames(),
      priorities: PRIORITIES,
      max_message_length: MAX_MESSAGE_LENGTH,
    });
  } catch (error) {
    if (error instanceof NotificationError) return errorResponse(error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message, code: "server_error" }, { status: 500 });
  }
}
