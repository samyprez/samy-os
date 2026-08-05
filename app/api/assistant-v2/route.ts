import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AssistantAction = {
  action: "create_task" | "create_event" | "create_client" | "query" | "none";
  title: string | null;
  area: string | null;
  priority: "Alta" | "Media" | "Baja" | null;
  due_date: string | null;
  starts_at: string | null;
  location: string | null;
  client_name: string | null;
  contact: string | null;
  service: string | null;
  response: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["create_task", "create_event", "create_client", "query", "none"] },
    title: { type: ["string", "null"] },
    area: { type: ["string", "null"] },
    priority: { type: ["string", "null"], enum: ["Alta", "Media", "Baja", null] },
    due_date: { type: ["string", "null"] },
    starts_at: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    client_name: { type: ["string", "null"] },
    contact: { type: ["string", "null"] },
    service: { type: ["string", "null"] },
    response: { type: "string" }
  },
  required: ["action", "title", "area", "priority", "due_date", "starts_at", "location", "client_name", "contact", "service", "response"]
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Falta OPENAI_API_KEY en .env.local." }, { status: 500 });

    const body = (await request.json()) as { transcript?: string; now?: string; timezone?: string };
    const transcript = body.transcript?.trim();
    if (!transcript) return NextResponse.json({ error: "No se recibió ninguna instrucción." }, { status: 400 });

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      reasoning: { effort: "minimal" },
      instructions: [
        "Eres el cerebro de Samy OS y respondes en español.",
        "Convierte la orden en una sola acción estructurada.",
        "Acciones permitidas: create_task, create_event, create_client, query o none.",
        "Resuelve hoy, mañana, días de la semana y horas usando la fecha y zona horaria suministradas.",
        "No inventes datos ausentes.",
        "Para una tarea usa title, area, priority y due_date.",
        "Para un evento usa title, starts_at y location.",
        "Para un cliente usa client_name, contact y service.",
        "response debe confirmar brevemente lo entendido o pedir el dato indispensable que falte."
      ].join(" "),
      input: `Fecha y hora actual: ${body.now || new Date().toISOString()}\nZona horaria: ${body.timezone || "America/Toronto"}\nOrden: ${transcript}`,
      text: { format: { type: "json_schema", name: "samy_os_action", strict: true, schema } }
    });

    if (!response.output_text) return NextResponse.json({ error: "OpenAI no devolvió una acción utilizable." }, { status: 502 });
    return NextResponse.json(JSON.parse(response.output_text) as AssistantAction);
  } catch (error) {
    console.error("Assistant v2 error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado." }, { status: 500 });
  }
}
