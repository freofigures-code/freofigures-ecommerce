-- Read-only. Apply after 202609300001_guard_generation_pricing.sql.
select jsonb_build_object(
  'pricing_guard_trigger', exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.generation_jobs'::regclass
      and t.tgfoid=to_regprocedure('private.guard_generation_pricing()')
      and t.tgenabled in ('O','A')
  ),
  'pricing_guard_invoker', exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('private.guard_generation_pricing()')
      and not p.prosecdef
  ),
  'generator_server_definer', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='start_generation' and p.prosecdef
  )
) as verificacao_preco;
