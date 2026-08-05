"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Section =
  | "Dashboard"
  | "Clientes"
  | "Pendientes"
  | "Calendario"
  | "Marcas"
  | "Notas"
  | "Salud";

type Client = {
  id: string;
  name: string;
  brand: string | null;
  primary_contact: string | null;
  service: string | null;
  status: string;
  priority: string;
  next_step: string | null;
};

type Task = {
  id: string;
  client_id: string | null;
  area: string | null;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
};

const navigation: Array<{ name: Section; icon: typeof LayoutDashboard }> = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Clientes", icon: Users },
  { name: "Pendientes", icon: ClipboardList },
  { name: "Calendario", icon: CalendarDays },
  { name: "Marcas", icon: Store },
  { name: "Notas", icon: NotebookPen },
  { name: "Salud", icon: HeartPulse },
];

const starterClients = [
  {
    name: "Salami Sibao",
    brand: "Amazing Solutions",
    primary_contact: "Orian",
    service: "Website + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    next_step: "Terminar actualización web y dar seguimiento en Toronto.",
  },
  {
    name: "MiKiosko.ca",
    brand: "Amazing Solutions / TorontoDominicano",
    primary_contact: "Por confirmar",
    service: "Contenido + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    next_step: "Crear contenido con productos reales y colocar banners.",
  },
];

const starterTasks = [
  { title: "Terminar actualización web", area: "Salami Sibao", priority: "Alta", status: "Pendiente" },
  { title: "Dar seguimiento a representante de Toronto", area: "Salami Sibao", priority: "Alta", status: "Pendiente" },
  { title: "Crear contenido con productos reales", area: "MiKiosko.ca", priority: "Alta", status: "En progreso" },
  { title: "Colocar banners en TorontoDominicano", area: "MiKiosko.ca", priority: "Media", status: "Pendiente" },
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
      {children}
    </span>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("Dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskArea, setNewTaskArea] = useState("");

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const [{ data: existingClients, error: clientsError }, { data: existingTasks, error: tasksError }] =
      await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: true }),
        supabase.from("tasks").select("*").order("created_at", { ascending: true }),
      ]);

    if (clientsError || tasksError) {
      setNotice(clientsError?.message || tasksError?.message || "No se pudieron cargar los datos.");
      setLoading(false);
      return;
    }

    let loadedClients = (existingClients ?? []) as Client[];
    let loadedTasks = (existingTasks ?? []) as Task[];

    if (loadedClients.length === 0) {
      const { data } = await supabase
        .from("clients")
        .insert(starterClients.map((client) => ({ ...client, user_id: user.id })))
        .select();
      loadedClients = (data ?? []) as Client[];
    }

    if (loadedTasks.length === 0) {
      const { data } = await supabase
        .from("tasks")
        .insert(starterTasks.map((task) => ({ ...task, user_id: user.id })))
        .select();
      loadedTasks = (data ?? []) as Task[];
    }

    setClients(loadedClients);
    setTasks(loadedTasks);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function addClient() {
    const name = newClientName.trim();
    if (!name) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data, error } = await supabase
      .from("clients")
      .insert({
        user_id: authData.user.id,
        name,
        status: "Activo",
        priority: "Media",
        next_step: "Definir próximo paso",
      })
      .select()
      .single();

    if (error) return setNotice(error.message);
    setClients((current) => [...current, data as Client]);
    setNewClientName("");
    setNotice("Cliente creado correctamente.");
  }

  async function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: authData.user.id,
        title,
        area: newTaskArea.trim() || "General",
        status: "Pendiente",
        priority: "Media",
      })
      .select()
      .single();

    if (error) return setNotice(error.message);
    setTasks((current) => [...current, data as Task]);
    setNewTaskTitle("");
    setNewTaskArea("");
    setNotice("Tarea creada correctamente.");
  }

  async function toggleTask(task: Task) {
    const nextStatus = task.status === "Completado" ? "Pendiente" : "Completado";
    const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);
    if (error) return setNotice(error.message);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item)));
  }

  function runAssistant() {
    const command = assistantInput.trim().toLowerCase();
    if (!command) return;

    if (command.includes("salami")) {
      const matches = tasks.filter((task) => (task.area ?? "").toLowerCase().includes("salami"));
      setAssistantReply(
        matches.length
          ? `Salami Sibao tiene ${matches.length} tarea(s): ${matches.map((task) => `${task.title} (${task.status})`).join(", ")}.`
          : "No encontré tareas de Salami Sibao.",
      );
    } else if (command.includes("pendiente") || command.includes("tarea")) {
      const pending = tasks.filter((task) => task.status !== "Completado");
      setAssistantReply(`Tienes ${pending.length} tarea(s) pendientes.`);
    } else if (command.includes("cliente")) {
      setAssistantReply(`Tienes ${clients.length} cliente(s) activos en Samy OS.`);
    } else if (command.includes("calendario") || command.includes("mañana") || command.includes("hoy")) {
      setAssistantReply("La conexión con Google Calendar es el próximo módulo. Por ahora no hay eventos sincronizados.");
    } else {
      setAssistantReply("Puedo ayudarte con clientes, tareas y Salami Sibao. Prueba: “muéstrame los pendientes de Salami Sibao”.");
    }
  }

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => `${client.name} ${client.brand ?? ""} ${client.service ?? ""}`.toLowerCase().includes(query));
  }, [clients, search]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => `${task.title} ${task.area ?? ""} ${task.status}`.toLowerCase().includes(query));
  }, [tasks, search]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#090b10] text-zinc-300">Cargando Samy OS…</main>;
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-zinc-100">
      <div className="flex min-h-screen">
        {mobileMenuOpen && <button aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMobileMenuOpen(false)} />}

        <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-[#0d1017] transition-transform lg:static lg:translate-x-0 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400"><Sparkles size={20} /></div>
              <div><p className="font-semibold">Samy OS</p><p className="text-xs text-zinc-500">Centro de operaciones</p></div>
            </div>
            <button className="lg:hidden" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navigation.map(({ name, icon: Icon }) => (
              <button key={name} onClick={() => { setActiveSection(name); setMobileMenuOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${activeSection === name ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={19} />{name}
              </button>
            ))}
          </nav>

          <button onClick={signOut} className="m-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5"><LogOut size={17} />Cerrar sesión</button>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-white/10 bg-[#090b10]/90 px-4 backdrop-blur-xl sm:px-8">
            <button className="rounded-xl border border-white/10 p-2.5 lg:hidden" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
            <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">Samy OS v0.2</p><h1 className="text-xl font-semibold">{activeSection}</h1></div>
            <label className="hidden w-full max-w-sm items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 sm:flex"><Search size={17} className="text-zinc-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clientes o tareas" className="w-full bg-transparent text-sm outline-none" /></label>
          </header>

          <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
            {notice && <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">{notice}</div>}

            {activeSection === "Dashboard" && (
              <>
                <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-[#111520] to-cyan-400/10 p-6 sm:p-8">
                  <p className="text-sm font-semibold text-violet-300">Resumen ejecutivo</p>
                  <h2 className="mt-3 text-3xl font-semibold">Buenas, Samy. Tu operación ya está conectada.</h2>
                  <p className="mt-3 text-zinc-400">Tienes {clients.length} clientes y {tasks.filter((task) => task.status !== "Completado").length} tareas abiertas.</p>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Clientes activos", clients.length, Users],
                    ["Pendientes", tasks.filter((task) => task.status !== "Completado").length, CheckCircle2],
                    ["Completadas", tasks.filter((task) => task.status === "Completado").length, ClipboardList],
                    ["Eventos", 0, CalendarDays],
                  ].map(([label, value, Icon]) => {
                    const MetricIcon = Icon as typeof Users;
                    return <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><MetricIcon size={20} className="text-violet-300" /><p className="mt-5 text-sm text-zinc-500">{label as string}</p><p className="mt-2 text-3xl font-semibold">{value as number}</p></article>;
                  })}
                </section>

                <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                  <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h3 className="text-xl font-semibold">Próximas acciones</h3><div className="mt-5 space-y-3">{tasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}</div></article>
                  <article className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-5"><Sparkles className="text-violet-300" /><h3 className="mt-4 text-xl font-semibold">Pregúntale a Samy OS</h3><textarea value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder="Muéstrame los pendientes de Salami Sibao" className="mt-4 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none" /><button onClick={runAssistant} className="mt-3 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold">Consultar</button>{assistantReply && <p className="mt-4 rounded-xl bg-black/20 p-4 text-sm leading-6 text-zinc-300">{assistantReply}</p>}</article>
                </section>
              </>
            )}

            {activeSection === "Clientes" && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row"><input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Nombre del nuevo cliente" className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none" /><button onClick={addClient} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-zinc-950"><Plus size={18} />Nuevo cliente</button></div>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">{filteredClients.map((client) => <article key={client.id} className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="flex justify-between gap-4"><div><h3 className="text-lg font-semibold">{client.name}</h3><p className="mt-1 text-sm text-zinc-500">{client.brand || "Sin marca"}</p></div><Pill>{client.priority}</Pill></div><p className="mt-4 text-sm text-zinc-300">{client.service || "Servicio por definir"}</p><p className="mt-3 text-sm text-zinc-500">Próximo paso: {client.next_step || "Por definir"}</p></article>)}</div>
              </section>
            )}

            {activeSection === "Pendientes" && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                <div className="grid gap-3 md:grid-cols-[1fr_0.6fr_auto]"><input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Nueva tarea" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none" /><input value={newTaskArea} onChange={(event) => setNewTaskArea(event.target.value)} placeholder="Cliente o área" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none" /><button onClick={addTask} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-zinc-950"><Plus size={18} />Crear tarea</button></div>
                <div className="mt-6 space-y-3">{filteredTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}</div>
              </section>
            )}

            {activeSection === "Calendario" && <EmptyState icon={CalendarDays} title="Calendario" description="Google Calendar será el próximo conector." />}
            {activeSection === "Marcas" && <EmptyState icon={Store} title="Marcas" description="Aquí administraremos Amazing Solutions, TorontoDominicano y Samy Prez." />}
            {activeSection === "Notas" && <EmptyState icon={NotebookPen} title="Notas" description="El módulo de notas persistentes viene en la próxima iteración." />}
            {activeSection === "Salud" && <EmptyState icon={HeartPulse} title="Salud" description="Este espacio se mantendrá privado y separado de los datos comerciales." />}
          </div>
        </section>
      </div>
    </main>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  return (
    <article className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <button aria-label={`Cambiar estado de ${task.title}`} onClick={() => onToggle(task)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${task.status === "Completado" ? "border-emerald-400 bg-emerald-400 text-black" : "border-zinc-600"}`}>{task.status === "Completado" && <CheckCircle2 size={15} />}</button>
      <div className="min-w-0 flex-1"><p className={task.status === "Completado" ? "text-zinc-500 line-through" : "font-medium"}>{task.title}</p><p className="mt-1 text-sm text-zinc-500">{task.area || "General"} · {task.status}</p></div><Pill>{task.priority}</Pill>
    </article>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof CalendarDays; title: string; description: string }) {
  return <section className="flex min-h-[430px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5"><Icon size={25} /></div><h2 className="mt-5 text-2xl font-semibold">{title}</h2><p className="mt-3 text-sm text-zinc-500">{description}</p></div></section>;
}
