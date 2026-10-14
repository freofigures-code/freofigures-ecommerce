-- Affiliate attribution is server-validated during the existing retail checkout.
-- Monetary commissions are based on the validated displayed product price, before
-- coupons/Freo credits, and accrue only if Mercado Pago confirms some cash payment.
begin;

create schema if not exists private;

create table public.affiliate_settings (
  id integer primary key default 1 check (id = 1),
  default_rate_pct numeric(5,2) not null default 10 check (default_rate_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.affiliate_settings(id,default_rate_pct) values(1,10);
alter table public.affiliate_settings enable row level security;
revoke all on public.affiliate_settings from public,anon,authenticated;
grant select,update(default_rate_pct) on public.affiliate_settings to authenticated;
create policy affiliate_settings_read on public.affiliate_settings for select to authenticated using (true);
create policy affiliate_settings_admin_update on public.affiliate_settings for update to authenticated
  using (public.is_publication_admin()) with check (public.is_publication_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('affiliate-selfies','affiliate-selfies',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create function private.affiliate_valid_cpf(p_cpf text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v_digits text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  v_sum integer; v_check integer; i integer; d integer;
begin
  if length(v_digits)<>11 or v_digits=repeat(substr(v_digits,1,1),11) then return false; end if;
  for d in 10..11 loop
    v_sum := 0;
    for i in 1..d-1 loop
      v_sum := v_sum + substr(v_digits,i,1)::integer * (d+1-i);
    end loop;
    v_check := (v_sum*10)%11;
    if v_check=10 then v_check:=0; end if;
    if v_check<>substr(v_digits,d,1)::integer then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function private.affiliate_valid_cpf(text) from public,anon,authenticated;

create table public.affiliate_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  selfie_path text not null unique,
  pix_key text,
  status text not null default 'active' check (status in ('active','suspended')),
  commission_override_pct numeric(5,2) check (commission_override_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affiliate_profiles_status on public.affiliate_profiles(status);
alter table public.affiliate_profiles enable row level security;
revoke all on public.affiliate_profiles from public,anon,authenticated;
grant select on public.affiliate_profiles to authenticated;
create policy affiliate_profiles_read on public.affiliate_profiles for select to authenticated
  using (user_id=(select auth.uid()) or public.is_publication_admin());

create function public.affiliate_register(p_cpf text,p_selfie_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_cpf text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
     or not exists(select 1 from auth.users where id=v_user and is_anonymous is false) then
    raise exception 'Entre em uma conta cadastrada para se afiliar' using errcode='42501';
  end if;
  if not private.affiliate_valid_cpf(v_cpf) then raise exception 'CPF inválido'; end if;
  if p_selfie_path !~ ('^'||v_user::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
     or not exists (
       select 1 from storage.objects s where s.bucket_id='affiliate-selfies'
         and s.name=p_selfie_path and s.owner_id=v_user::text
         and coalesce((s.metadata->>'size')::bigint,0) between 1 and 5242880
         and coalesce(s.metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
     ) then raise exception 'Selfie privada não encontrada ou inválida'; end if;
  insert into public.affiliate_profiles(user_id,cpf,selfie_path)
    values(v_user,v_cpf,p_selfie_path);
end $$;
revoke all on function public.affiliate_register(text,text) from public,anon,authenticated;
grant execute on function public.affiliate_register(text,text) to authenticated;

create function public.affiliate_update_pix_key(p_pix_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_key text := btrim(coalesce(p_pix_key,''));
begin
  if auth.uid() is null or length(v_key)<5 or length(v_key)>120 then
    raise exception 'Chave Pix inválida';
  end if;
  update public.affiliate_profiles set pix_key=v_key,updated_at=now()
    where user_id=auth.uid() and status='active';
  if not found then raise exception 'Perfil de afiliado indisponível'; end if;
end $$;
revoke all on function public.affiliate_update_pix_key(text) from public,anon,authenticated;
grant execute on function public.affiliate_update_pix_key(text) to authenticated;

create policy affiliate_selfie_read on storage.objects for select to authenticated
  using (bucket_id='affiliate-selfies' and
    (split_part(name,'/',1)=(select auth.uid())::text or public.is_publication_admin()));
create policy affiliate_selfie_insert on storage.objects for insert to authenticated
  with check (bucket_id='affiliate-selfies'
    and split_part(name,'/',1)=(select auth.uid())::text
    and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
create policy affiliate_selfie_delete_unused on storage.objects for delete to authenticated
  using(bucket_id='affiliate-selfies' and split_part(name,'/',1)=(select auth.uid())::text
    and not exists(select 1 from public.affiliate_profiles where selfie_path=name));
-- Restrictive rules prevent older, broad Storage policies from exposing the bucket.
create policy affiliate_selfie_read_guard on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id<>'affiliate-selfies' or
    (bucket_id='affiliate-selfies' and
      (split_part(name,'/',1)=(select auth.uid())::text or public.is_publication_admin())));
create policy affiliate_selfie_insert_guard on storage.objects as restrictive for insert to anon,authenticated
  with check (bucket_id<>'affiliate-selfies' or
    (bucket_id='affiliate-selfies' and split_part(name,'/',1)=(select auth.uid())::text
      and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)));
create policy affiliate_selfie_update_guard on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id<>'affiliate-selfies') with check (bucket_id<>'affiliate-selfies');
create policy affiliate_selfie_delete_guard on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id<>'affiliate-selfies' or
    (bucket_id='affiliate-selfies' and split_part(name,'/',1)=(select auth.uid())::text
      and not exists(select 1 from public.affiliate_profiles where selfie_path=name)));

create table public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(affiliate_id,product_id),
  unique(id,product_id)
);
create index affiliate_links_product on public.affiliate_links(product_id);
alter table public.affiliate_links enable row level security;
revoke all on public.affiliate_links from public,anon,authenticated;
grant select on public.affiliate_links to authenticated;
create policy affiliate_links_own_read on public.affiliate_links for select to authenticated
  using (affiliate_id=(select auth.uid()) or public.is_publication_admin());

create function public.affiliate_get_link(p_product_id bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_link uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.affiliate_profiles
      where user_id=auth.uid() and status='active') then
    raise exception 'Afiliação indisponível' using errcode='42501';
  end if;
  if not exists(select 1 from public.products where id=p_product_id and is_active is true
      and coalesce(sale_mode,'direct')<>'quote_only'
      and coalesce(b2b_category,'loja')='loja') then
    raise exception 'Produto indisponível para afiliação';
  end if;
  insert into public.affiliate_links(affiliate_id,product_id) values(auth.uid(),p_product_id)
    on conflict(affiliate_id,product_id) do update set affiliate_id=excluded.affiliate_id
    returning id into v_link;
  return v_link;
end $$;
revoke all on function public.affiliate_get_link(bigint) from public,anon,authenticated;
grant execute on function public.affiliate_get_link(bigint) to authenticated;

create table public.affiliate_clicks (
  visitor_token uuid primary key,
  link_id uuid not null references public.affiliate_links(id) on delete cascade,
  clicked_at timestamptz not null default now()
);
create index affiliate_clicks_link on public.affiliate_clicks(link_id);
alter table public.affiliate_clicks enable row level security;
revoke all on public.affiliate_clicks from public,anon,authenticated;

create function public.affiliate_record_click(p_link_id uuid,p_product_id bigint,p_visitor_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_visitor_token is null or p_link_id is null or p_product_id is null
     or not exists(select 1 from public.affiliate_links l
       join public.affiliate_profiles a on a.user_id=l.affiliate_id
       join public.products p on p.id=l.product_id
       where l.id=p_link_id and l.product_id=p_product_id
         and a.status='active' and p.is_active is true
         and coalesce(p.b2b_category,'loja')='loja') then
    return false;
  end if;
  insert into public.affiliate_clicks(visitor_token,link_id)
    values(p_visitor_token,p_link_id)
    on conflict(visitor_token) do update set link_id=excluded.link_id,clicked_at=now();
  return true;
end $$;
revoke all on function public.affiliate_record_click(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.affiliate_record_click(uuid,bigint,uuid) to anon,authenticated;

alter table public.orders add column affiliate_prepared boolean not null default false;
create table public.affiliate_commissions (
  order_id bigint primary key references public.orders(id) on delete restrict,
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  link_id uuid not null references public.affiliate_links(id) on delete restrict,
  product_id bigint not null references public.products(id) on delete restrict,
  quantity integer not null check(quantity>0),
  base_cents bigint not null check(base_cents>=0),
  rate_pct numeric(5,2) not null check(rate_pct between 0 and 100),
  commission_cents bigint not null check(commission_cents>=0),
  state text not null default 'pending' check(state in ('pending','available','reversed')),
  reversal_reason text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  reversed_at timestamptz,
  last_checked_at timestamptz
);
create index affiliate_commissions_affiliate on public.affiliate_commissions(affiliate_id,created_at desc);
create index affiliate_commissions_reconcile on public.affiliate_commissions(last_checked_at,created_at)
  where state='available';
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliate_commissions from public,anon,authenticated;
grant select on public.affiliate_commissions to authenticated;
create policy affiliate_commissions_read on public.affiliate_commissions for select to authenticated
  using(affiliate_id=(select auth.uid()) or public.is_publication_admin());

create function private.affiliate_guard_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.affiliate_prepared and current_user in ('anon','authenticated') then
      raise exception 'Indicação disponível somente ao servidor' using errcode='42501';
    end if;
  elsif current_user in ('anon','authenticated') and
    (new.affiliate_prepared is distinct from old.affiliate_prepared
     or (old.affiliate_prepared and new.items is distinct from old.items)) then
    raise exception 'Indicação e itens validados só podem ser alterados pelo servidor' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.affiliate_guard_order() from public,anon,authenticated;
create trigger affiliate_guard_order before insert or update on public.orders
  for each row execute function private.affiliate_guard_order();

create function public.affiliate_prepare_order(
  p_order_id bigint,p_visitor_token uuid,p_items jsonb,p_subtotal numeric
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_link public.affiliate_links; v_affiliate public.affiliate_profiles;
  v_rate numeric(5,2); v_item jsonb; v_line_cents bigint := 0;
  v_sum_cents bigint := 0; v_qty integer := 0; v_item_qty integer;
  v_item_cents bigint;
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Validação disponível somente ao servidor' using errcode='42501';
  end if;
  if p_visitor_token is null then return false; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.is_b2b or v_order.is_digital
     or lower(btrim(v_order.status))<>'pendente'
     or v_order.freo_verified_paid_amount is not null
     or v_order.items is distinct from p_items
     or jsonb_typeof(v_order.items)<>'array' then
    raise exception 'Pedido indisponível para indicação';
  end if;
  if v_order.affiliate_prepared then
    return exists(select 1 from public.affiliate_commissions where order_id=p_order_id);
  end if;
  select l.* into v_link from public.affiliate_clicks c
    join public.affiliate_links l on l.id=c.link_id
    where c.visitor_token=p_visitor_token and c.clicked_at>=now()-interval '30 days'
      and c.clicked_at<=now()
    order by c.clicked_at desc limit 1;
  if not found then return false; end if;
  select * into v_affiliate from public.affiliate_profiles where user_id=v_link.affiliate_id;
  if not found or v_affiliate.status<>'active' or v_affiliate.user_id=v_order.user_id
     or not exists(select 1 from public.products p where p.id=v_link.product_id
       and p.is_active is true and coalesce(p.b2b_category,'loja')='loja') then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(v_order.items) loop
    if coalesce(v_item->>'quantity','') !~ '^[0-9]{1,4}$'
       or coalesce(v_item->>'price','') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Item inválido para indicação';
    end if;
    v_item_qty := (v_item->>'quantity')::integer;
    v_item_cents := round((v_item->>'price')::numeric*100)::bigint;
    if v_item_qty<1 or v_item_qty>1000 then raise exception 'Quantidade inválida'; end if;
    v_sum_cents := v_sum_cents + v_item_qty*v_item_cents;
    if v_item->>'product_id'=v_link.product_id::text then
      v_line_cents := v_line_cents + v_item_qty*v_item_cents;
      v_qty := v_qty + v_item_qty;
    end if;
  end loop;
  if v_sum_cents<>round(p_subtotal*100)::bigint then
    raise exception 'Subtotal da indicação diverge do pedido validado';
  end if;
  if v_qty=0 or v_line_cents<=0 then return false; end if;
  select coalesce(v_affiliate.commission_override_pct,default_rate_pct) into v_rate
    from public.affiliate_settings where id=1;
  if v_rate is null then raise exception 'Taxa de comissão indisponível'; end if;
  insert into public.affiliate_commissions(
    order_id,affiliate_id,link_id,product_id,quantity,base_cents,rate_pct,commission_cents
  ) values(
    p_order_id,v_affiliate.user_id,v_link.id,v_link.product_id,v_qty,v_line_cents,v_rate,
    round(v_line_cents*v_rate/100)::bigint
  );
  update public.orders set affiliate_prepared=true where id=p_order_id;
  return true;
end $$;
revoke all on function public.affiliate_prepare_order(bigint,uuid,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.affiliate_prepare_order(bigint,uuid,jsonb,numeric) to service_role;

create function private.affiliate_sync_commission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_affiliate uuid;
begin
  if not new.affiliate_prepared then return new; end if;
  select affiliate_id into v_affiliate from public.affiliate_commissions where order_id=new.id;
  if v_affiliate is null then return new; end if;
  perform 1 from public.affiliate_profiles where user_id=v_affiliate for update;
  if lower(btrim(new.status))='cancelado' then
    update public.affiliate_commissions set state='reversed',
      reversal_reason='Pedido cancelado',reversed_at=now()
      where order_id=new.id and state<>'reversed';
  elsif new.freo_verified_paid_amount is not null
      and old.freo_verified_paid_amount is null
      and lower(btrim(new.status)) in ('pago','producao','enviado','entregue') then
    update public.affiliate_commissions set
      state=case when new.freo_verified_paid_amount>0 then 'available' else 'reversed' end,
      confirmed_at=now(),
      reversal_reason=case when new.freo_verified_paid_amount>0 then null else 'Sem pagamento em dinheiro' end,
      reversed_at=case when new.freo_verified_paid_amount>0 then null else now() end
      where order_id=new.id and state='pending';
  end if;
  return new;
end $$;
revoke all on function private.affiliate_sync_commission() from public,anon,authenticated;
create trigger affiliate_sync_commission after update of status,freo_verified_paid_amount on public.orders
  for each row execute function private.affiliate_sync_commission();

create function public.affiliate_reverse_order(p_order_id bigint,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_affiliate uuid;
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Estorno disponível somente ao servidor' using errcode='42501';
  end if;
  select affiliate_id into v_affiliate from public.affiliate_commissions where order_id=p_order_id;
  if v_affiliate is null then return; end if;
  perform 1 from public.affiliate_profiles where user_id=v_affiliate for update;
  update public.affiliate_commissions set state='reversed',
    reversal_reason=left(coalesce(nullif(btrim(p_reason),''),'Pagamento estornado'),120),
    reversed_at=now(),last_checked_at=now()
    where order_id=p_order_id and state<>'reversed';
end $$;
revoke all on function public.affiliate_reverse_order(bigint,text) from public,anon,authenticated;
grant execute on function public.affiliate_reverse_order(bigint,text) to service_role;

create function public.affiliate_mark_checked(p_order_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Conciliação disponível somente ao servidor' using errcode='42501';
  end if;
  update public.affiliate_commissions set last_checked_at=now()
    where order_id=p_order_id and state='available';
end $$;
revoke all on function public.affiliate_mark_checked(bigint) from public,anon,authenticated;
grant execute on function public.affiliate_mark_checked(bigint) to service_role;

create table public.affiliate_payouts (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references public.affiliate_profiles(user_id) on delete restrict,
  amount_cents bigint not null check(amount_cents>0),
  pix_key_snapshot text not null,
  pix_reference text not null unique,
  admin_id uuid not null references auth.users(id),
  paid_at timestamptz not null default now()
);
create unique index affiliate_payout_reference_ci on public.affiliate_payouts(lower(pix_reference));
create index affiliate_payouts_affiliate on public.affiliate_payouts(affiliate_id,paid_at desc);
alter table public.affiliate_payouts enable row level security;
revoke all on public.affiliate_payouts from public,anon,authenticated;
grant select on public.affiliate_payouts to authenticated;
create policy affiliate_payouts_read on public.affiliate_payouts for select to authenticated
  using (affiliate_id=(select auth.uid()) or public.is_publication_admin());

create function public.affiliate_balance(p_user_id uuid default null)
returns table(pending_cents bigint,earned_cents bigint,paid_cents bigint,balance_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := coalesce(p_user_id,auth.uid());
begin
  if v_user is null or (v_user<>auth.uid() and not public.is_publication_admin()) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  return query select
    coalesce((select sum(c.commission_cents) from public.affiliate_commissions c
      where c.affiliate_id=v_user and c.state='pending'),0)::bigint,
    coalesce((select sum(c.commission_cents) from public.affiliate_commissions c
      where c.affiliate_id=v_user and c.state='available'),0)::bigint,
    coalesce((select sum(p.amount_cents) from public.affiliate_payouts p
      where p.affiliate_id=v_user),0)::bigint,
    (coalesce((select sum(c.commission_cents) from public.affiliate_commissions c
      where c.affiliate_id=v_user and c.state='available'),0)
     -coalesce((select sum(p.amount_cents) from public.affiliate_payouts p
      where p.affiliate_id=v_user),0))::bigint;
end $$;
revoke all on function public.affiliate_balance(uuid) from public,anon,authenticated;
grant execute on function public.affiliate_balance(uuid) to authenticated;

create function public.affiliate_record_payout(p_affiliate_id uuid,p_amount_cents bigint,p_pix_reference text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_profile public.affiliate_profiles; v_available bigint; v_paid bigint; v_id bigint;
begin
  if not public.is_publication_admin() then
    raise exception 'Apenas administradores podem registrar Pix' using errcode='42501';
  end if;
  if p_amount_cents is null or p_amount_cents<=0
     or length(btrim(coalesce(p_pix_reference,'')))<6
     or length(p_pix_reference)>120 then raise exception 'Valor ou comprovante Pix inválido'; end if;
  select * into v_profile from public.affiliate_profiles where user_id=p_affiliate_id for update;
  if not found or nullif(btrim(v_profile.pix_key),'') is null then
    raise exception 'Afiliado sem chave Pix cadastrada'; end if;
  select coalesce(sum(commission_cents),0) into v_available
    from public.affiliate_commissions where affiliate_id=p_affiliate_id and state='available';
  select coalesce(sum(amount_cents),0) into v_paid
    from public.affiliate_payouts where affiliate_id=p_affiliate_id;
  if p_amount_cents>v_available-v_paid then raise exception 'Saldo insuficiente para pagamento'; end if;
  insert into public.affiliate_payouts(affiliate_id,amount_cents,pix_key_snapshot,pix_reference,admin_id)
    values(p_affiliate_id,p_amount_cents,v_profile.pix_key,btrim(p_pix_reference),auth.uid())
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.affiliate_record_payout(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.affiliate_record_payout(uuid,bigint,text) to authenticated;

create function public.affiliate_admin_update(p_user_id uuid,p_status text,p_override numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_publication_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_status not in ('active','suspended') or (p_override is not null and (p_override<0 or p_override>100)) then
    raise exception 'Configuração inválida'; end if;
  update public.affiliate_profiles set status=p_status,
    commission_override_pct=p_override,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'Afiliado não encontrado'; end if;
end $$;
revoke all on function public.affiliate_admin_update(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.affiliate_admin_update(uuid,text,numeric) to authenticated;

grant all on public.affiliate_settings,public.affiliate_profiles,public.affiliate_links,
  public.affiliate_clicks,public.affiliate_commissions,public.affiliate_payouts to service_role;
grant usage,select on sequence public.affiliate_payouts_id_seq to service_role;

-- Recheck Mercado Pago after approval as well, so refunds before or after a
-- manual Pix payout reverse the receivable without altering the retail order.
select cron.schedule('freo-affiliate-reconciliation','*/10 * * * *',$cron$
  select net.http_post(
    url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-payment-sync',
    body := jsonb_build_object('order_id',c.order_id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  )
  from public.affiliate_commissions c
    join public.orders o on o.id=c.order_id
  where c.state='available' and o.payment_id ~ '^[0-9]{5,30}$'
  order by c.last_checked_at nulls first,c.created_at,c.order_id
  limit 50
$cron$);

select cron.schedule('freo-affiliate-click-expiry','15 3 * * *',$cron$
  delete from public.affiliate_clicks where clicked_at < now()-interval '30 days'
$cron$);

commit;
