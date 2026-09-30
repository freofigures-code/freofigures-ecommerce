import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('credits are atomic, private, charged once per model, and rewarded once after paid confirmation', async () => {
  const db = new PGlite();
  const user = '11111111-1111-4111-8111-111111111111';
  const newUser = '22222222-2222-4222-8222-222222222222';
  const guest = '33333333-3333-4333-8333-333333333333';
  const balance = async id => {
    const role = (await db.query('select current_user as name')).rows[0].name;
    await db.exec('reset role');
    try { return Number((await db.query(`select balance from public.freo_wallets where user_id='${id}'`)).rows[0]?.balance); }
    finally { if (role !== 'postgres') await db.exec(`set role ${role}`); }
  };
  const rows = async sql => (await db.query(sql)).rows;
  const act = async (role, id = '') => db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private; create schema net; create schema cron;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous',false) $$;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
      insert into auth.users(id) values('${user}');
      create table public.generation_jobs(id uuid primary key,user_id uuid not null,status text default 'queued');
      alter table public.generation_jobs enable row level security;
      create policy jobs_owner on public.generation_jobs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant select,insert,update on public.generation_jobs to authenticated,service_role;
      create function private.guard_generation_pricing() returns trigger language plpgsql as $$ begin return new; end $$;
      create table public.orders(
        id bigint primary key,user_id uuid not null,status text not null,total numeric not null,
        payment_id text,items jsonb not null default '[]',frete_valor numeric,
        created_at timestamp without time zone default now(),
        frete_service_id text,frete_service_name text,shipping_address text
      );
      insert into public.orders(id,user_id,status,total) values(99,'${user}','pago',50);
      alter table public.orders enable row level security;
      create policy orders_owner on public.orders for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant select,insert,update on public.orders to authenticated,service_role;
      create function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
        headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 2000)
        returns bigint language sql as $$ select 1::bigint $$;
      create function cron.schedule(job_name text,schedule text,command text)
        returns bigint language sql as $$ select 1::bigint $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202609300002_freo_credits.sql', import.meta.url), 'utf8'));
    const postflight = (await db.query(await readFile(new URL('../supabase/diagnostics/freo_credits_postflight.sql', import.meta.url), 'utf8'))).rows[0].verificacao_creditos_freo;
    assert.ok(Object.values(postflight).every(Boolean), JSON.stringify(postflight));
    assert.equal((await rows('select freo_rewards_eligible from public.orders where id=99'))[0].freo_rewards_eligible,false);
    assert.equal(await balance(user), 50);
    await db.exec(`insert into auth.users(id) values('${newUser}'); insert into auth.users(id,is_anonymous) values('${guest}',true);`);
    assert.equal(await balance(newUser), 50);
    assert.ok(Number.isNaN(await balance(guest)));

    await act('authenticated', user);
    await assert.rejects(db.exec(`update public.freo_wallets set balance=999 where user_id='${user}'`), /permission denied/);
    await assert.rejects(db.exec(`insert into public.orders(id,user_id,status,total) values(90,'${user}','pago',50)`), /pendente/);
    await db.exec(`insert into public.generation_jobs(id,user_id) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${user}'),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${user}')`);
    await act('service_role');
    assert.equal(await balance(user), 30);
    await db.exec("update public.generation_jobs set status='completed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");
    assert.equal(await balance(user), 30);
    await act('authenticated', user);
    await db.exec(`insert into public.orders(id,user_id,status,total) values(1,'${user}','pendente',50)`);
    await assert.rejects(db.exec("update public.orders set status='pago' where id=1"), /servidor/);
    await assert.rejects(db.exec('update public.orders set total=1 where id=1'), /servidor/);
    await assert.rejects(db.exec(`select public.freo_apply_order_credits(1,20,'${user}')`), /permission denied/);
    await act('service_role');
    assert.equal(Number((await rows(`select public.freo_apply_order_credits(1,20,'${user}') as total`))[0].total),48);
    assert.equal(await balance(user),10);
    assert.equal(Number((await rows(`select public.freo_apply_order_credits(1,20,'${user}') as total`))[0].total),48);
    await assert.rejects(db.exec("select public.freo_confirm_paid_order(1,'12345678',47)"), /diverge/);
    await db.exec("select public.freo_confirm_paid_order(1,'12345678',48)");
    assert.equal(await balance(user),58);
    await db.exec("select public.freo_confirm_paid_order(1,'12345678',48)");
    assert.equal(await balance(user),58);
    await act('authenticated',user);
    await db.exec("update public.orders set payment_id='12345678' where id=1");
    await assert.rejects(db.exec("update public.orders set payment_id='99999999' where id=1"), /servidor/);
    await act('authenticated',user);
    assert.equal(Number((await rows("select count(*)::int as n from public.freo_credit_ledger where reason='order_reward' and reference_id='1'"))[0].n),1);

    await act('authenticated', newUser);
    await db.exec(`insert into public.orders(id,user_id,status,total) values(2,'${newUser}','pendente',5)`);
    await act('service_role');
    assert.equal(Number((await rows(`select public.freo_apply_order_credits(2,50,'${newUser}') as total`))[0].total),0);
    await db.exec("select public.freo_confirm_paid_order(2,'freo-only:2',0)");
    assert.equal(await balance(newUser),0);
    await act('authenticated',newUser);
    assert.equal(Number((await rows("select count(*)::int as n from public.freo_credit_ledger where reason='order_reward' and reference_id='2'"))[0].n),0);
    await act('service_role');
    await assert.rejects(db.exec("select public.freo_confirm_paid_order(2,'12345678',0)"), /outro pagamento/);

    await act('authenticated',user);
    await db.exec(`insert into public.orders(id,user_id,status,total,payment_id) values(3,'${user}','pendente',20,'87654321')`);
    await act('service_role');
    await db.exec(`select public.freo_apply_order_credits(3,10,'${user}')`);
    assert.equal(await balance(user),48);
    await db.exec("select public.freo_release_order_credits(3,'87654321')");
    assert.equal(await balance(user),58);
    await db.exec("select public.freo_release_order_credits(3,'87654321')");
    assert.equal(await balance(user),58);
  } finally {
    await db.close();
  }
});
