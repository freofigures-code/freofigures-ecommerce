-- Run after 202610030002_b2b_quote_requests.sql. Every field should be true.
select jsonb_build_object(
  'quote_table', to_regclass('public.b2b_quote_requests') is not null,
  'rls_enabled', exists (
    select 1 from pg_class where oid = 'public.b2b_quote_requests'::regclass and relrowsecurity
  ),
  'owner_read_policy', exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'b2b_quote_requests' and policyname = 'b2b_quote_owner_read'
  ),
  'admin_read_policy', exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'b2b_quote_requests' and policyname = 'b2b_quote_admin_read'
  ),
  'owner_insert_policy', exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'b2b_quote_requests' and policyname = 'b2b_quote_owner_insert'
  ),
  'admin_update_policy', exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'b2b_quote_requests' and policyname = 'b2b_quote_admin_update'
  ),
  'trusted_snapshot_trigger', exists (
    select 1 from pg_trigger where tgrelid = 'public.b2b_quote_requests'::regclass and tgname = 'b2b_quote_before_insert' and not tgisinternal
  ),
  'anon_has_no_read', not has_table_privilege('anon', 'public.b2b_quote_requests', 'select'),
  'customer_cannot_edit_description', not has_column_privilege('authenticated', 'public.b2b_quote_requests', 'description', 'update'),
  'admin_can_update_status', has_column_privilege('authenticated', 'public.b2b_quote_requests', 'status', 'update')
) as verificacao_cotacoes_b2b;
