-- New affiliates provide CPF and phone. Legacy selfies remain private and intact.
begin;

alter table public.affiliate_profiles
  add column phone text check (phone ~ '^[1-9]{2}[0-9]{8,9}$');
alter table public.affiliate_profiles alter column selfie_path drop not null;

-- Remove the old selfie-based registration entry point and prevent new uploads.
revoke execute on function public.affiliate_register(text,text) from authenticated;
drop function public.affiliate_register(text,text);
drop policy if exists affiliate_selfie_insert on storage.objects;
drop policy if exists affiliate_selfie_insert_guard on storage.objects;
create policy affiliate_selfie_insert_guard on storage.objects
  as restrictive for insert to anon,authenticated
  with check (bucket_id <> 'affiliate-selfies');

create function public.affiliate_register_phone(p_cpf text,p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_cpf text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
     or not exists(select 1 from auth.users where id=v_user and is_anonymous is false) then
    raise exception 'Entre em uma conta cadastrada para se afiliar' using errcode='42501';
  end if;
  if not private.affiliate_valid_cpf(v_cpf) then raise exception 'CPF inválido'; end if;
  if v_phone !~ '^[1-9]{2}[0-9]{8,9}$' then raise exception 'Telefone inválido'; end if;
  insert into public.affiliate_profiles(user_id,cpf,phone)
    values(v_user,v_cpf,v_phone);
end $$;
revoke all on function public.affiliate_register_phone(text,text) from public,anon,authenticated;
grant execute on function public.affiliate_register_phone(text,text) to authenticated;

commit;
