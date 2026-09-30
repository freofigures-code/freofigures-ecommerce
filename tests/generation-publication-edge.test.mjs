import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase/functions/generation-publication/index.ts', import.meta.url), 'utf8');
const js = ts.transpile(source.replace(/import \{ createClient \} from '[^']+';/, 'const createClient = globalThis.createClient;'), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function harness(options = {}) {
  const calls = { downloads: [], uploads: [], removals: [], rpc: [], quote: 0 };
  let handler;
  const user = options.user === undefined ? { id: 'owner' } : options.user;
  const row = { id, user_id: options.jobOwner || 'owner', status: 'completed', image_path: 'original.png', model_path: 'original.glb' };
  const table = name => {
    const chain = {
      select: () => chain, eq: () => chain,
      single: async () => ({ data: name === 'profiles' ? { is_admin: !!options.admin } : name === 'generation_publications' ? { id, status: 'pending', image_path: 'snapshot/cover' } : row }),
      maybeSingle: async () => ({ data: name === 'products' ? { images: ['https://example.com/public/cover'] } : options.existing || null }),
    }; return chain;
  };
  const client = privileged => ({
    auth: { getUser: async () => ({ data: { user } }) }, from: table,
    storage: { from: bucket => ({
      download: async path => { calls.downloads.push({bucket,path,privileged}); if (options.deniedSource && !privileged) return {error:'Storage RLS denied'}; return { data: new Blob(['test'], { type: path.endsWith('.png') || path.includes('cover') ? 'image/png' : 'model/gltf-binary' }) }; },
      upload: async (path, file) => { calls.uploads.push({ bucket, path }); return options.failModel && path.endsWith('/model') ? { error: 'upload failed' } : { data: {} }; },
      remove: async paths => { calls.removals.push({ bucket, paths }); return {}; },
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/public/cover' } }),
    }) },
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: { id, status: name.startsWith('submit') ? 'pending' : 'approved', image_path: args.p_image_path } }; },
  });
  vm.runInNewContext(js, {
    createClient: (_url,key) => client(key === 'SUPABASE_SERVICE_ROLE_KEY'), Request, Response, Blob, crypto, console: { error() {} },
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://example.com' : key }, serve: fn => { handler = fn; } },
    fetch: async (url, init) => {
      calls.quote++; assert.equal(init.headers.Authorization,'Bearer user-token');
      assert.equal(JSON.parse(init.body).generation_id,id);
      return Response.json({ success: true, ready: options.pending !== true, generation_id: id, valor_final: options.price === undefined ? 87.65 : options.price });
    },
  });
  return { calls, run: body => handler(new Request('https://example.com', { method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify(body) })) };
}
const submit = { action:'submit',generation_id:id,consent:true,price:0.01,user_id:'forged',status:'approved' };

test('Edge requires an account, explicit consent, ownership and admin role', async () => {
  for (const options of [{user:null},{user:{id:'owner',is_anonymous:true}},{jobOwner:'other'}]) {
    const h=harness(options); assert.ok((await h.run(submit)).status>=400); assert.equal(h.calls.rpc.length,0);
  }
  const h=harness(); assert.equal((await h.run({...submit,consent:false})).status,400);
  assert.equal((await h.run({action:'review',publication_id:id,approve:true,stock:1})).status,403);
  assert.equal(h.calls.uploads.length,0);
});
test('Edge stores server price and authenticated owner with private asset snapshots', async () => {
  const h=harness();const response=await h.run(submit);assert.equal(response.status,200);
  assert.equal((await response.json()).publication.status,'pending');
  assert.equal(h.calls.rpc[0].args.p_price,87.65); assert.equal(h.calls.rpc[0].args.p_user_id,'owner');
  assert.equal(h.calls.uploads.length,2);assert.ok(h.calls.uploads.every(call=>call.bucket==='generation-publications'));
  assert.equal(h.calls.removals.length,0);
  assert.equal(h.calls.downloads.length,2);
  assert.ok(h.calls.downloads.every(call=>!call.privileged && call.bucket==='generations'));
});
test('Edge fails closed on invalid price and cleans up failed snapshot uploads', async () => {
  for (const price of [0,0.001,-1,100000000,'not-a-price']) {
    const h=harness({price});assert.equal((await h.run(submit)).status,400);assert.equal(h.calls.uploads.length,0);assert.equal(h.calls.rpc.length,0);
  }
  const pending=harness({pending:true});assert.equal((await pending.run(submit)).status,400);assert.equal(pending.calls.uploads.length,0);
  const h=harness({failModel:true});assert.equal((await h.run(submit)).status,400);
  assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.removals[0].paths.length,1);
});
test('Edge retries do not duplicate a submitted model and admin rejection publishes no image', async () => {
  const h=harness({existing:{id,status:'pending'}});assert.equal((await h.run(submit)).status,200);
  assert.equal(h.calls.quote,0);assert.equal(h.calls.uploads.length,0);
  const admin=harness({admin:true});assert.equal((await admin.run({action:'review',publication_id:id,approve:false,reason:'Revisar modelo'})).status,200);
  assert.equal(admin.calls.uploads.length,0);assert.equal(admin.calls.rpc[0].args.p_approve,false);
});

test('forged generation paths cannot bypass caller Storage permissions', async () => {
  const h=harness({deniedSource:true});
  assert.equal((await h.run(submit)).status,400);
  assert.equal(h.calls.downloads[0].privileged,false);
  assert.equal(h.calls.uploads.length,0);
  assert.equal(h.calls.rpc.length,0);
});
