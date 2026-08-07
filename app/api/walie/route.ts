import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type WalieAction = {
  action: "create_task" | "create_note" | "create_event" | "create_client" | "query" | "none";
  title: string | null;
  body: string | null;
  area: string | null;
  priority: "Alta" | "Media" | "Baja" | null;
  due_date: string | null;
  starts_at: string | null;
  location: string | null;
  client_name: string | null;
  contact: string | null;
  service: string | null;
  related_to: string | null;
  response: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ["create_task", "create_note", "create_event", "create_client", "query", "none"] },
    title: { type: ["string", "null"] },
    body: { type: ["string", "null"] },
    area: { type: ["string", "null"] },
    priority: { type: ["string", "null"], enum: ["Alta", "Media", "Baja", null] },
    due_date: { type: ["string", "null"] },
    starts_at: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    client_name: { type: ["string", "null"] },
    contact: { type: ["string", "null"] },
    service: { type: ["string", "null"] },
    related_to: { type: ["string", "null"] },
    response: { type: "string" },
  },
  required: ["action", "title", "body", "area", "priority", "due_date", "starts_at", "location", "client_name", "contact", "service", "related_to", "response"],
} as const;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Falta OPENAI_API_KEY en Vercel." }, { status: 500 });

    const input = (await request.json()) as { transcript?: string; now?: string; timezone?: string };
    const transcript = input.transcript?.trim();
    if (!transcript) return NextResponse.json({ error: "No recibí ninguna instrucción." }, { status: 400 });

    const now = input.now && !Number.isNaN(Date.parse(input.now)) ? new Date(input.now).toISOString() : new Date().toISOString();
    const timezone = input.timezone || "America/Toronto";

    const client = new OpenAI({ apiKey, timeout: 20000, maxRetries: 1 });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: [
            "Eres Walie, el asistente ejecutivo de Samy OS.",
            "Convierte cada instrucción en una sola acción estructurada.",
            "Prioriza tareas, notas y recordatorios operativos.",
            "Acciones: create_task, create_note, create_event, create_client, query, none.",
            "Para recordar algo que sea una acción futura usa create_task.",
            "Para guardar información o una idea sin acción futura usa create_note.",
            "Para una tarea usa title, area, priority y due_date.",
            "Para una nota usa body y related_to.",
            "Para un evento usa title, starts_at y location.",
            "Para un cliente usa client_name, contact y service.",
            "Resuelve hoy, mañana y días de la semana usando la fecha y zona horaria dadas.",
            "No inventes datos. Si falta algo indispensable usa none y pide solo ese dato.",
            "response debe ser breve y natural en español.",
          ].join(" "),
        },
        { role: "user", content: `Fecha actual: ${now}\nZona horaria: ${timezone}\nOrden: ${transcript}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "walie_action", strict: true, schema } },
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return NextResponse.json({ error: "Walie no devolvió una acción." }, { status: 502 });

    const action = JSON.parse(text) as WalieAction;
    return NextResponse.json(action);
  } catch (error) {
    console.error("Walie error", error);
    return NextResponse.json({ error: "Walie no pudo interpretar la instrucción." }, { status: 500 });
  }
}
