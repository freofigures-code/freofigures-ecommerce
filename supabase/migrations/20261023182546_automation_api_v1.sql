-- Private delivery state. Only the server key may read or update these rows.
create table public.automation_outbox (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('order.created', 'order.status_changed')),
  order_id bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  leased_until timestamptz,
  delivered_at timestamptz,
  last_error text
);
create index automation_outbox_pending_idx on public.automation_outbox (next_attempt_at, id)
  where delivered_at is null and attempts < 10;
alter table public.automation_outbox enable row level security;
revoke all on public.automation_outbox from public, anon, authenticated;
revoke all on sequence public.automation_outbox_id_seq from public, anon, authenticated;
grant select, insert, update on public.automation_outbox to service_role;
grant usage, select on sequence public.automation_outbox_id_seq to service_role;

create schema if not exists private;
create function private.automation_enqueue_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'order.created';
  elsif new.status is distinct from old.status then
    v_event := 'order.status_changed';
  else
    return new;
  end if;
  insert into public.automation_outbox (event_type, order_id, payload)
  values (v_event, new.id, jsonb_build_object(
    'order_id', new.id,
    'status', new.status,
    'total', new.total,
    'created_at', new.created_at
  ));
  return new;
end;
$$;
revoke all on function private.automation_enqueue_order() from public, anon, authenticated;
create trigger automation_order_event after insert or update of status on public.orders
  for each row execute function private.automation_enqueue_order();

-- SKIP LOCKED gives each concurrent dispatcher a distinct lease. Redelivery is
-- still possible after a crash; consumers must deduplicate X-Freo-Event-Id.
create function public.automation_claim_outbox(p_limit integer default 20)
returns setof public.automation_outbox
language sql security definer set search_path = '' as $$
  update public.automation_outbox o
     set leased_until = now() + interval '90 seconds', attempts = o.attempts + 1
   where o.id in (
     select id from public.automation_outbox
      where delivered_at is null and attempts < 10 and next_attempt_at <= now()
        and (leased_until is null or leased_until < now())
      order by id for update skip locked limit least(greatest(p_limit, 1), 20)
   )
  returning o.*;
$$;
revoke all on function public.automation_claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.automation_claim_outbox(integer) to service_role;

-- Visitor metrics below contain only events recorded with Analíticos consent.
-- Order counts are operational totals and are deliberately separate from the
-- observed browser-session funnel.
create function public.automation_analytics_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with sessions as (
    select session_id,
      bool_or(event_type = 'page_view') as visited,
      bool_or(event_type = 'product_click' or (event_type = 'page_view' and product_id is not null)) as product,
      bool_or(event_type in ('add_to_cart', 'view_cart')) as cart,
      bool_or(event_type = 'begin_checkout') as checkout,
      bool_or(event_type = 'purchase') as purchase
    from public.analytics_events
    where created_at >= p_from and created_at < p_to and session_id is not null
    group by session_id
  ), stage_counts as (
    select count(*) filter (where visited) as visits,
      count(*) filter (where product) as product_views,
      count(*) filter (where cart) as carts,
      count(*) filter (where checkout) as checkouts,
      count(*) filter (where purchase) as observed_purchases,
      count(*) filter (where product and not cart) as left_after_product,
      count(*) filter (where cart and not checkout) as left_after_cart,
      count(*) filter (where checkout and not purchase) as left_after_checkout
    from sessions
  ), order_counts as (
    select count(*) as created_orders,
      count(*) filter (where lower(btrim(status)) in ('pago', 'aprovado', 'producao', 'enviado', 'entregue')) as paid_orders
    from public.orders where created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'visits', s.visits, 'product_views', s.product_views, 'carts', s.carts,
    'checkouts', s.checkouts, 'observed_purchases', s.observed_purchases,
    'left_after_product', s.left_after_product, 'left_after_cart', s.left_after_cart,
    'left_after_checkout', s.left_after_checkout,
    'created_orders', o.created_orders, 'paid_orders_created_in_period', o.paid_orders
  ) from stage_counts s cross join order_counts o;
$$;
revoke all on function public.automation_analytics_funnel(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.automation_analytics_funnel(timestamptz,timestamptz) to service_role;

create function public.automation_analytics_pages(p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with pages as (
    select coalesce(nullif(split_part(page, '?', 1), ''), '/') as path,
      count(*) as views, count(distinct session_id) as sessions
    from public.analytics_events
    where created_at >= p_from and created_at < p_to and event_type = 'page_view'
    group by 1 order by views desc limit 100
  )
  select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', views, 'sessions', sessions)), '[]'::jsonb)
  from pages;
$$;
revoke all on function public.automation_analytics_pages(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.automation_analytics_pages(timestamptz,timestamptz) to service_role;
