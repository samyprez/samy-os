import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Amazing Business Hub — app.amazingsolutions.ca
 *
 * The Hub is the system of record for the business: clients, projects and
 * invoices. Samy OS keeps its own database for Samuel's personal assistant
 * data (tasks, notes, events), so nothing is migrated and neither app has to
 * change. Walie reads and writes both.
 *
 * Access is with the Hub's service-role key. Its tables are gated by RLS on
 * a `profiles.role` staff check, which a server-to-server caller has no
 * session for — the service role is the only workable path, and it is why
 * this module never accepts a table name or filter from the caller.
 *
 * The schema here was read from the live deployment, not from the repo's
 * migrations: those have drifted badly. `projects.status` is
 * pending|in_progress|monthly|urgent|completed, not the values in
 * 0003_add_projects.sql, and clients use `company_name`, not `name`.
 */

export const HUB_PROJECT_STATUSES = [
  "pending",
  "in_progress",
  "monthly",
  "urgent",
  "completed",
] as const;

export type HubProjectStatus = (typeof HUB_PROJECT_STATUSES)[number];

/** What Samuel says out loud, mapped to what the column stores. */
const STATUS_SYNONYMS: Record<string, HubProjectStatus> = {
  pendiente: "pending",
  pending: "pending",
  "en progreso": "in_progress",
  progreso: "in_progress",
  taller: "in_progress",
  in_progress: "in_progress",
  mensual: "monthly",
  recurrente: "monthly",
  monthly: "monthly",
  urgente: "urgent",
  urgent: "urgent",
  completado: "completed",
  completada: "completed",
  terminado: "completed",
  terminada: "completed",
  listo: "completed",
  completed: "completed",
};

export function normalizeProjectStatus(input: string | null | undefined): HubProjectStatus | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return STATUS_SYNONYMS[key] ?? null;
}

export function missingHubEnvVars() {
  return ["HUB_SUPABASE_URL", "HUB_SUPABASE_SERVICE_ROLE_KEY"].filter(
    (name) => !process.env[name]?.trim(),
  );
}

export function hubConfigured() {
  return missingHubEnvVars().length === 0;
}

let cached: SupabaseClient | null = null;

export function getHubAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.HUB_SUPABASE_URL?.trim();
  const key = process.env.HUB_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error(`Missing ${missingHubEnvVars().join(", ")}`);

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

export function hubProjectRef() {
  const url = process.env.HUB_SUPABASE_URL?.trim();
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").split(".")[0];
}

const PROJECT_FIELDS =
  "id,title,description,status,progress_percent,client_id,client_name,delivery_date,started_at,completed_at,notes,created_at";

export async function listHubProjects(options: { query?: string | null; status?: string | null } = {}) {
  let q = getHubAdmin().from("projects").select(PROJECT_FIELDS);

  const status = normalizeProjectStatus(options.status);
  if (status) q = q.eq("status", status);

  const search = options.query?.trim();
  if (search) q = q.or(`title.ilike.%${search}%,client_name.ilike.%${search}%,description.ilike.%${search}%`);

  // Nulls last so dated work leads; the board reads the same way.
  const { data, error } = await q.order("delivery_date", { ascending: true, nullsFirst: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Resolves a spoken project name to exactly one row. Returning the
 * candidates on an ambiguous match lets the assistant ask which one rather
 * than guess and update the wrong project.
 */
export type HubProject = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  progress_percent: number | null;
  client_id: string | null;
  client_name: string | null;
  delivery_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string | null;
};

export async function findHubProject(
  nameOrId: string,
): Promise<{ match: HubProject | null; candidates: HubProject[] }> {
  const value = nameOrId.trim();
  const admin = getHubAdmin();

  if (/^[0-9a-f-]{36}$/i.test(value)) {
    const { data, error } = await admin.from("projects").select(PROJECT_FIELDS).eq("id", value).maybeSingle();
    if (error) throw new Error(error.message);
    return { match: (data as HubProject | null) ?? null, candidates: [] };
  }

  const { data, error } = await admin
    .from("projects")
    .select(PROJECT_FIELDS)
    .or(`title.ilike.%${value}%,client_name.ilike.%${value}%`)
    .limit(10);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as HubProject[];
  if (rows.length === 1) return { match: rows[0], candidates: [] };

  const exact = rows.filter((r) => r.title?.toLowerCase() === value.toLowerCase());
  if (exact.length === 1) return { match: exact[0], candidates: [] };

  return { match: null, candidates: rows };
}

export type HubProjectPatch = {
  status?: string | null;
  progress_percent?: number | null;
  delivery_date?: string | null;
  description?: string | null;
  title?: string | null;
};

export async function updateHubProject(projectId: string, patch: HubProjectPatch) {
  const update: Record<string, unknown> = {};

  if (patch.status !== undefined && patch.status !== null) {
    const status = normalizeProjectStatus(patch.status);
    if (!status) {
      throw new Error(
        `Estado no válido: "${patch.status}". Usa uno de: ${HUB_PROJECT_STATUSES.join(", ")}.`,
      );
    }
    update.status = status;
    // Keep completed_at consistent with the board rather than leaving a
    // finished project with an empty completion date.
    if (status === "completed") update.completed_at = new Date().toISOString();
  }

  if (patch.progress_percent !== undefined && patch.progress_percent !== null) {
    const pct = Math.round(Number(patch.progress_percent));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new Error("progress_percent debe ser un número entre 0 y 100.");
    }
    update.progress_percent = pct;
    if (pct === 100 && update.status === undefined) {
      update.status = "completed";
      update.completed_at = new Date().toISOString();
    }
  }

  if (patch.delivery_date !== undefined) update.delivery_date = patch.delivery_date?.trim() || null;
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.title !== undefined && patch.title?.trim()) update.title = patch.title.trim();

  if (Object.keys(update).length === 0) throw new Error("No hay nada que actualizar.");

  const { data, error } = await getHubAdmin()
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Appends rather than replaces. Notes dictated over time are a running log,
 * and overwriting would silently destroy whatever was there.
 */
export async function appendHubProjectNote(projectId: string, note: string) {
  const admin = getHubAdmin();
  const { data: current, error: readError } = await admin
    .from("projects")
    .select("id,title,notes")
    .eq("id", projectId)
    .single();
  if (readError) throw new Error(readError.message);

  const stamp = new Date().toLocaleDateString("es-CA", { timeZone: "America/Toronto" });
  const entry = `[${stamp}] ${note.trim()}`;
  const merged = current.notes?.trim() ? `${current.notes.trim()}\n${entry}` : entry;

  const { data, error } = await admin
    .from("projects")
    .update({ notes: merged })
    .eq("id", projectId)
    .select("id,title,notes")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createHubProject(input: {
  title: string;
  client_name?: string | null;
  client_id?: string | null;
  description?: string | null;
  status?: string | null;
  delivery_date?: string | null;
}) {
  const status = normalizeProjectStatus(input.status) ?? "pending";
  const { data, error } = await getHubAdmin()
    .from("projects")
    .insert({
      title: input.title.trim(),
      client_id: input.client_id?.trim() || null,
      client_name: input.client_name?.trim() || null,
      description: input.description?.trim() || null,
      status,
      progress_percent: 0,
      delivery_date: input.delivery_date?.trim() || null,
    })
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

const CLIENT_FIELDS =
  "id,company_name,contact_name,email,phone,website,status,service_interest,follow_up_date,comments,is_active,created_at";

export async function listHubClients(query?: string | null) {
  let q = getHubAdmin().from("clients").select(CLIENT_FIELDS);
  const search = query?.trim();
  if (search) {
    q = q.or(
      `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%,service_interest.ilike.%${search}%`,
    );
  }
  const { data, error } = await q.order("company_name", { ascending: true }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type HubClient = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string | null;
  service_interest: string | null;
  follow_up_date: string | null;
  comments: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

/** Same ambiguity-returns-candidates pattern as findHubProject. */
export async function findHubClient(
  nameOrId: string,
): Promise<{ match: HubClient | null; candidates: HubClient[] }> {
  const value = nameOrId.trim();
  const admin = getHubAdmin();

  if (/^[0-9a-f-]{36}$/i.test(value)) {
    const { data, error } = await admin.from("clients").select(CLIENT_FIELDS).eq("id", value).maybeSingle();
    if (error) throw new Error(error.message);
    return { match: (data as HubClient | null) ?? null, candidates: [] };
  }

  const { data, error } = await admin
    .from("clients")
    .select(CLIENT_FIELDS)
    .or(`company_name.ilike.%${value}%,contact_name.ilike.%${value}%`)
    .limit(10);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as HubClient[];
  if (rows.length === 1) return { match: rows[0], candidates: [] };

  const exact = rows.filter((r) => r.company_name?.toLowerCase() === value.toLowerCase());
  if (exact.length === 1) return { match: exact[0], candidates: [] };

  return { match: null, candidates: rows };
}

export async function createHubClient(input: {
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_interest?: string | null;
}) {
  const { data, error } = await getHubAdmin()
    .from("clients")
    .insert({
      company_name: input.company_name.trim(),
      contact_name: input.contact_name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      service_interest: input.service_interest?.trim() || null,
      is_active: true,
    })
    .select(CLIENT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateHubClient(
  clientId: string,
  patch: {
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    service_interest?: string | null;
    comments?: string | null;
    follow_up_date?: string | null;
    status?: string | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (patch.contact_name !== undefined) update.contact_name = patch.contact_name?.trim() || null;
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.service_interest !== undefined) update.service_interest = patch.service_interest?.trim() || null;
  if (patch.comments !== undefined) update.comments = patch.comments?.trim() || null;
  if (patch.follow_up_date !== undefined) update.follow_up_date = patch.follow_up_date?.trim() || null;
  if (patch.status !== undefined) update.status = patch.status?.trim() || null;

  if (Object.keys(update).length === 0) throw new Error("No hay nada que actualizar.");

  const { data, error } = await getHubAdmin()
    .from("clients")
    .update(update)
    .eq("id", clientId)
    .select(CLIENT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listHubInvoices(options: { status?: string | null; query?: string | null } = {}) {
  let q = getHubAdmin()
    .from("invoices")
    .select("id,client_id,client_name,status,total_amount,currency,due_date,notes,created_at,stripe_payment_link_url,wave_view_url");

  if (options.status?.trim()) q = q.eq("status", options.status.trim());
  if (options.query?.trim()) q = q.ilike("client_name", `%${options.query.trim()}%`);

  const { data, error } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// "Notas" in the Hub UI — a Google-Keep-style board, table name `reminders`.
// Read from the SQL Editor history (2026-08-11), not the repo: this table
// doesn't exist in the amazing-business-hub git checkout at all, so whatever
// deployed it did so outside that repo. RLS is disabled and there is no
// user_id column — it's a single shared board, not per-user.
const REMINDER_FIELDS =
  "id,title,content,checklist,is_urgent,needs_context,is_done,is_pinned,color,position,created_at";

export async function listHubReminders(options: { query?: string | null; includeDone?: boolean } = {}) {
  let q = getHubAdmin().from("reminders").select(REMINDER_FIELDS);
  if (!options.includeDone) q = q.eq("is_done", false);
  const search = options.query?.trim();
  if (search) q = q.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  const { data, error } = await q
    .order("is_pinned", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createHubReminder(input: {
  title?: string | null;
  content: string;
  is_urgent?: boolean | null;
  is_pinned?: boolean | null;
  checklist?: { text: string; done?: boolean }[] | null;
}) {
  const { data, error } = await getHubAdmin()
    .from("reminders")
    .insert({
      title: input.title?.trim() || "",
      content: input.content.trim(),
      is_urgent: input.is_urgent ?? false,
      is_pinned: input.is_pinned ?? false,
      checklist: input.checklist ?? [],
    })
    .select(REMINDER_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function completeHubReminder(reminderId: string) {
  const { data, error } = await getHubAdmin()
    .from("reminders")
    .update({ is_done: true })
    .eq("id", reminderId)
    .select(REMINDER_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Cheap reachability check for /api/health, mirroring the Supabase one. */
export async function hubReachable() {
  const { error } = await getHubAdmin().from("projects").select("id").limit(1);
  if (error) throw new Error(error.message);
  return true;
}
