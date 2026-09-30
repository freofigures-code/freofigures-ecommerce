-- Execute after 202609300003_community_creators.sql. Every field must be true.
select jsonb_build_object(
  'creator_profiles',to_regclass('public.creator_profiles') is not null,
  'likes_table',to_regclass('public.community_product_likes') is not null,
  'sales_table',to_regclass('public.community_sales') is not null,
  'priced_lines',to_regclass('public.community_order_lines') is not null,
  'profiles_rls',(select relrowsecurity from pg_class where oid='public.creator_profiles'::regclass),
  'likes_rls',(select relrowsecurity from pg_class where oid='public.community_product_likes'::regclass),
  'sales_rls',(select relrowsecurity from pg_class where oid='public.community_sales'::regclass),
  'no_direct_profile_edit',not has_table_privilege('authenticated','public.creator_profiles','UPDATE'),
  'no_direct_sale_write',not has_table_privilege('authenticated','public.community_sales','INSERT'),
  'prepared_order_server_only',not has_function_privilege('authenticated','public.prepare_community_order(bigint,numeric,jsonb)','EXECUTE'),
  'creator_on_approval',exists(select 1 from pg_trigger where tgrelid='public.generation_publications'::regclass and tgname='creator_on_publication_approval' and tgenabled in ('O','A')),
  'sale_reward_trigger',exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='reward_community_sale' and tgenabled in ('O','A')),
  'community_order_guard',exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='guard_community_order' and tgenabled in ('O','A')),
  'approved_creators_backfilled',not exists(
    select 1 from public.generation_publications g left join public.creator_profiles c on c.user_id=g.user_id
    where g.status='approved' and g.product_id is not null and c.user_id is null
  ),
  'creator_reward_ledger_reason',exists(
    select 1 from pg_constraint where conrelid='public.freo_credit_ledger'::regclass
      and conname='freo_credit_ledger_reason_check' and pg_get_constraintdef(oid) like '%creator_reward%'
  )
) as verificacao_criadores;
