-- Run after 202610050001_b2b_direct_orders.sql, before publishing the UI.
-- Event products remain quotation-only; the retail and B2B checkouts are unchanged.
begin;

do $$
begin
  if to_regclass('public.b2b_quote_requests') is null
     or to_regclass('public.products') is null
     or to_regclass('public.profiles') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Apply the existing B2B migrations before event quotes and chat';
  end if;
end $$;

create table public.b2b_event_pricing (
  product_id bigint primary key references public.products(id) on delete cascade,
  pricing_mode text not null check (pricing_mode in ('step', 'tiers')),
  minimum_quantity integer not null check (minimum_quantity between 1 and 1000000),
  base_unit_price numeric(12,2) not null check (base_unit_price between 0.01 and 999999.99),
  discount_per_extra_unit numeric(12,2) not null default 0 check (discount_per_extra_unit between 0 and 999999.99),
  floor_unit_price numeric(12,2) not null default 0.01 check (floor_unit_price between 0.01 and 999999.99),
  tiers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check (floor_unit_price <= base_unit_price)
);

create function private.validate_b2b_event_pricing() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_product record; v_tier jsonb; v_qty integer; v_price numeric; v_prev_qty integer := 0; v_prev_price numeric := 999999.99;
begin
  select b2b_category,sale_mode,is_kit into v_product from public.products where id = new.product_id;
  if not found or v_product.b2b_category <> 'eventos' or v_product.sale_mode <> 'quote_only' or v_product.is_kit then
    raise exception 'Event pricing requires a quotation-only event product';
  end if;
  if new.pricing_mode = 'tiers' then
    if jsonb_typeof(new.tiers) <> 'array' or jsonb_array_length(new.tiers) not between 1 and 30 then
      raise exception 'Provide between 1 and 30 quantity price breaks';
    end if;
    for v_tier in select value from jsonb_array_elements(new.tiers) loop
      if jsonb_typeof(v_tier) <> 'object'
         or jsonb_typeof(v_tier->'min_qty') <> 'number'
         or jsonb_typeof(v_tier->'unit_price') <> 'number'
         or (v_tier->>'min_qty') !~ '^[0-9]{1,7}$'
         or (v_tier->>'unit_price') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then
        raise exception 'Invalid quantity price break';
      end if;
      v_qty := (v_tier->>'min_qty')::integer;
      v_price := (v_tier->>'unit_price')::numeric;
      if v_qty < new.minimum_quantity or v_qty > 1000000 or v_qty <= v_prev_qty
         or v_price < 0.01 or v_price > v_prev_price then
        raise exception 'Price breaks must increase in quantity and not increase in unit price';
      end if;
      if v_prev_qty = 0 and v_qty <> new.minimum_quantity then
        raise exception 'The first break must match the minimum quantity';
      end if;
      v_prev_qty := v_qty;
      v_prev_price := v_price;
    end loop;
  elsif new.tiers <> '[]'::jsonb then
    raise exception 'Step pricing cannot contain price breaks';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger validate_b2b_event_pricing before insert or update on public.b2b_event_pricing
for each row execute function private.validate_b2b_event_pricing();
revoke all on function private.validate_b2b_event_pricing() from public;

create function private.guard_priced_event_product() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.b2b_event_pricing where product_id = new.id) then
    if new.b2b_category <> 'eventos' then
      delete from public.b2b_event_pricing where product_id = new.id;
    elsif new.sale_mode <> 'quote_only' or new.is_kit then
      raise exception 'Priced event products must remain quotation-only';
    end if;
  end if;
  return new;
end $$;
create trigger guard_priced_event_product before update of b2b_category,sale_mode,is_kit on public.products
for each row execute function private.guard_priced_event_product();
revoke all on function private.guard_priced_event_product() from public;

create function private.b2b_event_unit_price(p_product_id bigint, p_quantity integer) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare v_config public.b2b_event_pricing; v_tier jsonb; v_price numeric;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then return null; end if;
  select * into v_config from public.b2b_event_pricing where product_id = p_product_id;
  if not found or p_quantity < v_config.minimum_quantity then return null; end if;
  if v_config.pricing_mode = 'step' then
    return greatest(v_config.floor_unit_price,
      round(v_config.base_unit_price - v_config.discount_per_extra_unit * (p_quantity - v_config.minimum_quantity), 2));
  end if;
  for v_tier in select value from jsonb_array_elements(v_config.tiers) loop
    if (v_tier->>'min_qty')::integer <= p_quantity then
      v_price := (v_tier->>'unit_price')::numeric;
    else
      exit;
    end if;
  end loop;
  return v_price;
end $$;
revoke all on function private.b2b_event_unit_price(bigint,integer) from public, anon, authenticated;

alter table public.b2b_event_pricing enable row level security;
revoke all on public.b2b_event_pricing from public, anon, authenticated;
grant select, insert, update, delete on public.b2b_event_pricing to authenticated;
create policy b2b_event_pricing_business_read on public.b2b_event_pricing for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.is_admin = true or (p.account_type = 'pj'
      and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14
      and exists (select 1 from public.products pr where pr.id = product_id
        and pr.b2b_category = 'eventos' and pr.is_active = true)))));
create policy b2b_event_pricing_admin_write on public.b2b_event_pricing for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

alter table public.b2b_quote_requests
  add column estimated_unit_price numeric(12,2),
  add column estimated_total numeric(18,2),
  add column pricing_mode_snapshot text;

create or replace function public.b2b_quote_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_profile record; v_product record; v_price numeric; v_mode text;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Quote owner must be the authenticated user';
  end if;
  select account_type, company_name, phone, cnpj into v_profile
    from public.profiles where id = new.user_id;
  if not found or v_profile.account_type is distinct from 'pj'
     or length(regexp_replace(coalesce(v_profile.cnpj, ''), '[^0-9]', '', 'g')) <> 14
     or nullif(btrim(v_profile.company_name), '') is null then
    raise exception 'A complete business profile is required';
  end if;
  new.company_name := v_profile.company_name;
  select email into new.contact_email from auth.users where id = new.user_id;
  new.contact_phone := v_profile.phone;
  new.status := 'recebida';
  new.admin_note := null;
  new.created_at := now();
  new.updated_at := now();
  new.description := btrim(new.description);
  new.deadline := nullif(btrim(new.deadline), '');
  new.estimated_unit_price := null;
  new.estimated_total := null;
  new.pricing_mode_snapshot := null;
  if new.product_id is not null then
    select title, b2b_category, sale_mode into v_product
      from public.products where id = new.product_id and is_active = true;
    if not found or v_product.b2b_category is distinct from new.category then
      raise exception 'Product is not available in this B2B category';
    end if;
    new.product_name := v_product.title;
    if new.category = 'eventos' and exists (
      select 1 from public.b2b_event_pricing where product_id = new.product_id
    ) then
      if v_product.sale_mode <> 'quote_only' then raise exception 'Priced event product must require a quote'; end if;
      v_price := private.b2b_event_unit_price(new.product_id, new.quantity);
      if v_price is null then raise exception 'Quantity is below the configured event minimum'; end if;
      select pricing_mode into v_mode from public.b2b_event_pricing where product_id = new.product_id;
      new.estimated_unit_price := v_price;
      new.estimated_total := v_price * new.quantity;
      new.pricing_mode_snapshot := v_mode;
    end if;
  else
    new.product_name := null;
  end if;
  return new;
end $$;

create function public.can_access_b2b_quote(p_quote_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.b2b_quote_requests q where q.id = p_quote_id
      and (q.user_id = auth.uid() or exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true
      ))
  );
$$;
revoke all on function public.can_access_b2b_quote(uuid) from public, anon;
grant execute on function public.can_access_b2b_quote(uuid) to authenticated;

create table public.b2b_quote_messages (
  id bigint generated always as identity primary key,
  quote_id uuid not null references public.b2b_quote_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or attachment_path is not null)
);
create index b2b_quote_messages_thread_idx on public.b2b_quote_messages(quote_id, created_at, id);

create function public.b2b_quote_attachment_allowed(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[];
begin
  v_parts := string_to_array(p_name, '/');
  if array_length(v_parts, 1) <> 3
     or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$' then
    return false;
  end if;
  return public.can_access_b2b_quote(v_parts[1]::uuid)
    and (not p_write or v_parts[2] = auth.uid()::text);
end $$;
revoke all on function public.b2b_quote_attachment_allowed(text,boolean) from public;
-- Anonymous requests to other Storage buckets also evaluate the restrictive guard.
-- The helper returns false for anonymous users and reveals no quote metadata.
grant execute on function public.b2b_quote_attachment_allowed(text,boolean) to anon, authenticated;

create function private.b2b_quote_message_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or not public.can_access_b2b_quote(new.quote_id) then
    raise exception 'Message sender is not a participant' using errcode = '42501';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  if new.attachment_path is not null then
    if not public.b2b_quote_attachment_allowed(new.attachment_path, true)
       or split_part(new.attachment_path, '/', 1) <> new.quote_id::text
       or not exists (select 1 from storage.objects o
         where o.bucket_id = 'b2b-quote-images' and o.name = new.attachment_path) then
      raise exception 'Image does not belong to this conversation' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger b2b_quote_message_guard before insert on public.b2b_quote_messages
for each row execute function private.b2b_quote_message_guard();
revoke all on function private.b2b_quote_message_guard() from public;

alter table public.b2b_quote_messages enable row level security;
revoke all on public.b2b_quote_messages from public, anon, authenticated;
grant select, insert on public.b2b_quote_messages to authenticated;
grant usage, select on sequence public.b2b_quote_messages_id_seq to authenticated;
create policy b2b_quote_messages_read on public.b2b_quote_messages for select to authenticated
  using (public.can_access_b2b_quote(quote_id));
create policy b2b_quote_messages_send on public.b2b_quote_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_access_b2b_quote(quote_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('b2b-quote-images', 'b2b-quote-images', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'b2b-quote-images'
    and public = false and file_size_limit = 5242880
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]) then
    raise exception 'B2B quote image bucket must be private and limited to 5 MB images';
  end if;
end $$;
create policy b2b_quote_images_read on storage.objects for select to authenticated
  using (bucket_id = 'b2b-quote-images' and public.b2b_quote_attachment_allowed(name, false));
create policy b2b_quote_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'b2b-quote-images' and public.b2b_quote_attachment_allowed(name, true));
create policy b2b_quote_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'b2b-quote-images' and public.b2b_quote_attachment_allowed(name, true));
-- Existing broad Storage policies must not expose or modify this private bucket.
create policy b2b_quote_images_read_guard on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'b2b-quote-images' or public.b2b_quote_attachment_allowed(name, false));
create policy b2b_quote_images_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'b2b-quote-images' or public.b2b_quote_attachment_allowed(name, true));
create policy b2b_quote_images_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'b2b-quote-images') with check (bucket_id <> 'b2b-quote-images');
create policy b2b_quote_images_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'b2b-quote-images' or public.b2b_quote_attachment_allowed(name, true));
commit;
