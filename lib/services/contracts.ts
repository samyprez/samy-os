import type { CalendarEvent, Client, Task, TaskStatus } from "../domain/types";

export interface ClientRepository {
  list(): Promise<Client[]>;
  findByName(query: string): Promise<Client | null>;
  create(input: Omit<Client, "id">): Promise<Client>;
  update(id: string, input: Partial<Omit<Client, "id">>): Promise<Client>;
}

export interface TaskRepository {
  list(clientQuery?: string): Promise<Task[]>;
  create(input: Omit<Task, "id">): Promise<Task>;
  updateStatus(id: string, status: TaskStatus): Promise<Task>;
}

export interface CalendarGateway {
  list(range: "today" | "tomorrow" | "week"): Promise<CalendarEvent[]>;
  create(input: Omit<CalendarEvent, "id">): Promise<CalendarEvent>;
}
