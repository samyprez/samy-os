import "server-only";

// Gmail access over the plain REST API with fetch. The googleapis package pulls
// in the whole Google API surface (tens of MB) to do what four fetch calls do
// here, and it inflates the Vercel lambda for no benefit.

// Read and send only. Nothing here can delete or modify existing mail, so a
// leaked refresh token cannot destroy Samy's mailbox.
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const MAX_RESULTS = 25;
const MAX_BODY_CHARS = 8000;

export function gmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim(),
  );
}

export function missingGmailEnvVars() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"].filter(
    (name) => !process.env[name]?.trim(),
  );
}

type CachedToken = { value: string; expiresAt: number };

// Module scope survives between invocations on a warm lambda, so a burst of
// gateway calls mints one access token instead of one per call.
let cachedToken: CachedToken | null = null;

export async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const missing = missingGmailEnvVars();
  if (missing.length) throw new Error(`Gmail no está configurado. Faltan: ${missing.join(", ")}`);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!.trim(),
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`No se pudo renovar el acceso a Gmail: ${detail}`);
  }

  const lifetime = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  // Retire the token a minute early so a call never starts with a token that
  // expires mid-flight.
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + (lifetime - 60) * 1000 };
  return cachedToken.value;
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: GmailPart;
};

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    // Surface Google's own message ("Precondition check failed", "Invalid
    // to header", quota errors). A generic "Gmail request failed" sends
    // whoever is debugging back to the Cloud console for no reason.
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      const apiMessage = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
      if (apiMessage) detail = apiMessage;
    } catch {
      if (text.trim()) detail = text.trim().slice(0, 300);
    }
    throw new Error(`Gmail API: ${detail}`);
  }

  return (text ? JSON.parse(text) : {}) as T;
}

function header(headers: GmailHeader[] | undefined, name: string) {
  const match = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return match?.value || "";
}

function decodeBase64Url(data: string) {
  // Gmail returns base64url (- and _ instead of + and /) and strips padding.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function encodeBase64Url(value: string | Buffer) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectBody(part: GmailPart | undefined, mimeType: string): string {
  if (!part) return "";
  // Skip attachments: a PDF decoded as text is noise, not content.
  if (!part.filename && part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts || []) {
    const found = collectBody(child, mimeType);
    if (found) return found;
  }
  return "";
}

function extractBody(payload: GmailPart | undefined) {
  const plain = collectBody(payload, "text/plain");
  if (plain.trim()) return plain.trim();
  const html = collectBody(payload, "text/html");
  return html.trim() ? stripHtml(html) : "";
}

export type EmailSummary = {
  id: string;
  thread_id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
};

export async function searchEmails(query: string, limit = 10): Promise<EmailSummary[]> {
  const maxResults = Math.min(Math.max(1, Math.floor(limit) || 10), MAX_RESULTS);
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query?.trim()) params.set("q", query.trim());

  const list = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
    `/messages?${params.toString()}`,
  );
  if (!list.messages?.length) return [];

  const metadataParams = new URLSearchParams({ format: "metadata" });
  for (const name of ["From", "To", "Subject", "Date"]) {
    metadataParams.append("metadataHeaders", name);
  }

  return Promise.all(
    list.messages.map(async (item) => {
      const message = await gmailFetch<GmailMessage>(
        `/messages/${item.id}?${metadataParams.toString()}`,
      );
      const headers = message.payload?.headers;
      return {
        id: message.id || item.id,
        thread_id: message.threadId || item.threadId,
        from: header(headers, "From"),
        to: header(headers, "To"),
        subject: header(headers, "Subject"),
        date: header(headers, "Date"),
        snippet: message.snippet || "",
      };
    }),
  );
}

export type EmailDetail = EmailSummary & { body: string; truncated: boolean };

export async function readEmail(messageId: string): Promise<EmailDetail> {
  const id = messageId?.trim();
  if (!id) throw new Error("message_id es obligatorio");

  const message = await gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  const headers = message.payload?.headers;
  const full = extractBody(message.payload);
  const truncated = full.length > MAX_BODY_CHARS;

  return {
    id: message.id || id,
    thread_id: message.threadId || "",
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    date: header(headers, "Date"),
    snippet: message.snippet || "",
    body: truncated
      ? `${full.slice(0, MAX_BODY_CHARS)}\n\n[... mensaje truncado, ${full.length - MAX_BODY_CHARS} caracteres más ...]`
      : full,
    truncated,
  };
}

function encodeHeaderValue(value: string) {
  // Plain ASCII goes through untouched; anything with accents or ñ must be
  // RFC 2047 encoded or Gmail mangles it into mojibake in the recipient's inbox.
  const hasNonAscii = Array.from(value).some((char) => (char.codePointAt(0) ?? 0) > 127);
  if (!hasNonAscii) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  cc?: string | null;
  reply_to_message_id?: string | null;
};

export type SentEmail = { id: string; thread_id: string; to: string; subject: string };

export async function sendEmail(input: SendEmailInput): Promise<SentEmail> {
  const to = input.to?.trim();
  const body = input.body ?? "";
  let subject = input.subject?.trim() || "";
  if (!to) throw new Error("to es obligatorio");
  if (!subject) throw new Error("subject es obligatorio");
  if (!body.trim()) throw new Error("body es obligatorio");

  let threadId: string | undefined;
  let inReplyTo = "";
  let references = "";

  if (input.reply_to_message_id?.trim()) {
    const metadataParams = new URLSearchParams({ format: "metadata" });
    for (const name of ["Message-ID", "References", "Subject"]) {
      metadataParams.append("metadataHeaders", name);
    }
    const original = await gmailFetch<GmailMessage>(
      `/messages/${encodeURIComponent(input.reply_to_message_id.trim())}?${metadataParams.toString()}`,
    );
    const headers = original.payload?.headers;
    threadId = original.threadId;
    inReplyTo = header(headers, "Message-ID");
    // Chain onto the existing References so long threads keep collapsing into
    // one conversation instead of splitting.
    references = [header(headers, "References"), inReplyTo].filter(Boolean).join(" ");
    if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
  }

  const headerLines = [
    `To: ${to}`,
    input.cc?.trim() ? `Cc: ${input.cc.trim()}` : "",
    `Subject: ${encodeHeaderValue(subject)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    references ? `References: ${references}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);

  // Base64 body keeps UTF-8 intact and sidesteps the 998-character line limit
  // that raw long paragraphs would violate.
  const encodedBody = Buffer.from(body, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const raw = `${headerLines.join("\r\n")}\r\n\r\n${encodedBody}`;

  const sent = await gmailFetch<{ id?: string; threadId?: string }>("/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeBase64Url(raw), ...(threadId ? { threadId } : {}) }),
  });

  return { id: sent.id || "", thread_id: sent.threadId || "", to, subject };
}

export async function getGmailAddress() {
  const profile = await gmailFetch<{ emailAddress?: string }>("/profile");
  return profile.emailAddress || "";
}
