import { NextResponse } from "next/server";
import { accessTokenValid } from "@/lib/server/mcp-oauth";
import { PRIORITIES, providerStatus, recipientBook, sendWhatsAppNotification } from "@/lib/server/notifications";
import { templateNames } from "@/lib/server/notification-formatters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Servidor MCP de Samy OS.
 *
 * Existe porque las rutinas programadas de ChatGPT corren en un chat normal, y
 * ahí no hay Actions de GPT: solo conectores. Un GPT personalizado sí tiene
 * Actions, pero pierde vidIQ, que es de donde el Channel Manager saca los datos
 * del canal. Un conector MCP es lo único que da las dos cosas a la vez, y lo ven
 * las cinco rutinas sin tocar ninguna.
 */

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "enviar_whatsapp",
    description:
      "Manda un aviso corto por WhatsApp al teléfono de Samuel. Úsalo al cerrar una rutina programada (auditoría del canal, radar de contenido, control de gastos). El informe largo sigue yendo por correo: aquí van pocas líneas.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Texto del aviso, en español y breve. Alternativa a usar una plantilla.",
        },
        template: {
          type: "string",
          enum: ["samyprez-youtube", "generic"],
          description:
            "Formato: 'samyprez-youtube' para el canal (rellena do_next, prep_next, kpi) o 'generic' para el resto (title, body, items, action).",
        },
        data: {
          type: "object",
          description: "Campos de la plantilla. Los vacíos se omiten del mensaje.",
          properties: {
            do_next: { type: "string", description: "Lo que Samuel tiene que hacer ahora." },
            prep_next: { type: "string", description: "Lo siguiente a preparar." },
            kpi: { type: "string", description: "La métrica a vigilar, en una frase." },
            title: { type: "string", description: "generic: encabezado del aviso." },
            body: { type: "string", description: "generic: resumen en una o dos frases." },
            items: { type: "array", items: { type: "string" }, description: "generic: lista de puntos." },
            action: { type: "string", description: "generic: la acción a tomar." },
            note: { type: "string", description: "Una línea extra de contexto." },
          },
        },
        source: {
          type: "string",
          description:
            "Qué rutina avisa: samyprez-youtube, dominican-content-radar, money-tracker, amazing-solutions o system-alert.",
        },
        priority: { type: "string", enum: [...PRIORITIES], description: "Por defecto 'normal'." },
        to: {
          type: "string",
          description: "Alias del destinatario ('samy', 'partner', 'all'). Si se omite, va a Samuel.",
        },
      },
    },
  },
  {
    name: "estado_whatsapp",
    description:
      "Comprueba que el gateway de WhatsApp está configurado, sin gastar un mensaje. Útil para diagnosticar antes de culpar al envío.",
    inputSchema: { type: "object", properties: {} },
  },
];

function unauthorized(origin: string) {
  // La cabecera dice dónde descubrir el OAuth: sin ella el cliente solo ve un
  // 401 y no sabe que puede autenticarse.
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "No autorizado" }, id: null },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

function result(id: unknown, value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result: value });
}

function failure(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/** El contenido textual es lo que el modelo lee; el error va marcado aparte. */
function toolText(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "estado_whatsapp") {
    const status = providerStatus();
    const aliases = Object.keys(recipientBook()).join(", ") || "ninguno";
    return toolText(
      status.configured
        ? `Gateway listo. Proveedor: ${status.provider}. Destinatarios: ${aliases}. Plantillas: ${templateNames().join(", ")}.`
        : `Gateway NO configurado. Faltan variables: ${status.missing_env.join(", ")}.`,
      !status.configured,
    );
  }

  if (name !== "enviar_whatsapp") return toolText(`Herramienta desconocida: ${name}`, true);

  const outcome = await sendWhatsAppNotification(args);
  if (outcome.sent > 0 && outcome.failed === 0) {
    const sids = outcome.results.map((r) => r.sid).filter(Boolean).join(", ");
    return toolText(`Aviso entregado a Twilio. Message SID: ${sids}.`);
  }
  const reasons = outcome.results
    .filter((r) => r.status !== "sent")
    .map((r) => `${r.to}: ${r.error}${r.hint ? ` — ${r.hint}` : ""}`)
    .join(" | ");
  return toolText(
    `No se pudo enviar (${outcome.sent} de ${outcome.results.length}). ${reasons}`,
    outcome.sent === 0,
  );
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !accessTokenValid(token)) return unauthorized(origin);

  let body: { method?: string; id?: unknown; params?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return failure(null, -32700, "JSON inválido");
  }

  const { method, id } = body;
  const params = body.params || {};

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "samy-os", version: "1.0.0" },
      });

    // Una notificación no lleva id y no espera respuesta con contenido.
    case "notifications/initialized":
    case "notifications/cancelled":
      return new NextResponse(null, { status: 202 });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: TOOLS });

    case "tools/call": {
      const name = String(params.name || "");
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<
        string,
        unknown
      >;
      try {
        return result(id, await callTool(name, args));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        console.error("[mcp] tool error", name, message);
        // Un fallo de la herramienta se devuelve como resultado, no como error
        // JSON-RPC: así el modelo lo lee y lo puede contar en su informe.
        return result(id, toolText(message, true));
      }
    }

    default:
      return failure(id, -32601, `Método no soportado: ${method}`);
  }
}

/** Sin transporte SSE: este servidor responde JSON en la misma petición. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !accessTokenValid(token)) return unauthorized(origin);
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
