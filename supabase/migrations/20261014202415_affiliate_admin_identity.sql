-- Expose only affiliate login emails, only to a verified administrator.
begin;

create function public.affiliate_admin_identity(p_user_ids uuid[])
returns table(user_id uuid,email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_publication_admin() then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if p_user_ids is null or cardinality(p_user_ids)>50 then
    raise exception 'Lista de afiliados inválida';
  end if;
  return query
    select a.user_id,u.email::text
    from public.affiliate_profiles a
    join auth.users u on u.id=a.user_id
    where a.user_id=any(p_user_ids);
end $$;
revoke all on function public.affiliate_admin_identity(uuid[]) from public,anon,authenticated;
grant execute on function public.affiliate_admin_identity(uuid[]) to authenticated;

commit;
