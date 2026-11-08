# WordPress connection — verified 2026-11-08

Use the existing official WordPress ChatGPT connector for Toronto Dominicano.

- Canonical site: https://torontodominicano.com
- Site ID: 255646887 (Jetpack-connected, MCP available).
- Do not select legacy ID 5890710: WordPress reports it disconnected.
- Ordinary ChatGPT connector read test succeeded: listing published posts returned IDs 75535 and 75534.
- Authenticated draft listing succeeded with zero results. This is not a write test.
- No post, media, settings or public content was changed.
- Creation, editing, SEO metadata, media upload and publishing remain untested. Public publication requires owner approval.

The custom Amazing Solutions WP Connector is separate. Its tested alias VisitorTorontoDominicano.com returns INVALID_ARGUMENT / Unknown site alias. Earlier domain alias tests also failed. Its backend alias mapping has not been repaired. No site named VisitorTorontoDominicano.com appears in the authorized WordPress site inventory; do not silently map that name to Toronto Dominicano for writes without clarification.

The official connector is accessible in this ChatGPT conversation. This does not imply the Samy OS deployed backend has a WordPress OAuth credential or can call ChatGPT's connected tools. Avoid copying credentials or adding a duplicate WordPress site to resolve this distinction.

## Subsequent custom connector test — 2026-11-08

The custom backend was located at samyprez/amazing-solutions-wp-connector-mcp.
Its exact configured alias is `torontodominicano`. Both ChatGPT links passed
wp_status using that alias, reporting the intended site and plugin 1.4.0.
The first connection passed find/create/update/get tests; draft 75536 remains
unpublished. The previous alias errors did not mean the connection was broken.
PR #1 in that repository adds discovery and configured-domain resolution, with
six passing unit tests. It remains undeployed. Media/publishing untested.
