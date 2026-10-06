-- Apply after 202610060002_b2b_event_customizer.sql.
-- Existing PNG previews remain valid. New .scad sources are private and can
-- only be uploaded by admins or read by eligible B2B customers.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('b2b-parametric-models', 'b2b-parametric-models', false, 262144, array['text/plain'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'b2b-parametric-models'
    and public = false and file_size_limit <= 262144) then
    raise exception 'The parametric model bucket must be private and limited to 256 KiB';
  end if;
end $$;

alter table public.b2b_event_customizers
  alter column template_path drop not null,
  add column model_path text,
  add column text_parameter text not null default 'custom_text',
  add column model_verified_path text,
  add column model_verified_at timestamptz,
  add constraint b2b_customizer_has_source check (template_path is not null or model_path is not null);

create or replace function public.b2b_parametric_model_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and p_name ~ '^models/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.scad$'
    and (
      public.is_publication_admin()
      or exists (
        select 1 from public.profiles p
        join public.b2b_event_customizers c on c.model_path = p_name
        join public.products pr on pr.id = c.product_id
        where p.id = (select auth.uid()) and p.account_type = 'pj'
          and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14
          and pr.b2b_category = 'eventos' and pr.is_active = true
      )
    );
$$;
revoke all on function public.b2b_parametric_model_allowed(text) from public, anon;
grant execute on function public.b2b_parametric_model_allowed(text) to authenticated;

create policy b2b_parametric_model_read on storage.objects for select to authenticated
  using (bucket_id = 'b2b-parametric-models' and public.b2b_parametric_model_allowed(name));
create policy b2b_parametric_model_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'b2b-parametric-models' and public.is_publication_admin()
    and name ~ '^models/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.scad$');
-- Other permissive bucket policies must not grant wider access.
create policy b2b_parametric_model_read_guard on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'b2b-parametric-models' or public.b2b_parametric_model_allowed(name));
create policy b2b_parametric_model_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'b2b-parametric-models' or (public.is_publication_admin()
    and name ~ '^models/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.scad$'));
create policy b2b_parametric_model_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'b2b-parametric-models') with check (bucket_id <> 'b2b-parametric-models');
create policy b2b_parametric_model_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'b2b-parametric-models');

create or replace function private.validate_b2b_event_customizer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_product record; v_color jsonb; v_hex text; v_seen text[] := '{}';
begin
  select b2b_category, sale_mode, is_kit, is_active into v_product from public.products where id = new.product_id;
  if not found or v_product.b2b_category <> 'eventos' or v_product.sale_mode <> 'quote_only' or v_product.is_kit
     or not exists (select 1 from public.b2b_event_pricing where product_id = new.product_id) then
    raise exception 'The customizer requires a quotation-only event product';
  end if;
  if new.template_path is not null and (new.template_path !~ '^b2b-customizers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'imagens' and o.name = new.template_path)) then
    raise exception 'Upload a PNG preview template before saving the customizer';
  end if;
  if new.model_path is not null and (new.model_path !~ '^models/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.scad$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'b2b-parametric-models' and o.name = new.model_path)) then
    raise exception 'Upload a valid private OpenSCAD model before saving the customizer';
  end if;
  if new.text_parameter !~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' then
    raise exception 'The OpenSCAD text parameter name is invalid';
  end if;
  if new.model_path is not null and v_product.is_active then
    if tg_op = 'INSERT' then
      raise exception 'Deactivate the event product before changing its parametric model';
    elsif new.model_path is distinct from old.model_path or new.text_parameter is distinct from old.text_parameter then
      raise exception 'Deactivate the event product before changing its parametric model';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.model_verified_path := null;
    new.model_verified_at := null;
  elsif new.model_path is distinct from old.model_path
     or new.text_parameter is distinct from old.text_parameter then
    new.model_verified_path := null;
    new.model_verified_at := null;
  elsif new.model_verified_path is not null and new.model_verified_path is distinct from new.model_path then
    raise exception 'The verified model must match the uploaded source';
  end if;
  if (new.model_verified_path is null) <> (new.model_verified_at is null) then
    raise exception 'Model verification requires both a source and a timestamp';
  end if;
  if jsonb_typeof(new.colors) <> 'array' or jsonb_array_length(new.colors) not between 1 and 8 then
    raise exception 'Choose between one and eight colors';
  end if;
  for v_color in select value from jsonb_array_elements(new.colors) loop
    v_hex := lower(v_color->>'hex');
    if coalesce(jsonb_typeof(v_color), '') <> 'object'
       or coalesce(jsonb_typeof(v_color->'name'), '') <> 'string'
       or coalesce(jsonb_typeof(v_color->'hex'), '') <> 'string'
       or coalesce(char_length(btrim(v_color->>'name')), 0) not between 1 and 30
       or coalesce((v_color->>'name') ~ '[[:cntrl:]]', false)
       or coalesce(v_hex, '') !~ '^#[0-9a-f]{6}$'
       or v_hex = any(v_seen) then
      raise exception 'Color names and hexadecimal values must be valid and unique';
    end if;
    v_seen := array_append(v_seen, v_hex);
  end loop;
  new.sample_text := btrim(new.sample_text);
  if char_length(new.sample_text) not between 1 and new.text_limit
     or new.sample_text ~ '[[:cntrl:]]' then
    raise exception 'The example text exceeds the configured limit';
  end if;
  new.updated_at := now();
  return new;
end $$;

create function private.guard_unverified_b2b_parametric_product() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active and exists (
    select 1 from public.b2b_event_customizers c
    where c.product_id = new.id and c.model_path is not null
      and c.model_verified_path is distinct from c.model_path
  ) then
    raise exception 'Test the parametric model with two names before activating the product';
  end if;
  return new;
end $$;
create trigger guard_unverified_b2b_parametric_product before update of is_active on public.products
for each row execute function private.guard_unverified_b2b_parametric_product();
revoke all on function private.guard_unverified_b2b_parametric_product() from public;

create or replace function private.b2b_quote_customization_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_config public.b2b_event_customizers; v_requested jsonb; v_color jsonb; v_text text;
begin
  v_requested := new.customization;
  if new.product_id is null then
    if v_requested is not null then raise exception 'Choose a product before customizing'; end if;
    return new;
  end if;
  select * into v_config from public.b2b_event_customizers where product_id = new.product_id;
  if not found then
    if v_requested is not null then raise exception 'This product has no interactive customizer'; end if;
    return new;
  end if;
  if new.estimated_unit_price is null then
    raise exception 'This customized product has no available event price';
  end if;
  if coalesce(jsonb_typeof(v_requested), '') <> 'object'
     or coalesce(jsonb_typeof(v_requested->'text'), '') <> 'string'
     or coalesce(jsonb_typeof(v_requested->'color_hex'), '') <> 'string' then
    raise exception 'Choose a color and enter the personalization text';
  end if;
  v_text := btrim(v_requested->>'text');
  if char_length(v_text) not between 1 and v_config.text_limit or v_text ~ '[[:cntrl:]]' then
    raise exception 'Personalization text is invalid or too long';
  end if;
  select value into v_color from jsonb_array_elements(v_config.colors)
    where lower(value->>'hex') = lower(v_requested->>'color_hex') limit 1;
  if v_color is null then raise exception 'Choose a color offered for this product'; end if;
  new.customization := jsonb_build_object(
    'text', v_text, 'color_name', v_color->>'name', 'color_hex', lower(v_color->>'hex'),
    'template_path', v_config.template_path,
    'model_path', v_config.model_path,
    'text_parameter', case when v_config.model_path is not null then v_config.text_parameter else null end);
  return new;
end $$;

commit;
