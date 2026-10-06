import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const file = name => new URL(`../supabase/${name}`, import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const template = 'b2b-customizers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';

test('only admin configures a preview, and quote stores server-validated color/text snapshot', async () => {
  const db = new PGlite();
  const as = id => db.exec(`reset role; select set_config('test.uid','${id}',false); set role authenticated;`);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private; create schema storage;
      grant usage on schema public,auth,storage to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text);
      insert into auth.users values ('${owner}','a@company.test'),('${other}','b@company.test'),('${admin}','admin@company.test');
      create table public.profiles(id uuid primary key,account_type text,company_name text,phone text,cnpj text,is_admin boolean default false);
      insert into public.profiles values
        ('${owner}','pj','Empresa A',null,'12345678000190',false),
        ('${other}','pf','Cliente',null,null,false),
        ('${admin}','pj','Admin',null,'12345678000190',true);
      grant select on public.profiles to authenticated;
      create table public.products(id bigint primary key,title text,b2b_category text,sale_mode text,is_kit boolean default false,is_active boolean default true);
      insert into public.products values(1,'Chaveiro','eventos','quote_only',false,true),(2,'Projeto sob medida','sob_medida','quote_only',false,true);
      grant select,update on public.products to authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into storage.buckets values('imagens','imagens',true,null,null);
      create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      grant usage,select on sequence storage.objects_id_seq to anon,authenticated;
      create policy broad_upload on storage.objects for all to anon,authenticated using(true) with check(true);
      create function public.is_publication_admin() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true) $$;
      grant execute on function public.is_publication_admin() to anon,authenticated;
      insert into storage.objects(bucket_id,name) values('imagens','${template}');
    `);
    for (const name of [
      'migrations/202610030002_b2b_quote_requests.sql',
      'migrations/202610060001_b2b_event_quotes_chat.sql',
      'migrations/202610060002_b2b_event_customizer.sql',
    ]) await db.exec(await readFile(file(name), 'utf8'));

    const checks = (await db.query(await readFile(file('diagnostics/b2b_event_customizer_postflight.sql'), 'utf8'))).rows[0].verificacao_personalizador_eventos;
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify(checks));

    await as(admin);
    await db.exec(`insert into storage.objects(bucket_id,name) values('imagens','b2b-customizers/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png')`);
    await db.exec(`insert into public.b2b_event_pricing(product_id,pricing_mode,minimum_quantity,base_unit_price,discount_per_extra_unit,floor_unit_price)
      values(1,'step',10,2.00,0.02,1.00)`);
    await db.exec(`insert into public.b2b_event_customizers(product_id,template_path,colors,sample_text,text_limit)
      values(1,'${template}','[{"name":"Azul claro","hex":"#82c9e8"},{"name":"Vermelho","hex":"#d12e3c"}]','Seu nome',20)`);
    await assert.rejects(db.exec(`update public.b2b_event_customizers set colors='[{"name":"Sem cor"}]' where product_id=1`), /Color names/);
    await assert.rejects(db.exec(`update public.b2b_event_customizers set template_path='b2b-customizers/aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb.png' where product_id=1`), /Upload a PNG/);

    await as(owner);
    assert.equal((await db.query('select * from public.b2b_event_customizers')).rows.length, 1);
    const blockedUpdate = await db.query(`update public.b2b_event_customizers set text_limit=2 where product_id=1 returning product_id`);
    assert.equal(blockedUpdate.rows.length, 0);
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('imagens','b2b-customizers/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png')`), /row-level security/);
    const quote = (await db.query(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity,customization)
      values('${owner}','eventos',1,'Chaveiros personalizados para a escola',20,
        '{"text":" Alice ","color_hex":"#82C9E8","color_name":"Nome falso","template_path":"fraude"}')
      returning id,customization`)).rows[0];
    assert.deepEqual(quote.customization, { text: 'Alice', color_name: 'Azul claro', color_hex: '#82c9e8', template_path: template });
    const legacy = (await db.query(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity)
      values('${owner}','sob_medida',2,'Projeto exclusivo para a empresa',50) returning customization`)).rows[0];
    assert.equal(legacy.customization, null);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity,customization)
      values('${owner}','eventos',1,'Outro pedido de chaveiros',20,'{"text":"Alice","color_hex":"#000000"}')`), /Choose a color/);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity)
      values('${owner}','eventos',1,'Pedido sem personalização',20)`), /Choose a color/);
    await assert.rejects(db.exec(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity,customization)
      values('${owner}','eventos',1,'Pedido com texto longo',20,'{"text":"123456789012345678901","color_hex":"#82c9e8"}')`), /too long/);

    await as(other);
    assert.equal((await db.query('select * from public.b2b_event_customizers')).rows.length, 0);
    await db.exec(`reset role; select set_config('test.uid','',false); set role anon;`);
    await assert.rejects(db.exec('select * from public.b2b_event_customizers'), /permission denied/);

    await as(admin);
    await db.exec(`update public.b2b_event_customizers set colors='[{"name":"Rosa","hex":"#e9a0c5"}]' where product_id=1`);
    const saved = (await db.query(`select customization from public.b2b_quote_requests where id='${quote.id}'`)).rows[0].customization;
    assert.equal(saved.color_name, 'Azul claro');
    assert.equal(saved.text, 'Alice');

    await db.exec('reset role');
    await db.exec(await readFile(file('migrations/202610060003_b2b_parametric_customizer.sql'), 'utf8'));
    const parametricChecks = (await db.query(await readFile(file('diagnostics/b2b_parametric_customizer_postflight.sql'), 'utf8'))).rows[0].verificacao_modelo_parametrico;
    assert.ok(Object.values(parametricChecks).every(Boolean), JSON.stringify(parametricChecks));
    const modelPath = 'models/dddddddd-dddd-4ddd-8ddd-dddddddddddd.scad';
    await as(admin);
    await db.exec(`insert into storage.objects(bucket_id,name) values('b2b-parametric-models','${modelPath}')`);
    await assert.rejects(db.exec(`update public.b2b_event_customizers set template_path=null, model_path='${modelPath}' where product_id=1`), /Deactivate the event product/);
    await db.exec(`update public.products set is_active=false where id=1`);
    await db.exec(`update public.b2b_event_customizers set template_path=null, model_path='${modelPath}', text_parameter='custom_text' where product_id=1`);
    await assert.rejects(db.exec(`update public.products set is_active=true where id=1`), /Test the parametric model/);
    await db.exec(`update public.b2b_event_customizers set model_verified_path='${modelPath}', model_verified_at=now() where product_id=1`);
    await db.exec(`update public.products set is_active=true where id=1`);
    await assert.rejects(db.exec(`update public.b2b_event_customizers set text_parameter='x; drop table users' where product_id=1`), /parameter name/);
    await as(owner);
    assert.equal((await db.query(`select model_path from public.b2b_event_customizers where product_id=1`)).rows[0].model_path, modelPath);
    assert.equal((await db.query(`select name from storage.objects where bucket_id='b2b-parametric-models'`)).rows.length, 1);
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('b2b-parametric-models','models/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.scad')`), /row-level security/);
    const parametricQuote = (await db.query(`insert into public.b2b_quote_requests(user_id,category,product_id,description,quantity,customization)
      values('${owner}','eventos',1,'Chaveiros paramétricos',20,'{"text":"Alex","color_hex":"#e9a0c5","model_path":"fraude"}') returning customization`)).rows[0].customization;
    assert.equal(parametricQuote.model_path, modelPath);
    assert.equal(parametricQuote.text_parameter, 'custom_text');
    assert.equal(parametricQuote.template_path, null);
    await as(other);
    assert.equal((await db.query(`select name from storage.objects where bucket_id='b2b-parametric-models'`)).rows.length, 0);
    await db.exec(`reset role; select set_config('test.uid','',false); set role anon;`);
    await assert.rejects(db.query(`select name from storage.objects where bucket_id='b2b-parametric-models'`), /permission denied/);
  } finally { await db.close(); }
});
