"use client";

import {
  CalendarDays,
  CheckSquare2,
  HeartPulse,
  LayoutDashboard,
  NotebookPen,
  Search,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

const clients = [
  {
    name: "Salami Sibao",
    brand: "Amazing Solutions",
    service: "Website + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    next: "Terminar actualización web y dar seguimiento a Orian",
  },
  {
    name: "MiKiosko.ca",
    brand: "Amazing Solutions / TorontoDominicano",
    service: "Contenido + publicidad mensual",
    status: "Activo",
    priority: "Alta",
    next: "Crear contenido con productos reales y colocar banners",
  },
];

const tasks = [
  { title: "Terminar actualización web", area: "Salami Sibao", priority: "Alta", status: "Pendiente" },
  { title: "Dar seguimiento a representante Toronto", area: "Salami Sibao", priority: "Alta", status: "Pendiente" },
  { title: "Preparar contenido con productos reales", area: "MiKiosko.ca", priority: "Alta", status: "En progreso" },
  { title: "Colocar banners en TorontoDominicano", area: "MiKiosko.ca", priority: "Media", status: "Pendiente" },
];

const navItems = [
  ["Dashboard", LayoutDashboard],
  ["Clientes", Users],
  ["Pendientes", CheckSquare2],
  ["Calendario", CalendarDays],
  ["Marcas", Store],
  ["Notas", NotebookPen],
  ["Salud", HeartPulse],
] as const;

export default function Home() {
  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");

  const filteredClients = useMemo(
    () => clients.filter((client) => `${client.name} ${client.brand} ${client.service}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><Sparkles size={20} /></div>
        <div className="brand-copy">
          <strong>Samy OS</strong>
          <span>Centro de operaciones</span>
        </div>
        <nav>
          {navItems.map(([label, Icon]) => (
            <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Samy OS v0.1</p>
            <h1>{active}</h1>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar clientes, tareas o marcas" />
          </label>
        </header>

        {active === "Dashboard" && (
          <>
            <section className="hero-card">
              <div>
                <span className="section-kicker">Resumen ejecutivo</span>
                <h2>Buenas, Samy. Esto es lo más importante ahora.</h2>
                <p>Dos clientes activos, cuatro acciones abiertas y dos seguimientos de alta prioridad.</p>
              </div>
              <button className="primary-button"><Sparkles size={18} /> Pregúntale a Samy OS</button>
            </section>

            <section className="metric-grid">
              <article><span>Clientes activos</span><strong>2</strong><small>Todos en prioridad alta</small></article>
              <article><span>Pendientes</span><strong>4</strong><small>3 requieren seguimiento</small></article>
              <article><span>Eventos próximos</span><strong>0</strong><small>Sin eventos registrados</small></article>
              <article><span>Marcas</span><strong>3</strong><small>Amazing Solutions, TorontoDominicano, Samy Prez</small></article>
            </section>

            <section className="content-grid">
              <article className="panel">
                <div className="panel-heading"><div><span className="section-kicker">Enfoque</span><h3>Próximas acciones</h3></div></div>
                <div className="task-list">
                  {tasks.map((task) => (
                    <div className="task-row" key={task.title}>
                      <div className="task-check" />
                      <div><strong>{task.title}</strong><span>{task.area}</span></div>
                      <span className={`badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel assistant-panel">
                <span className="section-kicker">Asistente</span>
                <h3>Recomendación de hoy</h3>
                <p>Empieza por Salami Sibao: cerrar la actualización web desbloquea el seguimiento comercial y reduce dos pendientes a la vez.</p>
                <button className="secondary-button">Marcar como enfoque principal</button>
              </article>
            </section>
          </>
        )}

        {active === "Clientes" && (
          <section className="panel wide-panel">
            <div className="panel-heading"><div><span className="section-kicker">CRM</span><h3>Clientes activos</h3></div><button className="primary-button">Nuevo cliente</button></div>
            <div className="client-grid">
              {filteredClients.map((client) => (
                <article className="client-card" key={client.name}>
                  <div className="client-card-top"><div><h3>{client.name}</h3><span>{client.brand}</span></div><span className="badge alta">{client.priority}</span></div>
                  <p>{client.service}</p>
                  <div className="client-meta"><span>{client.status}</span><span>Próximo paso</span></div>
                  <strong className="next-step">{client.next}</strong>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === "Pendientes" && (
          <section className="panel wide-panel">
            <div className="panel-heading"><div><span className="section-kicker">Operaciones</span><h3>Lista de pendientes</h3></div><button className="primary-button">Nueva tarea</button></div>
            <div className="task-list large">
              {tasks.map((task) => (
                <div className="task-row" key={task.title}>
                  <div className="task-check" />
                  <div><strong>{task.title}</strong><span>{task.area} · {task.status}</span></div>
                  <span className={`badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!["Dashboard", "Clientes", "Pendientes"].includes(active) && (
          <section className="empty-state panel">
            <div className="brand-mark"><Sparkles size={20} /></div>
            <h2>{active}</h2>
            <p>La estructura está lista. Este módulo se conectará después de validar el núcleo: dashboard, clientes y pendientes.</p>
          </section>
        )}
      </section>
    </main>
  );
}
