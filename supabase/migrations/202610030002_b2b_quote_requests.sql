-- Run after 202610030001_b2b_categories.sql.
-- Quotes are private to the requesting company and administrators.
create table if not exists public.b2b_quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  contact_email text,
  contact_phone text,
  category text not null check (category in ('loja', 'eventos', 'sob_medida')),
  product_id bigint references public.products(id) on delete set null,
  product_name text,
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  quantity integer not null check (quantity between 1 and 1000000),
  deadline text check (deadline is null or char_length(deadline) <= 100),
  status text not null default 'recebida' check (status in ('recebida', 'em_analise', 'proposta_enviada', 'aprovada', 'recusada')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists b2b_quote_requests_user_created_idx
  on public.b2b_quote_requests (user_id, created_at desc);
create index if not exists b2b_quote_requests_status_created_idx
  on public.b2b_quote_requests (status, created_at desc);

-- Never trust company/product/status supplied by a browser. Capture a server-side
-- snapshot and reject accounts that are not registered as businesses.
create or replace function public.b2b_quote_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_profile record;
declare v_product record;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Quote owner must be the authenticated user';
  end if;
  select account_type, company_name, phone into v_profile
    from public.profiles where id = new.user_id;
  if not found or v_profile.account_type is distinct from 'pj'
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
  if new.product_id is not null then
    select title, b2b_category into v_product
      from public.products where id = new.product_id and is_active = true;
    if not found or v_product.b2b_category is distinct from new.category then
      raise exception 'Product is not available in this B2B category';
    end if;
    new.product_name := v_product.title;
  else
    new.product_name := null;
  end if;
  return new;
end $$;

drop trigger if exists b2b_quote_before_insert on public.b2b_quote_requests;
create trigger b2b_quote_before_insert before insert on public.b2b_quote_requests
for each row execute function public.b2b_quote_before_insert();

create or replace function public.b2b_quote_touch_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists b2b_quote_touch_update on public.b2b_quote_requests;
create trigger b2b_quote_touch_update before update on public.b2b_quote_requests
for each row execute function public.b2b_quote_touch_update();

alter table public.b2b_quote_requests enable row level security;
revoke all on public.b2b_quote_requests from anon, authenticated;
grant select, insert on public.b2b_quote_requests to authenticated;
grant update (status, admin_note) on public.b2b_quote_requests to authenticated;

drop policy if exists b2b_quote_owner_read on public.b2b_quote_requests;
create policy b2b_quote_owner_read on public.b2b_quote_requests for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists b2b_quote_admin_read on public.b2b_quote_requests;
create policy b2b_quote_admin_read on public.b2b_quote_requests for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));
drop policy if exists b2b_quote_owner_insert on public.b2b_quote_requests;
create policy b2b_quote_owner_insert on public.b2b_quote_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'pj'
  ));
drop policy if exists b2b_quote_admin_update on public.b2b_quote_requests;
create policy b2b_quote_admin_update on public.b2b_quote_requests for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));
