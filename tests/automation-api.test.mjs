import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createApiHandler, validateProduct } from '../supabase/functions/freo-automation-api/core.mjs';
import { createDispatchHandler } from '../supabase/functions/freo-automation-dispatch/core.mjs';

const origin = 'https://example.supabase.co';
const readToken = 'r'.repeat(48);
const writeToken = 'w'.repeat(48);
const request = (path, method = 'GET', token = readToken, body) => new Request(`https://example.supabase.co/functions/v1/freo-automation-api${path}`, {
  method,
  headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('API fails closed on missing credentials and read token cannot mutate catalog', async () => {
  const handler = createApiHandler({ db: {}, readToken, writeToken, storageOrigin: origin });
  assert.equal((await handler(new Request('https://example.supabase.co/functions/v1/freo-automation-api/products'))).status, 401);
  assert.equal((await handler(request('/products', 'POST', readToken, { title: 'Figure', price: 20, category: 'games' }))).status, 403);
});

test('product writes allow regular catalog fields and block privileged/special fields', () => {
  const product = validateProduct({ title: 'Figure', price: 20, category: 'games' }, { creating: true, storageOrigin: origin });
  assert.equal(product.is_active, false);
  assert.equal(product.b2b_category, 'loja');
  assert.equal(validateProduct({ preparation_days: 3 }, { storageOrigin: origin }).preparation_days, 3);
  assert.throws(() => validateProduct({ preparation_days: 0 }, { storageOrigin: origin }), /Prazo de preparação/);
  assert.throws(() => validateProduct({ publication_id: 'forged' }, { storageOrigin: origin }), /Campo não permitido/);
  assert.throws(() => validateProduct({ category: 'feito_por_voces' }, { storageOrigin: origin }), /Categoria indisponível/);
  assert.throws(() => validateProduct({ title: 'X' }, { existing: { is_kit: true }, storageOrigin: origin }), /painel especializado/);
  assert.throws(() => validateProduct({ images: ['https://other.example/private.png'] }, { storageOrigin: origin }), /bucket imagens/);
});

test('authenticated product creation writes only validated fields and archives on DELETE', async () => {
  let saved = null;
  const existing = { id: 12, title: 'Figure', price: 20, promotional_price: null, is_kit: false, publication_id: null, b2b_category: 'loja', sale_mode: 'normal', is_active: true };
  const db = { from(table) {
    assert.equal(table, 'products');
    return {
      insert(value) { saved = value; return { select() { return { single: async () => ({ data: { id: 12, ...value }, error: null }) }; } }; },
      select() { return { eq() { return { maybeSingle: async () => ({ data: existing, error: null }) }; } }; },
      update(value) { saved = value; return { eq() { return { select() { return { single: async () => ({ data: { ...existing, ...value }, error: null }) }; } }; } }; },
    };
  } };
  const handler = createApiHandler({ db, readToken, writeToken, storageOrigin: origin });
  const created = await handler(request('/products', 'POST', writeToken, { title: 'Figure', price: 20, category: 'games' }));
  assert.equal(created.status, 201);
  assert.equal(saved.is_active, false);
  assert.equal(saved.sale_mode, 'normal');
  const archived = await handler(request('/products/12', 'DELETE', writeToken));
  assert.equal(archived.status, 200);
  assert.deepEqual(saved, { is_active: false });
  assert.equal((await archived.json()).meta.archived, true);
});

test('analytics endpoint passes bounded time range to aggregate RPC', async () => {
  let called;
  const db = { rpc: async (name, params) => { called = { name, params }; return { data: { visits: 3 }, error: null }; } };
  const handler = createApiHandler({ db, readToken, writeToken, storageOrigin: origin });
  const response = await handler(request('/analytics/funnel?from=2026-10-01&to=2026-10-08'));
  assert.equal(response.status, 200);
  assert.equal(called.name, 'automation_analytics_funnel');
  assert.equal(called.params.p_from, '2026-10-01T00:00:00.000Z');
  assert.equal((await handler(request('/analytics/funnel?from=2026-01-01&to=2026-10-08'))).status, 400);
});

test('webhook signs and acknowledges an outbox event; failed delivery remains retryable', async () => {
  const updates = [];
  const db = {
    rpc: async () => ({ data: [{ id: 7, event_type: 'order.created', order_id: 123, payload: { order_id: 123 }, created_at: '2026-10-23T00:00:00Z', attempts: 1 }], error: null }),
    from() { return { update(value) { updates.push(value); return { eq() { return { eq: async () => ({ error: null }) }; } }; } }; },
  };
  let sent;
  const handler = createDispatchHandler({ db, workerToken: writeToken, webhookUrl: 'https://automation.example/webhook', signingSecret: 's'.repeat(48), now: () => new Date('2026-10-23T00:01:00Z'), fetchImpl: async (url, options) => { sent = { url, options }; return new Response('', { status: 200 }); } });
  const response = await handler(new Request('https://example.supabase.co/dispatch', { method: 'POST', headers: { authorization: `Bearer ${writeToken}` } }));
  assert.equal((await response.json()).delivered, 1);
  assert.equal(sent.options.headers['x-freo-event-id'], '7');
  assert.match(sent.options.headers['x-freo-signature'], /^sha256=[a-f0-9]{64}$/);
  assert.equal(updates[0].delivered_at, '2026-10-23T00:01:00.000Z');

  const failing = createDispatchHandler({ db, workerToken: writeToken, webhookUrl: 'https://automation.example/webhook', signingSecret: 's'.repeat(48), now: () => new Date('2026-10-23T00:01:00Z'), fetchImpl: async () => new Response('', { status: 503 }) });
  const retried = await failing(new Request('https://example.supabase.co/dispatch', { method: 'POST', headers: { authorization: `Bearer ${writeToken}` } }));
  assert.equal((await retried.json()).failed, 1);
  assert.equal(updates[1].next_attempt_at, '2026-10-23T00:01:15.000Z');
});

test('SQL migration queues orders, restricts outbox, and aggregates consented events', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.orders(id bigint primary key, status text not null, total numeric not null, created_at timestamp without time zone not null default (now() at time zone 'UTC'));
      create table public.analytics_events(event_type text not null, product_id text, page text, session_id text, created_at timestamptz not null default now());
      grant insert, update, select on public.orders to authenticated, service_role;
      grant select, insert on public.analytics_events to service_role;
    `);
    const sql = await readFile(new URL('../supabase/migrations/20261023182546_automation_api_v1.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(`set role authenticated; insert into public.orders(id,status,total) values(1,'pendente',20); update public.orders set status='pago' where id=1;`);
    await assert.rejects(db.query('select * from public.automation_outbox'), /permission denied/);
    await db.exec('reset role; set role service_role;');
    const outbox = (await db.query('select event_type,payload from public.automation_outbox order by id')).rows;
    assert.deepEqual(outbox.map(row => row.event_type), ['order.created', 'order.status_changed']);
    assert.equal(outbox[1].payload.status, 'pago');
    const claimed = (await db.query('select * from public.automation_claim_outbox(20)')).rows;
    assert.equal(claimed.length, 2);
    assert.equal(claimed[0].attempts, 1);
    await db.exec(`insert into public.analytics_events(event_type,product_id,page,session_id) values
      ('page_view',null,'/','a'),('product_click','7','/produto?secret=yes','a'),
      ('add_to_cart','7','/carrinho','a'),('begin_checkout',null,'/checkout','a'),
      ('page_view',null,'/','b');`);
    const funnel = (await db.query("select public.automation_analytics_funnel(now()-interval '1 day',now()+interval '1 day') as data")).rows[0].data;
    assert.equal(Number(funnel.visits), 2);
    assert.equal(Number(funnel.left_after_checkout), 1);
    assert.equal(Number(funnel.paid_orders_created_in_period), 1);
    const pages = (await db.query("select public.automation_analytics_pages(now()-interval '1 day',now()+interval '1 day') as data")).rows[0].data;
    assert.equal(pages[0].path, '/');
  } finally { await db.close(); }
});
