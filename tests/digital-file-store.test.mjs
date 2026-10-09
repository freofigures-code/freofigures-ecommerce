import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('digital purchases require two private files, a server order, and verified payment', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-4000-8000-000000000001';
  const buyer = '00000000-0000-4000-8000-000000000002';
  const other = '00000000-0000-4000-8000-000000000003';
  const uuid = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema private;
      create table auth.users(id uuid primary key,email text,is_anonymous boolean not null default false);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
      create table public.profiles(id uuid primary key,is_admin boolean not null default false);
      create function public.is_publication_admin() returns boolean language sql stable security definer
        as 'select exists(select 1 from public.profiles where id=auth.uid() and is_admin)';
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text);
      alter table storage.objects enable row level security;
      create table public.orders(
        id bigint generated always as identity primary key,user_id uuid,status text default 'pendente',
        total numeric(12,2),items jsonb,frete_valor numeric,payment_id text,is_b2b boolean not null default false,
        customer_email text,freo_verified_paid_amount numeric
      );
      insert into auth.users values('${admin}','admin@example.com',false),
        ('${buyer}','buyer@example.com',false),('${other}','other@example.com',false);
      insert into public.profiles values('${admin}',true),('${buyer}',false),('${other}',false);
      grant usage on schema auth,storage to authenticated,anon,service_role;
      grant select on public.profiles to authenticated,anon;
      grant select,insert,update on public.orders to authenticated; grant all on public.orders to service_role;
      grant usage,select on sequence public.orders_id_seq to authenticated;
      grant select,insert on storage.objects to authenticated;
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261009153413_digital_file_store.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const diagnostic = await readFile(new URL('../supabase/diagnostics/digital_file_store_postflight.sql', import.meta.url), 'utf8');
    const check = (await db.query(diagnostic)).rows[0].verificacao_loja_digital;
    assert.ok(Object.values(check).every(Boolean), JSON.stringify(check));
    await db.exec(`select set_config('test.uid','${admin}',false); set role authenticated;`);
    await assert.rejects(db.exec(`insert into public.digital_products(title,price,is_active) values('Modelo ativo',20,true)`), /STL e 3MF/);
    const product = (await db.query(`insert into public.digital_products(title,price,is_active)
      values('Chaveiro digital',20,false) returning id`)).rows[0].id;
    await db.exec('reset role');
    await db.exec(`insert into storage.objects values
      ('digital-print-files','stl/${uuid}.stl'),('digital-print-files','3mf/${uuid}.3mf')`);
    await db.exec(`set role authenticated;
      insert into public.digital_product_assets(product_id,stl_path,mf3_path)
        values(${product},'stl/${uuid}.stl','3mf/${uuid}.3mf');
      update public.digital_products set is_active=true where id=${product};`);
    await assert.rejects(db.exec(`insert into public.orders(user_id,total,items,frete_valor,is_digital,digital_validated,digital_request_id)
      values('${admin}',20,'[]',0,true,true,'${uuid}')`), /só pode ser criado/);
    await db.exec(`reset role; select set_config('test.uid','${other}',false); set role authenticated;`);
    assert.equal((await db.query('select count(*) as n from public.digital_products')).rows[0].n, 1);
    assert.equal((await db.query('select count(*) as n from public.digital_product_assets')).rows[0].n, 0);
    await assert.rejects(db.exec(`insert into public.digital_products(title,price) values('Produto falso',1)`));
    await db.exec(`reset role; select set_config('test.uid','${buyer}',false); set role service_role;`);
    const order = (await db.query(`select public.digital_create_order(${product},'${buyer}','${uuid}') as id`)).rows[0].id;
    const again = (await db.query(`select public.digital_create_order(${product},'${buyer}','${uuid}') as id`)).rows[0].id;
    assert.equal(again, order);
    const snapshot = (await db.query(`select stl_path,mf3_path from public.digital_order_entitlements where order_id=${order}`)).rows[0];
    assert.equal(snapshot.stl_path, `stl/${uuid}.stl`);
    await db.exec(`reset role; select set_config('test.uid','${buyer}',false); set role authenticated;`);
    await assert.rejects(db.exec(`update public.orders set payment_id='123456789' where id=${order}`), /só pode ser alterado pelo servidor/);
    await db.exec('reset role; set role service_role;');
    await db.exec(`update public.orders set status='pago',freo_verified_paid_amount=20 where id=${order}`);
    await assert.rejects(db.exec(`select public.digital_create_order(${product},'${buyer}','22222222-2222-4222-8222-222222222222')`), /já está na sua biblioteca/);
    await db.exec(`reset role; select set_config('test.uid','${other}',false); set role authenticated;`);
    assert.equal((await db.query('select count(*) as n from public.digital_order_entitlements')).rows[0].n, 0);
    await db.exec(`reset role; select set_config('test.uid','${buyer}',false); set role authenticated;`);
    assert.equal((await db.query('select count(*) as n from public.digital_order_entitlements')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('digital storefront remains separate from physical stock and shipping', async () => {
  const page = await readFile(new URL('../public/stls.html', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../public/admin/arquivos-digitais.html', import.meta.url), 'utf8');
  const edge = await readFile(new URL('../supabase/functions/freo-digital-store/index.ts', import.meta.url), 'utf8');
  for (const html of [page, admin]) {
    const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(Boolean);
    for (const source of inline) assert.doesNotThrow(() => new Function(source));
  }
  assert.match(page, /freo-digital-store/);
  assert.match(admin, /digital-print-files/);
  assert.match(edge, /freo_verified_paid_amount/);
  const sync = await readFile(new URL('../supabase/functions/freo-payment-sync/index.ts', import.meta.url), 'utf8');
  assert.match(sync, /digital_order_id/);
  assert.match(sync, /external_reference/);
  assert.doesNotMatch(edge, /decrementar_estoque|calcular-frete/);
});
