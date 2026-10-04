import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('admin quote page script parses before publication', async () => {
  const html = await readFile(new URL('../public/admin/cotacoes-b2b.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('B2B quotes belong to a PJ, stay private, and only admins change progress', async () => {
  const db = new PGlite();
  const pj = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const pf = '33333333-3333-4333-8333-333333333333';
  const admin = '44444444-4444-4444-8444-444444444444';
  const role = (name, id = '') => db.exec(`reset role; set role ${name}; select set_config('request.jwt.claim.sub','${id}',false);`);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values('${pj}','pj@example.com'),('${other}','other@example.com'),('${pf}','pf@example.com'),('${admin}','admin@example.com');
      create table public.profiles(id uuid primary key,account_type text,company_name text,phone text,is_admin boolean default false);
      insert into public.profiles values('${pj}','pj','Empresa Teste','11999999999',false),('${other}','pj','Outra Empresa',null,false),('${pf}','pf',null,null,false),('${admin}','pj','Admin',null,true);
      grant select on public.profiles to authenticated;
      create table public.products(id bigint primary key,title text not null,b2b_category text,is_active boolean default true);
      insert into public.products values(1,'Chaveiro', 'eventos',true),(2,'Escultura','sob_medida',true);
      grant select on public.products to authenticated;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202610030002_b2b_quote_requests.sql', import.meta.url), 'utf8'));
    const verificationSql = await readFile(new URL('../supabase/diagnostics/b2b_quotes_postflight.sql', import.meta.url), 'utf8');
    const verification = (await db.query(verificationSql)).rows[0].verificacao_cotacoes_b2b;
    assert.ok(Object.values(verification).every(Boolean), JSON.stringify(verification));
    await role('authenticated', pj);
    const insert = await db.query(`insert into public.b2b_quote_requests(user_id,company_name,category,product_id,product_name,description,quantity,status,admin_note)
      values('${pj}','Fraude','eventos',1,'Outro título','Quero chaveiros para o evento',100,'aprovada','Falso') returning id,company_name,contact_email,contact_phone,product_name,status,admin_note`);
    const quote = insert.rows[0];
    assert.equal(quote.company_name, 'Empresa Teste');
    assert.equal(quote.contact_email, 'pj@example.com');
    assert.equal(quote.contact_phone, '11999999999');
    assert.equal(quote.product_name, 'Chaveiro');
    assert.equal(quote.status, 'recebida');
    assert.equal(quote.admin_note, null);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,description,quantity) values('${other}','eventos','Outro pedido de evento',1)`), /owner/);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity) values('${pj}','eventos',2,'Produto de outra categoria',1)`), /not available/);
    assert.equal((await db.query(`update public.b2b_quote_requests set status='aprovada' where id='${quote.id}' returning id`)).rows.length, 0);
    assert.equal((await db.query(`select status from public.b2b_quote_requests where id='${quote.id}'`)).rows[0].status, 'recebida');
    await role('authenticated', other);
    assert.equal((await db.query('select * from public.b2b_quote_requests')).rows.length, 0);
    await role('authenticated', pf);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,description,quantity) values('${pf}','eventos','Quero um produto de evento',1)`), /business profile/);
    await role('authenticated', admin);
    assert.equal((await db.query('select * from public.b2b_quote_requests')).rows.length, 1);
    await db.exec(`update public.b2b_quote_requests set status='proposta_enviada',admin_note='Proposta enviada pelo WhatsApp' where id='${quote.id}'`);
    await role('authenticated', pj);
    const updated = (await db.query(`select status,admin_note from public.b2b_quote_requests where id='${quote.id}'`)).rows[0];
    assert.equal(updated.status, 'proposta_enviada');
    assert.equal(updated.admin_note, 'Proposta enviada pelo WhatsApp');
    await role('anon');
    await assert.rejects(db.exec('select * from public.b2b_quote_requests'), /permission denied/);
  } finally {
    await db.close();
  }
});
