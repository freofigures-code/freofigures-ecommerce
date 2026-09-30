-- Freo Credits. Apply only after 202609300001_guard_generation_pricing.sql.
-- An order is rewarded only after a trusted server confirms its payment amount.
begin;

do $$
declare required_column text;
begin
  if to_regclass('public.generation_jobs') is null or to_regclass('public.orders') is null
     or to_regclass('auth.users') is null then
    raise exception 'Créditos Freo: tabelas generation_jobs, orders ou auth.users ausentes';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='is_anonymous' and udt_name='bool'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='id' and udt_name='int8'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='total' and udt_name='numeric'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='generation_jobs' and column_name='id' and udt_name='uuid'
  ) then
    raise exception 'Créditos Freo: estrutura do banco diverge da estrutura verificada';
  end if;
  foreach required_column in array array[
    'user_id:uuid','status:text','payment_id:text','items:jsonb',
    'frete_valor:numeric','frete_service_id:text','frete_service_name:text',
    'shipping_address:text','created_at:timestamp'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='orders'
        and column_name=split_part(required_column,':',1)
        and udt_name=split_part(required_column,':',2)
    ) then
      raise exception 'Créditos Freo: coluna orders.% ausente ou incompatível',split_part(required_column,':',1);
    end if;
  end loop;
  if to_regprocedure('private.guard_generation_pricing()') is null then
    raise exception 'Créditos Freo: aplique antes a proteção do preço das gerações';
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'Créditos Freo: função net.http_post ausente';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'Créditos Freo: função cron.schedule ausente';
  end if;
end;
$$;

create table public.freo_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 50 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.freo_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('welcome','generation','order_discount','order_reward','order_refund')),
  reference_id text not null,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, reason, reference_id)
);
create index freo_credit_ledger_user_created on public.freo_credit_ledger(user_id, created_at desc);

alter table public.freo_wallets enable row level security;
alter table public.freo_credit_ledger enable row level security;
create policy freo_wallet_read_own on public.freo_wallets for select to authenticated
  using (user_id = (select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy freo_ledger_read_own on public.freo_credit_ledger for select to authenticated
  using (user_id = (select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
revoke all on public.freo_wallets, public.freo_credit_ledger from public, anon, authenticated;
grant select on public.freo_wallets, public.freo_credit_ledger to authenticated;

create function private.freo_ensure_wallet(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id=p_user_id and is_anonymous is false) then
    raise exception 'Entre em uma conta cadastrada para usar Créditos Freo' using errcode='42501';
  end if;
  insert into public.freo_wallets(user_id) values(p_user_id) on conflict do nothing;
  if found then
    insert into public.freo_credit_ledger(user_id,reason,reference_id,delta,balance_after)
      values(p_user_id,'welcome',p_user_id::text,50,50);
  end if;
end;
$$;
revoke all on function private.freo_ensure_wallet(uuid) from public, anon, authenticated;

create function private.freo_auth_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous is false then perform private.freo_ensure_wallet(new.id); end if;
  return new;
end;
$$;
revoke all on function private.freo_auth_wallet() from public, anon, authenticated;
create trigger freo_auth_wallet after insert or update of is_anonymous on auth.users
  for each row execute function private.freo_auth_wallet();

-- Existing registered accounts receive the same 50-credit opening balance once.
insert into public.freo_wallets(user_id)
  select id from auth.users where is_anonymous is false on conflict do nothing;
insert into public.freo_credit_ledger(user_id,reason,reference_id,delta,balance_after)
  select user_id,'welcome',user_id::text,50,50 from public.freo_wallets
  on conflict do nothing;

-- Serializes all changes per account and makes every business event idempotent.
create function private.freo_change(p_user_id uuid, p_reason text, p_reference_id text, p_delta integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_balance integer;
begin
  if p_delta = 0 or p_reason not in ('generation','order_discount','order_reward','order_refund')
     or nullif(btrim(p_reference_id),'') is null then
    raise exception 'Movimentação de créditos inválida';
  end if;
  perform private.freo_ensure_wallet(p_user_id);
  select balance into v_balance from public.freo_wallets where user_id=p_user_id for update;
  if exists (select 1 from public.freo_credit_ledger
             where user_id=p_user_id and reason=p_reason and reference_id=p_reference_id) then
    return v_balance;
  end if;
  if v_balance+p_delta < 0 then
    raise exception 'Créditos Freo insuficientes. Cada modelo custa 10 créditos.' using errcode='P0001';
  end if;
  update public.freo_wallets set balance=v_balance+p_delta,updated_at=now() where user_id=p_user_id;
  insert into public.freo_credit_ledger(user_id,reason,reference_id,delta,balance_after)
    values(p_user_id,p_reason,p_reference_id,p_delta,v_balance+p_delta);
  return v_balance+p_delta;
end;
$$;
revoke all on function private.freo_change(uuid,text,text,integer) from public, anon, authenticated;

-- Both prompt and image-upload paths insert exactly one job. Later refinement and
-- image-to-model conversion update that job, so they do not charge a second time.
create function private.freo_charge_generation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.freo_change(new.user_id,'generation',new.id::text,-10);
  return new;
end;
$$;
revoke all on function private.freo_charge_generation() from public, anon, authenticated;
create trigger freo_charge_generation after insert on public.generation_jobs
  for each row execute function private.freo_charge_generation();

alter table public.orders
  add column freo_credits_used integer not null default 0 check (freo_credits_used >= 0),
  add column freo_verified_paid_amount numeric(12,2),
  add column freo_rewards_eligible boolean not null default false,
  add constraint freo_paid_amount_nonnegative check (freo_verified_paid_amount is null or freo_verified_paid_amount >= 0);
-- Opening balances are granted to current users; old orders do not earn retroactive credits.
alter table public.orders alter column freo_rewards_eligible set default true;
create unique index freo_verified_payment_unique on public.orders(payment_id)
  where freo_verified_paid_amount is not null;

-- This guard also closes the prior route where a browser could mark its order paid.
create function private.freo_guard_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_verification_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_verification_changed := true;
  else
    v_verification_changed := new.freo_verified_paid_amount is distinct from old.freo_verified_paid_amount;
  end if;
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      if lower(btrim(new.status)) is distinct from 'pendente' or new.freo_credits_used <> 0
         or new.freo_verified_paid_amount is not null then
        raise exception 'O pedido deve iniciar pendente, sem créditos aplicados' using errcode='42501';
      end if;
    elsif new.total is distinct from old.total or new.status is distinct from old.status
       or new.freo_credits_used is distinct from old.freo_credits_used
       or new.freo_verified_paid_amount is distinct from old.freo_verified_paid_amount
       or new.freo_rewards_eligible is distinct from old.freo_rewards_eligible
       or new.frete_valor is distinct from old.frete_valor
       or new.frete_service_id is distinct from old.frete_service_id
       or new.frete_service_name is distinct from old.frete_service_name
       or new.shipping_address is distinct from old.shipping_address
       or (old.freo_verified_paid_amount is not null and new.payment_id is distinct from old.payment_id) then
      raise exception 'Pagamento, total e Créditos Freo só podem ser alterados pelo servidor' using errcode='42501';
    end if;
  end if;
  if new.freo_verified_paid_amount is not null and v_verification_changed then
    if current_user not in ('postgres','service_role')
       or new.freo_verified_paid_amount <> new.total
       or nullif(btrim(new.payment_id),'') is null then
      raise exception 'Valor pago precisa ser confirmado pelo servidor';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.freo_guard_order() from public, anon, authenticated;
create trigger freo_guard_order before insert or update on public.orders
  for each row execute function private.freo_guard_order();

-- Reserves credits atomically against a pending order. One credit = R$ 0.10.
create function public.freo_apply_order_credits(p_order_id bigint,p_credits integer,p_user_id uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_discount numeric(12,2);
begin
  if current_setting('role',true) <> 'service_role' then
    raise exception 'Desconto disponível somente ao servidor' using errcode='42501';
  end if;
  if p_user_id is null or p_credits is null or p_credits <= 0 then
    raise exception 'Pedido ou quantidade de créditos inválidos';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.user_id <> p_user_id or lower(btrim(v_order.status)) <> 'pendente' then
    raise exception 'Pedido indisponível para usar Créditos Freo' using errcode='42501';
  end if;
  if v_order.freo_credits_used = p_credits then return v_order.total; end if;
  if v_order.freo_credits_used <> 0 then
    raise exception 'Pedido já usa outra quantidade de créditos';
  end if;
  v_discount := p_credits::numeric/10;
  if v_discount > v_order.total or v_order.total < 0 then
    raise exception 'Os créditos não podem ultrapassar o total do pedido';
  end if;
  perform private.freo_change(p_user_id,'order_discount',p_order_id::text,-p_credits);
  update public.orders set total=total-v_discount,freo_credits_used=p_credits where id=p_order_id;
  return v_order.total-v_discount;
end;
$$;
revoke all on function public.freo_apply_order_credits(bigint,integer,uuid) from public, anon, authenticated;
grant execute on function public.freo_apply_order_credits(bigint,integer,uuid) to service_role;

-- Called only by a trusted backend after checking Mercado Pago's payment API.
create function public.freo_confirm_paid_order(p_order_id bigint,p_payment_id text,p_paid_amount numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if current_setting('role',true) <> 'service_role' then
    raise exception 'Confirmação disponível somente ao servidor' using errcode='42501';
  end if;
  if nullif(btrim(p_payment_id),'') is null or p_paid_amount is null or p_paid_amount < 0 then
    raise exception 'Comprovante de pagamento incompleto';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if lower(btrim(v_order.status)) not in ('pendente','pago','producao','enviado','entregue') or v_order.total <> p_paid_amount then
    raise exception 'Valor pago diverge do pedido pendente';
  end if;
  if v_order.freo_verified_paid_amount is not null then
    if v_order.payment_id=p_payment_id and v_order.freo_verified_paid_amount=p_paid_amount then return; end if;
    raise exception 'Pedido já foi confirmado com outro pagamento';
  end if;
  if v_order.payment_id is not null and v_order.payment_id <> p_payment_id then
    raise exception 'ID de pagamento diverge do pedido';
  end if;
  if exists (select 1 from public.orders where payment_id=p_payment_id and id<>p_order_id
             and freo_verified_paid_amount is not null) then
    raise exception 'Pagamento já pertence a outro pedido';
  end if;
  update public.orders set payment_id=p_payment_id,freo_verified_paid_amount=p_paid_amount,
    status=case when lower(btrim(status))='pendente' then 'pago' else status end
    where id=p_order_id;
end;
$$;
revoke all on function public.freo_confirm_paid_order(bigint,text,numeric) from public, anon, authenticated;
grant execute on function public.freo_confirm_paid_order(bigint,text,numeric) to service_role;

-- A rejected/cancelled payment restores the reserved credits once. The caller
-- must first verify that terminal status with Mercado Pago.
create function public.freo_release_order_credits(p_order_id bigint,p_payment_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if current_setting('role',true) <> 'service_role' then
    raise exception 'Estorno disponível somente ao servidor' using errcode='42501';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if lower(btrim(v_order.status))='cancelado' then return; end if;
  if lower(btrim(v_order.status)) <> 'pendente' or v_order.freo_verified_paid_amount is not null
     or v_order.payment_id is distinct from p_payment_id or v_order.freo_credits_used <= 0 then
    raise exception 'Créditos indisponíveis para estorno';
  end if;
  perform private.freo_change(v_order.user_id,'order_refund',p_order_id::text,v_order.freo_credits_used);
  update public.orders set total=total+v_order.freo_credits_used::numeric/10,
    freo_credits_used=0,status='cancelado' where id=p_order_id;
end;
$$;
revoke all on function public.freo_release_order_credits(bigint,text) from public, anon, authenticated;
grant execute on function public.freo_release_order_credits(bigint,text) to service_role;

create function private.freo_reward_paid_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_credits integer;
begin
  if new.freo_rewards_eligible and lower(btrim(new.status)) in ('pago','producao','enviado','entregue')
     and new.freo_verified_paid_amount is not null and old.freo_verified_paid_amount is null then
    -- Only actual money paid earns credits; redeemed credits never earn rewards.
    v_credits := floor(new.freo_verified_paid_amount)::integer;
    if v_credits > 0 and exists(select 1 from auth.users where id=new.user_id and is_anonymous is false) then
      perform private.freo_change(new.user_id,'order_reward',new.id::text,v_credits);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.freo_reward_paid_order() from public, anon, authenticated;
create trigger freo_reward_paid_order after update of status,freo_verified_paid_amount on public.orders
  for each row execute function private.freo_reward_paid_order();

-- The existing n8n webhook may continue setting status='pago'. This asynchronous
-- call independently checks the Mercado Pago payment before awarding rewards.
create function private.freo_request_payment_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.freo_rewards_eligible and lower(btrim(new.status)) in ('pago','producao','enviado','entregue')
     and new.freo_verified_paid_amount is null and new.payment_id ~ '^[0-9]{5,30}$' then
    perform net.http_post(
      url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-payment-sync',
      body := jsonb_build_object('order_id',new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;
revoke all on function private.freo_request_payment_sync() from public, anon, authenticated;
create trigger freo_request_payment_sync after update of status,payment_id on public.orders
  for each row execute function private.freo_request_payment_sync();

-- Retry transient Edge/API failures without touching the existing n8n workflow.
select cron.schedule('freo-payment-sync', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-payment-sync',
    body := jsonb_build_object('order_id',o.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  )
  from public.orders o
  where o.freo_rewards_eligible and lower(btrim(o.status)) in ('pago','producao','enviado','entregue')
    and o.freo_verified_paid_amount is null and o.payment_id ~ '^[0-9]{5,30}$'
  order by o.id desc limit 50
$cron$);

-- Pending Pix/boleto/card attempts with a gateway ID are checked hourly so a
-- later rejection returns the held credits even after the buyer closes the tab.
select cron.schedule('freo-pending-reconciliation', '0 * * * *', $cron$
  select net.http_post(
    url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-payment-sync',
    body := jsonb_build_object('order_id',o.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  )
  from public.orders o
  where o.freo_rewards_eligible and lower(btrim(o.status))='pendente'
    and o.freo_credits_used > 0 and o.payment_id ~ '^[0-9]{5,30}$'
    and o.created_at >= now() - interval '45 days'
  order by o.id desc limit 50
$cron$);

commit;
