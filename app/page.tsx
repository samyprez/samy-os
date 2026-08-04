"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  NotebookPen,
  Search,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type Section =
  | "Dashboard"
  | "Clientes"
  | "Pendientes"
  | "Calendario"
  | "Marcas"
  | "Notas"
  | "Salud";

const navigation: Array<{
  name: Section;
  icon: typeof LayoutDashboard;
}> = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Clientes", icon: Users },
  { name: "Pendientes", icon: ClipboardList },
  { name: "Calendario", icon: CalendarDays },
  { name: "Marcas", icon: Store },
  { name: "Notas", icon: NotebookPen },
  { name: "Salud", icon: HeartPulse },
];

const clients = [
  {
    name: "Salami Sibao",
    brand: "Amazing Solutions",
    service: "Website + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    contact: "Orian, representante Toronto por confirmar",
    nextStep:
      "Terminar actualización web y dar seguimiento a la representante de Toronto.",
  },
  {
    name: "MiKiosko.ca",
    brand: "Amazing Solutions / TorontoDominicano",
    service: "Contenido + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    contact: "Contacto por confirmar",
    nextStep:
      "Crear contenido con productos reales y colocar banners en TorontoDominicano.",
  },
];

const tasks = [
  {
    title: "Terminar actualización web",
    area: "Salami Sibao",
    status: "Pendiente",
    priority: "Alta",
  },
  {
    title: "Dar seguimiento a representante de Toronto",
    area: "Salami Sibao",
    status: "Pendiente",
    priority: "Alta",
  },
  {
    title: "Crear contenido con productos reales",
    area: "MiKiosko.ca",
    status: "En progreso",
    priority: "Alta",
  },
  {
    title: "Colocar banners en TorontoDominicano",
    area: "MiKiosko.ca",
    status: "Pendiente",
    priority: "Media",
  },
];

const brands = [
  {
    name: "Amazing Solutions",
    type: "Negocio principal",
    objective: "Web, marketing y ventas",
  },
  {
    name: "TorontoDominicano",
    type: "Medio comunitario",
    objective: "Eventos y comunidad dominicana",
  },
  {
    name: "Samy Prez",
    type: "Marca personal",
    objective: "Contenido personal y liderazgo",
  },
];

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
      {children}
    </span>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] =
    useState<Section>("Dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [assistantInput, setAssistantInput] = useState("");

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return clients;

    return clients.filter((client) =>
      `${client.name} ${client.brand} ${client.service} ${client.contact}`
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  function navigate(section: Section) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-zinc-100">
      <div className="flex min-h-screen">
        {mobileMenuOpen && (
          <button
            aria-label="Cerrar menú"
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-[#0d1017] transition-transform lg:static lg:translate-x-0 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="font-semibold tracking-tight">Samy OS</p>
                <p className="text-xs text-zinc-500">
                  Centro de operaciones
                </p>
              </div>
            </div>

            <button
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {navigation.map(({ name, icon: Icon }) => {
              const active = activeSection === name;

              return (
                <button
                  key={name}
                  onClick={() => navigate(name)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={19} />
                  {name}
                </button>
              );
            })}
          </nav>

          <div className="m-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
              <Sparkles size={18} />
            </div>
            <p className="text-sm font-semibold">Enfoque de hoy</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Terminar Salami Sibao antes de abrir nuevas tareas.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-white/10 bg-[#090b10]/90 px-4 backdrop-blur-xl sm:px-8">
            <button
              aria-label="Abrir menú"
              className="rounded-xl border border-white/10 p-2.5 text-zinc-300 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
                Samy OS v0.1
              </p>
              <h1 className="truncate text-xl font-semibold">
                {activeSection}
              </h1>
            </div>

            <label className="hidden w-full max-w-sm items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 sm:flex">
              <Search size={17} className="text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar clientes o tareas"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
              />
            </label>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-bold text-white">
              SP
            </div>
          </header>

          <div className="mx-auto max-w-7xl p-4 sm:p-8">
            {activeSection === "Dashboard" && (
              <Dashboard
                assistantInput={assistantInput}
                setAssistantInput={setAssistantInput}
                onNavigate={navigate}
              />
            )}

            {activeSection === "Clientes" && (
              <Clients clients={filteredClients} />
            )}

            {activeSection === "Pendientes" && <Tasks />}

            {activeSection === "Calendario" && (
              <EmptyState
                icon={CalendarDays}
                title="Calendario"
                description="Aquí aparecerán tus reuniones, eventos y fechas límite cuando conectemos Google Calendar."
              />
            )}

            {activeSection === "Marcas" && <Brands />}

            {activeSection === "Notas" && (
              <EmptyState
                icon={NotebookPen}
                title="Notas"
                description="Guarda ideas, decisiones importantes y notas relacionadas con clientes o proyectos."
              />
            )}

            {activeSection === "Salud" && (
              <EmptyState
                icon={HeartPulse}
                title="Salud"
                description="Registra seguimientos, medicamentos, síntomas y notas personales de salud."
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Dashboard({
  assistantInput,
  setAssistantInput,
  onNavigate,
}: {
  assistantInput: string;
  setAssistantInput: (value: string) => void;
  onNavigate: (section: Section) => void;
}) {
  const metrics = [
    {
      label: "Clientes activos",
      value: "2",
      note: "Ambos con prioridad alta",
      icon: Users,
    },
    {
      label: "Pendientes",
      value: "4",
      note: "3 requieren seguimiento",
      icon: CheckCircle2,
    },
    {
      label: "Eventos próximos",
      value: "0",
      note: "Calendario por conectar",
      icon: CalendarDays,
    },
    {
      label: "Marcas",
      value: "3",
      note: "Ecosistema activo",
      icon: Store,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-[#111520] to-cyan-400/10 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold text-violet-300">
              Resumen ejecutivo
            </p>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Buenas, Samy. Esto es lo más importante ahora.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              Tienes dos clientes activos, cuatro acciones abiertas y dos
              seguimientos comerciales de alta prioridad.
            </p>
          </div>

          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">
            <Sparkles size={18} />
            Pregúntale a Samy OS
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-300">
                <Icon size={19} />
              </div>
              <span className="text-xs text-emerald-400">Activo</span>
            </div>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
            <p className="mt-2 text-xs text-zinc-500">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                Prioridades
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                Próximas acciones
              </h3>
            </div>
            <button
              onClick={() => onNavigate("Pendientes")}
              className="text-sm text-zinc-400 transition hover:text-white"
            >
              Ver todas
            </button>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.title}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-black/20 p-4"
              >
                <button
                  aria-label={`Completar ${task.title}`}
                  className="h-5 w-5 shrink-0 rounded-full border border-zinc-600 transition hover:border-emerald-400"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {task.area} · {task.status}
                  </p>
                </div>
                <Badge>{task.priority}</Badge>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/10 to-white/[0.03] p-5 sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300">
            <MessageSquareText size={21} />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
            Asistente ejecutivo
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            ¿Qué necesitas resolver?
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Escríbeme una instrucción. En la próxima fase conectaremos esta
            caja con acciones reales.
          </p>

          <textarea
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            placeholder="Ejemplo: ¿Qué clientes necesitan seguimiento?"
            className="mt-5 min-h-28 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-4 text-sm outline-none transition placeholder:text-zinc-600 focus:border-violet-400/50"
          />

          <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold transition hover:bg-violet-400">
            <Sparkles size={17} />
            Consultar
          </button>
        </article>
      </section>
    </div>
  );
}

function Clients({
  clients: visibleClients,
}: {
  clients: typeof clients;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
            CRM
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Clientes activos</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Seguimiento comercial y próximos pasos.
          </p>
        </div>

        <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950">
          Nuevo cliente
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleClients.map((client) => (
          <article
            key={client.name}
            className="rounded-2xl border border-white/10 bg-black/20 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{client.name}</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {client.brand}
                </p>
              </div>
              <Badge>{client.priority}</Badge>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-600">
                  Servicio
                </p>
                <p className="mt-1 text-zinc-300">{client.service}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-600">
                  Contacto
                </p>
                <p className="mt-1 text-zinc-300">{client.contact}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-600">
                  Próximo paso
                </p>
                <p className="mt-1 leading-6 text-zinc-300">
                  {client.nextStep}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Tasks() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
            Operaciones
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Pendientes activos
          </h2>
        </div>
        <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950">
          Nueva tarea
        </button>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => (
          <article
            key={task.title}
            className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center"
          >
            <button className="h-5 w-5 shrink-0 rounded-full border border-zinc-600" />

            <div className="min-w-0 flex-1">
              <p className="font-medium">{task.title}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {task.area} · {task.status}
              </p>
            </div>

            <Badge>{task.priority}</Badge>
          </article>
        ))}
      </div>
    </section>
  );
}

function Brands() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {brands.map((brand) => (
        <article
          key={brand.name}
          className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
            <Store size={20} />
          </div>
          <h2 className="mt-5 text-lg font-semibold">{brand.name}</h2>
          <p className="mt-1 text-sm text-zinc-500">{brand.type}</p>
          <p className="mt-4 text-sm leading-6 text-zinc-300">
            {brand.objective}
          </p>
        </article>
      ))}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CalendarDays;
  title: string;
  description: string;
}) {
  return (
    <section className="flex min-h-[500px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-zinc-300">
          <Icon size={25} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          {description}
        </p>
        <button className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
          Crear primer registro
        </button>
      </div>
    </section>
  );
}