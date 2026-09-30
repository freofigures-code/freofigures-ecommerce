-- Read-only verification after 202609290001_generation_publications.sql.
-- Every result must be true. No customer data or private asset paths returned.
select jsonb_build_object(
  'publication_table', to_regclass('public.generation_publications') is not null,
  'publication_rls', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.generation_publications')),false),
  'products_publication_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='publication_id'),
  'private_bucket', exists(select 1 from storage.buckets where id='generation-publications' and public is false),
  'category_constraint', exists(select 1 from pg_constraint where conname='products_catalog_category' and conrelid='public.products'::regclass),
  'community_product_read_guard', exists(select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='approved_community_products_only' and permissive='RESTRICTIVE'),
  'community_product_write_guards', (select count(*)=3 from pg_policies where schemaname='public' and tablename='products' and permissive='RESTRICTIVE' and policyname in ('community_product_insert_guard','community_product_update_guard','community_product_delete_guard')),
  'community_cover_write_guards', (select count(*)=3 from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE' and policyname in ('community_cover_insert_guard','community_cover_update_guard','community_cover_delete_guard')),
  'private_snapshot_guards', (select count(*)=4 from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE' and policyname like 'publication_snapshot_%_guard'),
  'submit_rpc_service_only', has_function_privilege('service_role','public.submit_generation_publication(uuid,uuid,numeric,text,text)','execute')
    and not has_function_privilege('authenticated','public.submit_generation_publication(uuid,uuid,numeric,text,text)','execute'),
  'review_rpc_service_only', has_function_privilege('service_role','public.review_generation_publication(uuid,uuid,boolean,text,integer,text)','execute')
    and not has_function_privilege('authenticated','public.review_generation_publication(uuid,uuid,boolean,text,integer,text)','execute')
) as verificacao_publicacoes;
