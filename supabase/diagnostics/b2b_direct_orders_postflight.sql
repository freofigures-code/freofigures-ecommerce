-- Read-only check after 202610050001_b2b_direct_orders.sql.
select jsonb_build_object(
  'order_type_column', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='is_b2b'
  ),
  'order_validated_column', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='b2b_validated'
  ),
  'order_guard', exists (
    select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='guard_b2b_order' and not tgisinternal
  ),
  'separate_cart', to_regclass('public.b2b_cart_items') is not null,
  'cart_rls', (select relrowsecurity from pg_class where oid='public.b2b_cart_items'::regclass),
  'tier_rls', (select relrowsecurity from pg_class where oid='public.product_price_tiers'::regclass),
  'product_rls', (select relrowsecurity from pg_class where oid='public.products'::regclass),
  'business_tier_guard', exists (
    select 1 from pg_policies where schemaname='public' and tablename='product_price_tiers' and policyname='b2b_tiers_business_read'
  ),
  'private_b2b_products', exists (
    select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='b2b_products_private_read'
  ),
  'server_validation', to_regprocedure('public.mark_b2b_order_validated(bigint)') is not null
) as verificacao_pedidos_b2b;
