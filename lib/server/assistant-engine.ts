import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantAction = {
  action:
    | "create_task"
    | "create_note"
    | "create_event"
    | "create_client"
    | "create_brand"
    | "complete_task"
    | "update_client"
    | "query"
    | "search_email"
    | "none";
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
  name: string | null;
  next_step: string | null;
  status: string | null;
  query: string | null;
  response: string;
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "create_task",
        "create_note",
        "create_event",
        "create_client",
        "create_brand",
        "complete_task",
        "update_client",
        "query",
        "search_email",
        "none",
      ],
    },
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
    name: { type: ["string", "null"] },
    next_step: { type: ["string", "null"] },
    status: { type: ["string", "null"] },
    query: { type: ["string", "null"] },
    response: { type: "string" },
  },
  required: ["action", "title", "body", "area", "priority", "due_date", "starts_at", "location", "client_name", "contact", "service", "related_to", "name", "next_step", "status", "query", "response"],
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
          "Prioriza tareas, notas, clientes y recordatorios operativos.",
          "Acciones: create_task, create_note, create_event, create_client, create_brand, complete_task, update_client, query, search_email, none.",
          "Para recordar algo que sea una acción futura usa create_task (title, area, priority, due_date).",
          "Para guardar información o una idea sin acción futura usa create_note (body, related_to).",
          "Para un evento usa create_event (title, starts_at, location).",
          "Para un cliente nuevo usa create_client (client_name, contact, service).",
          "Para una marca nueva usa create_brand (name).",
          "Para marcar una tarea como hecha, lista o completada usa complete_task (title con el nombre de la tarea a buscar).",
          "Para actualizar un cliente que ya existe (próximo paso, estado, prioridad, servicio o contacto) usa update_client (client_name para identificarlo, y solo los campos que cambian: next_step, status, priority, service, contact).",
          "Si pregunta qué tiene pendiente, pide un resumen, o pregunta por un cliente o área en específico, usa query (query con el término de búsqueda, o vacío para un resumen general).",
          "Si pide buscar, revisar o ver correos o emails, usa search_email (query con los términos de búsqueda de Gmail: remitente, asunto o tema).",
          "Nunca uses una acción para enviar correos: enviar siempre requiere que Samy lo confirme viendo la pantalla del dashboard, así que si pide enviar un correo usa none y dile que lo redacte y confirme desde la sección de Email.",
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
type EventFields = {
  title: string;
  starts_at: string;
  location?: string | null;
  description?: string | null;
  ends_at?: string | null;
  related_to?: string | null;
};
type ClientFields = {
  name: string;
  contact?: string | null;
  service?: string | null;
  priority?: string | null;
  brand?: string | null;
  next_step?: string | null;
};
type BrandFields = {
  name: string;
  type?: string | null;
  objective?: string | null;
  platforms?: string | null;
  content_frequency?: string | null;
  notes?: string | null;
};

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
  const title = fields.title.trim();
  const startsAt = fields.starts_at.trim();

  const duplicate = await admin
    .from("events")
    .select("id,title,starts_at")
    .eq("user_id", userId)
    .eq("title", title)
    .eq("starts_at", startsAt)
    .limit(1);
  if (duplicate.error) throw new Error(duplicate.error.message);
  if (duplicate.data?.length) return { duplicate: true as const, event: duplicate.data[0] };

  const { data, error } = await admin
  .from("events")
  .insert({
    user_id: userId,
    title,
    starts_at: startsAt,
    ends_at: fields.ends_at?.trim() || null,
    description: fields.description?.trim() || null,
    location: fields.location?.trim() || null,
    related_to: fields.related_to?.trim() || null,
    status: "Programado",
  })
  .select("id,title,starts_at,ends_at,location,related_to,status")
  .single();
  if (error) throw new Error(error.message);
  return { duplicate: false as const, event: data };
}

export async function insertClient(admin: SupabaseClient, userId: string, fields: ClientFields) {
  const name = fields.name.trim();

  const duplicate = await admin
    .from("clients")
    .select("id,name,status")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1);
  if (duplicate.error) throw new Error(duplicate.error.message);
  if (duplicate.data?.length) return { duplicate: true as const, client: duplicate.data[0] };

  const { data, error } = await admin
  .from("clients")
  .insert({
    user_id: userId,
    name,
    brand: fields.brand?.trim() || null,
    primary_contact: fields.contact?.trim() || null,
    service: fields.service?.trim() || null,
    status: "Activo",
    priority: fields.priority || "Media",
    next_step: fields.next_step?.trim() || "Definir próximo paso",
  })
  .select("id,name,brand,primary_contact,service,status,priority,next_step")
  .single();
  if (error) throw new Error(error.message);
  return { duplicate: false as const, client: data };
}

export async function insertBrand(admin: SupabaseClient, userId: string, fields: BrandFields) {
  const name = fields.name.trim();

  const duplicate = await admin
    .from("brands")
    .select("id,name")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1);
  if (duplicate.error) throw new Error(duplicate.error.message);
  if (duplicate.data?.length) return { duplicate: true as const, brand: duplicate.data[0] };

  const { data, error } = await admin
  .from("brands")
  .insert({
    user_id: userId,
    name,
    type: fields.type?.trim() || null,
    objective: fields.objective?.trim() || null,
    platforms: fields.platforms?.trim() || null,
    content_frequency: fields.content_frequency?.trim() || null,
    notes: fields.notes?.trim() || null,
  })
  .select("id,name,type,objective,platforms,content_frequency")
  .single();
  if (error) throw new Error(error.message);
  return { duplicate: false as const, brand: data };
}

export type AssistantExecutionResult = { success: boolean; message: string };

async function findOneTaskByTitle(admin: SupabaseClient, userId: string, title: string) {
  const { data, error } = await admin
    .from("tasks")
    .select("id,title,status")
    .eq("user_id", userId)
    .neq("status", "Completado")
    .ilike("title", `%${title}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function findOneClientByName(admin: SupabaseClient, userId: string, name: string) {
  const { data, error } = await admin
    .from("clients")
    .select("id,name")
    .eq("user_id", userId)
    .ilike("name", `%${name}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function runAssistantAction(action: AssistantAction, admin: SupabaseClient, userId: string): Promise<AssistantExecutionResult> {
  if (action.action === "create_task") {
    if (!action.title) return { success: false, message: "No pude identificar el nombre de la tarea." };
    const result = await insertTask(admin, userId, {
      title: action.title,
      area: action.area,
      priority: action.priority,
      due_date: action.due_date,
      source: "Walie",
    });
    if (result.duplicate) return { success: true, message: "Esa tarea ya estaba registrada. No la dupliqué." };
    return { success: true, message: action.response || "Listo, la tarea fue creada." };
  }

  if (action.action === "create_note") {
    if (!action.body) return { success: false, message: "No pude identificar el contenido de la nota." };
    await insertNote(admin, userId, { body: action.body, related_to: action.related_to, priority: action.priority, category: "Walie" });
    return { success: true, message: action.response || "Listo, la nota fue guardada." };
  }

  if (action.action === "create_event") {
    if (!action.title || !action.starts_at) return { success: false, message: "Faltan el título o la fecha del evento." };
    const result = await insertEvent(admin, userId, { title: action.title, starts_at: action.starts_at, location: action.location });
    if (result.duplicate) return { success: true, message: "Ese evento ya estaba agendado. No lo dupliqué." };
    return { success: true, message: action.response || "Listo, el evento fue agendado." };
  }

  if (action.action === "create_client") {
    if (!action.client_name) return { success: false, message: "Falta el nombre del cliente." };
    const result = await insertClient(admin, userId, { name: action.client_name, contact: action.contact, service: action.service, priority: action.priority });
    if (result.duplicate) return { success: true, message: "Ese cliente ya estaba registrado. No lo dupliqué." };
    return { success: true, message: action.response || "Listo, el cliente fue registrado." };
  }

  if (action.action === "create_brand") {
    if (!action.name) return { success: false, message: "Falta el nombre de la marca." };
    const result = await insertBrand(admin, userId, { name: action.name });
    if (result.duplicate) return { success: true, message: "Esa marca ya estaba registrada. No la dupliqué." };
    return { success: true, message: action.response || "Listo, la marca fue creada." };
  }

  if (action.action === "complete_task") {
    if (!action.title) return { success: false, message: "No pude identificar qué tarea completar." };
    const matches = await findOneTaskByTitle(admin, userId, action.title);
    if (!matches.length) return { success: false, message: `No encontré ninguna tarea pendiente parecida a "${action.title}".` };
    if (matches.length > 1) return { success: false, message: `Encontré ${matches.length} tareas parecidas a "${action.title}". Sé más específico.` };
    const { error } = await admin.from("tasks").update({ status: "Completado", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", matches[0].id);
    if (error) throw new Error(error.message);
    return { success: true, message: `Listo, marqué "${matches[0].title}" como completada.` };
  }

  if (action.action === "update_client") {
    if (!action.client_name) return { success: false, message: "No pude identificar de qué cliente hablas." };
    const matches = await findOneClientByName(admin, userId, action.client_name);
    if (!matches.length) return { success: false, message: `No encontré ningún cliente parecido a "${action.client_name}".` };
    if (matches.length > 1) return { success: false, message: `Encontré ${matches.length} clientes parecidos a "${action.client_name}". Sé más específico.` };

    const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (action.next_step) patch.next_step = action.next_step;
    if (action.status) patch.status = action.status;
    if (action.priority) patch.priority = action.priority;
    if (action.service) patch.service = action.service;
    if (action.contact) patch.primary_contact = action.contact;
    if (Object.keys(patch).length === 1) return { success: false, message: "No identifiqué qué actualizar del cliente." };

    const { error } = await admin.from("clients").update(patch).eq("user_id", userId).eq("id", matches[0].id);
    if (error) throw new Error(error.message);
    return { success: true, message: action.response || `Listo, actualicé a ${matches[0].name}.` };
  }

  if (action.action === "query") {
    const term = action.query?.trim().toLowerCase() || "";
    const [tasksResult, clientsResult] = await Promise.all([
      admin.from("tasks").select("title,area,status").eq("user_id", userId).neq("status", "Completado").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
      admin.from("clients").select("name,priority,status,next_step").eq("user_id", userId).limit(100),
    ]);
    if (tasksResult.error) throw new Error(tasksResult.error.message);
    if (clientsResult.error) throw new Error(clientsResult.error.message);

    const tasks = tasksResult.data ?? [];
    const filtered = term ? tasks.filter((t) => `${t.title} ${t.area ?? ""}`.toLowerCase().includes(term)) : tasks;

    if (term) {
      if (!filtered.length) return { success: true, message: `No encontré pendientes relacionados con "${action.query}".` };
      return { success: true, message: `Pendientes de ${action.query}: ${filtered.slice(0, 8).map((t) => t.title).join("; ")}.` };
    }
    if (!filtered.length) return { success: true, message: "No tienes pendientes abiertos ahora mismo." };
    return { success: true, message: `Tienes ${filtered.length} pendientes: ${filtered.slice(0, 6).map((t) => t.title).join("; ")}.` };
  }

  if (action.action === "search_email") {
    const { gmailConfigured, missingGmailEnvVars, searchEmails } = await import("@/lib/server/gmail");
    if (!gmailConfigured()) return { success: false, message: `Gmail no está conectado todavía. Faltan: ${missingGmailEnvVars().join(", ")}.` };
    const emails = await searchEmails(action.query?.trim() || "", 5);
    if (!emails.length) return { success: true, message: "No encontré correos con esa búsqueda." };
    const summary = emails.map((e) => `de ${e.from.split("<")[0].trim()}: ${e.subject || "(sin asunto)"}`).join("; ");
    return { success: true, message: `Encontré ${emails.length} correos. ${summary}. Ábrelos en la sección de Email para leerlos completos.` };
  }

  return { success: false, message: action.response || "No pude completar la acción." };
}
