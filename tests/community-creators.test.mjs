import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('approved creators, moderated handles, private likes and paid rewards are atomic and idempotent', async () => {
  const db = new PGlite();
  const creator = '11111111-1111-4111-8111-111111111111';
  const buyer = '22222222-2222-4222-8222-222222222222';
  const admin = '33333333-3333-4333-8333-333333333333';
  const publication = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const query = async sql => (await db.query(sql)).rows;
  const privateQuery = async sql => {
    const active=(await query('select current_user as role'))[0].role;
    await db.exec('reset role');
    try { return await query(sql); }
    finally { if(active!=='postgres') await db.exec(`set role ${active}`); }
  };
  const role = async (name,id='') => db.exec(`reset role; set role ${name}; select set_config('request.jwt.claim.sub','${id}',false);`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private; create schema net; create schema cron;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous',false) $$;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
      insert into auth.users values('${creator}',false),('${buyer}',false),('${admin}',false);
      create table public.profiles(id uuid primary key,is_admin boolean not null default false);
      insert into public.profiles values('${creator}',false),('${buyer}',false),('${admin}',true);
      create function public.is_publication_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and is_admin) $$;
      create table public.generation_jobs(id uuid primary key,user_id uuid not null);
      create function private.guard_generation_pricing() returns trigger language plpgsql as $$ begin return new; end $$;
      create table public.products(id bigint primary key, title text not null, price numeric(10,2) not null,
        images jsonb default '[]'::jsonb, category text, is_active boolean default true,publication_id uuid,created_at timestamp default now());
      alter table public.products enable row level security;
      create policy product_read on public.products for select to anon,authenticated using(true);
      grant select on public.products to anon,authenticated;
      create table public.generation_publications(id uuid primary key,generation_id uuid,user_id uuid,status text,product_id text);
      create function public.is_approved_publication(p_id uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.generation_publications where id=p_id and status='approved') $$;
      grant execute on function public.is_approved_publication(uuid) to anon,authenticated;
      create table public.orders(id bigint primary key,user_id uuid not null,status text default 'pendente',total numeric not null,
        payment_id text,items jsonb,frete_valor numeric,frete_service_id text,frete_service_name text,
        shipping_address text,created_at timestamp default now());
      alter table public.orders enable row level security;
      create policy order_owner on public.orders for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant select,insert,update on public.orders to authenticated,service_role;
      create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
        headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000)
        returns bigint language sql as $$ select 1::bigint $$;
      create function cron.schedule(job_name text,schedule text,command text)
        returns bigint language sql as $$ select 1::bigint $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202609300002_freo_credits.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202609300003_community_creators.sql',import.meta.url),'utf8'));
    const postflight=(await query(await readFile(new URL('../supabase/diagnostics/community_creators_postflight.sql',import.meta.url),'utf8')))[0].verificacao_criadores;
    assert.ok(Object.values(postflight).every(Boolean),JSON.stringify(postflight));
    await db.exec(`insert into public.generation_jobs values('${generation}','${creator}');
      insert into public.generation_publications values('${publication}','${generation}','${creator}','pending',null);
      insert into public.products(id,title,price,category,publication_id,images) values(7,'Modelo do criador',50,'feito_por_voces','${publication}','["https://example.com/cover.png"]');
      update public.generation_publications set status='approved',product_id='7' where id='${publication}';`);
    const initialHandle=(await query(`select handle from public.creator_profiles where user_id='${creator}'`))[0].handle;
    assert.match(initialHandle,/^freo_[0-9]+$/);
    await role('authenticated',creator);
    await assert.rejects(db.exec(`update public.creator_profiles set handle='obsceno' where user_id='${creator}'`),/permission denied/);
    await assert.rejects(db.exec(`select public.request_creator_handle('caralho')`),/indisponível/);
    await db.exec(`select public.request_creator_handle('Artista_Freo')`);
    assert.equal((await query(`select handle,pending_handle from public.creator_profiles where user_id='${creator}'`))[0].handle,initialHandle);
    await role('authenticated',admin);
    await db.exec(`select public.review_creator_handle('${creator}',true)`);
    await role('anon');
    await assert.rejects(db.exec('select * from public.creator_profiles'),/permission denied/);
    assert.equal((await query(`select creator_handle from public.community_catalog_info()`))[0].creator_handle,'artista_freo');
    assert.equal((await query(`select public.creator_handle_exists('artista_freo') as exists`))[0].exists,true);
    assert.equal((await query(`select public.creator_handle_exists('admin') as exists`))[0].exists,false);
    assert.equal((await query(`select product_title from public.creator_public_profile('artista_freo')`))[0].product_title,'Modelo do criador');
    await role('authenticated',buyer);
    assert.equal((await query('select * from public.community_sales')).length,0);
    await db.exec(`insert into public.community_product_likes(product_id,user_id) values(7,'${buyer}')`);
    await assert.rejects(db.exec(`insert into public.community_product_likes(product_id,user_id) values(7,'${buyer}')`),/duplicate key/);
    assert.equal(Number((await query(`select likes_count from public.community_catalog_info()`))[0].likes_count),1);
    await db.exec(`insert into public.orders(id,user_id,total,items,frete_valor) values(10,'${buyer}',60,
      '[{"product_id":"7","quantity":1,"price":50}]',10)`);
    await assert.rejects(db.exec(`select public.prepare_community_order(10,50,'[{"product_id":"7","quantity":1,"price":50}]')`),/permission denied/);
    await role('service_role');
    await assert.rejects(db.exec(`select public.prepare_community_order(10,50,'[{"product_id":"8","quantity":1,"price":50}]')`),/Itens mudaram/);
    assert.equal((await query(`select public.prepare_community_order(10,50,'[{"product_id":"7","quantity":1,"price":50}]') as ready`))[0].ready,true);
    assert.equal((await query(`select public.prepare_community_order(10,50,'[{"product_id":"7","quantity":1,"price":50}]') as ready`))[0].ready,true);
    await role('authenticated',buyer);
    await assert.rejects(db.exec(`update public.orders set items='[]' where id=10`),/Itens validados/);
    await role('service_role');
    await db.exec(`select public.freo_confirm_paid_order(10,'12345678',60)`);
    await db.exec(`select public.freo_confirm_paid_order(10,'12345678',60)`);
    assert.equal(Number((await privateQuery(`select balance from public.freo_wallets where user_id='${buyer}'`))[0].balance),110);
    assert.equal(Number((await privateQuery(`select balance from public.freo_wallets where user_id='${creator}'`))[0].balance),190);
    assert.deepEqual((await privateQuery('select quantity,credits_awarded from public.community_sales where order_id=10')),[{quantity:1,credits_awarded:150}]);
    assert.equal(Number((await privateQuery(`select count(*)::int as n from public.freo_credit_ledger where reason='creator_reward'`))[0].n),1);
    await role('authenticated',buyer);
    await db.exec(`insert into public.orders(id,user_id,total,items,frete_valor) values(11,'${buyer}',50,
      '[{"product_id":"7","quantity":1,"price":50}]',10)`);
    await role('service_role');
    await db.exec(`select public.prepare_community_order(11,50,'[{"product_id":"7","quantity":1,"price":50}]')`);
    await db.exec(`select public.freo_confirm_paid_order(11,'87654321',50)`);
    assert.equal(Number((await privateQuery('select credits_awarded from public.community_sales where order_id=11'))[0].credits_awarded),123);
    assert.equal(Number((await privateQuery(`select balance from public.freo_wallets where user_id='${creator}'`))[0].balance),313);
    await db.exec("reset role; update public.products set price=5 where id=7");
    await role('authenticated',buyer);
    await db.exec(`insert into public.orders(id,user_id,total,items,frete_valor) values(12,'${buyer}',15,
      '[{"product_id":"7","quantity":1,"price":5}]',10)`);
    await role('service_role');
    await db.exec(`select public.prepare_community_order(12,5,'[{"product_id":"7","quantity":1,"price":5}]')`);
    await db.exec(`select public.freo_apply_order_credits(12,150,'${buyer}')`);
    await db.exec("select public.freo_confirm_paid_order(12,'freo-only:12',0)");
    assert.equal(Number((await privateQuery('select credits_awarded from public.community_sales where order_id=12'))[0].credits_awarded),0);
    assert.equal(Number((await privateQuery(`select balance from public.freo_wallets where user_id='${creator}'`))[0].balance),313);
    await role('authenticated',buyer);
    await db.exec('delete from public.community_product_likes where product_id=7');
    assert.equal(Number((await query('select likes_count from public.community_catalog_info()'))[0].likes_count),0);
  } finally { await db.close(); }
});
