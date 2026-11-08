# Existing Samy OS MCP: read bridge

## Implementation status — 2026-11-08

This is an incremental change in the original repository, not a replacement application. Amazing Business Hub remains the only source of business clients, tasks/projects, notes and invoices. No database or business records were created or migrated.

Follow-up after team authorization: actual deployed health checks succeeded in both production and the preview. Gmail, Calendar and Hub read checks pass. The configured personal database returns `TypeError: fetch failed` on all six tables and its service-role probe; owner lookup is consequently blocked. The legacy `/api/chatgpt` route eagerly resolved that owner even for independent Hub/Gmail operations. This change now resolves personal context only for brand/health operations, preserving dashboard-supplied context and testing both independent reads and personal-operation failure.

Implemented and locally tested:

- Existing `/api/mcp` exposes `consultar_samy_os` after explicit additional consent.
- Read operations: connector_status, list_tasks, list_projects, list_clients, list_notes, list_invoices, list_events, search_email, read_email.
- Business operations call the existing Hub adapters. Gmail and Calendar call existing Google adapters. These reads do not depend on the personal Samy OS database or its owner lookup.
- Old OAuth tokens retain exactly the original two notification tools. Direct attempts to call the new tool are denied. Read consent requires ASSISTANT_API_KEY (or the existing legacy assistant key), not merely NOTIFICATION_API_KEY. Read authorization codes and tokens are signed separately with the assistant key so a notification signing key cannot mint read access.
- Runtime allowlist and argument validation reject writes, unknown fields, malformed requests and oversized search parameters.
- Connector diagnostics distinguish configuration from successful provider reads. No write-tested claim is made. Account identity returned by a provider still needs comparison with the intended account.
- The mixed GPT Action gateway is marked consequential because it includes calendar deletion and invoice confirmation. This is a host confirmation hint, not a complete server-side approval system.
- WhatsApp status wording no longer implies delivery from configuration alone. Notification tool names and sending behavior are preserved.

## Verification

1. `npm run test:read`: twelve behavioral tests with injected provider responses, including token isolation, rejected writes, Hub routing, mail parameters and diagnostic states.
2. `npm run test:read:http`: actual local Next HTTP routes, OAuth registration/consent/PKCE exchange, permission boundaries, tool discovery, configuration diagnostics, malformed arguments and invalid bearer rejection. Uses synthetic local secrets only. Requires a running local server configured with the three test-only values used in the CI workflow. Never point this test at production.
3. `next typegen` followed by `tsc --noEmit`: passed.
4. ESLint on changed code: passed. Repository-wide lint currently has 20 errors and 5 warnings in pre-existing UI code; it is not a clean full-repository lint run.
5. Production build passed with dummy public Supabase build variables. This verifies compilation and prerendering, not access to a real production database.

## Rollout and actual ChatGPT acceptance

1. Review this branch, run CI, and deploy an authorized Vercel preview with the existing server configuration. Do not copy production secrets into chat or the repository.
2. Verify the deployment and actual provider identities with read calls. Direct requests timed out. After connecting Vercel, project metadata confirmed the original production deployment is READY, initially protected fetching and team-scoped environment listing returned 403. Owner subsequently authorized the team; environment metadata and actual health responses became accessible. Gmail, Calendar and Hub passed provider reads in both production and preview; personal database checks failed. READY alone is not provider health.
3. Deploy to production only after review and applicable approval. `main` is documented as auto-deployed by Vercel.
4. Refresh and re-authorize the **existing** Samy OS Avisos connector. Do not create a duplicate plugin. On its consent screen select read access and enter the assistant key securely in the browser, never in chat. Existing notification-only authorization can remain unchanged until this step.
5. Refresh tool discovery. Confirm `consultar_samy_os` appears in an ordinary ChatGPT conversation and call connector_status, followed by a small real Hub query and Gmail read. Local tests do not establish this production/interface acceptance.
6. Test on the owner's iPhone. Voice availability must be tested separately; no voice compatibility claim is made here.

Example requests after rollout: “Muéstrame las facturas pendientes”, “Busca mis correos sin leer”, “Muéstrame los proyectos pendientes”, “Comprueba las conexiones de Samy OS”.

Rollback: revert the change and redeploy. No schema rollback is necessary. Existing WhatsApp tokens and workflows remain usable; read-enabled tokens use a separate token kind and assistant signing key; reverting disables their read access.

## Rechecked connected tools (not Samy OS deployment credentials)

| Provider | Evidence from this ChatGPT session | Write tested | Remaining limitation |
| --- | --- | --- | --- |
| Gmail | Authenticated profile returned the intended owner account | No | Profile only; not a message-content smoke test and not proof of Samy OS Google token validity |
| Hostinger Mail | Account endpoint returned the intended business mailbox | No | Does not grant website hosting access; no server adapter added |
| Stripe | Account discovery returned AMAZING SOLUTIONS, live mode | No | No payment settlement queried; not yet integrated into this server bridge |
| WhatsApp | Existing private connector executed status from this ordinary chat | No | Configuration only; no delivery/inbound test |
| Metricool | Brand query returned TorontoDominicano | No | No publication or platform-specific permission test |
| WordPress connector | Both existing account links rejected the supplied domain with `Unknown site alias` | No | Alias inventory/configuration is not exposed by available tools; existing plugin package contains an App reference, not its backend alias map |
| Supabase | Project listing returned content-studio and New-Amazing-dashboard | No | Configured personal project identified from deployed health, but absent from the accessible project list and unreachable from deployment; no configuration changed |
| Hostinger hosting | No hosting tools or configured local hosting MCP found in this environment | No | Two hosting account authorizations still needed; mail authorization is separate |
| Vercel | Connected; original samy-os project and production deployment identified, state READY | No | Team authorized; environment metadata and production/preview health read successfully. No deployment configuration changed |
| Google Ads | Compatible marketing integration discoverable, not connected/tested | No | Account authorization needed; no budgets changed |

## Remaining engineering work (not implemented in this change)

- Durable server-side email draft approval binding, revision invalidation and replay prevention; show sender, To, CC, BCC, subject, complete body and attachments before every approved send. No email was sent during this assignment.
- Durable OAuth authorization-code single-use storage, revocation, shorter access-token lifetime/refresh handling, rate limits, scoped structured audit logs and provider timeouts. Existing OAuth uses stateless signed codes and long-lived tokens; this change does not claim to fix those limitations.
- Existing dashboard authorization must be reviewed for owner-only access before expanding write capabilities.
- Financial idempotency and Stripe account/mode assertions before any writes; no automatic invoice issuing enabled in MCP.
- Twilio inbound SMS/WhatsApp verification, durable inbox, delivery tracking and consent controls. Existing inbound webhook uses Meta signature verification; that is not a tested Twilio inbound implementation.
- Hostinger multi-account inventory, WordPress alias repair, social inbox/publishing, lead scoring/deduplication and Google Ads adapters.
- Provider capability research for personal WhatsApp groups and iOS notifications remains pending; no unrestricted access is claimed or implemented.
- Full multi-account connector registry, durable operational logs and monitoring remain incomplete. The new connector_status is a limited read diagnostic, not a full registry.

No public content, invoices, payment requests, emails or third-party messages were sent. Existing scheduled automations were not changed.
