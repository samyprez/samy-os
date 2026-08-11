import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { insertEvent, insertBrand } from "@/lib/server/assistant-engine";
import { gmailConfigured, missingGmailEnvVars, readEmail, searchEmails } from "@/lib/server/gmail";
import {
  appendHubProjectNote,
  createHubClient,
  createHubProject,
  createHubReminder,
  findHubClient,
  findHubProject,
  hubConfigured,
  listHubClients,
  listHubInvoices,
  listHubProjects,
  listHubReminders,
  missingHubEnvVars,
  updateHubClient,
  updateHubProject,
} from "@/lib/server/hub";

// Shared by /api/chatgpt (ChatGPT Actions, static bearer token) and
// /api/dashboard (the browser, signed-in Samy OS session). Both authenticate
// differently but must behave identically once a userId is resolved, so the
// operation logic itself lives here exactly once.

export type Operation =
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
  | "list_health"
  | "create_health"
  | "search_email"
  | "read_email"
  // Amazing Business Hub — app.amazingsolutions.ca. A separate database and a
  // separate system of record: the Hub holds the business (50 clients, the
  // project board, invoices), Samy OS holds Samuel's personal assistant data.
  // Living here rather than only in the ChatGPT route means the Samy OS
  // dashboard gets these operations too.
  | "list_projects"
  | "create_project"
  | "update_project"
  | "add_project_note"
  | "list_hub_clients"
  | "list_invoices";

export type GatewayInput = {
  operation?: Operation;
  title?: string;
  area?: string | null;
  priority?: "Alta" | "Media" | "Baja" | null;
  due_date?: string | null;
  task_id?: string | null;
  query?: string | null;
  body?: string;
  related_to?: string | null;
  client_id?: string | null;
  name?: string;
  contact?: string | null;
  service?: string | null;
  brand?: string | null;
  next_step?: string | null;
  status?: string | null;
  last_important_message?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
  type?: string | null;
  objective?: string | null;
  platforms?: string | null;
  content_frequency?: string | null;
  notes?: string | null;
  limit?: number | null;
  message_id?: string | null;
  // Hub
  project?: string | null;
  progress_percent?: number | null;
  delivery_date?: string | null;
  note?: string | null;
  // Health
  entry_date?: string | null;
  sleep_hours?: number | null;
  energy_level?: number | null;
  water_glasses?: number | null;
  movement_minutes?: number | null;
  mood?: string | null;
};

export async function runGatewayOperation(input: GatewayInput, admin: SupabaseClient, userId: string) {
  const operation = input.operation;
  if (!operation) return NextResponse.json({ ok: false, error: "operation is required" }, { status: 400 });

  // Tasks and projects both live in the Hub now (2026-08-10) — Samy asked to
  // stop using Samy OS's own `tasks` table entirely so "tarea" and "proyecto"
  // always land in the same place, app.amazingsolutions.ca. list_tasks,
  // create_task and complete_task are kept as operation names (ChatGPT's
  // vocabulary for a spoken "tarea") but are now aliases over Hub projects.
  const HUB_OPS = new Set<Operation>([
    "list_tasks",
    "create_task",
    "complete_task",
    "list_projects",
    "create_project",
    "update_project",
    "add_project_note",
    "list_clients",
    "create_client",
    "update_client",
    "list_hub_clients",
    "list_invoices",
    "list_notes",
    "create_note",
  ]);

  if (HUB_OPS.has(operation) && !hubConfigured()) {
    return NextResponse.json({
      ok: false,
      error: `La oficina virtual no está conectada. Faltan estas variables en Vercel: ${missingHubEnvVars().join(", ")}.`,
    });
  }

  if (operation === "overview") {
    const events = await admin.from("events").select("id,title,starts_at,location,status").eq("user_id", userId).gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(10);
    if (events.error) throw new Error(events.error.message);

    let tasks: Awaited<ReturnType<typeof listHubProjects>> = [];
    let clients: Awaited<ReturnType<typeof listHubClients>> = [];
    let notes: Awaited<ReturnType<typeof listHubReminders>> = [];
    if (hubConfigured()) {
      const [projects, hubClients, hubNotes] = await Promise.all([listHubProjects({}), listHubClients(), listHubReminders({})]);
      tasks = projects.filter((p) => p.status !== "completed").slice(0, 20);
      clients = hubClients.slice(0, 50);
      notes = hubNotes;
    }

    return NextResponse.json({ ok: true, tasks, notes, clients, events: events.data });
  }

  if (operation === "list_tasks") {
    const tasks = await listHubProjects({ query: input.query, status: input.status });
    return NextResponse.json({ ok: true, tasks });
  }

  if (operation === "create_task") {
    const title = input.title?.trim();
    if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    const task = await createHubProject({
      title,
      client_name: input.name || input.related_to,
      description: input.description,
      status: input.status,
      delivery_date: input.delivery_date || input.due_date,
    });
    return NextResponse.json({ ok: true, task, message: `Tarea creada: ${task.title}` });
  }

  if (operation === "complete_task") {
    const ref = input.task_id?.trim() || input.project?.trim() || input.title?.trim();
    if (!ref) return NextResponse.json({ ok: false, error: "task_id is required" }, { status: 400 });

    const { match, candidates } = await findHubProject(ref);
    if (!match) {
      return NextResponse.json({
        ok: false,
        error: candidates.length
          ? `Hay ${candidates.length} tareas que coinciden con "${ref}". Pregúntale a Samy cuál.`
          : `No encontré ninguna tarea que coincida con "${ref}".`,
        candidates: candidates.map((c) => ({ id: c.id, title: c.title, client_name: c.client_name, status: c.status })),
      });
    }

    const task = await updateHubProject(match.id, { status: "completed" });
    return NextResponse.json({ ok: true, task, message: `Tarea completada: ${task.title}` });
  }

  if (operation === "list_notes") {
    const notes = await listHubReminders({ query: input.query });
    return NextResponse.json({ ok: true, notes });
  }

  if (operation === "create_note") {
    const body = input.body?.trim();
    if (!body) return NextResponse.json({ ok: false, error: "body is required" }, { status: 400 });
    const note = await createHubReminder({
      title: input.title,
      content: body,
      is_urgent: input.priority === "Alta",
    });
    return NextResponse.json({ ok: true, note, message: "Nota guardada." });
  }

  if (operation === "list_clients") {
    const clients = await listHubClients(input.query);
    return NextResponse.json({ ok: true, clients });
  }

  if (operation === "create_client") {
    const name = input.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    const contact = input.contact?.trim();
    const client = await createHubClient({
      company_name: name,
      email: contact?.includes("@") ? contact : undefined,
      phone: contact && !contact.includes("@") ? contact : undefined,
      service_interest: input.service,
    });
    return NextResponse.json({ ok: true, client, message: `Cliente creado: ${client.company_name}` });
  }

  if (operation === "update_client") {
    const ref = input.client_id?.trim() || input.name?.trim();
    if (!ref) return NextResponse.json({ ok: false, error: "client_id is required" }, { status: 400 });

    const { match, candidates } = await findHubClient(ref);
    if (!match) {
      return NextResponse.json({
        ok: false,
        error: candidates.length
          ? `Hay ${candidates.length} clientes que coinciden con "${ref}". Pregúntale a Samy cuál.`
          : `No encontré ningún cliente que coincida con "${ref}".`,
        candidates: candidates.map((c) => ({ id: c.id, company_name: c.company_name, email: c.email })),
      });
    }

    const client = await updateHubClient(match.id, {
      contact_name: input.contact,
      service_interest: input.service,
      comments: input.next_step ?? input.last_important_message,
      status: input.status,
    });
    return NextResponse.json({ ok: true, client, message: `Cliente actualizado: ${client.company_name}` });
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

  if (operation === "list_health") {
    let query = admin
      .from("health_entries")
      .select("id,entry_date,sleep_hours,energy_level,water_glasses,movement_minutes,mood,notes,created_at")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });
    if (input.query?.trim()) query = query.or(`mood.ilike.%${input.query.trim()}%,notes.ilike.%${input.query.trim()}%`);
    const { data, error } = await query.limit(30);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, health: data });
  }

  if (operation === "create_health") {
    const entryDate = input.entry_date?.trim() || new Date().toISOString().slice(0, 10);
    const { data, error } = await admin
      .from("health_entries")
      .insert({
        user_id: userId,
        entry_date: entryDate,
        sleep_hours: input.sleep_hours ?? null,
        energy_level: input.energy_level ?? null,
        water_glasses: input.water_glasses ?? null,
        movement_minutes: input.movement_minutes ?? null,
        mood: input.mood?.trim() || null,
        notes: input.body?.trim() || input.notes?.trim() || null,
      })
      .select("id,entry_date,sleep_hours,energy_level,water_glasses,movement_minutes,mood,notes")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, health: data, message: "Registro de salud guardado." });
  }

  if (operation === "search_email" || operation === "read_email") {
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

  // ---- Amazing Business Hub ----------------------------------------------

  if (operation === "list_projects") {
    const projects = await listHubProjects({ query: input.query, status: input.status });
    return NextResponse.json({ ok: true, projects });
  }

  if (operation === "create_project") {
    const title = input.title?.trim();
    if (!title) return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    const project = await createHubProject({
      title,
      client_name: input.name || input.related_to,
      description: input.description,
      status: input.status,
      delivery_date: input.delivery_date,
    });
    return NextResponse.json({ ok: true, project, message: `Proyecto creado: ${project.title}` });
  }

  if (operation === "update_project" || operation === "add_project_note") {
    const ref = input.project?.trim() || input.title?.trim();
    if (!ref) {
      return NextResponse.json(
        { ok: false, error: "project is required (nombre o id del proyecto)" },
        { status: 400 },
      );
    }

    const { match, candidates } = await findHubProject(ref);
    if (!match) {
      // Ambiguity is reported rather than resolved: updating the wrong project
      // silently is worse than asking which one was meant.
      return NextResponse.json({
        ok: false,
        error: candidates.length
          ? `Hay ${candidates.length} proyectos que coinciden con "${ref}". Pregúntale a Samy cuál.`
          : `No encontré ningún proyecto que coincida con "${ref}".`,
        candidates: candidates.map((c) => ({
          id: c.id,
          title: c.title,
          client_name: c.client_name,
          status: c.status,
        })),
      });
    }

    if (operation === "add_project_note") {
      const note = input.note?.trim() || input.body?.trim();
      if (!note) return NextResponse.json({ ok: false, error: "note is required" }, { status: 400 });
      const project = await appendHubProjectNote(match.id, note);
      return NextResponse.json({ ok: true, project, message: `Nota añadida a ${project.title}.` });
    }

    try {
      const project = await updateHubProject(match.id, {
        status: input.status,
        progress_percent: input.progress_percent,
        delivery_date: input.delivery_date,
        description: input.description,
      });
      return NextResponse.json({ ok: true, project, message: `Proyecto actualizado: ${project.title}` });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "No pude actualizar el proyecto." },
        { status: 400 },
      );
    }
  }

  if (operation === "list_hub_clients") {
    const clients = await listHubClients(input.query);
    return NextResponse.json({ ok: true, clients });
  }

  if (operation === "list_invoices") {
    const invoices = await listHubInvoices({ status: input.status, query: input.query });
    return NextResponse.json({ ok: true, invoices });
  }

  return NextResponse.json({ ok: false, error: `Unsupported operation: ${operation}` }, { status: 400 });
}
