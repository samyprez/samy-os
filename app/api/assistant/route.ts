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
    action: {
      type: "string",
      enum: ["create_task", "create_event", "create_client", "query", "none"],
    },
    title: { type: ["string", "null"] },
    area: { type: ["string", "null"] },
    priority: { type: ["string", "null"], enum: ["Alta", "Media", "Baja", null] },
    due_date: { type: ["string", "null"], description: "Date in YYYY-MM-DD format." },
    starts_at: { type: ["string", "null"], description: "ISO 8601 date-time with offset." },
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
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta OPENAI_API_KEY en .env.local." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      transcript?: string;
      now?: string;
      timezone?: string;
    };

    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: "No se recibió ninguna instrucción." }, { status: 400 });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        instructions: [
          "Eres el cerebro de Samy OS, un asistente ejecutivo en español.",
          "Interpreta órdenes naturales y devuelve una sola acción estructurada.",
          "Las acciones permitidas son crear tarea, evento o cliente; consultar; o ninguna.",
          "Resuelve expresiones como hoy, mañana, el viernes y a las tres usando la fecha, hora y zona horaria suministradas.",
          "No inventes nombres, fechas, contactos ni lugares ausentes.",
          "Para una tarea usa title, area, priority y due_date.",
          "Para un evento usa title, starts_at y location.",
          "Para un cliente usa client_name, contact y service.",
          "La respuesta debe confirmar brevemente lo que entendiste o pedir el dato indispensable que falte.",
        ].join(" "),
        input: `Fecha y hora actual: ${body.now || new Date().toISOString()}\nZona horaria: ${body.timezone || "America/Toronto"}\nOrden del usuario: ${transcript}`,
        text: {
          format: {
            type: "json_schema",
            name: "samy_os_action",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("OpenAI error:", details);
      return NextResponse.json(
        { error: "OpenAI no pudo interpretar la instrucción." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { output_text?: string };
    if (!data.output_text) {
      return NextResponse.json({ error: "OpenAI no devolvió una acción." }, { status: 502 });
    }

    const action = JSON.parse(data.output_text) as AssistantAction;
    return NextResponse.json(action);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado." },
      { status: 500 },
    );
  }
}
