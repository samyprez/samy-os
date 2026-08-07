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

- `overview`
- `list_tasks`
- `create_task`
- `complete_task`
- `list_notes`
- `create_note`

Authentication uses a server-only bearer token (`SAMY_OS_API_TOKEN`). The endpoint performs database operations with the Supabase service-role key and scopes every request to the configured Samy OS owner.

The OpenAPI document for a ChatGPT Action is available at:

`GET /api/chatgpt/openapi`

### Required production environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
SAMY_OS_API_TOKEN
SAMY_OS_OWNER_USER_ID   # preferred
# or SAMY_OS_OWNER_EMAIL
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `SAMY_OS_API_TOKEN` in browser code.

## Health check

`GET /api/health` reports whether Supabase tables, OpenAI and the ChatGPT gateway configuration are ready without exposing secret values.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
