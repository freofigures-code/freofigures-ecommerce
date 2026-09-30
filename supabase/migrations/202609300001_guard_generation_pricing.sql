-- Apply after 202609290001_generation_publications.sql.
-- The deployed generation-price-quote reads metadata.pricing from generation_jobs.
-- Existing owner UPDATE policies allow a direct REST edit of that JSON field.
begin;
do $$
begin
  if to_regclass('public.generation_jobs') is null
    or to_regclass('public.generation_publications') is null then
    raise exception 'Proteção cancelada: migração de publicações ou generation_jobs ausente';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.generation_jobs'::regclass) then
    raise exception 'Proteção cancelada: generation_jobs precisa de RLS';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='start_generation'
      and p.prosecdef and pg_get_userbyid(p.proowner) not in ('anon','authenticated')
  ) then
    raise exception 'Proteção cancelada: start_generation deve executar como SECURITY DEFINER privilegiado';
  end if;
  if to_regprocedure('private.guard_generation_pricing()') is not null then
    raise exception 'Proteção já instalada. Não execute novamente';
  end if;
end;
$$;

-- SECURITY INVOKER is deliberate. A direct client UPDATE runs as authenticated;
-- start_generation is SECURITY DEFINER and workers/callbacks use service_role.
create function private.guard_generation_pricing() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('anon','authenticated') then return new; end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'queued'
      or new.metadata ? 'pricing'
      or new.image_path is not null or new.rendered_image_path is not null
      or new.model_path is not null or new.model_url is not null
      or new.completed_at is not null or new.active_operation is not null
      or new.active_operation_id is not null then
      raise exception 'Campos de geração e preço só podem ser definidos pelo servidor'
        using errcode = '42501';
    end if;
  elsif new.user_id is distinct from old.user_id
    or new.status is distinct from old.status
    or new.metadata->'pricing' is distinct from old.metadata->'pricing'
    or new.image_path is distinct from old.image_path
    or new.rendered_image_path is distinct from old.rendered_image_path
    or new.model_path is distinct from old.model_path
    or new.model_url is distinct from old.model_url
    or new.completed_at is distinct from old.completed_at
    or new.active_operation is distinct from old.active_operation
    or new.active_operation_id is distinct from old.active_operation_id then
    raise exception 'Campos de geração e preço só podem ser alterados pelo servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_generation_pricing() from public, anon, authenticated;
create trigger guard_generation_pricing before insert or update on public.generation_jobs
  for each row execute function private.guard_generation_pricing();
commit;
