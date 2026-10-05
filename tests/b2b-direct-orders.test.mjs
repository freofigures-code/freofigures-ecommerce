import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('B2B migration creates a separate cart, validates quantities and fixes order type', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
      create function auth.role() returns text language sql as 'select current_setting(''test.role'',true)';
      create table public.profiles(id uuid primary key,account_type text,is_admin boolean,cnpj text);
      create table public.products(id bigint primary key,b2b_category text,is_active boolean);
      create table public.product_price_tiers(product_id bigint,min_qty integer,max_qty integer,unit_price numeric,is_active boolean);
      create table public.orders(id bigint generated always as identity primary key,user_id uuid,
        status text default 'pendente',items jsonb,total numeric,frete_valor numeric,
        shipping_address text,freo_verified_paid_amount numeric);
    `);
    const migration = await readFile(new URL('../supabase/migrations/202610050001_b2b_direct_orders.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const diagnostic = await readFile(new URL('../supabase/diagnostics/b2b_direct_orders_postflight.sql', import.meta.url), 'utf8');
    const postflight = (await db.query(diagnostic)).rows[0].verificacao_pedidos_b2b;
    assert.ok(Object.values(postflight).every(Boolean), JSON.stringify(postflight));
    const user = '00000000-0000-4000-8000-000000000001';
    await db.exec(`insert into auth.users values ('${user}'); insert into public.profiles values ('${user}','pf',false,'12345678000190');
      select set_config('test.uid','${user}',false),set_config('test.role','authenticated',false);`);
    await assert.rejects(db.exec(`insert into public.orders(user_id,is_b2b) values ('${user}',true)`), /conta empresarial/);
    await db.exec(`update public.profiles set account_type='pj' where id='${user}'; insert into public.orders(user_id,is_b2b) values ('${user}',true);`);
    await assert.rejects(db.exec('update public.orders set is_b2b=false where is_b2b=true'), /tipo do pedido/);
    await assert.rejects(db.exec('update public.orders set b2b_validated=true where is_b2b=true'), /validado/);
    await assert.rejects(db.exec(`insert into public.b2b_cart_items(user_id,product_id,product_name,price,quantity,total_price) values ('${user}','1','Teste',1,0,0)`));
    await db.exec(`insert into public.b2b_cart_items(user_id,product_id,product_name,price,quantity,total_price) values ('${user}','1','Teste',1,1000000,1000000)`);
    const rows = await db.query('select is_b2b from public.orders');
    assert.equal(rows.rows[0].is_b2b, true);
    await db.exec(`insert into public.products values (1,'loja',true),(2,'eventos',true);
      insert into public.product_price_tiers values (1,10,null,1,true);
      grant usage on schema auth to anon,authenticated;
      grant select on public.profiles to anon,authenticated;`);
    await db.exec("select set_config('test.uid','',false),set_config('test.role','anon',false); set role anon;");
    assert.deepEqual((await db.query('select id from public.products order by id')).rows.map(r => r.id), [1]);
    await assert.rejects(db.query('select * from public.product_price_tiers'), /permission denied/);
    const pf = '00000000-0000-4000-8000-000000000002';
    await db.exec(`reset role; insert into auth.users values ('${pf}'); insert into public.profiles values ('${pf}','pf',false,null);
      select set_config('test.uid','${pf}',false),set_config('test.role','authenticated',false); set role authenticated;`);
    assert.deepEqual((await db.query('select id from public.products order by id')).rows.map(r => r.id), [1]);
    assert.equal((await db.query('select * from public.product_price_tiers')).rows.length, 0);
    await db.exec(`reset role; select set_config('test.uid','${user}',false),set_config('test.role','authenticated',false); set role authenticated;`);
    assert.deepEqual((await db.query('select id from public.products order by id')).rows.map(r => r.id), [1, 2]);
    assert.equal((await db.query('select * from public.product_price_tiers')).rows.length, 1);
  } finally {
    await db.close();
  }
});

test('B2B checkout retains the ordinary payment UI and excludes stock calls', async () => {
  const html = await readFile(new URL('../public/checkout.html', import.meta.url), 'utf8');
  assert.match(html, /b2bCheckoutMode = urlParams\.get\('b2b'\) === '1'/);
  assert.match(html, /from\(b2bCheckoutMode \? 'b2b_cart_items' : 'cart_items'\)/);
  assert.match(html, /if \(!b2bCheckoutMode\) cartItemsData\.forEach/);
  assert.match(html, /if \(data\.status !== 'rejected' && !b2bCheckoutMode\) cartItemsData\.forEach/g);
  assert.match(html, /is_b2b:\s+b2bCheckoutMode/g);
});
