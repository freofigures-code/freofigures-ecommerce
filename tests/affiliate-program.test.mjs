import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('referral has a locked price snapshot, requires verified cash, and reverses on refund', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema private; create schema cron;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
      create function auth.uid() returns uuid language sql stable
        as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
      create function auth.jwt() returns jsonb language sql stable as 'select ''{}''::jsonb';
      create table public.profiles(id uuid primary key,is_admin boolean not null default false);
      create function public.is_publication_admin() returns boolean language sql stable security definer
        as 'select exists(select 1 from public.profiles where id=auth.uid() and is_admin)';
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb);
      alter table storage.objects enable row level security;
      create policy broad_read on storage.objects for select to anon,authenticated using(true);
      create policy broad_insert on storage.objects for insert to authenticated with check(true);
      grant usage on schema auth,storage to anon,authenticated,service_role;
      grant select,insert,delete on storage.objects to authenticated;
      grant select on storage.objects to anon;
      create table public.products(id bigint primary key,title text,price numeric,promotional_price numeric,
        is_active boolean not null default true,sale_mode text,b2b_category text,is_kit boolean not null default false);
      create table public.orders(id bigint generated always as identity primary key,user_id uuid,status text default 'pendente',
        total numeric(12,2),items jsonb,is_b2b boolean not null default false,is_digital boolean not null default false,
        freo_verified_paid_amount numeric,payment_id text);
      create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
      create table cron.job(jobname text);
      insert into auth.users values
        ('00000000-0000-4000-8000-000000000001',false),
        ('00000000-0000-4000-8000-000000000002',false),
        ('00000000-0000-4000-8000-000000000003',false);
      insert into public.profiles values
        ('00000000-0000-4000-8000-000000000001',true),
        ('00000000-0000-4000-8000-000000000002',false),
        ('00000000-0000-4000-8000-000000000003',false);
      insert into public.products values(1,'Peça',50,45,true,'direct','loja',false);
      grant select on public.profiles,public.products to anon,authenticated;
      grant select,insert,update on public.orders to authenticated;
      grant all on public.orders,public.products,public.profiles to service_role;
      grant usage,select on sequence public.orders_id_seq to authenticated;
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261013164305_affiliate_program.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec("insert into cron.job values('freo-affiliate-reconciliation'),('freo-affiliate-click-expiry')");
    const diagnostic = await readFile(new URL('../supabase/diagnostics/affiliate_program_postflight.sql', import.meta.url), 'utf8');
    const checks = (await db.query(diagnostic)).rows[0].verificacao_afiliados;
    assert.ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
    await db.exec(`
      insert into storage.objects values(
        'affiliate-selfies',
        '00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg',
        '00000000-0000-4000-8000-000000000001',
        '{"size":10240,"mimetype":"image/jpeg"}'
      );
      insert into public.affiliate_profiles(user_id,cpf,selfie_path) values(
        '00000000-0000-4000-8000-000000000001','11144477735',
        '00000000-0000-4000-8000-000000000001/22222222-2222-4222-8222-222222222222.jpg'
      );
    `);
    const phoneMigration = await readFile(new URL('../supabase/migrations/20261014184213_affiliate_phone_signup.sql', import.meta.url), 'utf8');
    await db.exec(phoneMigration);
    const phoneDiagnostic = await readFile(new URL('../supabase/diagnostics/affiliate_phone_signup_postflight.sql', import.meta.url), 'utf8');
    const phoneChecks = (await db.query(phoneDiagnostic)).rows[0].verificacao_cadastro_afiliados;
    assert.ok(Object.values(phoneChecks).every(Boolean),JSON.stringify(phoneChecks));
    const legacy = (await db.query("select phone,selfie_path from public.affiliate_profiles where user_id='00000000-0000-4000-8000-000000000001'")).rows[0];
    assert.equal(legacy.phone,null);
    assert.match(legacy.selfie_path,/22222222-2222-4222-8222-222222222222\.jpg$/);
    await db.exec(`
      insert into storage.objects values(
        'affiliate-selfies',
        '00000000-0000-4000-8000-000000000002/11111111-1111-4111-8111-111111111111.jpg',
        '00000000-0000-4000-8000-000000000002',
        '{"size":10240,"mimetype":"image/jpeg"}'
      );
      select set_config('test.uid','00000000-0000-4000-8000-000000000002',false);
      set role authenticated;
    `);
    await assert.rejects(
      db.exec(`select public.affiliate_register_phone('11111111111','11912345678')`),
      /CPF inválido/
    );
    await assert.rejects(db.exec(`select public.affiliate_register_phone('52998224725','123')`),/Telefone inválido/);
    await db.exec(`select public.affiliate_register_phone('529.982.247-25','(11) 91234-5678')`);
    const newProfile = (await db.query("select cpf,phone,selfie_path from public.affiliate_profiles where user_id='00000000-0000-4000-8000-000000000002'")).rows[0];
    assert.deepEqual(newProfile,{cpf:'52998224725',phone:'11912345678',selfie_path:null});
    await assert.rejects(db.exec(`insert into storage.objects values('affiliate-selfies','00000000-0000-4000-8000-000000000002/33333333-3333-4333-8333-333333333333.jpg','00000000-0000-4000-8000-000000000002','{}')`),/row-level security|permission denied/i);
    const link = (await db.query('select public.affiliate_get_link(1) as id')).rows[0].id;
    await assert.rejects(db.exec(`update public.affiliate_profiles set commission_override_pct=90`), /permission denied/);
    await db.exec(`reset role; select set_config('test.uid','00000000-0000-4000-8000-000000000003',false); set role authenticated;`);
    const clicked = await db.query('select public.affiliate_record_click($1,1,$2) as ok', [
      link,'10000000-0000-4000-8000-000000000001'
    ]);
    assert.equal(clicked.rows[0].ok,true);
    const privateRows = await db.query('select count(*)::integer as n from public.affiliate_profiles');
    assert.equal(privateRows.rows[0].n,0);
    const privateImages = await db.query("select count(*)::integer as n from storage.objects where bucket_id='affiliate-selfies'");
    assert.equal(privateImages.rows[0].n,0);
    await db.exec('reset role; set role service_role;');
    const order = await db.query(`
      insert into public.orders(user_id,status,total,items)
      values('00000000-0000-4000-8000-000000000003','pendente',40,
      '[{"product_id":1,"quantity":1,"price":45}]') returning id
    `);
    const id = Number(order.rows[0].id);
    const prepare = await db.query('select public.affiliate_prepare_order($1,$2,$3::jsonb,45) as ok', [
      id,'10000000-0000-4000-8000-000000000001','[{"product_id":1,"quantity":1,"price":45}]'
    ]);
    assert.equal(prepare.rows[0].ok,true);
    const before = (await db.query('select base_cents,rate_pct,commission_cents,state from public.affiliate_commissions')).rows[0];
    assert.deepEqual([Number(before.base_cents),Number(before.rate_pct),Number(before.commission_cents),before.state],[4500,10,450,'pending']);
    await db.exec('reset role; set role authenticated;');
    await assert.rejects(db.exec('update public.orders set items=\'[{"product_id":1,"quantity":2,"price":45}]\' where id=1'), /itens validados/);
    await db.exec('reset role; set role service_role;');
    await db.exec("update public.orders set status='pago',payment_id='123456789',freo_verified_paid_amount=40 where id=1");
    assert.equal((await db.query('select state from public.affiliate_commissions')).rows[0].state,'available');
    await db.exec("reset role; select set_config('test.uid','00000000-0000-4000-8000-000000000002',false); set role authenticated;");
    await db.exec("select public.affiliate_update_pix_key('52998224725')");
    await db.exec("reset role; select set_config('test.uid','00000000-0000-4000-8000-000000000001',false); set role authenticated;");
    await db.exec("select public.affiliate_record_payout('00000000-0000-4000-8000-000000000002',450,'PIX-COMPROVANTE-001')");
    await assert.rejects(db.exec("select public.affiliate_record_payout('00000000-0000-4000-8000-000000000002',1,'PIX-COMPROVANTE-002')"),/Saldo insuficiente/);
    await db.exec('reset role; set role service_role;');
    await db.exec("select public.affiliate_reverse_order(1,'Reembolso')");
    assert.equal((await db.query('select state from public.affiliate_commissions')).rows[0].state,'reversed');
    await db.exec('reset role; set role authenticated;');
    const balance=(await db.query("select * from public.affiliate_balance('00000000-0000-4000-8000-000000000002')")).rows[0];
    assert.equal(Number(balance.balance_cents),-450);
    await db.exec("select public.affiliate_admin_update('00000000-0000-4000-8000-000000000002','active',20)");
    await db.exec('reset role; set role service_role;');
    await db.exec(`
      insert into public.orders(user_id,status,total,items)
      values('00000000-0000-4000-8000-000000000003','pendente',0,
      '[{"product_id":1,"quantity":1,"price":45}]');
      select public.affiliate_prepare_order(2,'10000000-0000-4000-8000-000000000001',
        '[{"product_id":1,"quantity":1,"price":45}]',45);
      update public.orders set status='pago',payment_id='freo-only:2',freo_verified_paid_amount=0 where id=2;
    `);
    assert.equal((await db.query('select state from public.affiliate_commissions where order_id=2')).rows[0].state,'reversed');
    const rates=(await db.query('select order_id,rate_pct from public.affiliate_commissions order by order_id')).rows;
    assert.deepEqual(rates.map(r=>Number(r.rate_pct)),[10,20]);
  } finally { await db.close(); }
});

test('affiliate UI and payment integration scripts parse', async () => {
  for (const path of ['../public/afiliados.html','../public/admin/afiliados.html','../public/checkout.html']) {
    const html = await readFile(new URL(path, import.meta.url),'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1].trim()) assert.doesNotThrow(() => new Function(match[1]));
    }
  }
  for (const path of ['../public/affiliate-referral.js','../public/produto-apple.js']) {
    const source = await readFile(new URL(path, import.meta.url),'utf8');
    assert.doesNotThrow(() => new Function(source));
  }
  const affiliateHtml = await readFile(new URL('../public/afiliados.html',import.meta.url),'utf8');
  assert.match(affiliateHtml,/<input id="phone"[^>]*type="tel"/);
  assert.doesNotMatch(affiliateHtml,/<input[^>]*type="file"/);
  assert.match(affiliateHtml,/affiliate_register_phone/);
  const formatter = affiliateHtml.match(/function formatCpf\(value\)\{[^\n]+\}/)?.[0];
  assert.ok(formatter);
  const formatCpf = new Function(`${formatter}; return formatCpf`)();
  assert.equal(formatCpf('52998224725'),'529.982.247-25');
  assert.equal(formatCpf('529.982.247-25'),'529.982.247-25');
  assert.equal(formatCpf('529.98'),'529.98');
  const validator = affiliateHtml.match(/function cpfValid\(value\)\{[^\n]+\}/)?.[0];
  assert.ok(validator);
  const cpfValid = new Function(`${validator}; return cpfValid`)();
  assert.equal(cpfValid('52998224725'),true);
  assert.equal(cpfValid('529.982.247-25'),true);
  assert.equal(cpfValid('52998224726'),false);
  assert.equal(cpfValid('111.111.111-11'),false);
});

test('affiliate variation preview uses the option price validated by checkout', async () => {
  const html = await readFile(new URL('../public/afiliados.html',import.meta.url),'utf8');
  const start = html.indexOf('function productVariantGroups');
  const end = html.indexOf('function productImage',start);
  assert.ok(start > -1 && end > start);
  const pricing = new Function('var rate=10;'+html.slice(start,end)+';return {productVariantGroups,selectedVariantPrice,productBase,estimatedCommission}')();
  const product = {price:180,promotional_price:30,is_kit:false,variants:[
    {name:'Tamanho',per_option_price:true,options:[
      {name:'10 cm',price:30},{name:'15 cm',price:60},{name:'20 cm',price:77},{name:'25 cm',price:120}
    ]},
    {name:'Cor',per_option_price:false,options:['Branco','Dourado']}
  ]};
  const groups = pricing.productVariantGroups(product);
  assert.equal(pricing.productBase(product),30);
  assert.deepEqual([0,1,2,3].map(i=>pricing.selectedVariantPrice(groups,[i,0],30)),[30,60,77,120]);
  assert.equal(pricing.selectedVariantPrice(groups,[1,1],30),60);
  assert.deepEqual([30,60,77,120].map(pricing.estimatedCommission),[300,600,770,1200]);
  const fallback = {price:50,promotional_price:null,is_kit:false,variants:[
    {name:'Tamanho',per_option_price:true,options:[{name:'P',price:null},{name:'G',price:80}]},
    {name:'Acabamento',per_option_price:true,options:[{name:'Padrão',price:40},{name:'Especial',price:70}]}
  ]};
  const fallbackGroups = pricing.productVariantGroups(fallback);
  assert.equal(pricing.selectedVariantPrice(fallbackGroups,[0,1],50),70);
  assert.equal(pricing.selectedVariantPrice(fallbackGroups,[1,0],50),80);
  assert.equal(pricing.productBase(fallback),40);
  assert.match(html,/Ver variações e comissões/);
});
