import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash, createHmac } from 'node:crypto';
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name === 'server-only' ? {} : mocks[name] || require(name), loaded, loaded.exports);
  return loaded.exports;
}
const providerNames = ['./gmail', './calendar', './hub', './notifications', './connectors', './whatsapp-inbox'];
const read = load('lib/server/mcp-read.ts', Object.fromEntries(providerNames.map(n => [n, {}])));
process.env.ASSISTANT_API_KEY = 'local-unit-assistant-key';
process.env.MCP_OAUTH_SECRET = 'local-unit-test-only-not-a-real-secret';
const oauth = load('lib/server/mcp-oauth.ts');
function token(readAccess) {
  const verifier = 'a'.repeat(43);
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const { client_id } = oauth.registerClient([redirect]);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return oauth.redeemCode(oauth.issueCode(client_id, redirect, challenge, readAccess), client_id, redirect, verifier);
}
test('legacy notification token does not acquire read permissions', () => {
  const t = token(false);
  assert.equal(oauth.accessTokenValid(t), true);
  assert.equal(oauth.accessTokenCanRead(t), false);
});
test('explicit new consent grants read access; tampering does not', () => {
  const t = token(true);
  assert.equal(oauth.accessTokenCanRead(t), true);
  assert.equal(oauth.accessTokenCanRead(t + 'x'), false);
});
test('write operations cannot enter through the read bridge', async () => {
  for (const operation of ['confirm_invoice', 'send_email', 'delete_event', 'create_client']) {
    await assert.rejects(read.runReadOperation({ operation }, {}), /Unsupported/);
  }
});
test('rejects malformed or injected arguments before provider calls', async () => {
  for (const args of [{ operation: 'search_email', limit: 0 }, { operation: 'search_email', limit: 26 }, { operation: 'search_email', query: {} }, { operation: 'list_clients', body: 'write' }, { operation: 'read_email' }]) {
    await assert.rejects(read.runReadOperation(args, {}));
  }
});
test('routes every business query to existing Hub without personal database', async () => {
  let calls = [];
  const mock = name => async (...args) => { calls.push([name, args]); return [{ id: 'existing' }]; };
  const deps = { listHubProjects: mock('projects'), listHubClients: mock('clients'), listHubReminders: mock('notes'), listHubInvoices: mock('invoices') };
  for (const operation of ['list_tasks', 'list_projects', 'list_clients', 'list_notes', 'list_invoices']) {
    const r = await read.runReadOperation({ operation, query: 'customer', status: 'pending' }, deps);
    assert.equal(r.source, 'amazing_business_hub');
  }
  assert.deepEqual(calls.map(c => c[0]), ['projects', 'projects', 'clients', 'notes', 'invoices']);
});

test('limit trims list results, not only email search', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
  const deps = { listHubClients: async () => many };
  assert.equal((await read.runReadOperation({ operation: 'list_clients', limit: 10 }, deps)).clients.length, 10);
  assert.equal((await read.runReadOperation({ operation: 'list_clients' }, deps)).clients.length, 30);
});
test('Gmail reads use requested message id and bounded search limit', async () => {
  const deps = { searchEmails: async (q, n) => { assert.equal(q, 'is:unread'); assert.equal(n, 5); return []; }, readEmail: async id => { assert.equal(id, 'message1'); return { id }; } };
  assert.equal((await read.runReadOperation({ operation: 'search_email', query: 'is:unread', limit: 5 }, deps)).ok, true);
  assert.equal((await read.runReadOperation({ operation: 'read_email', message_id: 'message1' }, deps)).email.id, 'message1');
});
test('health distinguishes absent configuration, real read, failure and untested writes', async () => {
  const deps = { gmailConfigured: () => true, getGmailAddress: async () => 'test@example.com', calendarConfigured: () => false, hubConfigured: () => true, hubReachable: async () => { throw Error('private-provider-payload'); }, providerStatus: () => ({ configured: true, provider: 'twilio' }) };
  const r = await read.runReadOperation({ operation: 'connector_status' }, deps);
  assert.deepEqual(r.connectors.map(c => c.state), ['read_verified', 'not_configured', 'read_failed']);
  assert.equal(r.connectors.every(c => c.write_tested === false), true);
  assert.equal(r.whatsapp.read_tested, false);
  assert.equal(JSON.stringify(r).includes('private-provider-payload'), false);
});
test('mixed OpenAPI gateway requires consequential confirmation', () => {
  const { buildSamyOsOpenApi } = load('lib/server/openapi-schema.ts');
  assert.equal(buildSamyOsOpenApi('https://example.com').paths['/api/chatgpt'].post['x-openai-isConsequential'], true);
});

test('notification signing key cannot mint read access', () => {
  const payload = Buffer.from(JSON.stringify({kind:'access_read',exp:Date.now()+60000})).toString('base64url');
  const forged = payload+'.'+createHmac('sha256',process.env.MCP_OAUTH_SECRET).update('access_read.'+payload).digest('base64url');
  assert.equal(oauth.accessTokenCanRead(forged),false);
  assert.equal(oauth.accessTokenValid(forged),false);
});

function gatewayWithUnavailablePersonalDb() {
  const unavailable = () => { throw Error('personal database unavailable'); };
  return load('lib/server/gateway-operations.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/server/samy-os-admin': { getSamyOsAdmin: unavailable, getSamyOsOwnerId: unavailable },
    '@/lib/server/assistant-engine': {},
    '@/lib/server/gmail': { gmailConfigured: () => true, searchEmails: async () => [{id:'mail'}], readEmail: async () => ({id:'mail'}) },
    '@/lib/server/calendar': { calendarConfigured: () => true, listCalendarEvents: async () => [] },
    '@/lib/server/hub': { hubConfigured: () => true, listHubClients: async () => [{id:'client'}], listHubProjects: async () => [{id:'project'}], listHubReminders: async () => [], listHubInvoices: async () => [{id:'invoice'}] },
  });
}
test('legacy gateway reads remain usable while personal database is unavailable', async () => {
  const { runGatewayOperation } = gatewayWithUnavailablePersonalDb();
  for (const operation of ['overview','list_clients','list_tasks','list_projects','list_notes','list_invoices','search_email','read_email','list_events']) {
    const response = await runGatewayOperation({operation,message_id:'mail'});
    assert.equal((await response.json()).ok,true,operation);
  }
});
test('personal data operations still require personal database context', async () => {
  const { runGatewayOperation } = gatewayWithUnavailablePersonalDb();
  for (const operation of ['list_brands','create_brand','list_health','create_health']) {
    await assert.rejects(runGatewayOperation({operation}),/personal database unavailable/);
  }
});
test('ChatGPT route authenticates and dispatches without owner lookup', async () => {
  let authenticated = false;
  const route = load('app/api/chatgpt/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/server/samy-os-admin': { assertSamyOsApiAuth: () => { authenticated = true; } },
    '@/lib/server/gateway-operations': { runGatewayOperation: async input => { assert.equal(authenticated,true); return Response.json({ok:true,operation:input.operation}); } },
    '@/lib/server/gateway-errors': { isDatabaseUnreachable: () => false },
  });
  assert.equal((await (await route.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify({operation:'list_clients'})}))).json()).ok,true);
  assert.equal((await route.POST(new Request('https://example.com',{method:'POST',body:'null'}))).status,400);
});
