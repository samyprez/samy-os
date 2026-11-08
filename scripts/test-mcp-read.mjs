import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('HTTP test is local-only');
const rpc = async (token, method, params) => {
  const r = await fetch(`${base}/api/mcp`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}) });
  return { status: r.status, data: await r.json() };
};
for(let i=0;i<30;i++) { try { await fetch(base+'/api/mcp'); break; } catch { await new Promise(r=>setTimeout(r,500)); } }
const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const registered=await fetch(base+'/api/mcp/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[redirect]})}).then(r=>r.json());
const verifier='v'.repeat(43);
const common={client_id:registered.client_id,redirect_uri:redirect,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
async function consent(read, key) {
 const res=await fetch(base+'/api/mcp/oauth/authorize',{method:'POST',redirect:'manual',body:new URLSearchParams({...common,key,...(read?{read_access:'yes'}:{})})});
 if(res.status!==302) return {status:res.status};
 const code=new URL(res.headers.get('location')).searchParams.get('code');
 const token=await fetch(base+'/api/mcp/oauth/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:common.client_id,redirect_uri:redirect,code,code_verifier:verifier})}).then(r=>r.json());
 return {status:302,token:token.access_token};
}
const legacy=await consent(false,'local-test-notification');
assert.equal(legacy.status,302);
assert.equal((await rpc(legacy.token,'tools/list',{})).data.result.tools.length,2);
assert.equal((await rpc(legacy.token,'tools/call',{name:'consultar_samy_os',arguments:{operation:'connector_status'}})).data.result.isError,true);
assert.equal((await consent(true,'local-test-notification')).status,401);
const read=await consent(true,'local-test-assistant');
assert.equal(read.status,302);
const listed=await rpc(read.token,'tools/list',{});
assert.equal(listed.data.result.tools.length,3);
assert.equal(listed.data.result.tools.find(t=>t.name==='consultar_samy_os').annotations.readOnlyHint,true);
const health=await rpc(read.token,'tools/call',{name:'consultar_samy_os',arguments:{operation:'connector_status'}});
assert.equal(health.data.result.isError,false);
assert.equal(JSON.parse(health.data.result.content[0].text).connectors.every(c=>c.state==='not_configured'),true);
assert.equal((await rpc(read.token,'tools/call',{name:'consultar_samy_os',arguments:{operation:'confirm_invoice'}})).data.result.isError,true);
assert.equal((await rpc(read.token,'tools/call',{name:'consultar_samy_os',arguments:[]})).data.error.code,-32602);
assert.equal((await rpc('invalid','tools/list',{})).status,401);
console.log('PASS: HTTP OAuth consent, old-token isolation, assistant-key requirement, discovery, configuration diagnostics, write rejection, malformed arguments and invalid-token rejection. No provider writes.');
