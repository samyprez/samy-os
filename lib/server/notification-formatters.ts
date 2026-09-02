import "server-only";

/**
 * Message templates for the WhatsApp gateway.
 *
 * A caller may send `message` already written, or send `template` + `data` and
 * let the server build the text. The second form exists so that every SAMYPREZ
 * alert looks the same no matter which automation fired it, and so the wording
 * can change here without editing ChatGPT's prompt.
 *
 * WhatsApp is the short channel: these stay a few lines. The full report keeps
 * going out by email, untouched.
 */

export type TemplateData = Record<string, unknown>;

function text(data: TemplateData, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function list(data: TemplateData, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item).trim()).filter(Boolean);
      if (items.length) return items;
    }
  }
  return [];
}

function block(label: string, body: string) {
  return body ? `${label}:\n${body}` : "";
}

/**
 * SAMYPREZ YouTube Manager alert — the format Samuel specified.
 * Every field is optional; empty ones are dropped instead of printing a
 * heading with nothing under it.
 */
export function formatSamyprezYoutubeAlert(data: TemplateData) {
  const parts = [
    "SAMYPREZ YOUTUBE MANAGER",
    block("DO NEXT", text(data, "do_next", "doNext", "record", "next")),
    block("PREP NEXT", text(data, "prep_next", "prepNext", "prepare")),
    block("KPI", text(data, "kpi", "kpis", "metric")),
    text(data, "note", "notes"),
    text(data, "footer") || "Manager review completed.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Generic alert for the other automations (radar, money tracker, Amazing
 * Solutions, reminders). A title, some lines, and an optional action.
 */
export function formatGenericAlert(data: TemplateData) {
  const bullets = list(data, "items", "lines", "bullets");
  const parts = [
    text(data, "title", "heading").toUpperCase(),
    text(data, "body", "summary", "message"),
    bullets.length ? bullets.map((item) => `• ${item}`).join("\n") : "",
    block("ACCIÓN", text(data, "action", "do_next", "next")),
    text(data, "footer"),
  ];
  return parts.filter(Boolean).join("\n\n");
}

const TEMPLATES: Record<string, (data: TemplateData) => string> = {
  samyprez_youtube: formatSamyprezYoutubeAlert,
  // The source slug is accepted as a template name too, so an automation that
  // already sends source:"samyprez-youtube" can just add template:"samyprez-youtube".
  "samyprez-youtube": formatSamyprezYoutubeAlert,
  samyprez: formatSamyprezYoutubeAlert,
  generic: formatGenericAlert,
  alert: formatGenericAlert,
};

export function templateNames() {
  return Object.keys(TEMPLATES);
}

export function renderTemplate(name: string, data: TemplateData) {
  const render = TEMPLATES[name.trim().toLowerCase()];
  if (!render) return null;
  return render(data).trim();
}

/**
 * Priority marker. `normal` and `low` print nothing so the common case stays
 * clean; only the loud ones get a prefix.
 */
export function priorityPrefix(priority: string) {
  switch (priority) {
    case "urgent":
      return "🚨 URGENTE\n";
    case "high":
      return "⚠️ IMPORTANTE\n";
    default:
      return "";
  }
}
