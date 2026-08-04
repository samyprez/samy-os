export type AssistantIntent =
  | { type: "calendar.read"; range: "today" | "tomorrow" | "week" }
  | { type: "task.update"; clientQuery: string; taskQuery: string; status?: "Pendiente" | "En progreso" | "Completado" }
  | { type: "task.list"; clientQuery?: string }
  | { type: "unknown"; original: string };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseAssistantIntent(input: string): AssistantIntent {
  const text = normalize(input);

  if (/calendario|agenda|reuniones|eventos/.test(text)) {
    const range = text.includes("manana")
      ? "tomorrow"
      : /semana|proximos dias/.test(text)
        ? "week"
        : "today";

    return { type: "calendar.read", range };
  }

  if (/actualiza|cambia|marca|completa/.test(text) && /tarea|pendiente/.test(text)) {
    const status = text.includes("complet")
      ? "Completado"
      : text.includes("progreso")
        ? "En progreso"
        : undefined;

    const clientQuery = text.includes("sibao") || text.includes("salami")
      ? "Salami Sibao"
      : text.includes("mikiosko")
        ? "MiKiosko.ca"
        : "";

    return {
      type: "task.update",
      clientQuery,
      taskQuery: input,
      status,
    };
  }

  if (/tareas|pendientes|que tengo que hacer/.test(text)) {
    const clientQuery = text.includes("sibao") || text.includes("salami")
      ? "Salami Sibao"
      : text.includes("mikiosko")
        ? "MiKiosko.ca"
        : undefined;

    return { type: "task.list", clientQuery };
  }

  return { type: "unknown", original: input };
}
