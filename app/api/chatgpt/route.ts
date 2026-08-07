import { NextResponse } from "next/server";
import { assertSamyOsApiAuth, getSamyOsAdmin, getSamyOsOwnerId } from "@/lib/server/samy-os-admin";

export const runtime = "nodejs";

type Operation =
  | "overview"
  | "list_tasks"
  | "create_task"
  | "complete_task"
  | "list_notes"
  | "create_note";

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
      const dueDate = input.due_date?.trim() || null;
      let duplicateQuery = admin.from("tasks").select("id,title,due_date").eq("user_id", userId).eq("title", title).neq("status", "Completado");
      duplicateQuery = dueDate ? duplicateQuery.eq("due_date", dueDate) : duplicateQuery.is("due_date", null);
      const duplicate = await duplicateQuery.limit(1);
      if (duplicate.error) throw new Error(duplicate.error.message);
      if (duplicate.data?.length) return NextResponse.json({ ok: true, duplicate: true, task: duplicate.data[0], message: "La tarea ya existía y no fue duplicada." });

      const { data, error } = await admin.from("tasks").insert({
        user_id: userId,
        title,
        area: input.area?.trim() || "General",
        priority: input.priority || "Media",
        status: "Pendiente",
        due_date: dueDate,
        source: "ChatGPT",
      }).select("id,title,area,priority,status,due_date").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, task: data, message: `Tarea creada: ${data.title}` });
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
      const { data, error } = await admin.from("notes").insert({
        user_id: userId,
        body,
        related_to: input.related_to?.trim() || null,
        category: "ChatGPT",
        priority: input.priority || "Media",
      }).select("id,body,related_to,priority,created_at").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, note: data, message: "Nota guardada." });
    }

    return NextResponse.json({ ok: false, error: `Unsupported operation: ${operation}` }, { status: 400 });
  } catch (error) {
    console.error("ChatGPT gateway error", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
