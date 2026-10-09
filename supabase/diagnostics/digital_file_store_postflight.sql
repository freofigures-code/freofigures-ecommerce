-- Execute após 20261009153413_digital_file_store.sql.
-- Todos os campos devem ser true antes de publicar a loja digital.
select jsonb_build_object(
  'catalog_table', to_regclass('public.digital_products') is not null,
  'catalog_rls', (select relrowsecurity from pg_class where oid='public.digital_products'::regclass),
  'assets_table', to_regclass('public.digital_product_assets') is not null,
  'assets_rls', (select relrowsecurity from pg_class where oid='public.digital_product_assets'::regclass),
  'private_bucket', exists(select 1 from storage.buckets where id='digital-print-files' and public=false and file_size_limit<=52428800),
  'private_storage_guards', (select count(*)=4 from pg_policies where schemaname='storage' and tablename='objects'
    and permissive='RESTRICTIVE' and policyname in ('digital_files_read_guard','digital_files_insert_guard','digital_files_update_guard','digital_files_delete_guard')),
  'digital_order_columns', (select count(*)=3 from information_schema.columns where table_schema='public'
    and table_name='orders' and column_name in ('is_digital','digital_validated','digital_request_id')),
  'digital_order_guard', exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='digital_order_guard' and not tgisinternal),
  'entitlements_table', to_regclass('public.digital_order_entitlements') is not null,
  'entitlements_rls', (select relrowsecurity from pg_class where oid='public.digital_order_entitlements'::regclass),
  'server_order_rpc', exists(select 1 from pg_proc where oid=to_regprocedure('public.digital_create_order(bigint,uuid,uuid)')),
  'server_only_rpc', not has_function_privilege('authenticated','public.digital_create_order(bigint,uuid,uuid)','execute')
    and has_function_privilege('service_role','public.digital_create_order(bigint,uuid,uuid)','execute')
) as verificacao_loja_digital;
