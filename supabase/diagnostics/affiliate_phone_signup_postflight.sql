-- Execute após 20261014184213_affiliate_phone_signup.sql. Todos os campos devem ser true.
select jsonb_build_object(
  'phone_column', exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='affiliate_profiles' and column_name='phone'
      and data_type='text'),
  'legacy_selfies_nullable', exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='affiliate_profiles' and column_name='selfie_path'
      and is_nullable='YES'),
  'phone_registration_rpc', to_regprocedure('public.affiliate_register_phone(text,text)') is not null,
  'old_registration_removed', to_regprocedure('public.affiliate_register(text,text)') is null,
  'registration_authenticated_only',
    has_function_privilege('authenticated','public.affiliate_register_phone(text,text)','execute')
    and not has_function_privilege('anon','public.affiliate_register_phone(text,text)','execute'),
  'new_selfie_uploads_blocked',
    not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='affiliate_selfie_insert')
    and exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='affiliate_selfie_insert_guard' and permissive='RESTRICTIVE'
      and position('<>' in coalesce(with_check,''))>0),
  'private_legacy_bucket', exists(select 1 from storage.buckets
    where id='affiliate-selfies' and public=false),
  'affiliate_profiles_rls', (select relrowsecurity from pg_class
    where oid='public.affiliate_profiles'::regclass)
) as verificacao_cadastro_afiliados;
