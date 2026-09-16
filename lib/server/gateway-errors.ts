/**
 * Traduce los fallos de infraestructura a algo que Walie pueda decir en voz.
 *
 * Cuando el proyecto de Supabase está pausado su dominio deja de resolver y
 * `fetch` lanza un escueto "fetch failed". Ese texto llegaba tal cual al Action
 * de ChatGPT con un 500, así que la voz solo podía decir "hubo un error".
 */

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export const DATABASE_UNREACHABLE =
  "No puedo hablar con la base de datos de Samy OS: el proyecto de Supabase está " +
  "pausado o fue borrado. Entra a supabase.com/dashboard y pulsa Restore en el " +
  "proyecto. Hasta entonces no puedo leer ni guardar tareas, notas, clientes ni " +
  "eventos; el correo y el calendario sí siguen funcionando.";

/** ¿El fallo es que no se llega al servidor, y no un error de la operación? */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "fetch failed") return true;
  const code = (error.cause as { code?: string } | undefined)?.code;
  return typeof code === "string" && NETWORK_CODES.has(code);
}
