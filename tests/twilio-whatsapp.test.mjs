import { test } from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);

function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => name === 'server-only' ? {} : mocks[name] || require(name), loaded, loaded.exports);
  return loaded.exports;
}
const twilio = load('lib/server/twilio-whatsapp.ts');
const TOKEN = 'unit-test-token-not-real';
const URL_ = 'https://example.test/api/whatsapp/twilio';
const params = { MessageSid: 'SM' + 'a'.repeat(32), From: 'whatsapp:+16475550123', To: 'whatsapp:+14155238886', Body: 'Hola á' };

// Independent reference implementation of Twilio's documented algorithm.
function reference(url, p) {
  const data = url + Object.keys(p).sort().map((k) => k + p[k]).join('');
  return createHmac('sha1', TOKEN).update(Buffer.from(data, 'utf8')).digest('base64');
}

test('valid Twilio signature is accepted', () => {
  assert.equal(twilio.validateTwilioSignature(URL_, params, reference(URL_, params), TOKEN), true);
});
test('tampered body, other URL, missing header or token are rejected', () => {
  const sig = reference(URL_, params);
  assert.equal(twilio.validateTwilioSignature(URL_, { ...params, Body: 'otro' }, sig, TOKEN), false);
  assert.equal(twilio.validateTwilioSignature(URL_ + '?x=1', params, sig, TOKEN), false);
  assert.equal(twilio.validateTwilioSignature(URL_, params, null, TOKEN), false);
  assert.equal(twilio.validateTwilioSignature(URL_, params, sig, ''), false);
});
test('sender mode distinguishes sandbox from registered sender', () => {
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  process.env.TWILIO_WHATSAPP_FROM = '+14155238886';
  assert.equal(twilio.twilioSenderMode(), 'sandbox');
  process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+16475550000';
  assert.equal(twilio.twilioSenderMode(), 'registered_sender');
  delete process.env.TWILIO_WHATSAPP_FROM;
});
test('auth probe reports missing credentials without network', async () => {
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
  const r = await twilio.probeTwilioAuth();
  assert.equal(r.authenticated, false);
  assert.equal(r.error, 'missing_credentials');
});
test('notification gateway refuses numbers outside the directory', () => {
  const stub = { maskPhone: (x) => x, recordTwilioOutbound: async () => {} };
  const n = load('lib/server/notifications.ts', {
    '@/lib/server/twilio-whatsapp': twilio,
    '@/lib/server/whatsapp': { missingWhatsAppEnvVars: () => [], sendWhatsAppText: async () => ({}), whatsappConfigured: () => false },
    '@/lib/server/notification-formatters': { priorityPrefix: () => '', renderTemplate: () => '', templateNames: [] },
    '@/lib/server/whatsapp-inbox': stub,
  });
  process.env.SAMY_WHATSAPP = '+16475550101';
  assert.deepEqual(n.resolveRecipients({ to: 'samy' }), ['+16475550101']);
  assert.deepEqual(n.resolveRecipients({ to: '+16475550101' }), ['+16475550101']);
  assert.throws(() => n.resolveRecipients({ to: '+16475559999' }), (e) => e.code === 'recipient_not_in_directory' || e.status === 403);
  delete process.env.SAMY_WHATSAPP;
});
test('connector_status keeps WhatsApp honest and reports the registry', async () => {
  const read = load('lib/server/mcp-read.ts', Object.fromEntries(['./gmail', './calendar', './hub', './notifications', './connectors', './whatsapp-inbox'].map((n) => [n, {}])));
  const deps = {
    gmailConfigured: () => false, calendarConfigured: () => false, hubConfigured: () => false,
    providerStatus: () => ({ configured: true, provider: 'twilio' }),
    whatsappTwilioReport: async () => ({ authentication: { ok: true }, sending: { verified: false }, receiving: { verified: false } }),
    connectorRegistry: async () => [{ provider: 'stripe', state: 'not_configured' }],
  };
  const r = await read.runReadOperation({ operation: 'connector_status' }, deps);
  assert.equal(r.whatsapp.write_tested, false);
  assert.equal(r.whatsapp.diagnostics.sending.verified, false);
  assert.equal(r.remaining[0].state, 'not_configured');
});
