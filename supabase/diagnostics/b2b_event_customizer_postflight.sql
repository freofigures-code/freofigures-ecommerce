-- Run after 202610060002_b2b_event_customizer.sql. All values must be true.
select jsonb_build_object(
  'customizer_table', to_regclass('public.b2b_event_customizers') is not null,
  'customizer_rls', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.b2b_event_customizers')), false),
  'quote_snapshot', exists (select 1 from information_schema.columns where table_schema='public' and table_name='b2b_quote_requests' and column_name='customization'),
  'quote_validation_trigger', exists (select 1 from pg_trigger where tgrelid = to_regclass('public.b2b_quote_requests') and tgname='zz_b2b_quote_customization_guard' and not tgisinternal),
  'template_write_guard', (select count(*) = 3 from pg_policies where schemaname='storage' and tablename='objects' and policyname in
    ('b2b_customizer_image_insert_guard','b2b_customizer_image_update_guard','b2b_customizer_image_delete_guard') and permissive='RESTRICTIVE'),
  'business_read_policy', exists (select 1 from pg_policies where schemaname='public' and tablename='b2b_event_customizers' and policyname='b2b_event_customizers_business_read'),
  'admin_write_policy', exists (select 1 from pg_policies where schemaname='public' and tablename='b2b_event_customizers' and policyname='b2b_event_customizers_admin_write')
) as verificacao_personalizador_eventos;
