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

const allowedActions = new Set<AssistantAction["action"]>([
  "create_task",
  "create_event",
  "create_client",
  "query",
  "none",
]);

const allowedPriorities = new Set<NonNullable<AssistantAction["priority"]>>([
  "Alta",
  "Media",
  "Baja",
]);

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["create_task", "create_event", "create_client", "query", "none"],
    },
    title: { type: ["string", "null"] },
    area: { type: ["string", "null"] },
    priority: {
      type: ["string", "null"],
      enum: ["Alta", "Media", "Baja", null],
    },
    due_date: { type: ["string", "null"] },
    starts_at: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    client_name: { type: ["string", "null"] },
    contact: { type: ["string", "null"] },
    service: { type: ["string", "null"] },
    response: { type: "string" },
  },
  required: [
    "action",
    "title",
    "area",
    "priority",
    "due_date",
    "starts_at",
    "location",
    "client_name",
    "contact",
    "service",
    "response",
  ],
} as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function cleanNullableString(value: string | null) {
  if (value === null) return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isValidDateValue(value: string | null) {
  if (value === null) return true;
  return !Number.isNaN(Date.parse(value));
}

function isAssistantAction(value: unknown): value is AssistantAction {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    allowedActions.has(candidate.action as AssistantAction["action"]) &&
    isNullableString(candidate.title) &&
    isNullableString(candidate.area) &&
    (candidate.priority === null ||
      allowedPriorities.has(candidate.priority as NonNullable<AssistantAction["priority"]>)) &&
    isNullableString(candidate.due_date) &&
    isNullableString(candidate.starts_at) &&
    isNullableString(candidate.location) &&
    isNullableString(candidate.client_name) &&
    isNullableString(candidate.contact) &&
    isNullableString(candidate.service) &&
    typeof candidate.response === "string" &&
    candidate.response.trim().length > 0
  );
}

function normalizeAction(action: AssistantAction): AssistantAction {
  const normalized: AssistantAction = {
    ...action,
    title: cleanNullableString(action.title),
    area: cleanNullableString(action.area),
    due_date: cleanNullableString(action.due_date),
    starts_at: cleanNullableString(action.starts_at),
    location: cleanNullableString(action.location),
    client_name: cleanNullableString(action.client_name),
    contact: cleanNullableString(action.contact),
    service: cleanNullableString(action.service),
    response: action.response.trim(),
  };

  if (!isValidDateValue(normalized.due_date) || !isValidDateValue(normalized.starts_at)) {
    return {
      ...normalized,
      action: "none",
      due_date: null,
      starts_at: null,
      response: "No pude determinar una fecha válida. Dime el día y la hora nuevamente.",
    };
  }

  if (normalized.action === "create_task" && !normalized.title) {
    return {
      ...normalized,
      action: "none",
      response: "Dime el nombre de la tarea que deseas crear.",
    };
  }

  if (normalized.action === "create_event" && (!normalized.title || !normalized.starts_at)) {
    return {
      ...normalized,
      action: "none",
      response: "Dime el nombre, el día y la hora del evento.",
    };
  }

  if (normalized.action === "create_client" && !normalized.client_name) {
    return {
      ...normalized,
      action: "none",
      response: "Dime el nombre del cliente que deseas crear.",
    };
  }

  return normalized;
}

function openAIErrorResponse(error: OpenAI.APIError) {
  const status = error.status || 502;

  if (status === 401) {
    return NextResponse.json(
      { error: "La clave de OpenAI no es válida o no pertenece a este proyecto." },
      { status },
    );
  }

  if (status === 429) {
    return NextResponse.json(
      {
        error:
          error.code === "insufficient_quota"
            ? "La cuenta de OpenAI API no tiene cuota disponible para este proyecto."
            : "OpenAI está recibiendo demasiadas solicitudes. Inténtalo nuevamente en unos segundos.",
      },
      { status },
    );
  }

  return NextResponse.json(
    { error: `OpenAI no pudo procesar la instrucción (${status}).` },
    { status: status >= 400 && status < 600 ? status : 502 },
  );
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta OPENAI_API_KEY en .env.local." },
        { status: 500 },
      );
    }

    let body: {
      transcript?: string;
      now?: string;
      timezone?: string;
    };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "La solicitud enviada al asistente no contiene JSON válido." },
        { status: 400 },
      );
    }

    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "No se recibió ninguna instrucción." },
        { status: 400 },
      );
    }

    if (transcript.length > 2000) {
      return NextResponse.json(
        { error: "La instrucción es demasiado larga. Resume la orden e inténtalo nuevamente." },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: [
            "Eres el cerebro de Samy OS y respondes en español.",
            "Convierte la orden en exactamente una acción estructurada.",
            "Acciones permitidas: create_task, create_event, create_client, query o none.",
            "Resuelve hoy, mañana, días de la semana y horas usando la fecha y zona horaria suministradas.",
            "Devuelve due_date y starts_at como fechas ISO 8601 completas; conserva la zona horaria indicada.",
            "No inventes datos ausentes.",
            "Si falta un dato indispensable, usa action none y pide solamente ese dato en response.",
            "Para una tarea usa title, area, priority y due_date.",
            "Para un evento usa title, starts_at y location.",
            "Para un cliente usa client_name, contact y service.",
            "response debe confirmar brevemente lo entendido o pedir el dato indispensable que falte.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Fecha y hora actual: ${body.now || new Date().toISOString()}\nZona horaria: ${body.timezone || "America/Toronto"}\nOrden: ${transcript}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "samy_os_action",
          strict: true,
          schema,
        },
      },
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      return NextResponse.json(
        { error: "OpenAI no devolvió ningún mensaje." },
        { status: 502 },
      );
    }

    if (message.refusal) {
      return NextResponse.json(
        { error: `OpenAI rechazó la instrucción: ${message.refusal}` },
        { status: 502 },
      );
    }

    const outputText = message.content?.trim();
    if (!outputText) {
      console.error("OpenAI returned an empty message", completion.id);
      return NextResponse.json(
        { error: "OpenAI devolvió un mensaje vacío." },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      console.error("Invalid OpenAI JSON:", outputText);
      return NextResponse.json(
        { error: "OpenAI devolvió JSON inválido." },
        { status: 502 },
      );
    }

    if (!isAssistantAction(parsed)) {
      console.error("Invalid assistant action shape:", parsed);
      return NextResponse.json(
        { error: "OpenAI devolvió una acción incompleta o incompatible." },
        { status: 502 },
      );
    }

    return NextResponse.json(normalizeAction(parsed));
  } catch (error) {
    console.error("Assistant v2 error:", error);

    if (error instanceof OpenAI.APIError) {
      return openAIErrorResponse(error);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error inesperado al interpretar la instrucción.",
      },
      { status: 500 },
    );
  }
}
