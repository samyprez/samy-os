# Samy OS

Samy OS is the operational backend and dashboard for Walie. The primary conversation surface is ChatGPT; the dashboard is for visual review and manual control.

## Architecture

**ChatGPT / voice → secure Samy OS API → Supabase → dashboard**

The browser Walie voice UI remains useful as a fallback and for testing, but it is not intended to be the main daily interface.

## Core capabilities

The current core prioritizes:

- create and review tasks
- complete tasks
- create and review notes
- dashboard visibility
- clients/events as supporting operational context

## ChatGPT gateway

Production exposes a secure server endpoint at:

`POST /api/chatgpt`

Supported operations:

| Operation | Requires | Notes |
|---|---|---|
| `overview` | — | Open tasks, recent notes, clients, upcoming events |
| `list_tasks` | — | `query` filters title/area |
| `create_task` | `title` | Duplicate-guarded on title + due_date |
| `complete_task` | `task_id` | Get the id from `list_tasks` first |
| `list_notes` | — | `query` filters body/related_to |
| `create_note` | `body` | |
| `list_clients` | — | `query` filters name/service/brand |
| `create_client` | `name` | Duplicate-guarded, case-insensitive |
| `update_client` | `client_id` + ≥1 field | Rejects an empty patch |
| `list_events` | — | Upcoming only, unless `query` is given |
| `create_event` | `title`, `starts_at` | `starts_at` is ISO 8601 with offset |
| `list_brands` | — | |
| `create_brand` | `name` | Duplicate-guarded, case-insensitive |
| `search_email` | — | `query` uses Gmail search syntax; `limit` defaults to 10, caps at 25 |
| `read_email` | `message_id` | Get the id from `search_email` first |

Sending is **not** on this endpoint — see [Gmail](#gmail) for `POST /api/chatgpt/send-email`.

Dates: `due_date` is `YYYY-MM-DD`; `starts_at` / `ends_at` are ISO 8601 with an
offset. ChatGPT resolves relative dates in `America/Toronto` before calling.

**After adding an operation, re-import the schema in the GPT editor** (Configurar →
Acciones → gear → Importar desde URL). Otherwise ChatGPT keeps the old contract and
correctly reports it has no action for the new entity.

Authentication uses a server-only bearer token (`ASSISTANT_API_KEY`, or the legacy
`SAMY_OS_API_TOKEN`). The endpoint performs database operations with the Supabase
service-role key and scopes every request to the configured Samy OS owner.

The OpenAPI document is generated from a single source
(`lib/server/openapi-schema.ts`) and served at two equivalent URLs:

- `GET /openapi.json`
- `GET /api/chatgpt/openapi`

Do not add a static `public/openapi.json` — a file there shadows the route and the
two copies drift apart, which is what previously pointed ChatGPT at the wrong endpoint.

### Required production environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ASSISTANT_API_KEY
SAMY_OS_OWNER_USER_ID   # preferred
# or SAMY_OS_OWNER_EMAIL

# Gmail only. Everything else works without these; email operations
# return ok:false naming the missing variable instead of failing.
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ASSISTANT_API_KEY` in browser code.

**Finding the service-role key:** the Supabase dashboard no longer uses the words
"service role" anywhere. It now lives at **Settings → API Keys → "Secret keys"** as an
`sb_secret_...` value; "Secret key" is simply the new name for the same thing. The
"Publishable key" (`sb_publishable_...`) on the same page is the public one and will
not work. Copy with the copy icon rather than selecting by hand — the project
reference id sits nearby and is easy to grab by mistake.

Confirm they are all live in production with `GET /api/health`; `chatgptGateway`
must be `true`.

## Connecting Samy OS to ChatGPT (GPT Action)

GPT Actions with an OpenAPI schema remain the official way to connect a private
REST API to ChatGPT. Steps:

1. In ChatGPT, open the sidebar → **GPTs** → **Create a GPT** → **Configure**.
2. Name it `Samy OS`.
3. Paste these instructions:

   ```text
   Eres Walie, el asistente operativo de Samy. Usas la acción samyOs para
   guardar y consultar todo en Samy OS.

   Zona horaria: America/Toronto. Convierte siempre "mañana", "el viernes" o
   "la semana que viene" a una fecha real YYYY-MM-DD antes de llamar la acción.

   - Si Samy pide recordar hacer algo → create_task.
   - Si Samy quiere guardar información o una idea → create_note.
   - Si pregunta qué tiene pendiente → list_tasks, o overview para un resumen.
   - Para completar una tarea, primero list_tasks para obtener el task_id,
     luego complete_task.

   Confirma cada acción en español, en una sola frase corta. No inventes datos.
   ```

4. Scroll to **Actions** → **Create new action**.
5. Click **Import from URL** and paste:
   `https://samy-os-seven.vercel.app/openapi.json`
6. Under **Authentication**, choose **API Key**, Auth Type **Bearer**, and paste
   the value of `ASSISTANT_API_KEY`.
7. Save. Test with: *"Crea una tarea para llamar a Salami mañana."*

### Testing the gateway directly

```bash
curl -s -X POST https://samy-os-seven.vercel.app/api/chatgpt \
  -H "Authorization: Bearer $ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"operation":"create_task","title":"Llamar a Salami","due_date":"2026-08-08"}'
```

## Gmail

Samy OS reads and sends mail through the Gmail REST API using a long-lived
refresh token. Scopes are `gmail.readonly` and `gmail.send` only — nothing here
can delete or modify existing mail.

### 1. Google Cloud setup (once)

1. [Google Cloud Console](https://console.cloud.google.com/) → **Create project**
   (e.g. `samy-os`).
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → User type **External** → fill in
   app name, support email and developer email.
   - Leave publishing status on **Testing**. Under **Audience → Test users**, add
     Samy's own Gmail address. Testing mode is correct for a single-user tool: it
     skips Google's verification review entirely.
   - The trade-off: refresh tokens issued by an app in Testing expire after
     **7 days**. If `/api/health` starts reporting `gmail.works: false` with an
     `invalid_grant` error, re-run step 5 to mint a new one. Publishing the app
     (**Publish app**, no review needed for a personal Workspace/consumer account
     with sensitive scopes only in testing) removes that expiry.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   application type **Web application**.
   - Under **Authorized redirect URIs** add:
     `https://samy-os-seven.vercel.app/api/google/callback`
   - Add `http://localhost:3000/api/google/callback` too if you want to run the
     flow locally.
   - Copy the **Client ID** and **Client secret**.

### 2. Mint the refresh token (once)

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel and redeploy, then
open this in a browser, signed in as Samy:

```text
https://samy-os-seven.vercel.app/api/google/auth?token=<ASSISTANT_API_KEY>
```

The route is **not** public — it takes the same bearer token as the gateway,
passed in the query string because a browser following a redirect cannot set an
`Authorization` header.

Approve the consent screen. The callback prints the refresh token **once**;
Google never shows it again. Copy it immediately.

### 3. Vercel variables

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

Redeploy, then confirm with `GET /api/health` — `gmail.works` must be `true` and
`gmail.address` must show the connected account. `gmail.configured: true` with
`works: false` means the variables exist but the token is dead; the underlying
Google error is in `gmail.error`.

### Sending is a separate endpoint, on purpose

```text
POST /api/chatgpt/send-email    operationId: samyOsSendEmail
{ "to": "...", "subject": "...", "body": "...", "cc": "...", "reply_to_message_id": "..." }
```

`/api/chatgpt` is marked `x-openai-isConsequential: false` so ChatGPT does not
prompt before every task and note — without that, hands-free voice use is
impossible. But sending mail is irreversible and reaches a third party, so it
must always show the recipient and body and wait for Samy's confirmation.

That flag is **per-operation**, not per-field. Adding `send_email` as another
`operation` value on the main gateway would have forced one setting on both.
Two paths is the only way to get both behaviours, which is why send lives on its
own path and carries `x-openai-isConsequential: true`.

Both paths use the same `ASSISTANT_API_KEY` bearer token, and both are covered by
the same imported schema — **re-import the schema in the GPT editor** after
deploying, or ChatGPT will not know `samyOsSendEmail` exists.

Passing `reply_to_message_id` (an id from `search_email`) sets `In-Reply-To` and
`References` and posts to the original `threadId`, so replies thread properly
instead of starting a new conversation.

## Health check

`GET /api/health` reports whether Supabase tables, OpenAI, Gmail and the ChatGPT gateway configuration are ready without exposing secret values.

It distinguishes *configured* from *actually works*: the service-role key and the
Gmail refresh token are both exercised with a real call, because a key copied
from the wrong project — or a refresh token Google already revoked — is
"configured" and still fails every request.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
