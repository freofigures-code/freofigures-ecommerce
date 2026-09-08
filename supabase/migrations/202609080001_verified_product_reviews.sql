-- Product reviews require an exact product in an authenticated buyer's delivered order.
-- Artificial rows remain recoverable in the database but are hidden from the public API.
-- Run as the database owner before deploying the corresponding storefront change.
begin;

create schema if not exists private;

create or replace function private.review_has_delivered_product(p_user_id uuid, p_product_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and p_product_id is not null and exists (
    select 1 from public.orders o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
    ) item
    where o.user_id = p_user_id and lower(btrim(o.status)) = 'entregue'
      and item->>'product_id' = p_product_id
  );
$$;
revoke all on function private.review_has_delivered_product(uuid,text) from public;

create or replace function private.review_trusted_actor()
returns boolean language sql stable security definer set search_path = '' as $$
  select current_setting('role', true) in ('none', 'postgres', 'service_role')
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin is true);
$$;
revoke all on function private.review_trusted_actor() from public;

-- Without this guard a customer could promote themselves to an administrator,
-- then mark their own order delivered to unlock product reviews.
create or replace function private.protect_review_admin_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.review_trusted_actor() then
    if tg_op = 'INSERT' then
      if new.is_admin is true then raise exception 'Administrator flag is protected' using errcode = '42501'; end if;
    elsif new.is_admin is distinct from old.is_admin or new.id is distinct from old.id then
      raise exception 'Administrator flag and profile identity are protected' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_review_admin_flag() from public;
create trigger protect_review_admin_flag before insert or update on public.profiles
for each row execute function private.protect_review_admin_flag();

-- Checkout can still create pending orders and update payment information.
-- Only the existing administrator or backend can attest delivery or alter order items.
create or replace function private.protect_review_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.review_trusted_actor() then
    if tg_op = 'INSERT' then
      if lower(btrim(new.status)) = 'entregue' or new.label_delivered_at is not null
         or lower(btrim(new.label_status)) = 'delivered' then
        raise exception 'Delivery must be confirmed by the store' using errcode = '42501';
      end if;
    else
      if new.items is distinct from old.items or new.user_id is distinct from old.user_id
         or new.id is distinct from old.id
         or new.label_delivered_at is distinct from old.label_delivered_at
         or (new.label_status is distinct from old.label_status and
             (lower(btrim(new.label_status)) = 'delivered' or lower(btrim(old.label_status)) = 'delivered'))
         or (new.status is distinct from old.status and
             (lower(btrim(new.status)) = 'entregue' or lower(btrim(old.status)) = 'entregue')) then
        raise exception 'Order items, ownership and delivery are protected' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_review_delivery() from public;
create trigger protect_review_delivery before insert or update on public.orders
for each row execute function private.protect_review_delivery();

create or replace function public.product_review_eligibility(p_product_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return 'not_delivered';
  end if;
  if exists (select 1 from public.product_reviews
    where user_id = auth.uid() and product_id = p_product_id and is_artificial is false) then
    return 'already_reviewed';
  end if;
  if private.review_has_delivered_product(auth.uid(), p_product_id) then return 'eligible'; end if;
  return 'not_delivered';
end;
$$;
revoke all on function public.product_review_eligibility(text) from public, anon;
grant execute on function public.product_review_eligibility(text) to authenticated;

alter policy reviews_select_public on public.product_reviews
using (is_artificial is false and user_id is not null);
alter policy reviews_insert_verified_buyer on public.product_reviews
with check (auth.uid() = user_id and is_artificial is false
  and public.product_review_eligibility(product_id) = 'eligible');

create or replace function private.enforce_verified_product_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_artificial is distinct from false or new.user_id is null
     or not private.review_has_delivered_product(new.user_id, new.product_id) then
    raise exception 'A delivered purchase of this exact product is required' using errcode = '42501';
  end if;
  if current_setting('role', true) in ('anon', 'authenticated') and
     (auth.uid() is distinct from new.user_id or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)) then
    raise exception 'Review author must be the authenticated buyer' using errcode = '42501';
  end if;
  if new.rating is null or new.rating <> trunc(new.rating) or new.rating not between 1 and 5
     or length(btrim(coalesce(new.comment, ''))) = 0 then
    raise exception 'A rating from 1 to 5 and a comment are required' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_verified_product_review() from public;
create trigger enforce_verified_product_review before insert or update on public.product_reviews
for each row execute function private.enforce_verified_product_review();

create unique index one_real_review_per_buyer_product on public.product_reviews(user_id,product_id)
where is_artificial is false;

commit;
