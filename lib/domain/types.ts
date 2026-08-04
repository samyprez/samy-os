export type Priority = "Urgente" | "Alta" | "Media" | "Baja";
export type TaskStatus = "Pendiente" | "En progreso" | "Esperando respuesta" | "Completado";

export type Client = {
  id: string;
  name: string;
  brand?: string | null;
  primaryContact?: string | null;
  secondaryContact?: string | null;
  whatsappName?: string | null;
  service?: string | null;
  status: string;
  priority: Priority;
  lastImportantMessage?: string | null;
  nextStep?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

export type Task = {
  id: string;
  clientId?: string | null;
  area?: string | null;
  title: string;
  priority: Priority;
  status: TaskStatus;
  source?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  nextAction?: string | null;
  notes?: string | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  attendees?: string[];
};
