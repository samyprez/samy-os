// Diagnostics never echo raw provider payloads, URLs, tokens or email bodies.
export type CheckFailure = { code: string; retryable: boolean; action: string };
export function classifyConnectorError(error: unknown): CheckFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid_grant|revoked|expired.*token/i.test(message)) return { code: 'authorization_expired', retryable: false, action: 'Reauthorize the existing provider account.' };
  if (/401|unauthorized|invalid.*(key|token)/i.test(message)) return { code: 'authentication_failed', retryable: false, action: 'Check the configured account credential.' };
  if (/403|permission|insufficient|forbidden/i.test(message)) return { code: 'permission_missing', retryable: false, action: 'Authorize the required read permission for this account.' };
  if (/429|rate.limit|too many requests/i.test(message)) return { code: 'rate_limited', retryable: true, action: 'Retry after the provider rate limit resets.' };
  if (/timeout|timed out|aborted/i.test(message)) return { code: 'timeout', retryable: true, action: 'Retry the read check; verify provider reachability if it persists.' };
  if (/fetch failed|ENOTFOUND|ECONN|network/i.test(message)) return { code: 'unreachable', retryable: true, action: 'Check provider hostname, service availability and network access.' };
  if (/missing|not configured|faltan/i.test(message)) return { code: 'not_configured', retryable: false, action: 'Configure the existing connector server variables.' };
  return { code: 'provider_error', retryable: false, action: 'Inspect the provider response securely; do not infer account health.' };
}

export type DiagnosticCheck = { operation: string; state: "passed" | "failed" | "not_tested"; checked_at?: string; duration_ms?: number; code?: string; retryable?: boolean; action?: string };

export async function runConnectorCheck(operation: string, check: () => Promise<unknown>, timeoutMs = 8000): Promise<DiagnosticCheck> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(check), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('diagnostic timeout')), timeoutMs); })]);
    return { operation, state: 'passed' as const, checked_at: new Date().toISOString(), duration_ms: Date.now() - started };
  } catch (error) {
    return { operation, state: 'failed' as const, checked_at: new Date().toISOString(), duration_ms: Date.now() - started, ...classifyConnectorError(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
