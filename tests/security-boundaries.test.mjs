import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'server-only' ? {} : mocks[name] || require(name), loaded, loaded.exports);
  return loaded.exports;
}
test('dashboard rejects authenticated non-owner, unconfirmed email and missing owner configuration', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test';
  process.env.ASSISTANT_API_KEY = 'different-gateway-token';
  delete process.env.SAMY_OS_OWNER_USER_ID;
  process.env.SAMY_OS_OWNER_EMAIL = 'owner@example.com';
  let user = { id: 'stranger', email: 'stranger@example.com', email_confirmed_at: '2026-01-01' };
  const auth = load('lib/server/samy-os-admin.ts', { '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) } });
  const request = new Request('https://example.com', { headers: { authorization: 'Bearer session' } });
  await assert.rejects(auth.assertSamyOsCaller(request), /UNAUTHORIZED/);
  user = { id: 'owner', email: 'owner@example.com' };
  await assert.rejects(auth.assertSamyOsCaller(request), /UNAUTHORIZED/);
  user.email_confirmed_at = '2026-01-01';
  assert.equal(await auth.assertSamyOsCaller(request), 'owner');
  process.env.SAMY_OS_OWNER_USER_ID = 'different-owner';
  await assert.rejects(auth.assertSamyOsCaller(request), /UNAUTHORIZED/);
  process.env.SAMY_OS_OWNER_USER_ID = 'owner';
  assert.equal(await auth.assertSamyOsCaller(request), 'owner');
  delete process.env.SAMY_OS_OWNER_USER_ID;
  delete process.env.SAMY_OS_OWNER_EMAIL;
  await assert.rejects(auth.assertSamyOsCaller(request), /UNAUTHORIZED/);
});
test('Gmail rejects injected headers before making any request', async () => {
  const gmail = load('lib/server/gmail.ts');
  for (const key of ['to', 'cc', 'subject', 'reply_to_message_id']) {
    await assert.rejects(gmail.sendEmail({ to: 'recipient@example.com', subject: 'Reviewed', body: 'Reviewed body', [key]: 'value\r\nBcc: attacker@example.com' }), /Invalid email header/);
  }
  await assert.rejects(gmail.sendEmail({ to: 'recipient@example.com', subject: 'Reviewed', body: {} }), /body must be a string/);
});
test('reply sends exactly reviewed subject and body, rejects injected provider metadata', async () => {
  process.env.GOOGLE_CLIENT_ID = 'unit'; process.env.GOOGLE_CLIENT_SECRET = 'unit'; process.env.GOOGLE_REFRESH_TOKEN = 'unit';
  const oldFetch = globalThis.fetch;
  let sent = 0;
  let badMetadata = false;
  globalThis.fetch = async (url, init) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'unit', expires_in: 3600 });
    if (url.includes('/messages/original')) return Response.json({ threadId: 'thread', payload: { headers: [{ name: 'Message-ID', value: badMetadata ? '<id>\r\nBcc: attacker@example.com' : '<id>' }] } });
    assert.ok(url.endsWith('/messages/send'));
    const raw = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
    assert.match(raw, /Subject: Reviewed subject\r\n/);
    assert.equal(Buffer.from(raw.split('\r\n\r\n')[1], 'base64').toString('utf8'), 'Full reviewed body');
    sent++;
    return Response.json({ id: 'sent', threadId: 'thread' });
  };
  try {
    const gmail = load('lib/server/gmail.ts');
    const draft = { to: 'recipient@example.com', subject: 'Reviewed subject', body: 'Full reviewed body', reply_to_message_id: 'original' };
    await gmail.sendEmail(draft);
    badMetadata = true;
    await assert.rejects(gmail.sendEmail(draft), /Invalid reply metadata/);
    assert.equal(sent, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('changed Gmail sender blocks the message before sending', async () => {
  const oldFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'unit', expires_in: 3600 });
    if (url.endsWith('/profile')) return Response.json({ emailAddress: 'different@example.com' });
    writes++;
    throw new Error('Unexpected write');
  };
  try {
    const gmail = load('lib/server/gmail.ts');
    await assert.rejects(gmail.sendEmail({ expected_from: 'reviewed@example.com', to: 'recipient@example.com', subject: 'Reviewed', body: 'Body' }), /remitente cambió/);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test('dashboard preview only reads identity; sends require explicit confirmation and sender', async () => {
  let authorized = true;
  let writes = 0;
  const route = load('app/api/dashboard/send-email/route.ts', {
    '@/lib/server/samy-os-admin': { assertSamyOsCaller: async () => { if (!authorized) throw Error('UNAUTHORIZED'); return 'owner'; } },
    '@/lib/server/gmail': {
      gmailConfigured: () => true, getGmailAddress: async () => 'owner@example.com',
      sendEmail: async input => { writes++; assert.equal(input.expected_from, 'owner@example.com'); return { to: input.to }; }
    }
  });
  const preview = await route.GET(new Request('https://example.com'));
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal((await preview.json()).from, 'owner@example.com');
  assert.equal(writes, 0);
  const draft = { to: 'recipient@example.com', subject: 'Reviewed', body: 'Full body' };
  const req = input => new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  for (const invalid of [null, [], draft, { ...draft, approved: true }, { ...draft, approved: false, expected_from: 'owner@example.com' }]) assert.equal((await route.POST(req(invalid))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(req({ ...draft, approved: true, expected_from: 'owner@example.com' }))).status, 200);
  assert.equal(writes, 1);
  authorized = false;
  assert.equal((await route.GET(new Request('https://example.com'))).status, 401);
  assert.equal((await route.POST(req({ ...draft, approved: true, expected_from: 'owner@example.com' }))).status, 401);
  assert.equal(writes, 1);
});
