import "server-only";

import { getAccessToken, missingGmailEnvVars } from "@/lib/server/gmail";

// Same Google OAuth client and refresh token as Gmail — Google issues one
// refresh token per (client, scope-set) grant, so adding Calendar here only
// required widening the scope Samuel consents to, not a second OAuth app.
export const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIMEZONE = "America/Toronto";

export function calendarConfigured() {
  return missingGmailEnvVars().length === 0;
}

async function calendarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      const apiMessage = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      // Insufficient scope shows up here specifically when the refresh token
      // predates the Calendar consent — surface it plainly instead of a bare
      // "Request had insufficient authentication scopes".
      if (apiMessage) detail = apiMessage;
    } catch {
      if (text.trim()) detail = text.trim().slice(0, 300);
    }
    throw new Error(`Google Calendar: ${detail}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  link: string | null;
};

function toCalendarEvent(raw: GoogleCalendarEvent): CalendarEvent {
  return {
    id: raw.id || "",
    title: raw.summary || "(sin título)",
    description: raw.description || null,
    location: raw.location || null,
    starts_at: raw.start?.dateTime || raw.start?.date || null,
    ends_at: raw.end?.dateTime || raw.end?.date || null,
    link: raw.htmlLink || null,
  };
}

export async function listCalendarEvents(options: { query?: string | null; timeMin?: string | null } = {}) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
    timeMin: options.timeMin?.trim() || new Date().toISOString(),
  });
  if (options.query?.trim()) params.set("q", options.query.trim());

  const result = await calendarFetch<{ items?: GoogleCalendarEvent[] }>(`?${params.toString()}`);
  return (result.items ?? []).map(toCalendarEvent);
}

export async function createCalendarEvent(input: {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  description?: string | null;
}) {
  // A bare date (no time) becomes an all-day event; Google Calendar wants
  // {date} not {dateTime} for those, and no timeZone field.
  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(input.starts_at.trim());
  const start = isAllDay ? { date: input.starts_at.trim() } : { dateTime: input.starts_at.trim(), timeZone: TIMEZONE };
  const end = input.ends_at?.trim()
    ? isAllDay
      ? { date: input.ends_at.trim() }
      : { dateTime: input.ends_at.trim(), timeZone: TIMEZONE }
    : isAllDay
      ? { date: input.starts_at.trim() }
      : { dateTime: new Date(new Date(input.starts_at).getTime() + 60 * 60 * 1000).toISOString(), timeZone: TIMEZONE };

  const created = await calendarFetch<GoogleCalendarEvent>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.title.trim(),
      location: input.location?.trim() || undefined,
      description: input.description?.trim() || undefined,
      start,
      end,
    }),
  });
  return toCalendarEvent(created);
}

export async function deleteCalendarEvent(eventId: string) {
  await calendarFetch<void>(`/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

/** Resolves a spoken title to one event so complete/cancel don't need a raw Google id. */
export async function findCalendarEvent(titleOrId: string) {
  const value = titleOrId.trim();
  const events = await listCalendarEvents({ query: value, timeMin: new Date(Date.now() - 24 * 3600 * 1000).toISOString() });
  const byId = events.find((e) => e.id === value);
  if (byId) return { match: byId, candidates: [] as CalendarEvent[] };
  if (events.length === 1) return { match: events[0], candidates: [] as CalendarEvent[] };
  const exact = events.filter((e) => e.title.toLowerCase() === value.toLowerCase());
  if (exact.length === 1) return { match: exact[0], candidates: [] as CalendarEvent[] };
  return { match: null, candidates: events };
}
