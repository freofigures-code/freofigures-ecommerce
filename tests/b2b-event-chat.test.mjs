import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/202610060001_b2b_event_quotes_chat.sql', import.meta.url);
const quoteMigration = new URL('../supabase/migrations/202610030002_b2b_quote_requests.sql', import.meta.url);
const ids = {
  owner: '11111111-1111-4111-8111-111111111111',
  other: '22222222-2222-4222-8222-222222222222',
  admin: '33333333-3333-4333-8333-333333333333',
};

test('event quote prices are server-calculated and chat/images stay in their conversation', async () => {
  const db = new PGlite();
  const as = (id) => db.exec(`reset role; select set_config('test.uid','${id}',false); set role authenticated;`);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private; create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values
        ('${ids.owner}','owner@example.com'),('${ids.other}','other@example.com'),('${ids.admin}','admin@example.com');
      create table public.profiles(id uuid primary key,account_type text,company_name text,phone text,cnpj text,is_admin boolean default false);
      insert into public.profiles values
        ('${ids.owner}','pj','Empresa A',null,'12345678000190',false),
        ('${ids.other}','pj','Empresa B',null,'98765432000199',false),
        ('${ids.admin}','pj','Admin',null,'12345678000190',true);
      grant select on public.profiles to authenticated;
      create table public.products(id bigint primary key,title text,b2b_category text,sale_mode text,is_kit boolean default false,is_active boolean default true);
      insert into public.products values(1,'Chaveiro','eventos','quote_only',false,true);
      grant select on public.products to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      grant usage,select on sequence storage.objects_id_seq to authenticated;
    `);
    await db.exec(await readFile(quoteMigration, 'utf8'));
    await db.exec(await readFile(migration, 'utf8'));
    const diagnostic = await readFile(new URL('../supabase/diagnostics/b2b_event_chat_postflight.sql', import.meta.url), 'utf8');
    const checks = (await db.query(diagnostic)).rows[0].verificacao_eventos_chat;
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify(checks));

    await as(ids.admin);
    await db.exec(`insert into public.b2b_event_pricing(product_id,pricing_mode,minimum_quantity,base_unit_price,discount_per_extra_unit,floor_unit_price)
      values(1,'step',10,2.00,0.02,1.00)`);
    await assert.rejects(db.exec(`update public.b2b_event_pricing set tiers='[{"min_qty":20,"unit_price":1.8}]',pricing_mode='tiers' where product_id=1`), /first break/);
    await db.exec(`update public.b2b_event_pricing set tiers='[{"min_qty":10,"unit_price":2.0},{"min_qty":20,"unit_price":1.8}]',pricing_mode='tiers' where product_id=1`);
    await as(ids.owner);
    const tierQuote = (await db.query(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity)
      values('${ids.owner}','eventos',1,'Chaveiros com logotipo da escola',25) returning estimated_unit_price,estimated_total`)).rows[0];
    assert.equal(Number(tierQuote.estimated_unit_price), 1.8);
    assert.equal(Number(tierQuote.estimated_total), 45);
    await as(ids.admin);
    await db.exec(`update public.b2b_event_pricing set tiers='[]',pricing_mode='step' where product_id=1`);

    await as(ids.owner);
    const quote = (await db.query(`insert into public.b2b_quote_requests(user_id,company_name,category,product_id,description,quantity,estimated_unit_price,estimated_total)
      values('${ids.owner}','Fraude','eventos',1,'Chaveiros para a formatura da escola',20,0.01,0.20)
      returning id,company_name,estimated_unit_price,estimated_total`)).rows[0];
    assert.equal(quote.company_name, 'Empresa A');
    assert.equal(Number(quote.estimated_unit_price), 1.8);
    assert.equal(Number(quote.estimated_total), 36);
    await assert.rejects(db.exec(`update public.b2b_quote_requests set estimated_total=0.01 where id='${quote.id}'`), /permission denied/);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity)
      values('${ids.owner}','eventos',1,'Chaveiros de formatura',9)`), /minimum/);

    const path = `${quote.id}/${ids.owner}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    await db.exec(`insert into storage.objects(bucket_id,name) values('b2b-quote-images','${path}')`);
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('b2b-quote-images','${quote.id}/${ids.other}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png')`), /row-level security/);
    const message = (await db.query(`insert into public.b2b_quote_messages(quote_id,sender_id,body,attachment_path)
      values('${quote.id}','${ids.owner}','Segue a marca','${path}') returning id`)).rows[0];
    assert.ok(message.id);
    await assert.rejects(db.exec(`insert into public.b2b_quote_messages(quote_id,sender_id,body)
      values('${quote.id}','${ids.admin}','Mensagem falsa')`), /sender/);

    await db.exec(`reset role; grant select on storage.objects to anon;
      create policy preexisting_broad_image_read on storage.objects for select to anon using (true);
      select set_config('test.uid','',false); set role anon;`);
    assert.equal((await db.query(`select * from storage.objects where bucket_id='b2b-quote-images'`)).rows.length, 0);

    await as(ids.other);
    assert.equal((await db.query('select * from public.b2b_quote_messages')).rows.length, 0);
    assert.equal((await db.query(`select * from storage.objects where bucket_id='b2b-quote-images'`)).rows.length, 0);
    await assert.rejects(db.exec(`insert into public.b2b_quote_messages(quote_id,sender_id,body)
      values('${quote.id}','${ids.other}','Tentativa de invasão')`), /participant|row-level security/);

    await as(ids.admin);
    assert.equal((await db.query('select * from public.b2b_quote_messages')).rows.length, 1);
    await db.exec(`insert into public.b2b_quote_messages(quote_id,sender_id,body)
      values('${quote.id}','${ids.admin}','Recebemos sua imagem')`);
    await as(ids.owner);
    assert.equal((await db.query('select * from public.b2b_quote_messages')).rows.length, 2);
  } finally { await db.close(); }
});

test('admin quote page and pricing helpers parse, and WhatsApp handoff is absent', async () => {
  const html = await readFile(new URL('../public/admin/cotacoes-b2b.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  const admin = await readFile(new URL('../public/admin/produtos.html', import.meta.url), 'utf8');
  assert.match(admin, /event-pricing-editor/);
  assert.match(admin, /b2b_event_pricing/);
  for (const [, inline] of admin.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Function(inline));
  }
  const b2b = await readFile(new URL('../src/BApp.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(b2b, /wa\.me/);
});
