-- Execute após 20261014202415_affiliate_admin_identity.sql.
select jsonb_build_object(
  'identity_rpc', to_regprocedure('public.affiliate_admin_identity(uuid[])') is not null,
  'authenticated_execute', has_function_privilege('authenticated','public.affiliate_admin_identity(uuid[])','execute'),
  'anonymous_blocked', not has_function_privilege('anon','public.affiliate_admin_identity(uuid[])','execute'),
  'restricted_identity_function', exists(select 1 from pg_proc
    where oid='public.affiliate_admin_identity(uuid[])'::regprocedure
      and prosecdef and proconfig @> array['search_path=""']),
  'affiliate_profiles_rls', (select relrowsecurity from pg_class
    where oid='public.affiliate_profiles'::regclass)
) as verificacao_email_afiliados;
