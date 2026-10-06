-- Run after 202610060003_b2b_parametric_customizer.sql. Every value must be true.
select jsonb_build_object(
  'private_model_bucket', exists (select 1 from storage.buckets where id='b2b-parametric-models' and public=false and file_size_limit<=262144),
  'model_column', exists (select 1 from information_schema.columns where table_schema='public' and table_name='b2b_event_customizers' and column_name='model_path'),
  'text_parameter_column', exists (select 1 from information_schema.columns where table_schema='public' and table_name='b2b_event_customizers' and column_name='text_parameter'),
  'verification_column', exists (select 1 from information_schema.columns where table_schema='public' and table_name='b2b_event_customizers' and column_name='model_verified_path'),
  'png_optional', exists (select 1 from information_schema.columns where table_schema='public' and table_name='b2b_event_customizers' and column_name='template_path' and is_nullable='YES'),
  'model_read_policy', exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='b2b_parametric_model_read'),
  'private_model_guards', (select count(*)=4 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('b2b_parametric_model_read_guard','b2b_parametric_model_insert_guard','b2b_parametric_model_update_guard','b2b_parametric_model_delete_guard') and permissive='RESTRICTIVE'),
  'quote_snapshot_trigger', exists (select 1 from pg_trigger where tgrelid=to_regclass('public.b2b_quote_requests') and tgname='zz_b2b_quote_customization_guard' and not tgisinternal),
  'activation_guard', exists (select 1 from pg_trigger where tgrelid=to_regclass('public.products') and tgname='guard_unverified_b2b_parametric_product' and not tgisinternal)
) as verificacao_modelo_parametrico;
