-- Execute after 202609300002_freo_credits.sql. Every field must be true.
select jsonb_build_object(
  'wallets_rls', (select relrowsecurity from pg_class where oid='public.freo_wallets'::regclass),
  'ledger_rls', (select relrowsecurity from pg_class where oid='public.freo_credit_ledger'::regclass),
  'wallets_for_registered_users', not exists (
    select 1 from auth.users u left join public.freo_wallets w on w.user_id=u.id
    where u.is_anonymous is false and w.user_id is null
  ),
  'wallet_balance_private', not has_table_privilege('authenticated','public.freo_wallets','UPDATE'),
  'ledger_private', not has_table_privilege('authenticated','public.freo_credit_ledger','INSERT'),
  'generation_charge_trigger', exists (
    select 1 from pg_trigger where tgrelid='public.generation_jobs'::regclass
      and tgname='freo_charge_generation' and not tgisinternal
  ),
  'order_payment_guard', exists (
    select 1 from pg_trigger where tgrelid='public.orders'::regclass
      and tgname='freo_guard_order' and not tgisinternal
  ),
  'paid_reward_trigger', exists (
    select 1 from pg_trigger where tgrelid='public.orders'::regclass
      and tgname='freo_reward_paid_order' and not tgisinternal
  ),
  'automatic_payment_sync', exists (
    select 1 from pg_trigger where tgrelid='public.orders'::regclass
      and tgname='freo_request_payment_sync' and not tgisinternal
  ),
  'discount_server_only', not has_function_privilege('authenticated','public.freo_apply_order_credits(bigint,integer,uuid)','EXECUTE'),
  'confirmation_server_only', not has_function_privilege('authenticated','public.freo_confirm_paid_order(bigint,text,numeric)','EXECUTE'),
  'refund_server_only', not has_function_privilege('authenticated','public.freo_release_order_credits(bigint,text)','EXECUTE'),
  'payment_amount_column', exists (
    select 1 from information_schema.columns where table_schema='public'
      and table_name='orders' and column_name='freo_verified_paid_amount'
  )
) as verificacao_creditos_freo;
