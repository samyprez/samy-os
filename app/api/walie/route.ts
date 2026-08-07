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

function emptyAction(): Omit<WalieAction, "action" | "response"> {
  return {
    title: null,
    body: null,
    area: null,
    priority: null,
    due_date: null,
    starts_at: null,
    location: null,
    client_name: null,
    contact: null,
    service: null,
    related_to: null,
  };
}

function dateInTimezone(baseIso: string, timezone: string, daysToAdd: number) {
  const base = new Date(baseIso);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(base);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return date.toISOString().slice(0, 10);
}

function cleanTaskTitle(value: string) {
  return value
    .replace(/\b(?:para\s+)?(?:mañana|manana|hoy)\b.*$/i, "")
    .replace(/\b(?:a\s+las?|a\s+la)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, "")
    .replace(/^\s*(?:una\s+)?tarea\s+(?:para\s+)?/i, "")
    .replace(/^\s*(?:para\s+)?/i, "")
    .trim()
    .replace(/[.,;:]+$/, "");
}

function inferArea(title: string) {
  if (/salami\s*(?:cibao|sibao)|cibao|sibao/i.test(title)) return "Salami Cibao";
  if (/mikiosko|mi\s*kiosko/i.test(title)) return "MiKiosko.ca";
  return "General";
}

function parseCoreCommand(transcript: string, now: string, timezone: string): WalieAction | null {
  const text = transcript.trim();
  const normalized = text.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

  const noteMatch = normalized.match(/^(?:toma|crea|guarda|anota)(?:\s+una)?\s+nota\s*[:,-]?\s*(.+)$/i);
  if (noteMatch?.[1]?.trim()) {
    const body = text.replace(/^(?:toma|crea|guarda|anota)(?:\s+una)?\s+nota\s*[:,-]?\s*/i, "").trim();
    return {
      action: "create_note",
      ...emptyAction(),
      body,
      related_to: inferArea(body) === "General" ? null : inferArea(body),
      priority: "Media",
      response: `Listo. Guardé la nota: ${body}.`,
    };
  }

  const taskPrefix = /^(?:crea|crear|agrega|añade|anade|pon|recuérdame|recuerdame)(?:\s+una)?\s+(?:tarea|pendiente|recordatorio)\b/i;
  if (taskPrefix.test(normalized)) {
    const remainder = text.replace(taskPrefix, "").trim();
    const title = cleanTaskTitle(remainder);
    if (!title) return null;

    let dueDate: string | null = null;
    if (/\b(?:mañana|manana)\b/i.test(normalized)) dueDate = dateInTimezone(now, timezone, 1);
    else if (/\bhoy\b/i.test(normalized)) dueDate = dateInTimezone(now, timezone, 0);

    return {
      action: "create_task",
      ...emptyAction(),
      title,
      area: inferArea(title),
      priority: "Media",
      due_date: dueDate,
      response: dueDate
        ? `Listo. Creé la tarea ${title} para ${dueDate}.`
        : `Listo. Creé la tarea ${title}.`,
    };
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as { transcript?: string; now?: string; timezone?: string };
    const transcript = input.transcript?.trim();
    if (!transcript) return NextResponse.json({ error: "No recibí ninguna instrucción." }, { status: 400 });

    const now = input.now && !Number.isNaN(Date.parse(input.now)) ? new Date(input.now).toISOString() : new Date().toISOString();
    const timezone = input.timezone || "America/Toronto";

    // Core commands must work even if OpenAI is temporarily unavailable or structured output changes.
    const deterministic = parseCoreCommand(transcript, now, timezone);
    if (deterministic) return NextResponse.json(deterministic);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Falta OPENAI_API_KEY en Vercel." }, { status: 500 });

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
