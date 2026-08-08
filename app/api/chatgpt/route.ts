import { NextResponse } from "next/server";
import { assertSamyOsApiAuth, getSamyOsAdmin, getSamyOsOwnerId } from "@/lib/server/samy-os-admin";
import { insertTask, insertNote, insertEvent, insertClient, insertBrand } from "@/lib/server/assistant-engine";
import { gmailConfigured, missingGmailEnvVars, readEmail, searchEmails } from "@/lib/server/gmail";

export const runtime = "nodejs";

type Operation =
  | "overview"
| "list_tasks"
| "create_task"
| "complete_task"
| "list_notes"
| "create_note"
| "list_clients"
| "create_client"
| "update_client"
| "list_events"
| "create_event"
| "list_brands"
| "create_brand"
| "search_email"
| "read_email";

type Input = {
  operation?: Operation;
  title?: string;
  area?: string | null;
  priority?: "Alta" | "Media" | "Baja" | null;
  due_date?: string | null;
  task_id?: string | null;
  query?: string | null;
  body?: string;
  related_to?: string | null;
  // clients
  client_id?: string | null;
  name?: string;
  contact?: string | null;
  service?: string | null;
  brand?: string | null;
  next_step?: string | null;
  status?: string | null;
  last_important_message?: string | null;
  // events
  starts_at?: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  // brands
  type?: string | null;
  objective?: string | null;
  platforms?: string | null;
  content_frequency?: string | null;
  notes?: string | null;
  // email
  limit?: number | null;
  message_id?: string | null;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    try {
      assertSamyOsApiAuth(request);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
      throw error;
    }

  const input = (await request.json()) as Input;
    const operation = input.operation;
    if (!operation) return NextResponse.json({ ok: false, error: "operation is required" }, { status: 400 });

  const admin = getSamyOsAdmin();
    const userId = await getSamyOsOwnerId();

  if (operation === "overview") {
    const [tasks, notes, clients, events] = await Promise.all([
      admin.from("tasks").select("id,title,area,priority,status,due_date,created_at").eq("user_id", userId).neq("status", "Completado").order("due_date", { ascending: true, nullsFirst: false }).limit(20),
      admin.from("notes").select("id,body,related_to,priority,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      admin.from("clients").select("id,name,priority,status,next_step").eq("user_id", userId).order("created_at", { ascending: true }).limit(50),
      admin.from("events").select("id,title,starts_at,location,status").eq("user_id", userId).gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(10),
      ]);
    const error = tasks.error || notes.error || clients.error || events.error;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, tasks: tasks.data, notes: notes.data, clients: clients.data, events: events.data });
  }

  if (operation === "list_tasks") {
    let query = admin.from("tasks").select("id,title,area,priority,status,due_date,notes,created_at").eq("user_id", userId).order("due_date", { ascending: true, nullsFirst: false });
    if (input.query?.trim()) query = query.or(`title.ilike.%${input.query.trim()}%,area.ilike.%${input.query.trim()}%`);
    const { data, error } = await query.limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, tasks: data });
  }

  if (operation === "create_task") {
    const title = input.title?.trim();
    if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    const result = await insertTask(admin, userId, {
      title,
      area: input.area,
      priority: input.priority,
      due_date: input.due_date?.trim() || null,
      source: "ChatGPT",
    });
    if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true, task: result.task, message: "La tarea ya existía y no fue duplicada." });
    return NextResponse.json({ ok: true, task: result.task, message: `Tarea creada: ${result.task.title}` });
  }

  if (operation === "complete_task") {
    const taskId = input.task_id?.trim();
    if (!taskId) return NextResponse.json({ ok: false, error: "task_id is required" }, { status: 400 });
    const { data, error } = await admin.from("tasks").update({ status: "Completado", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", taskId).select("id,title,status").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, task: data, message: `Tarea completada: ${data.title}` });
  }

  if (operation === "list_notes") {
    let query = admin.from("notes").select("id,body,related_to,priority,created_at").eq("user_id", userId).order("created_at", { ascending: false });
    if (input.query?.trim()) query = query.or(`body.ilike.%${input.query.trim()}%,related_to.ilike.%${input.query.trim()}%`);
    const { data, error } = await query.limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, notes: data });
  }

  if (operation === "create_note") {
    const body = input.body?.trim();
    if (!body) return NextResponse.json({ ok: false, error: "body is required" }, { status: 400 });
    const { note } = await insertNote(admin, userId, { body, related_to: input.related_to, priority: input.priority, category: "ChatGPT" });
    return NextResponse.json({ ok: true, note, message: "Nota guardada." });
  }

  if (operation === "list_clients") {
    let query = admin.from("clients").select("id,name,brand,primary_contact,service,status,priority,next_step,due_date,last_important_message").eq("user_id", userId).order("created_at", { ascending: true });
    if (input.query?.trim()) query = query.or(`name.ilike.%${input.query.trim()}%,service.ilike.%${input.query.trim()}%,brand.ilike.%${input.query.trim()}%`);
    const { data, error } = await query.limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, clients: data });
  }

  if (operation === "create_client") {
    const name = input.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    const result = await insertClient(admin, userId, {
      name,
      contact: input.contact,
      service: input.service,
      priority: input.priority,
      brand: input.brand,
      next_step: input.next_step,
    });
    if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true, client: result.client, message: "El cliente ya existía y no fue duplicado." });
    return NextResponse.json({ ok: true, client: result.client, message: `Cliente creado: ${result.client.name}` });
  }

  if (operation === "update_client") {
    const clientId = input.client_id?.trim();
    if (!clientId) return NextResponse.json({ ok: false, error: "client_id is required" }, { status: 400 });
    const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (input.next_step !== undefined) patch.next_step = input.next_step?.trim() || null;
    if (input.status !== undefined) patch.status = input.status?.trim() || null;
    if (input.priority !== undefined) patch.priority = input.priority || null;
    if (input.service !== undefined) patch.service = input.service?.trim() || null;
    if (input.contact !== undefined) patch.primary_contact = input.contact?.trim() || null;
    if (input.due_date !== undefined) patch.due_date = input.due_date?.trim() || null;
    if (input.last_important_message !== undefined) patch.last_important_message = input.last_important_message?.trim() || null;
    if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
    const { data, error } = await admin.from("clients").update(patch).eq("user_id", userId).eq("id", clientId).select("id,name,status,priority,next_step,due_date").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, client: data, message: `Cliente actualizado: ${data.name}` });
  }

  if (operation === "list_events") {
    let query = admin.from("events").select("id,title,description,starts_at,ends_at,location,related_to,status").eq("user_id", userId).order("starts_at", { ascending: true });
    if (input.query?.trim()) query = query.or(`title.ilike.%${input.query.trim()}%,location.ilike.%${input.query.trim()}%,related_to.ilike.%${input.query.trim()}%`);
    else query = query.gte("starts_at", new Date().toISOString());
    const { data, error } = await query.limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, events: data });
  }

  if (operation === "create_event") {
    const title = input.title?.trim();
    const startsAt = input.starts_at?.trim();
    if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    if (!startsAt) return NextResponse.json({ ok: false, error: "starts_at is required" }, { status: 400 });
    const result = await insertEvent(admin, userId, {
      title,
      starts_at: startsAt,
      ends_at: input.ends_at,
      location: input.location,
      description: input.description,
      related_to: input.related_to,
    });
    if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true, event: result.event, message: "El evento ya existía y no fue duplicado." });
    return NextResponse.json({ ok: true, event: result.event, message: `Evento agendado: ${result.event.title}` });
  }

  if (operation === "list_brands") {
    let query = admin.from("brands").select("id,name,type,objective,platforms,active_pending,content_frequency,notes").eq("user_id", userId).order("created_at", { ascending: true });
    if (input.query?.trim()) query = query.or(`name.ilike.%${input.query.trim()}%,type.ilike.%${input.query.trim()}%`);
    const { data, error } = await query.limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, brands: data });
  }

  if (operation === "create_brand") {
    const name = input.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    const result = await insertBrand(admin, userId, {
      name,
      type: input.type,
      objective: input.objective,
      platforms: input.platforms,
      content_frequency: input.content_frequency,
      notes: input.notes,
    });
    if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true, brand: result.brand, message: "La marca ya existía y no fue duplicada." });
    return NextResponse.json({ ok: true, brand: result.brand, message: `Marca creada: ${result.brand.name}` });
  }

  if (operation === "search_email" || operation === "read_email") {
    // A missing refresh token is a setup gap, not a crash: answer with the
    // exact variable names so Samy can fix it instead of seeing a 500.
    if (!gmailConfigured()) {
      return NextResponse.json({
        ok: false,
        error: `Gmail no está conectado. Faltan estas variables en Vercel: ${missingGmailEnvVars().join(", ")}.`,
      });
    }

    if (operation === "search_email") {
      const emails = await searchEmails(input.query?.trim() || "", input.limit ?? 10);
      return NextResponse.json({ ok: true, emails });
    }

    const messageId = input.message_id?.trim();
    if (!messageId) return NextResponse.json({ ok: false, error: "message_id is required" }, { status: 400 });
    const email = await readEmail(messageId);
    return NextResponse.json({ ok: true, email });
  }

  return NextResponse.json({ ok: false, error: `Unsupported operation: ${operation}` }, { status: 400 });
  } catch (error) {
    console.error("ChatGPT gateway error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
