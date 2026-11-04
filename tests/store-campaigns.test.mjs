import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('black friday campaign is publicly readable and only admins can change it', async () => {
  const db = new PGlite();
  const admin = '11111111-1111-4111-8111-111111111111';
  const customer = '22222222-2222-4222-8222-222222222222';
  const act = async (role, id = '') => db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
  const rows = async sql => (await db.query(sql)).rows;
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key);
      insert into auth.users(id) values('${admin}'),('${customer}');
      create table public.profiles(id uuid primary key,is_admin boolean default false);
      insert into public.profiles values('${admin}',true),('${customer}',false);
      create function public.is_publication_admin() returns boolean language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.profiles where id = auth.uid() and is_admin is true);
      $$;
      grant execute on function public.is_publication_admin() to anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261104120000_store_campaigns.sql', import.meta.url), 'utf8'));

    await act('anon');
    const [row] = await rows(`select is_active, low_stock_threshold from public.store_campaigns where id='black_friday'`);
    assert.deepEqual(row, { is_active: false, low_stock_threshold: 5 });
    await assert.rejects(db.exec(`update public.store_campaigns set is_active=true`), /permission denied/);
    await assert.rejects(db.exec(`insert into public.store_campaigns(id) values('x')`), /permission denied/);

    await act('authenticated', customer);
    await db.exec(`update public.store_campaigns set is_active=true where id='black_friday'`);
    assert.equal((await rows(`select is_active from public.store_campaigns`))[0].is_active, false, 'customer update must be ignored by RLS');
    await assert.rejects(db.exec(`delete from public.store_campaigns`), /permission denied/);

    await act('authenticated', admin);
    await db.exec(`update public.store_campaigns set is_active=true, ends_at='2026-11-30T03:00:00Z', starts_at='2026-11-28T03:00:00Z' where id='black_friday'`);
    const [updated] = await rows(`select is_active, updated_by from public.store_campaigns`);
    assert.equal(updated.is_active, true);
    assert.equal(updated.updated_by, admin);
    await assert.rejects(db.exec(`update public.store_campaigns set ends_at='2026-11-01T00:00:00Z'`), /check/);
    await assert.rejects(db.exec(`update public.store_campaigns set low_stock_threshold=0`), /check/);
    await assert.rejects(db.exec(`update public.store_campaigns set id='other'`), /permission denied/);
  } finally {
    await db.close();
  }
});
