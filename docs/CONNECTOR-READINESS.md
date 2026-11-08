# Connector readiness — 2026-11-08

## Scope of this increment

`connector_status` now tests individual read operations instead of treating credentials or one table probe as proof that an entire integration works. Gmail checks profile, search and, when a message exists, body reading. Calendar checks event listing. Hub checks projects, clients, notes and invoices independently. A failed sub-operation marks the connector degraded. Empty mailboxes explicitly leave body reading untested. Gmail identity is compared with SAMY_OS_OWNER_EMAIL when configured.

Errors are classified as authorization_expired, authentication_failed, permission_missing, rate_limited, timeout, unreachable, not_configured or provider_error. Raw provider error text is omitted to avoid leaking payloads, URLs or credentials. Each diagnostic stops waiting after eight seconds; this deadline does not cancel a provider request already in progress. These checks make no writes and retain no message bodies or customer records in their report.

Seventeen behavioral tests cover read permissions, signing-key separation, no write dispatch, unavailable personal storage, partial failure, safe error classification, diagnostic deadlines, empty mailboxes and wrong-account detection. HTTP OAuth tests and production-build checks are also included in CI.

## Actual checks performed from the authorized environment

| Integration | Available | Authenticated | Intended account identified | Actual read | Write test | Ordinary-chat access | Remaining limitation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail plugin | Yes | Yes | Yes | Search and full message read passed | Not performed | Tested | Does not by itself validate a separate Samy OS OAuth token |
| Hostinger Mail plugin | Yes | Yes | Yes | Inbox listing and text body read passed | Not performed | Tested | Hosting access is separate |
| Stripe plugin | Yes | Yes | AMAZING SOLUTIONS, live | PaymentIntent list returned real account data | Not performed | Tested | No charge, refund, invoice or payment link created; a canceled intent is not money received |
| Existing Samy OS WhatsApp plugin | Yes | Yes | Recipient alias present | Status tool replied with deployed wording | Not performed | Tested | Configuration only, not delivery or inbound verification |
| Hub via Samy OS API | Yes | Yes | Hub project identified by deployed health | Authenticated list_clients and list_invoices returned HTTP 200 and ok=true | Not performed | API tested; new MCP read tool pending consent/discovery | Do not infer that the ordinary-chat read tool is installed from backend success |
| Gmail via Samy OS API | Yes | Yes | Owner mailbox confirmed by deployed health | Authenticated search_email returned HTTP 200 and ok=true | Not performed | API tested; new MCP read tool pending consent/discovery | Sending and attachment workflows remain untested |
| Calendar via Samy OS | Yes | Yes | Owner identity not independently checked | Deployed health executed list_events successfully | Not performed | New MCP read tool pending consent/discovery | No calendar event created or deleted |
| Personal Supabase project | Yes | Deployed credentials verified | Original project restored | Production health: six table probes, service-role query and owner lookup passed | Not performed | API health verified | Management connector uses a different authorization and previously denied this project |
| WordPress custom connector | Yes | Yes | torontodominicano alias | Status and post reads passed | Draft 75536 created, updated and read back | Tested | Publishing/media not tested; alias-discovery PR remains undeployed |
| Hostinger hosting x2 | Not exposed here | Not tested | Not identified | Not tested | Not performed | Blocked | Existing mail authorization is insufficient |
| Metricool | Yes | Yes | TorontoDominicano brand identified | Brand listing passed | Not performed | Brand listing tested | Network-specific publishing and private analytics need verification |
| Google Ads | Discoverable compatible connector | Not authorized here | Not identified | Not tested | Not performed | Blocked | No campaign or budget change made |

The API tests reported only HTTP status, ok flags and record counts. No customer lists, email bodies, provider secrets or payment identifiers are included in this repository.

## Deployment boundary

PR #6 was already merged and deployed before the owner clarified that future production changes must wait until the full project is finished. This increment remains on `feat/connector-readiness` and a Vercel preview. Do not merge it into production based only on passing CI.

The system is not complete: ordinary-chat discovery/reconsent for the new MCP tool, management access to the restored personal database, two hosting accounts, inbound messages, complete approvals/idempotency and marketing integrations still require work. A passing build is not acceptance of these missing capabilities.

## Security hardening in this preview

Dashboard authorization now requires the configured owner, not merely any valid
Supabase login. An explicit owner user ID takes precedence; the email fallback
requires a confirmed matching email. Missing owner configuration denies session
access. Existing server gateway credentials retain their authorization path.

Gmail rejects CR/LF/NUL header injection before provider calls and rejects
injected reply metadata. It no longer adds `Re:` after draft review. The OpenAPI
contract now describes preservation of the reviewed subject. Unit tests use
mocked Gmail responses; no real email was sent.

## Dashboard draft review update

The dashboard now fetches the authenticated Gmail identity before presenting an
immutable snapshot with sender, To, CC, BCC (none), full subject/body and
attachments (none). Editing requires another review. The explicit approval
button sends that snapshot, and an in-flight guard prevents double clicks.
The dashboard API requires a confirmation flag and expected sender; Gmail
rechecks that sender before sending. Tests cover identity changes, missing
confirmation, unauthorized access and preview-without-send. No real email sent.

This is UI confirmation, not a durable server approval record. A trusted caller
can still supply the confirmation flag. Single-use draft-bound approval,
idempotency across retries/instances, and the separate ChatGPT send endpoint
remain incomplete. BCC and attachments are not supported by this composer.
Browser interaction testing awaits a usable authenticated dashboard; compilation
and mocked route/provider tests do not replace that check. Do not deploy yet.

OAuth code replay prevention, revocation and rate limiting also remain open.

## WordPress blocker corrected

The custom connector was reachable. The valid alias is `torontodominicano`
(without `.com`). Both connections passed real status reads. Reading posts,
creating/updating draft 75536 and reading it back succeeded. It remains a draft.
Alias discovery/domain support is prepared in the original connector repository
PR #1, not deployed. See that repository README for the exact test record.

## Single-use email approval foundation (not activated)

`lib/server/email-approval.ts` implements a draft-hash-bound, principal-bound
15-minute approval lifecycle and a Supabase adapter. One conditional database
UPDATE claims the approval before the provider call. Consumed/uncertain claims
are never reset automatically. Provider success followed by audit failure returns
the receipt as `sent_audit_pending`; it does not invite a second send. Persisted
records contain hashes and receipts, not email content. Unsupported BCC and
attachments are rejected rather than silently dropped.

Five added tests use an atomic in-memory test store: edited draft fields, wrong
principal, expiration, eight simultaneous attempts, uncertain provider delivery,
storage failure and receipt persistence failure. These test the service contract,
NOT actual PostgreSQL concurrency or RLS. Total local automated suite: 27 tests.

`docs/proposals/email-approval-schema.sql` is an unapplied proposal, not a migration.
It revokes browser/public table access and enables RLS, with server-only grants.
No tables or data were changed. The original project `ljiviqzuzhtdrftphsih` still
returns `You do not have permission to perform this action` from management API.
Do not move this state into Hub tables or another project to bypass that blocker.

Release prerequisites: regain authorized original database access, inspect its
schema, generate/apply a migration in staging using the CLI workflow, verify
RLS and concurrent claims against Postgres, then connect BOTH send routes and
the dashboard/OpenAPI prepare-confirm flow to this service. The module is not
currently imported by either send route. The existing confirmation flag is NOT
a single-use approval. No production protection is claimed from this unused
foundation. Verify sender at preparation and execution, bind approval principal
to server-authenticated owner identity, and display every normalized field.

This provides at most one attempt per approval, not exactly-once delivery across
newly created approvals. Do not prepare another approval after an uncertain send
until the owner checks Sent mail. A crash after claiming requires reconciliation.
A malicious authorized caller can still assert owner approval; UI/ChatGPT must
capture explicit approval after showing the complete draft.

## Original production database recovered — 2026-11-08

The owner signed into the Supabase organization Samy OS. Through that owner
session, Resume project was confirmed for samy-os-PRODUCCION
(`ljiviqzuzhtdrftphsih`). Supabase displayed “Restoration complete!” and “back
online”. Production `/api/health` subsequently returned `ok: true`,
`tablesReady: true`, `serviceRoleWorks: true`, `ownerResolved: true` and
`chatgptGateway: true`. Gmail identified the expected mailbox; Calendar and
Hub checks returned `works: true`. These are bounded read probes, not a full
data-integrity audit or proof of all workflows. OpenAI's flag is configuration
only. No schema, environment-variable, billing-plan or deployment change occurred.
The management plugin's prior permission denial is separate from application
credentials and was not repaired by resuming the project.

The ordinary-chat `estado_whatsapp` tool was called again successfully after
recovery. It still only establishes configuration, not delivery. This chat's
available Samy OS tools remain the two notification tools, with no
`consultar_samy_os`. The existing private App-backed plugin was identified as
`plugin_asdk_app_6a99a293f7f8819183d408833b774ed5`; no replacement was created.
Its package only references the existing App, so changing package text cannot
renew OAuth consent or refresh the App's tool list. Browser access to ChatGPT
settings was blocked by the browser host policy. The owner must renew read
consent on the existing connection through ChatGPT's supported UI. Do not mint
an access token out of band or expand existing notification tokens silently.

## Bounded MCP list responses — preview only

Hub client/project/task/note/invoice lists and Calendar events now honor the
requested `limit` (1–25, default 25). Responses include `result_limit` and
`truncated` when the bridge omitted fetched rows. This flag describes bridge
trimming only: providers may already cap their result sets, so `false` does not
prove an exhaustive account inventory. Pagination remains future work. A
behavioral test covers every list operation, defaults and empty results; no
customer data is written. This change is not deployed to production.

## Discovery repair after owner reconnect — 2026-11-08

The owner reconnected and refreshed the existing App, then tested in a fresh
ChatGPT conversation. The supplied screenshot still shows only enviar_whatsapp
and estado_whatsapp. This rules out this conversation alone retaining the old
catalog; it does not reveal which grant ChatGPT used for metadata discovery.

The server previously omitted consultar_samy_os from tools/list for legacy
notification tokens. Discovery now advertises the same three schemas for every
valid token. Execution still enforces accessTokenCanRead BEFORE any provider
call; invalid tokens cannot list tools and legacy tokens cannot read data.
This eliminates grant-dependent catalog omission without granting read access.
It does not prove ChatGPT has accepted or refreshed the new catalog.

Validation: 29 unit/route tests passed, changed-file ESLint passed, production
build passed, and local HTTP OAuth tests passed with notification-only and
read-authorized grants. An initial HTTP attempt failed because the separately
started local server was no longer running; rerunning the server and tests in
the same process lifecycle passed. No real customer messages were sent.

This repair remains on PR #7, NOT production. Acceptance still requires the
new code deployed, a refreshed App catalog, and a real read invocation from
ChatGPT. Do not ask the owner to repeatedly reconnect the unchanged deployment.
