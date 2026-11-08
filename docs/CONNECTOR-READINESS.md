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
| Personal Supabase project | Configured | Not confirmed | Project identified | Deployment queries fail; management API explicitly denies access | Not performed | Blocked | Requires access to the account/organization owning the existing project; do not replace it with the Hub database |
| WordPress custom connector | Yes | Not confirmed for site | Alias unresolved | Both links reject the supplied domain alias | Not performed | Tools visible, site operation blocked | Backend alias map not exposed by these tools |
| Hostinger hosting x2 | Not exposed here | Not tested | Not identified | Not tested | Not performed | Blocked | Existing mail authorization is insufficient |
| Metricool | Yes | Yes | TorontoDominicano brand identified | Brand listing passed | Not performed | Brand listing tested | Network-specific publishing and private analytics need verification |
| Google Ads | Discoverable compatible connector | Not authorized here | Not identified | Not tested | Not performed | Blocked | No campaign or budget change made |

The API tests reported only HTTP status, ok flags and record counts. No customer lists, email bodies, provider secrets or payment identifiers are included in this repository.

## Deployment boundary

PR #6 was already merged and deployed before the owner clarified that future production changes must wait until the full project is finished. This increment remains on `feat/connector-readiness` and a Vercel preview. Do not merge it into production based only on passing CI.

The system is not complete: ordinary-chat discovery/reconsent for the new MCP tool, personal database access, WordPress aliases, two hosting accounts, inbound messages, complete approvals/idempotency and marketing integrations still require work. A passing build is not acceptance of these missing capabilities.

## Security hardening in this preview

Dashboard authorization now requires the configured owner, not merely any valid
Supabase login. An explicit owner user ID takes precedence; the email fallback
requires a confirmed matching email. Missing owner configuration denies session
access. Existing server gateway credentials retain their authorization path.

Gmail rejects CR/LF/NUL header injection before provider calls and rejects
injected reply metadata. It no longer adds `Re:` after draft review. The OpenAPI
contract now describes preservation of the reviewed subject. Unit tests use
mocked Gmail responses; no real email was sent.

**This does not complete the approval workflow.** The existing dashboard
confirmation still truncates the message and omits the sender/CC/BCC/attachment
summary. API sends do not yet require a durable, single-use approval bound to a
complete final draft. Production release remains blocked until this is fixed
and tested. OAuth code replay prevention, revocation, durable action idempotency,
and rate limiting also remain open. Do not report the full handoff completed.
