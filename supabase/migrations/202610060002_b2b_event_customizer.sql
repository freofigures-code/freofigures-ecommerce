-- Apply after 202610060001_b2b_event_quotes_chat.sql, before publishing the UI.
-- The preview is illustrative; production files and final artwork are agreed in the quote chat.
begin;

create table public.b2b_event_customizers (
  product_id bigint primary key references public.products(id) on delete cascade,
  template_path text not null,
  colors jsonb not null,
  sample_text text not null default 'Seu nome',
  text_limit smallint not null default 20 check (text_limit between 1 and 40),
  updated_at timestamptz not null default now()
);

create function private.validate_b2b_event_customizer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_product record; v_color jsonb; v_hex text; v_seen text[] := '{}';
begin
  select b2b_category, sale_mode, is_kit into v_product from public.products where id = new.product_id;
  if not found or v_product.b2b_category <> 'eventos' or v_product.sale_mode <> 'quote_only' or v_product.is_kit
     or not exists (select 1 from public.b2b_event_pricing where product_id = new.product_id) then
    raise exception 'The customizer requires a quotation-only event product';
  end if;
  if new.template_path !~ '^b2b-customizers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'imagens' and o.name = new.template_path) then
    raise exception 'Upload a PNG preview template before saving the customizer';
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
create trigger validate_b2b_event_customizer before insert or update on public.b2b_event_customizers
for each row execute function private.validate_b2b_event_customizer();
revoke all on function private.validate_b2b_event_customizer() from public;

create function private.guard_customizable_event_product() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.b2b_event_customizers where product_id = new.id) then
    if new.b2b_category <> 'eventos' then
      delete from public.b2b_event_customizers where product_id = new.id;
    elsif new.sale_mode <> 'quote_only' or new.is_kit then
      raise exception 'Customizable event products must remain quotation-only';
    end if;
  end if;
  return new;
end $$;
create trigger guard_customizable_event_product before update of b2b_category,sale_mode,is_kit on public.products
for each row execute function private.guard_customizable_event_product();
revoke all on function private.guard_customizable_event_product() from public;

alter table public.b2b_event_customizers enable row level security;
revoke all on public.b2b_event_customizers from public, anon, authenticated;
grant select, insert, update, delete on public.b2b_event_customizers to authenticated;
create policy b2b_event_customizers_business_read on public.b2b_event_customizers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and (p.is_admin = true or (p.account_type = 'pj'
      and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14
      and exists (select 1 from public.products pr where pr.id = b2b_event_customizers.product_id
        and pr.b2b_category = 'eventos' and pr.is_active = true)))));
create policy b2b_event_customizers_admin_write on public.b2b_event_customizers for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

-- An existing permissive policy on the public images bucket cannot permit a
-- non-admin to overwrite a preview template.
create policy b2b_customizer_image_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'imagens' or name not like 'b2b-customizers/%' or public.is_publication_admin());
create policy b2b_customizer_image_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'imagens' or name not like 'b2b-customizers/%' or public.is_publication_admin())
  with check (bucket_id <> 'imagens' or name not like 'b2b-customizers/%' or public.is_publication_admin());
create policy b2b_customizer_image_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'imagens' or name not like 'b2b-customizers/%' or public.is_publication_admin());

alter table public.b2b_quote_requests add column customization jsonb;

-- Runs after b2b_quote_before_insert, which checks the owner and product.
create function private.b2b_quote_customization_guard() returns trigger
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
    'template_path', v_config.template_path);
  return new;
end $$;
create trigger zz_b2b_quote_customization_guard before insert on public.b2b_quote_requests
for each row execute function private.b2b_quote_customization_guard();
revoke all on function private.b2b_quote_customization_guard() from public;

commit;
