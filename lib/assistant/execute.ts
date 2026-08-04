import type { AssistantIntent } from "./intents";

export type AssistantResult = {
  ok: boolean;
  message: string;
  requiresConfirmation?: boolean;
};

export function previewAssistantAction(intent: AssistantIntent): AssistantResult {
  switch (intent.type) {
    case "calendar.read":
      return {
        ok: true,
        message: `Listo para consultar el calendario (${intent.range}). Falta conectar Google Calendar.`,
      };

    case "task.list":
      return {
        ok: true,
        message: intent.clientQuery
          ? `Listo para buscar pendientes de ${intent.clientQuery}.`
          : "Listo para mostrar tus pendientes activos.",
      };

    case "task.update":
      return {
        ok: true,
        requiresConfirmation: true,
        message: `Preparé una actualización para ${intent.clientQuery || "el cliente encontrado"}. Antes de guardar, Samy OS pedirá confirmación.`,
      };

    default:
      return {
        ok: false,
        message: "Todavía no entiendo esa instrucción. Prueba con calendario, pendientes o actualizar una tarea.",
      };
  }
}
