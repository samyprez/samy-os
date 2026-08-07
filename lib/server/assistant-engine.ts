import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantAction = {
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
export async function interpretMessage(transcript: string, now?: string, timezone?: string): Promise<AssistantAction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY en Vercel.");

const resolvedNow = now && !Number.isNaN(Date.parse(now)) ? new Date(now).toISOString() : new Date().toISOString();
  const resolvedTimezone = timezone || "America/Toronto";

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
      { role: "user", content: `Fecha actual: ${resolvedNow}\nZona horaria: ${resolvedTimezone}\nOrden: ${transcript}` },
      ],
    response_format: { type: "json_schema", json_schema: { name: "walie_action", strict: true, schema } },
  });

const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Walie no devolvió una acción.");
  return JSON.parse(text) as AssistantAction;
}

type TaskFields = { title: string; area?: string | null; priority?: string | null; due_date?: string | null; source?: string };
type NoteFields = { body: string; related_to?: string | null; priority?: string | null; category?: string };
type EventFields = { title: string; starts_at: string; location?: string | null };
type ClientFields = { name: string; contact?: string | null; service?: string | null; priority?: string | null };

export async function insertTask(admin: SupabaseClient, userId: string, fields: TaskFields) {
  const title = fields.title.trim();
  const dueDate = fields.due_date?.trim() || null;
  let duplicateQuery = admin.from("tasks").select("id,title,due_date").eq("user_id", userId).eq("title", title).neq("status", "Completado");
  duplicateQuery = dueDate ? duplicateQuery.eq("due_date", dueDate) : duplicateQuery.is("due_date", null);
  const duplicate = await duplicateQuery.limit(1);
  if (duplicate.error) throw new Error(duplicate.error.message);
  if (duplicate.data?.length) return { duplicate: true as const, task: duplicate.data[0] };

const { data, error } = await admin
  .from("tasks")
  .insert({
    user_id: userId,
    title,
    area: fields.area || "General",
    priority: fields.priority || "Media",
    status: "Pendiente",
    due_date: dueDate,
    source: fields.source || "Assistant",
  })
  .select("id,title,area,priority,status,due_date")
  .single();
  if (error) throw new Error(error.message);
  return { duplicate: false as const, task: data };
}

export async function insertNote(admin: SupabaseClient, userId: string, fields: NoteFields) {
  const body = fields.body.trim();
  const { data, error } = await admin
  .from("notes")
  .insert({
    user_id: userId,
    body,
    related_to: fields.related_to?.trim() || null,
    category: fields.category || "Assistant",
    priority: fields.priority || "Media",
  })
  .select("id,body,related_to,priority,created_at")
  .single();
  if (error) throw new Error(error.message);
  return { note: data };
}

export async function insertEvent(admin: SupabaseClient, userId: string, fields: EventFields) {
  const { data, error } = await admin
  .from("events")
  .insert({
    user_id: userId,
    title: fields.title,
    starts_at: fields.starts_at,
    location: fields.location || null,
    status: "Programado",
  })
  .select("id,title,starts_at,location,status")
  .single();
  if (error) throw new Error(error.message);
  return { event: data };
}

export async function insertClient(admin: SupabaseClient, userId: string, fields: ClientFields) {
  const { data, error } = await admin
  .from("clients")
  .insert({
    user_id: userId,
    name: fields.name,
    primary_contact: fields.contact || null,
    service: fields.service || null,
    status: "Activo",
    priority: fields.priority || "Media",
    next_step: "Definir próximo paso",
  })
  .select("id,name,status,priority")
  .single();
  if (error) throw new Error(error.message);
  return { client: data };
}

export type AssistantExecutionResult = { success: boolean; message: string };

export async function runAssistantAction(action: AssistantAction, admin: SupabaseClient, userId: string): Promise<AssistantExecutionResult> {
  if (action.action === "create_task") {
    if (!action.title) return { success: false, message: "No pude identificar el nombre de la tarea." };
    const result = await insertTask(admin, userId, {
      title: action.title,
      area: action.area,
      priority: action.priority,
      due_date: action.due_date,
      source: "Assistant",
    });
    if (result.duplicate) return { success: true, message: "Esa tarea ya estaba registrada. No la dupliqué." };
    return { success: true, message: action.response || "Listo, la tarea fue creada." };
  }

if (action.action === "create_note") {
  if (!action.body) return { success: false, message: "No pude identificar el contenido de la nota." };
  await insertNote(admin, userId, { body: action.body, related_to: action.related_to, priority: action.priority, category: "Assistant" });
  return { success: true, message: action.response || "Listo, la nota fue guardada." };
}

if (action.action === "create_event") {
  if (!action.title || !action.starts_at) return { success: false, message: "Faltan el título o la fecha del evento." };
  await insertEvent(admin, userId, { title: action.title, starts_at: action.starts_at, location: action.location });
  return { success: true, message: action.response || "Listo, el evento fue agendado." };
}

if (action.action === "create_client") {
  if (!action.client_name) return { success: false, message: "Falta el nombre del cliente." };
  await insertClient(admin, userId, { name: action.client_name, contact: action.contact, service: action.service, priority: action.priority });
  return { success: true, message: action.response || "Listo, el cliente fue registrado." };
}

if (action.action === "query") {
  return { success: false, message: "Para consultas de solo lectura usa /api/chatgpt con list_tasks, list_notes u overview." };
}

return { success: false, message: action.response || "No pude completar la acción." };
}
