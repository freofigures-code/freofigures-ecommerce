-- Apply after the existing review/admin protection migration.
begin;
-- Abort before changing any data when the required production schema differs.
do $$
declare required_table text; image_type text; required_column record; actual_type text;
begin
  foreach required_table in array array['public.products','public.generation_jobs','public.profiles','auth.users','storage.buckets','storage.objects'] loop
    if to_regclass(required_table) is null then
      raise exception 'Migração cancelada: tabela obrigatória ausente: %', required_table;
    end if;
  end loop;
  if to_regclass('public.generation_publications') is not null or to_regclass('private.product_categories_before_community') is not null then
    raise exception 'Migração cancelada: já existem objetos de publicação. Não execute novamente sem conferir o diagnóstico.';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.products'::regclass) then
    raise exception 'Migração cancelada: products deve ter RLS habilitado.';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
      and tgfoid=to_regprocedure('private.protect_review_admin_flag()') and tgenabled in ('O','A')) then
    raise exception 'Migração cancelada: proteção de profiles.is_admin ausente ou desabilitada. Confira a migração de avaliações já existente.';
  end if;
  select format_type(atttypid,atttypmod) into image_type from pg_attribute
    where attrelid='public.products'::regclass and attname='images' and not attisdropped;
  if image_type is null or image_type not in ('text[]','jsonb','json') then
    raise exception 'Migração cancelada: tipo de products.images não validado: %',image_type;
  end if;
  for required_column in select * from (values
    ('public.products','id','bigint'),
    ('public.products','category','text'),
    ('public.products','price','numeric(10,2)'),
    ('public.products','is_kit','boolean'),
    ('public.products','title','text'),
    ('public.generation_jobs','id','uuid'),
    ('public.generation_jobs','user_id','uuid'),
    ('public.generation_jobs','title','text'),
    ('public.generation_jobs','status','text'),
    ('public.generation_jobs','image_path','text'),
    ('public.generation_jobs','rendered_image_path','text'),
    ('public.generation_jobs','model_path','text'),
    ('public.profiles','id','uuid'),
    ('public.profiles','is_admin','boolean'),
    ('storage.objects','bucket_id','text'),
    ('storage.objects','name','text')
  ) as expected(table_name,column_name,column_type) loop
    select format_type(a.atttypid,a.atttypmod) into actual_type from pg_attribute a
      where a.attrelid=required_column.table_name::regclass
        and a.attname=required_column.column_name and not a.attisdropped;
    if actual_type is distinct from required_column.column_type then
      raise exception 'Migração cancelada: %.% esperava %, encontrou %',
        required_column.table_name,required_column.column_name,required_column.column_type,actual_type;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Migração cancelada: storage.objects deve ter RLS habilitado.';
  end if;
  if not exists(select 1 from storage.buckets where id='imagens' and public is true)
      or not exists(select 1 from storage.buckets where id='generations') then
    raise exception 'Migração cancelada: buckets imagens (público) e generations são obrigatórios.';
  end if;
end;
$$;
create schema if not exists private;

-- Preserve the previous taxonomy for manual reclassification/rollback.
create table private.product_categories_before_community as select id, category from public.products;
revoke all on private.product_categories_before_community from public, anon, authenticated;
update public.products set category = 'games' where not coalesce(is_kit, false)
  and category is distinct from 'religioso'
  and category is distinct from 'kit_fixo'
  and category is distinct from 'montar_kit';
alter table public.products add constraint products_catalog_category
  check (coalesce(is_kit, false) or category in ('kit_fixo','montar_kit')
    or (category is not null and category in ('games', 'religioso', 'feito_por_voces')));

create table public.generation_publications (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null unique references public.generation_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  image_path text not null,
  model_path text not null,
  quoted_price numeric(10,2) not null check (quoted_price > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  consent_version text not null default '2026-09-29',
  consented_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  product_id text unique,
  check ((status = 'approved') = (product_id is not null))
);
alter table public.products add column publication_id uuid unique references public.generation_publications(id) on delete cascade;
alter table public.products add constraint products_community_requires_publication
  check ((category is not distinct from 'feito_por_voces') = (publication_id is not null));
alter table public.generation_publications enable row level security;
revoke all on public.generation_publications from anon, authenticated;
grant select on public.generation_publications to authenticated;
grant all on public.generation_publications to service_role;
create function public.is_publication_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.profiles where id = auth.uid() and is_admin is true);
$$;
revoke all on function public.is_publication_admin() from public;
grant execute on function public.is_publication_admin() to anon, authenticated;
create policy publication_owner_or_admin_read on public.generation_publications
  for select to authenticated using (user_id = auth.uid() or public.is_publication_admin());
create index generation_publications_queue on public.generation_publications(status, consented_at);

-- Edge Function alone can write verified quotes and decisions. Browser-supplied
-- prices, owner IDs, status changes and direct REST inserts are never trusted.
create function public.submit_generation_publication(
  p_generation_id uuid, p_user_id uuid, p_price numeric, p_image_path text, p_model_path text
) returns public.generation_publications language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; result public.generation_publications;
begin
  select * into j from public.generation_jobs where id = p_generation_id for update;
  if not found or j.user_id <> p_user_id or j.status <> 'completed' then
    raise exception 'Criação indisponível para publicação';
  end if;
  select * into result from public.generation_publications where generation_id = j.id;
  if found then return result; end if;
  if p_price is null or p_price < 0.01 or p_price > 99999999.99 or p_price::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Preço inválido';
  end if;
  insert into public.generation_publications(generation_id,user_id,title,image_path,model_path,quoted_price)
    values(j.id,j.user_id,j.title,p_image_path,p_model_path,p_price) returning * into result;
  return result;
end;
$$;
revoke all on function public.submit_generation_publication(uuid,uuid,numeric,text,text) from public, anon, authenticated;
grant execute on function public.submit_generation_publication(uuid,uuid,numeric,text,text) to service_role;

create function public.review_generation_publication(
  p_id uuid, p_admin_id uuid, p_approve boolean, p_image_url text default null,
  p_stock integer default 1, p_reason text default null
) returns public.generation_publications language plpgsql security definer set search_path = '' as $$
declare item public.generation_publications; created_id text;
begin
  if not exists(select 1 from public.profiles where id = p_admin_id and is_admin is true) then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  select * into item from public.generation_publications where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if item.status <> 'pending' then return item; end if;
  if p_approve then
    if p_image_url is null or p_image_url not like 'https://%' or p_stock is null or p_stock < 1 then
      raise exception 'Imagem e estoque válidos são obrigatórios';
    end if;
    insert into public.products(title,description,price,category,images,stock,is_active,publication_id)
      values(item.title,'Modelo criado pela comunidade e aprovado pela FreoFigures.',
        item.quoted_price,'feito_por_voces',
        (jsonb_populate_record(null::public.products, jsonb_build_object('images',jsonb_build_array(p_image_url)))).images,
        p_stock,true,item.id)
      returning id::text into created_id;
  end if;
  update public.generation_publications set
    status = case when p_approve then 'approved' else 'rejected' end,
    product_id = created_id, reviewed_at = now(), reviewed_by = p_admin_id,
    rejection_reason = case when p_approve then null else nullif(left(btrim(p_reason),1000),'') end
    where id = item.id returning * into item;
  return item;
end;
$$;
revoke all on function public.review_generation_publication(uuid,uuid,boolean,text,integer,text) from public, anon, authenticated;
grant execute on function public.review_generation_publication(uuid,uuid,boolean,text,integer,text) to service_role;

-- The existing products policies still apply. This restrictive policy adds an
-- approval gate even if an old public-read policy is permissive.
create policy approved_community_products_only on public.products as restrictive
  for select to anon, authenticated using (publication_id is null or exists (
    select 1 from public.generation_publications where id = publication_id and status = 'approved'
  ));
-- Use a definer predicate so anonymous catalog reads need no access to private
-- submissions (including creator identity and private model paths).
create function public.is_approved_publication(p_id uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.generation_publications where id = p_id and status = 'approved');
$$;
revoke all on function public.is_approved_publication(uuid) from public;
grant execute on function public.is_approved_publication(uuid) to anon, authenticated;
alter policy approved_community_products_only on public.products
  using (publication_id is null or public.is_approved_publication(publication_id));

-- Snapshot assets stay private. Only the reviewed cover is copied to the public
-- bucket by the Edge Function. Never expose the generation bucket or model files.
insert into storage.buckets(id,name,public) values('generation-publications','generation-publications',false);
create policy admin_publication_asset_read on storage.objects for select to authenticated
  using (bucket_id = 'generation-publications' and public.is_publication_admin());
-- Restrictive policies also guard against older broad Storage policies.
create policy publication_snapshot_read_guard on storage.objects as restrictive
  for select to anon, authenticated using (bucket_id <> 'generation-publications' or public.is_publication_admin());
create policy publication_snapshot_insert_guard on storage.objects as restrictive
  for insert to anon, authenticated with check (bucket_id <> 'generation-publications');
create policy publication_snapshot_update_guard on storage.objects as restrictive
  for update to anon, authenticated using (bucket_id <> 'generation-publications') with check (bucket_id <> 'generation-publications');
create policy publication_snapshot_delete_guard on storage.objects as restrictive
  for delete to anon, authenticated using (bucket_id <> 'generation-publications');
-- Guard community rows against the existing permissive products ALL policy.
create policy community_product_insert_guard on public.products as restrictive
  for insert to anon, authenticated with check (publication_id is null or public.is_publication_admin());
create policy community_product_update_guard on public.products as restrictive
  for update to anon, authenticated using (publication_id is null or public.is_publication_admin())
  with check (publication_id is null or public.is_publication_admin());
create policy community_product_delete_guard on public.products as restrictive
  for delete to anon, authenticated using (publication_id is null or public.is_publication_admin());

-- Protect approved covers against the existing imagens write policies.
create policy community_cover_insert_guard on storage.objects as restrictive
  for insert to anon, authenticated with check (bucket_id <> 'imagens' or name not like 'comunidade/%' or public.is_publication_admin());
create policy community_cover_update_guard on storage.objects as restrictive
  for update to anon, authenticated using (bucket_id <> 'imagens' or name not like 'comunidade/%' or public.is_publication_admin())
  with check (bucket_id <> 'imagens' or name not like 'comunidade/%' or public.is_publication_admin());
create policy community_cover_delete_guard on storage.objects as restrictive
  for delete to anon, authenticated using (bucket_id <> 'imagens' or name not like 'comunidade/%' or public.is_publication_admin());
commit;
