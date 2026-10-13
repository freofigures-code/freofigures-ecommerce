-- Execute após 20261013164305_affiliate_program.sql. Todos os campos devem ser true.
select jsonb_build_object(
  'rate_configured', exists(select 1 from public.affiliate_settings where id=1 and default_rate_pct between 0 and 100),
  'private_selfie_bucket', exists(select 1 from storage.buckets where id='affiliate-selfies' and public=false and file_size_limit=5242880),
  'selfie_guards', (select count(*)=4 from pg_policies where schemaname='storage' and tablename='objects'
    and permissive='RESTRICTIVE' and policyname in
      ('affiliate_selfie_read_guard','affiliate_selfie_insert_guard','affiliate_selfie_update_guard','affiliate_selfie_delete_guard')),
  'profiles_rls', (select relrowsecurity from pg_class where oid='public.affiliate_profiles'::regclass),
  'links_rls', (select relrowsecurity from pg_class where oid='public.affiliate_links'::regclass),
  'clicks_rls', (select relrowsecurity from pg_class where oid='public.affiliate_clicks'::regclass),
  'commissions_rls', (select relrowsecurity from pg_class where oid='public.affiliate_commissions'::regclass),
  'payouts_rls', (select relrowsecurity from pg_class where oid='public.affiliate_payouts'::regclass),
  'order_guard', exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='affiliate_guard_order' and not tgisinternal),
  'payment_trigger', exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='affiliate_sync_commission' and not tgisinternal),
  'prepare_service_only', not has_function_privilege('authenticated','public.affiliate_prepare_order(bigint,uuid,jsonb,numeric)','execute')
    and has_function_privilege('service_role','public.affiliate_prepare_order(bigint,uuid,jsonb,numeric)','execute'),
  'reverse_service_only', not has_function_privilege('authenticated','public.affiliate_reverse_order(bigint,text)','execute')
    and has_function_privilege('service_role','public.affiliate_reverse_order(bigint,text)','execute'),
  'payout_admin_rpc', has_function_privilege('authenticated','public.affiliate_record_payout(uuid,bigint,text)','execute'),
  'reconciliation_job', exists(select 1 from cron.job where jobname='freo-affiliate-reconciliation'),
  'click_expiry_job', exists(select 1 from cron.job where jobname='freo-affiliate-click-expiry')
) as verificacao_afiliados;
