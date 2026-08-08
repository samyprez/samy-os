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
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ASSISTANT_API_KEY` in browser code.

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

## Health check

`GET /api/health` reports whether Supabase tables, OpenAI and the ChatGPT gateway configuration are ready without exposing secret values.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
